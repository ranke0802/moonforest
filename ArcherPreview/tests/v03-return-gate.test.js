import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,Vector3} from '@babylonjs/core';
import {parseHTML} from 'linkedom';
import {VillageNavigation} from '../src/village-navigation.js';
import {villageObstacles} from '../src/village-layout.js';
import {exitRoadX,createMapPortal} from '../src/map-travel.js';
import {createConfirmDialog} from '../src/v03/confirm-dialog.js';
import {useLanguage,t} from '../src/v03/i18n.js';

// 2026-11-26, user: "맵 이동 직후 3초 이내에 다시 이전 맵으로 돌아가려고 하면
// xxx 지역으로 다시 이동하시겠습니까? 확인 모달 하나 띄워줘."
function village(t,{gate=true,answers=[],loading=()=>false}={}){
 const engine=new NullEngine(),scene=new Scene(engine),world={mapId:'village',scene,navigation:new VillageNavigation(villageObstacles())};
 const {document}=parseHTML('<button id="travel"></button>'),previousDocument=globalThis.document,previousLocation=globalThis.location;
 globalThis.document=document;globalThis.location={href:'https://gate.test/game/?character=warrior-v3'};
 // The arrival from the plains: on the exit road, three metres inside the return strip (z 73..78).
 const actor={position:new Vector3(exitRoadX(70),0,70)},asked=[],trips=[],pending=[];
 const portal=createMapPortal(world,{button:document.querySelector('button'),persistTravel:false,disarmRoadDestination:'warrior-plains',
  returnGate:gate?{destination:'warrior-plains',seconds:3,confirm:to=>{asked.push(to.destination);return answers.length?answers.shift():new Promise(resolve=>pending.push(resolve));}}:null,
  getState:()=>({position:actor.position,hp:500,potions:3,loading:loading()}),onTravel:url=>trips.push(new URL(url).searchParams.get('character'))});
 t.after(()=>{portal.dispose();scene.dispose();engine.dispose();globalThis.document=previousDocument;globalThis.location=previousLocation;});
 const walkTo=(z,dt=.1)=>{const step=z>actor.position.z?.3:-.3;while(Math.abs(z-actor.position.z)>1e-9){actor.position.z=Math.abs(z-actor.position.z)<Math.abs(step)?z:actor.position.z+step;actor.position.x=exitRoadX(actor.position.z);portal.update(dt);}};
 const wait=seconds=>{for(let i=0;i<Math.round(seconds*10);i++)portal.update(.1);};
 return {portal,actor,asked,trips,pending,walkTo,wait,settle:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('turning straight back within three seconds asks once and travels only on yes',async t=>{
 const g=village(t);
 g.walkTo(74.5);
 assert.deepEqual(g.asked,['warrior-plains']);assert.deepEqual(g.trips,[]);
 // Still deciding: more walking in the strip neither asks again nor travels.
 g.walkTo(76);assert.equal(g.asked.length,1);assert.deepEqual(g.trips,[]);
 g.pending[0](true);await g.settle();
 assert.deepEqual(g.trips,['warrior-plains']);
});

test('a refusal keeps the player here; pushing on asks again, and after three seconds the road is open',async t=>{
 const g=village(t);
 g.walkTo(73.3,.05);assert.equal(g.asked.length,1);
 g.pending[0](false);await g.settle();
 assert.deepEqual(g.trips,[]);
 // Standing still or stepping back does not ask again.
 g.portal.update(.05);g.walkTo(73,.05);assert.equal(g.asked.length,1);
 // 0.3 m further out than the most inward point since the refusal: asked again (still inside 3 s).
 g.walkTo(73.6,.05);assert.equal(g.asked.length,2);
 g.pending[1](false);await g.settle();assert.deepEqual(g.trips,[]);
 g.wait(3);
 g.walkTo(74.5);assert.equal(g.asked.length,2,'no question after three seconds');
 assert.deepEqual(g.trips,['warrior-plains']);
});

test('after three seconds of play the return needs no question',async t=>{
 const waited=village(t);
 waited.wait(3.1);waited.walkTo(74.5);
 assert.deepEqual(waited.asked,[]);assert.deepEqual(waited.trips,['warrior-plains']);
});

test('the three seconds do not run while the map is still loading',async t=>{
 let loading=true;const covered=village(t,{loading:()=>loading});
 covered.wait(5);loading=false;covered.walkTo(74.5);
 assert.equal(covered.asked.length,1,'time under the loading cover does not count');
});

test('0.2 has no gate: the road travels at once',async t=>{
 const plain=village(t,{gate:false});
 plain.walkTo(74.5);assert.deepEqual(plain.asked,[]);assert.deepEqual(plain.trips,['warrior-plains']);
});

test('a rejected answer means no',async t=>{
 const failing=village(t,{answers:[Promise.reject(new Error('closed'))]});
 failing.walkTo(74.5);await failing.settle();await failing.settle();
 assert.equal(failing.asked.length,1);assert.deepEqual(failing.trips,[]);
});

test('a road to another place than the one just left is never asked',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine),{document}=parseHTML('<button></button>'),previousDocument=globalThis.document,previousLocation=globalThis.location;
 globalThis.document=document;globalThis.location={href:'https://gate.test/game/?character=warrior-v3'};
 t.after(()=>{scene.dispose();engine.dispose();globalThis.document=previousDocument;globalThis.location=previousLocation;});
 const actor={position:new Vector3(exitRoadX(70),0,70)},asked=[],trips=[];
 const other=createMapPortal({mapId:'village',scene,navigation:new VillageNavigation(villageObstacles())},{button:document.querySelector('button'),persistTravel:false,
  returnGate:{destination:'warrior-v4',seconds:3,confirm:()=>{asked.push(1);return true;}},
  getState:()=>({position:actor.position,hp:500,potions:3}),onTravel:url=>trips.push(new URL(url).searchParams.get('character'))});
 for(let z=70.3;z<=74.5;z+=.3){actor.position.z=z;actor.position.x=exitRoadX(z);other.update(.1);}
 assert.deepEqual(asked,[]);assert.deepEqual(trips,['warrior-plains']);other.dispose();
});

