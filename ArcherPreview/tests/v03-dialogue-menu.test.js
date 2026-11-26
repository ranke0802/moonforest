// 2026-11-26, user: talking to the smith offers "talk / use the shop / temper equipment",
// the herbalist "talk / use the shop"; W and S move on a keyboard; the last entry of
// every such menu ends the talk.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createDialogue,CHOICE_ARM_MS} from '../src/v03/dialogue.js';
import {SERVICE_MENUS,serviceMenu} from '../src/v03/service-menu.js';
import {createStory} from '../src/v03/story.js';
import {QUESTS,NPCS,DIALOGUES} from '../src/v03/data/chapter1.js';
import {setPack} from '../src/v03/i18n.js';
import ko from '../src/v03/locales/ko.js';
import en from '../src/v03/locales/en.js';
import ja from '../src/v03/locales/ja.js';
import vi from '../src/v03/locales/vi.js';
import zh from '../src/v03/locales/zh.js';

const PACKS={ko,en,ja,vi,zh};
function stage(){
 const {document,window}=parseHTML('<html><body></body></html>');
 let time=0;
 const typewriter={start(node,text){node.textContent=text;return Promise.resolve();},complete:()=>false,stop(){},typing:false};
 const dialogue=createDialogue({doc:document,blip:null,typewriter,portraitFor:who=>who?'art/'+who+'.webp':null,now:()=>time});
 const press=(code,extra={})=>{
  const event=new window.Event('keydown',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'code',{value:code});Object.defineProperty(event,'repeat',{value:!!extra.repeat});
  document.dispatchEvent(event);return event;
 };
 const entries=()=>[...document.querySelectorAll('.v03-dialogue-choice')];
 const selected=()=>entries().findIndex(node=>node.classList.contains('is-selected'));
 return {document,window,dialogue,press,entries,selected,wait(ms=CHOICE_ARM_MS){time+=ms;},layer:document.querySelector('.v03-dialogue')};
}
const SMITH=[{id:'talk',label:'대화하기'},{id:'shop',label:'상점 이용'},{id:'forge',label:'장비 재련'},{id:'leave',label:'대화 그만하기'}];

test('the menu lists its entries under the speaker, the first one selected, and a tap picks one',async()=>{
 const s=stage();
 const picked=s.dialogue.choose(SMITH,{who:'대장장이'});
 assert.equal(s.dialogue.open,true);assert.equal(s.layer.hidden,false);
 assert.equal(s.document.querySelector('.v03-dialogue-who').textContent,'대장장이');
 assert.equal(s.document.querySelector('.v03-dialogue-menu').hidden,false);
 assert.equal(s.document.querySelector('.v03-dialogue-menu').getAttribute('role'),'menu');
 assert.equal(s.document.querySelector('.v03-dialogue-actions').hidden,true,'no "next" button while choosing');
 assert.equal(s.document.querySelector('.v03-dialogue-text').hidden,true);
 assert.deepEqual(s.entries().map(node=>node.textContent),['대화하기','상점 이용','장비 재련','대화 그만하기']);
 assert.ok(s.entries().every(node=>node.getAttribute('role')==='menuitem'&&node.type==='button'));
 assert.equal(s.selected(),0);assert.equal(s.entries()[0].getAttribute('aria-current'),'true');
 assert.equal(s.document.querySelector('.v03-dialogue-portrait').getAttribute('src'),'art/대장장이.webp');
 assert.ok('v03Talk' in s.document.documentElement.dataset,'the play HUD steps back');
 s.wait();s.entries()[2].click();
 assert.equal(await picked,'forge');
 assert.equal(s.dialogue.open,false);assert.equal(s.layer.hidden,true);assert.equal(s.entries().length,0);
 assert.equal(s.document.querySelector('.v03-dialogue-actions').hidden,false);assert.equal(s.document.querySelector('.v03-dialogue-text').hidden,false);
 assert.equal('v03Talk' in s.document.documentElement.dataset,false);
 s.dialogue.dispose();
});

test('W and S (and the arrows) move without wrapping; Enter, Space or E picks; Escape ends the talk',async()=>{
 for(const [down,up] of [['KeyS','KeyW'],['ArrowDown','ArrowUp']]){
  const s=stage(),picked=s.dialogue.choose(SMITH,{who:'대장장이'});
  assert.equal(s.press(up).defaultPrevented,true);assert.equal(s.selected(),0,'stays on the first');
  s.press(down);assert.equal(s.selected(),1);s.press(down);s.press(down);assert.equal(s.selected(),3);
  s.press(down);assert.equal(s.selected(),3,'stays on the last');
  s.press(up);assert.equal(s.selected(),2);
  assert.deepEqual(s.entries().map(node=>node.getAttribute('aria-current')),[null,null,'true',null]);
  s.wait();s.press('Enter');assert.equal(await picked,'forge');s.dialogue.dispose();
 }
 for(const [code,moves,expected] of [['Space',1,'shop'],['KeyE',0,'talk'],['Escape',1,'leave']]){
  const s=stage(),picked=s.dialogue.choose(SMITH);
  assert.equal(s.document.querySelector('.v03-dialogue-who').hidden,true,'no speaker given');
  for(let i=0;i<moves;i++)s.press('KeyS');
  s.wait();const event=s.press(code);assert.equal(event.defaultPrevented,true);
  assert.equal(await picked,expected,code);s.dialogue.dispose();
 }
 // Other keys pass through untouched; a held key does not pick.
 const s=stage(),picked=s.dialogue.choose(SMITH);let settled=false;picked.then(()=>{settled=true;});
 s.wait();assert.equal(s.press('KeyQ').defaultPrevented,false);
 s.press('Enter',{repeat:true});await Promise.resolve();assert.equal(settled,false);
 s.dialogue.cancel();assert.equal(await picked,null);assert.equal(s.dialogue.open,false);
 s.dialogue.dispose();
});