test('the question names the place in five languages, starts on the refusal and resolves true only for the accept button',async()=>{
 for(const [lang,place,word] of [['ko','윈드몬 대평원','다시 이동하시겠습니까'],['en','Windmourn Plains','Go back to'],['ja','','戻りますか'],['vi','','Quay lại'],['zh','','返回']]){
  await useLanguage(lang);
  const name=t('place.warrior-plains'),message=t('travel.returnConfirm',{place:name});
  assert.notEqual(name,'place.warrior-plains');assert.ok(message.includes(name)&&message.includes(word),lang+': '+message);
  if(place)assert.equal(name,place);
  for(const key of ['travel.returnTitle','travel.returnAccept'])assert.notEqual(t(key),key);
 }
 await useLanguage('ko');
 const {document,window}=parseHTML('<html lang="ko"><body><main id="app"></main></body></html>');
 const dialogs=createConfirmDialog({doc:document,mount:document.getElementById('app')}),dialog=document.querySelector('dialog.v03-confirm');
 let focused=null;
 dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};
 for(const button of dialog.querySelectorAll('button'))button.focus=()=>{focused=button;};
 const ask=()=>dialogs.ask({title:t('travel.returnTitle'),message:t('travel.returnConfirm',{place:t('place.warrior-plains')}),accept:t('travel.returnAccept')});
 const first=ask();
 assert.equal(dialog.open,true);assert.equal(dialogs.open,true);
 assert.equal(dialog.querySelector('p').textContent,'윈드몬 대평원 지역으로 다시 이동하시겠습니까?');
 const [yes,no]=dialog.querySelectorAll('button');
 assert.equal(yes.textContent,'이동');assert.equal(no.textContent,t('confirm.cancel'));assert.equal(focused,no);
 assert.equal(await ask(),false,'a second question while one is open is refused');
 yes.click();assert.equal(await first,true);assert.equal(dialog.open,false);assert.equal(dialogs.open,false);
 const second=ask();no.click();assert.equal(await second,false);
 const third=ask();dialog.close();assert.equal(await third,false,'Escape or closing the dialog means no');
 const fourth=ask();
 dialog.dispatchEvent(Object.assign(new window.Event('keydown',{bubbles:true}),{code:'KeyA'}));assert.equal(focused,yes);
 dialog.dispatchEvent(Object.assign(new window.Event('keydown',{bubbles:true}),{code:'ArrowRight'}));assert.equal(focused,no);
 dialogs.dispose();assert.equal(await fourth,false);assert.equal(document.querySelector('dialog.v03-confirm'),null);
});