test('a pick within a quarter second of the menu appearing is ignored (the tap that closed the last line)',async()=>{
 const s=stage(),picked=s.dialogue.choose(SMITH);let value;picked.then(v=>{value=v;});
 assert.equal(CHOICE_ARM_MS,250);
 s.entries()[0].click();s.press('Enter');s.press('Escape');await Promise.resolve();
 assert.equal(value,undefined);assert.equal(s.dialogue.open,true);
 s.press('KeyS');assert.equal(s.selected(),1,'moving is allowed at once');
 s.wait(249);s.entries()[1].click();await Promise.resolve();assert.equal(value,undefined);
 s.wait(1);s.entries()[1].click();assert.equal(await picked,'shop');
 s.dialogue.dispose();
});

test('a menu and a conversation never overlap, and a waiting quest line marks the talk entry',async()=>{
 const s=stage();
 const lines=[{who:'대장장이',text:'어서 오게.'}];
 const talk=s.dialogue.play(lines);
 assert.equal(await s.dialogue.choose(SMITH),null,'no menu over a line');
 s.document.querySelector('.v03-dialogue-next').click();assert.equal(await talk,lines);
 const picked=s.dialogue.choose([{id:'talk',label:'대화하기',mark:true},{id:'leave',label:'대화 그만하기'}]);
 assert.equal(await s.dialogue.play(lines),null,'no line over a menu');
 assert.equal(await s.dialogue.choose(SMITH),null,'one menu at a time');
 assert.deepEqual(s.entries().map(node=>'mark' in node.dataset),[true,false]);
 // Clicking outside the box does nothing while choosing.
 s.wait();s.layer.dispatchEvent(new s.window.Event('click',{bubbles:true}));assert.equal(s.dialogue.open,true);
 s.dialogue.dispose();assert.equal(await picked,null,'disposing settles the pick');
 assert.equal(await s.dialogue.choose([]),null);
});

test('the smith offers talk, shop and tempering, the herbalist talk and shop; ending the talk is always last',()=>{
 assert.deepEqual(SERVICE_MENUS,{smith:['shop','forge'],herbalist:['shop']});
 assert.equal(serviceMenu('driver'),null);assert.equal(serviceMenu('elder'),null);
 try{
  for(const [lang,pack] of Object.entries(PACKS)){
   setPack(lang,pack);
   const smith=serviceMenu('smith'),herbalist=serviceMenu('herbalist',true);
   assert.deepEqual(smith.map(entry=>entry.id),['talk','shop','forge','leave']);
   assert.deepEqual(herbalist.map(entry=>entry.id),['talk','shop','leave']);
   assert.deepEqual(smith.map(entry=>entry.label),['talk','shop','forge','leave'].map(id=>pack.ui['talk.menu.'+id]),lang);
   assert.ok(smith.every(entry=>entry.label&&!entry.label.startsWith('talk.')),lang+': every entry has its text');
   assert.equal(new Set(smith.map(entry=>entry.label)).size,4,lang+': four different entries');
   assert.equal(smith[0].mark,false);assert.equal(herbalist[0].mark,true);
  }
  setPack('ko',ko);
  assert.deepEqual(serviceMenu('smith').map(entry=>entry.label),['대화하기','상점 이용','장비 재련','대화 그만하기']);
  assert.deepEqual(serviceMenu('herbalist').map(entry=>entry.label),['대화하기','상점 이용','대화 그만하기']);
 }finally{setPack('ko',ko);}
});

const tick=async(n=4)=>{for(let i=0;i<n;i++)await new Promise(resolve=>setTimeout(resolve,0));};
const armed=()=>new Promise(resolve=>setTimeout(resolve,CHOICE_ARM_MS+30));
function village(npc){
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
 const values=new Map(),journey={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const index=QUESTS.findIndex(quest=>quest.id==='M05');
 journey.setItem('v03-story-v1',JSON.stringify({quest:index,step:1,count:0,done:[]}));
 const player={position:{x:0,z:0}},visits=[],suspended=[];let leaveShop=null;
 const world={scene:{isDisposed:false},mapId:'village',terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>null}};
 const api={world,battle:{encounters:[],combatCount:0},input:{setSuspended:on=>suspended.push(on)},getPlayer:()=>player,getController:()=>null,
  creditGold:(_source,n)=>n,addPotions:n=>n,toast(){},
  openTownShop:(id,view)=>{visits.push([id,view]);return new Promise(resolve=>{leaveShop=resolve;});}};
 const story=createStory({api,doc:document,save:{journey,touch:()=>true},content:{QUESTS,NPCS,DIALOGUES},
  createVisual:()=>({place(x,y,z){this.position={x,y,z};},dispose(){}})});
 story.start();
 const frame=()=>story.update(1/60,{ready:true,mapId:'village',character:'warrior-v3'});
 frame();
 const stand=story.castVisual(npc);Object.assign(player.position,{x:stand.position.x,z:stand.position.z});frame();
 const menu=()=>document.querySelector('.v03-dialogue-menu');
 return {document,story,visits,suspended,menu,entries:()=>[...menu().querySelectorAll('.v03-dialogue-choice')],closeShop:()=>leaveShop?.()};
}

test('the smith: talk, shop and tempering each return to the menu, and only "end the talk" leaves it',async()=>{
 setPack('ko',ko);
 const v=village('smith');
 try{
  assert.equal(v.story.near,true);
  v.document.querySelector('.v03-prompt').click();
  assert.equal(v.story.dialogueOpen,true);assert.equal(v.menu().hidden,false);
  assert.deepEqual(v.entries().map(node=>node.textContent),['대화하기','상점 이용','장비 재련','대화 그만하기']);
  assert.deepEqual(v.suspended,[true],'play input waits while the menu is up');assert.deepEqual(v.visits,[],'no shop opens by itself');
  // Shop, then back to the menu when it closes.
  await armed();v.entries()[1].click();await tick();
  assert.deepEqual(v.visits,[['smith','shop']]);assert.equal(v.menu().hidden,true,'the menu is away while the shop is open');
  v.closeShop();await tick();assert.equal(v.menu().hidden,false);assert.equal(v.entries().length,4);
  // Tempering.
  await armed();v.entries()[2].click();await tick();
  assert.deepEqual(v.visits,[['smith','shop'],['smith','forge']]);
  v.closeShop();await tick();assert.equal(v.menu().hidden,false);
  // Talk: the lines play, then the menu again; the shop does not follow.
  await armed();v.entries()[0].click();await tick();
  assert.equal(v.menu().hidden,true);assert.ok(v.document.querySelector('.v03-dialogue-text').textContent.length>0,'a line is shown');
  for(let i=0;i<40&&v.menu().hidden;i++){v.document.querySelector('.v03-dialogue-next').click();await tick(1);}
  assert.equal(v.menu().hidden,false,'back at the menu after the talk');assert.equal(v.visits.length,2);
  // The last entry ends it.
  await armed();v.entries()[3].click();await tick();
  assert.equal(v.story.dialogueOpen,false);assert.equal(v.suspended.at(-1),false,'play input is back');
  assert.equal(v.visits.length,2);
 }finally{v.story.dispose();}
});

test('the herbalist: talk, shop, end; Escape ends the talk from the keyboard',async()=>{
 setPack('ko',ko);
 const v=village('herbalist');
 try{
  v.document.querySelector('.v03-prompt').click();
  assert.deepEqual(v.entries().map(node=>node.textContent),['대화하기','상점 이용','대화 그만하기']);
  await armed();v.entries()[1].click();await tick();
  assert.deepEqual(v.visits,[['herbalist','shop']]);v.closeShop();await tick();
  await armed();
  const event=new (v.document.defaultView.Event)('keydown',{bubbles:true,cancelable:true});Object.defineProperty(event,'code',{value:'Escape'});
  v.document.dispatchEvent(event);await tick();
  assert.equal(v.story.dialogueOpen,false);assert.equal(v.suspended.at(-1),false);
 }finally{v.story.dispose();}
});

test('someone with no services talks at once, as before; leaving the map closes an open menu',async()=>{
 setPack('ko',ko);
 const plain=village('youth');
 try{
  plain.document.querySelector('.v03-prompt').click();
  assert.equal(plain.story.dialogueOpen,true);assert.equal(plain.menu().hidden,true,'no menu for the youth');
  assert.ok(plain.document.querySelector('.v03-dialogue-text').textContent.length>0);
 }finally{plain.story.dispose();}
 const v=village('smith');
 v.document.querySelector('.v03-prompt').click();assert.equal(v.menu().hidden,false);
 v.story.dispose();await tick();
 assert.deepEqual(v.visits,[]);
});

test('main.js and the town services pass the chosen view through to the shop',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/openTownShop:\(id,view\)=>townServices\?\.openShop\(id,view\)/);
 const services=readFileSync(new URL('../src/v03/town-services.js',import.meta.url),'utf8');
 assert.match(services,/shop\.show\(id,view\)/);
});
