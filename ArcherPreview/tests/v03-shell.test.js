import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createAttractPilot} from '../src/v03/attract-pilot.js';
import {createTitleScreen,slotSummary,formatPlayTime} from '../src/v03/title-screen.js';
import {createOpening,dreamSeconds,DREAM_BEATS} from '../src/v03/opening.js';
import {setupV03,AMBUSH,TITLE_FOE,OPENING_STAGE} from '../src/v03/boot.js';
import {createSaveSession} from '../src/v03/save-slots.js';

const E='moonforest-0.3';
const instant=()=>Promise.resolve();
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(times=12){for(let i=0;i<times;i++)await tick();}
function memory(seed={}){
 const map=new Map(Object.entries(seed));
 return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>{map.set(k,String(v));},removeItem:k=>{map.delete(k);},dump:()=>Object.fromEntries(map)};
}
function dom(){
 const {document,window}=parseHTML('<html><body><main id="app"><canvas id="viewport"></canvas><section id="loading"></section></main></body></html>');
 return {document,window,root:document.getElementById('app')};
}

test('attract pilot converts world steering to the camera frame used by the game',()=>{
 const calls=[],actions={attack:()=>calls.push('attack'),dodge:()=>calls.push('dodge'),guard:()=>calls.push('guard'),move:()=>calls.push('move')};
 const pilot=createAttractPilot({random:()=>.9});
 // Far target straight along +z. With alpha=-PI/2 the game's forward is +z.
 pilot.update(.016,{player:{x:0,z:0},target:{x:0,z:20},targetRadius:1,cameraAlpha:-Math.PI/2,actions});
 assert.ok(Math.abs(pilot.movement.y-1)<1e-9);assert.ok(Math.abs(pilot.movement.x)<1e-9);assert.equal(pilot.movement.run,true);assert.deepEqual(calls,['move']);
 // main.js: world = forward*y + right*x for any camera angle.
 for(const alpha of [0,.7,2.1,-1.3]){
  pilot.reset();pilot.update(.016,{player:{x:1,z:2},target:{x:-9,z:14},targetRadius:1,cameraAlpha:alpha,actions});
  const fx=-Math.cos(alpha),fz=-Math.sin(alpha),rx=-fz,rz=fx,wx=fx*pilot.movement.y+rx*pilot.movement.x,wz=fz*pilot.movement.y+rz*pilot.movement.x,len=Math.hypot(-10,12);
  assert.ok(Math.abs(wx-(-10/len))<1e-9&&Math.abs(wz-12/len)<1e-9);
 }
});
test('attract pilot attacks in range, defends against an attack and escapes a grab',()=>{
 const calls=[],actions={attack:()=>calls.push('attack'),dodge:()=>calls.push('dodge'),guard:()=>calls.push('guard'),move:()=>calls.push('move')};
 let roll=.2;const pilot=createAttractPilot({random:()=>roll});
 const near={player:{x:0,z:0},target:{x:0,z:3},targetRadius:1,cameraAlpha:0,actions};
 for(let i=0;i<80;i++)pilot.update(.016,near);
 assert.ok(calls.includes('attack'));
 // The swing commits: no movement while the blade is out.
 calls.length=0;pilot.reset();for(let i=0;i<70;i++){pilot.update(.016,near);if(calls.includes('attack'))break;}
 assert.equal(pilot.movement.x,0);assert.equal(pilot.movement.y,0);
 calls.length=0;pilot.reset();pilot.update(.016,{...near,targetAttacking:true});assert.deepEqual(calls,['dodge']);
 assert.ok(Math.hypot(pilot.movement.x,pilot.movement.y)>.9,'dodge has a direction');
 pilot.update(.016,{...near,targetAttacking:true});assert.deepEqual(calls.filter(name=>name!=='move'),['dodge'],'defence has a cooldown');
 roll=.95;calls.length=0;pilot.reset();pilot.update(.016,{...near,targetAttacking:true});assert.deepEqual(calls,['guard']);
 calls.length=0;pilot.reset();for(let i=0;i<30;i++)pilot.update(.016,{...near,captured:true});
 assert.ok(calls.length>=2&&calls.every(name=>name==='dodge'));
 calls.length=0;pilot.reset();pilot.update(.016,{player:{x:0,z:0},target:null,actions});assert.deepEqual(calls,[]);assert.equal(pilot.movement.x,0);
});
test('title screen: five menu entries, keyboard order, slot panel and confirm',async()=>{
 const {document}=dom(),actions=[];
 const title=createTitleScreen({doc:document,wait:instant,onAction:a=>actions.push(a)});
 assert.equal(title.visible,false);title.show();assert.equal(title.visible,true);
 const labels=[...title.element.querySelectorAll('.v03-menu-item')].map(b=>b.textContent);
 assert.deepEqual(labels,['새로하기','불러오기','갤러리','설정','끝내기']);
 title.setEnabled('load',false);assert.equal(title.element.querySelector('[data-action="load"]').disabled,true);
 title.element.querySelector('[data-action="load"]').dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));
 title.element.querySelector('[data-action="new"]').dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));
 assert.deepEqual(actions,['new']);
 const index=[{slot:1,used:true,chapter:1,title:'늑대와 마차',place:'대평원',level:2,playSeconds:3725},{slot:2,used:false},{slot:3,used:false}];
 const pick=title.chooseSlot({mode:'load',index,bootSlot:1});
 const slots=[...title.element.querySelectorAll('.v03-slot')];
 assert.equal(slots.length,3);assert.equal(slots[1].disabled,true);assert.match(slots[0].textContent,/늑대와 마차/);assert.match(slots[0].textContent,/1시간 2분/);
 // Menu clicks are ignored while a panel is open.
 title.element.querySelector('[data-action="gallery"]').dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));assert.deepEqual(actions,['new']);
 slots[0].dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));assert.equal(await pick,1);
 const cancelled=title.chooseSlot({mode:'new',index,bootSlot:1});title.closePanel();assert.equal(await cancelled,null);
 const yes=title.confirm({title:'t',message:'m'});title.element.querySelector('.v03-panel-accept').dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));assert.equal(await yes,true);
 const no=title.confirm({title:'t',message:'m'});title.element.querySelector('.v03-panel-back').dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));assert.equal(await no,false);
 assert.deepEqual(slotSummary({slot:2,used:false}),{title:'빈 기록',detail:'새로운 여정을 시작합니다'});assert.equal(formatPlayTime(59),'0분');
 title.dispose();assert.equal(document.querySelector('.v03-title'),null);
});
test('prologue lasts 15 to 20 seconds, shows every beat and can be skipped',async()=>{
 assert.ok(dreamSeconds()>=15&&dreamSeconds()<=20,String(dreamSeconds()));
 const {document}=dom(),seen=[];
 const opening=createOpening({doc:document,wait:async()=>{const text=document.querySelector('.v03-opening-line').textContent;if(text&&seen.at(-1)!==text)seen.push(text);}});
 assert.equal(await opening.play(),'done');assert.deepEqual(seen,DREAM_BEATS.map(beat=>beat.text));assert.equal(opening.active,true);
 await opening.release();assert.equal(opening.active,false);
 let waits=0;const quick=createOpening({doc:document,wait:async()=>{if(++waits===3)document.querySelectorAll('.v03-opening-skip')[1].dispatchEvent(new document.defaultView.Event('click'));}});
 assert.equal(await quick.play(),'skipped');assert.ok(waits<12);
});

function harness({local=memory(),session=memory(),ready=true}={}){
 const {document,window,root}=dom(),log=[];
 let resolveSplash;window.__moonforestSplash={done:new Promise(r=>{resolveSplash=r;}),remove:()=>log.push('splash-removed')};
 const save=createSaveSession({local,session,edition:E,now:()=>1000});
 const player={position:{x:0,z:0}},controller={captured:false,groggy:false,dead:false};
 const wolf={active:true,radius:1.8,actor:{position:{x:0,z:6}},brain:{hp:100,maxHp:900,mode:'idle'}};
 const battle={encounters:[],combat:{hp:120,maxHp:500},loading:false,livingCount:0,
  summon:async(_p,count,kind)=>{log.push(`summon:${kind}:${count}`);battle.encounters=Array.from({length:count},()=>({...wolf,brain:{...wolf.brain}}));battle.livingCount=count;return true;},
  resetBattle:()=>{log.push('resetBattle');battle.encounters=[];battle.livingCount=0;}};
 const state={ready,failed:false,character:'warrior-plains',mapId:'great-plains'};
 const camera={alpha:1,beta:.9,radius:17,lowerRadiusLimit:4,upperRadiusLimit:30};
 const made=[],marks=[],guide={shown:null,hidden:0,show(x,y,z,time,moving){guide.shown={x,y,z,moving};},hide(){guide.shown=null;guide.hidden++;},dispose(){}};
 const createVisual=(_scene,key,{id})=>{const v={id,key,placed:null,disposed:false,place(x,y,z,yaw){v.placed={x,y,z,yaw};},dispose(){v.disposed=true;}};made.push(v);return v;};
 battle.combatCount=0;
 const api={root,save,world:{camera,scene:{isDisposed:false},navigation:{free:()=>true,path:(from,to)=>[{x:(from.x+to.x)/2,z:(from.z+to.z)/2+3},{x:to.x,z:to.z}]},terrain:{heightAt:()=>1.5}},battle,wait:instant,random:()=>.5,createVisual,createGuide:()=>guide,createMarkers:null,setMapMarkers:list=>marks.push(list),placeProps:async props=>{log.push('props:'+props.map(p=>p.id).join(','));return true;},rest:()=>log.push('rest'),
  input:{setSuspended:v=>log.push('suspend:'+v)},actions:{attack:()=>log.push('attack'),dodge:()=>log.push('dodge'),guard:()=>log.push('guard'),move:()=>{}},
  toast:m=>log.push('toast:'+m),getPlayer:()=>player,getController:()=>controller,getState:()=>state,
  resetStage:stage=>log.push('resetStage:'+(stage?`${stage.x},${stage.z}`:'spawn')),openSettings:()=>log.push('settings'),travel:async id=>log.push('travel:'+id),
  startWorld:()=>log.push('startWorld'),exit:()=>log.push('exit'),wake:()=>{}};
 const shell=setupV03(api);
 const click=selector=>document.querySelector(selector).dispatchEvent(new window.Event('click',{bubbles:true}));
 return {document,window,shell,log,state,battle,camera,save,local,session,click,finishSplash:()=>resolveSplash(),controller,player,made,marks,guide,
  reveal:async()=>{await settle();shell.update(.016);await settle();for(let i=0;i<90;i++)shell.update(.016);await settle();}};
}

test('first run: logo → title → attract battle → new game without reload → prologue → ambush → living world',async()=>{
 const h=harness();
 assert.equal(h.shell.screen,'boot');assert.equal(h.shell.blocksProgress,true);
 h.finishSplash();await settle();
 assert.equal(h.shell.screen,'title');assert.equal(h.document.documentElement.dataset.v03Screen,'title');assert.ok(h.log.includes('splash-removed'));
 assert.equal(h.document.querySelector('[data-action="load"]').disabled,true);
 h.shell.update(.016);await settle();
 assert.ok(h.log.includes('suspend:true'));assert.ok(h.log.includes(`summon:${TITLE_FOE.kind}:${TITLE_FOE.count}`));
 // The menu waits, black, until the scene is drawn and streaming is quiet.
 h.state.pending=3;for(let i=0;i<120;i++)h.shell.update(.016);assert.equal(h.document.querySelector('.v03-title').classList.contains('scene-ready'),false);
 h.click('[data-action="new"]');await settle();assert.equal(h.shell.screen,'title','menu clicks wait for the reveal');
 h.state.pending=0;for(let i=0;i<80;i++)h.shell.update(.016);
 assert.ok(h.document.querySelector('.v03-title').classList.contains('scene-ready'));
 assert.equal(h.shell.pilotMovement!==null,true);
 // The showcase cannot end: player topped up, foe floored, camera orbits.
 const alpha=h.camera.alpha;for(let i=0;i<120;i++)h.shell.update(.016);
 assert.equal(h.battle.combat.hp,500);assert.equal(h.battle.encounters[0].brain.hp,900*TITLE_FOE.hpFloor);assert.ok(h.camera.alpha>alpha);assert.ok(h.camera.radius<17);
 assert.equal(h.save.meta().used,false,'title writes nothing');
 h.click('[data-action="new"]');await settle(40);
 assert.equal(h.shell.screen,'play');assert.equal(h.shell.blocksProgress,false);assert.equal(h.shell.blocksGame,false);assert.equal(h.shell.pilotMovement,null);
 assert.ok(h.log.includes(`resetStage:${OPENING_STAGE.x},${OPENING_STAGE.z}`));assert.ok(h.log.includes(`summon:${AMBUSH.kind}:${AMBUSH.count}`));assert.ok(h.log.includes('suspend:false'));
 assert.deepEqual([h.camera.alpha,h.camera.beta,h.camera.radius],[1,.9,17],'title camera is restored before the stage reset');
 assert.equal(h.save.meta().used,true);assert.equal(h.save.meta().title,'늑대와 마차');assert.equal(h.document.querySelector('.v03-title').hidden,true);
 assert.ok(h.log.includes('props:v03-opening-wagon'),'story scenery is placed behind the prologue');
 h.battle.livingCount=0;for(let i=0;i<1000;i++)h.shell.update(.016);assert.ok(h.save.meta().playSeconds>=15);
 assert.equal(h.log.includes('startWorld'),false,'roaming monsters wait until the opening quest is done');
});
test('title actions: settings, gallery, quit, and not-ready new game',async()=>{
 const h=harness({ready:false});h.finishSplash();await settle();h.shell.update(.016);
 assert.equal(h.shell.pilotMovement,null);assert.equal(h.log.some(x=>x.startsWith('summon')),false);
 h.click('[data-action="new"]');await settle();assert.equal(h.shell.screen,'title','nothing happens before the scene is ready');
 h.state.ready=true;await h.reveal();
 h.click('[data-action="settings"]');await settle();assert.ok(h.log.includes('settings'));
 h.click('[data-action="gallery"]');await settle();assert.equal(h.document.querySelectorAll('.v03-gallery-row').length,3);h.click('.v03-panel-back');await settle();
 h.click('[data-action="quit"]');await settle();h.click('.v03-panel-accept');await settle();
 assert.ok(h.log.includes('exit'));assert.equal(h.shell.screen,'exit');assert.equal(h.shell.blocksGame,true);
});
test('existing saves: load another slot reloads with an intent; overwrite wipes first',async()=>{
 const local=memory(),session=memory();
 const seed=createSaveSession({local,session,edition:E,now:()=>10});seed.commit({title:'달빛 여관',chapter:1,character:'warrior-v3',place:'숲의 경계 마을'});seed.journey.setItem('moonforest-gold-v1','77');
 const h=harness({local,session});assert.equal(h.save.slot,2,'boots into the first empty slot');
 let replaced=null;h.window.location={href:'https://test.invalid/moonforest-0.3.html?release=moonforest-0.2&character=warrior-plains&arrival=portal',replace:url=>{replaced=url;}};
 h.finishSplash();await h.reveal();assert.equal(h.document.querySelector('[data-action="load"]').disabled,false);
 h.click('[data-action="load"]');await settle();h.click('.v03-slot[data-slot="1"]');await settle();
 assert.match(replaced,/character=warrior-v3/);assert.doesNotMatch(replaced,/arrival/);
 const next=createSaveSession({local,session,edition:E});assert.deepEqual(next.intent,{slot:1,mode:'load'});assert.equal(next.slot,1);assert.equal(next.journey.getItem('moonforest-gold-v1'),'77');
 replaced=null;h.click('[data-action="new"]');await settle();h.click('.v03-slot[data-slot="1"]');await settle();
 assert.equal(replaced,null,'overwrite asks first');h.click('.v03-panel-accept');await settle();
 assert.match(replaced,/moonforest-0\.3\.html/);assert.doesNotMatch(replaced,/character=/);
 const fresh=createSaveSession({local,session,edition:E});assert.deepEqual(fresh.intent,{slot:1,mode:'new'});assert.equal(fresh.meta().used,false);assert.equal(fresh.journey.getItem('moonforest-gold-v1'),null);
});
test('a document opened with an intent skips logo and title',async()=>{
 const local=memory(),session=memory();createSaveSession({local,session,edition:E}).request(1,'new');
 const h=harness({local,session,ready:false});
 assert.equal(h.shell.screen,'opening');assert.ok(h.log.includes('splash-removed'));assert.equal(h.document.querySelector('.v03-title').hidden,true);
 h.shell.update(.016);assert.equal(h.log.some(x=>x.startsWith('summon')),false);
 h.state.ready=true;h.shell.update(.016);await settle(40);
 assert.equal(h.shell.screen,'play');assert.ok(h.log.includes(`summon:${AMBUSH.kind}:${AMBUSH.count}`));assert.equal(h.save.meta().used,true);
 const local2=memory(),session2=memory();const s=createSaveSession({local:local2,session:session2,edition:E});s.commit({title:'x',character:'warrior-v3'});s.journey.setItem('v03-story-v1','{"quest":1,"step":0,"count":0,"done":[]}');s.request(1,'load');
 const r=harness({local:local2,session:session2});assert.equal(r.shell.screen,'resume');r.shell.update(.016);await settle();
 assert.equal(r.shell.screen,'play');assert.ok(r.log.includes('startWorld'));assert.equal(r.log.some(x=>x.startsWith('summon')),false);
});
test('a loading failure hands the screen back to the game error card',async()=>{
 const h=harness();h.finishSplash();await settle();h.shell.update(.016);await settle();
 h.state.failed=true;h.shell.update(.016);
 assert.equal(h.shell.screen,'failed');assert.equal(h.shell.blocksProgress,true);assert.equal(h.document.querySelector('.v03-title').hidden,true);assert.equal(h.shell.pilotMovement,null);assert.ok(h.log.includes('suspend:false'));
 h.window.dispatchEvent(new h.window.Event('pagehide'));assert.equal(h.save.meta().used,false,'a failed start never creates a save');
});
test('0.3 entry and runtime hooks are wired',()=>{
 const html=readFileSync(new URL('../moonforest-0.3.html',import.meta.url),'utf8'),main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(html,/<div id="v03-splash" aria-hidden="true"><span>HYProduct<\/span><\/div>/);assert.match(html,/<title>MoonForest 0\.3<\/title>/);
 assert.match(html,/moonforest-0\.3:intent:v1/);assert.match(html,/src="\/src\/main\.js"/);
 assert.ok(html.indexOf('moonforest-v03-splash"')<html.indexOf('moonforest-startup-guard'));
 for(const hook of ['world.v03?.defeat(event)','!versionRoute.edition&&!elenaReviewMode','world.v03?.update(dt);','world.v03?.pilotMovement??input.value()','!world.v03?.blocksGame','world.v03?.blocksProgress',"await import('./v03/index.js')",'v03Save.journey'])assert.ok(main.includes(hook),hook);
 assert.equal(main.includes('chapterQuests?.action('),false);
});

test('quest log: defeat counts, multi-target talks in any order, reach, persistence',async()=>{
 const {createQuestLog}=await import('../src/v03/quests.js'),{QUESTS,DIALOGUES,NPCS}=await import('../src/v03/data/chapter1.js');
 const store=memory(),log=createQuestLog({quests:QUESTS,storage:store});log.reset();
 assert.equal(log.objective(),'늑대를 물리치기 (0/1)');
 assert.equal(log.notify({type:'talk',npc:'driver'}).changed,false);
 assert.equal(log.notify({type:'defeat',kind:'gray-wolf'}).stepDone,true,'the first fight counts whatever was defeated');assert.equal(log.step().id,'driver');
 const counted=createQuestLog({quests:[{id:'T',title:'t',steps:[{id:'a',text:'잡기',type:'defeat',kind:'wolf',count:3}]}],storage:memory()});counted.reset();
 assert.equal(counted.notify({type:'defeat',kind:'bear'}).changed,false);counted.notify({type:'defeat',kind:'wolf'});assert.equal(counted.objective(),'잡기 (1/3)');counted.notify({type:'defeat',kind:'wolf'});assert.equal(counted.notify({type:'defeat',kind:'wolf'}).questDone,'T');
 assert.equal(log.dialogueFor('driver'),'driver-thanks');assert.equal(log.dialogueFor('elder'),null);
 const again=createQuestLog({quests:QUESTS,storage:store});assert.equal(again.load(),true);assert.equal(again.step().id,'driver');
 log.notify({type:'talk',npc:'driver'});assert.equal(log.notify({type:'reach',map:'great-plains'}).changed,false);
 assert.equal(log.notify({type:'reach',map:'village'}).questDone,'M00');assert.equal(log.quest().id,'M01');
 assert.equal(log.notify({type:'talk',npc:'innkeeper'}).questDone,'M01');
 for(const npc of ['youth','elder'])assert.equal(log.notify({type:'talk',npc}).stepDone,false);
 assert.equal(log.objective(),'주민 세 사람의 이야기 듣기 (2/3)');assert.equal(log.notify({type:'talk',npc:'youth'}).changed,false,'no double count');
 assert.equal(log.notify({type:'talk',npc:'herbalist'}).stepDone,true);assert.equal(log.notify({type:'talk',npc:'innkeeper'}).questDone,'M02');
 assert.equal(log.notify({type:'talk',npc:'chief'}).stepDone,true);
 assert.equal(log.notify({type:'defeat',kind:'wolf',map:'village'}).changed,false,'M03 hunts only count on the plains');
 for(let i=0;i<3;i++)log.notify({type:'defeat',kind:'boar',map:'great-plains'});
 assert.equal(log.objective(),'촌장에게 알리기');assert.equal(log.notify({type:'talk',npc:'chief'}).questDone,'M03');
 assert.equal(log.notify({type:'defeat',kind:'gray-wolf',map:'great-plains'}).changed,false,'only the bear counts for M04');
 assert.equal(log.notify({type:'defeat',kind:'bear',map:'great-plains'}).stepDone,true);assert.equal(log.notify({type:'talk',npc:'chief'}).questDone,'M04');
 for(let i=0;i<4;i++)log.notify({type:'defeat',kind:'goblin',map:'village'});assert.equal(log.notify({type:'talk',npc:'youth'}).questDone,'M05');assert.equal(log.finished,true);assert.equal(log.objective(),'');
 // Data integrity: every referenced dialogue and NPC exists.
 const ids=new Set(NPCS.map(n=>n.id));
 for(const quest of QUESTS)for(const step of quest.steps)if(step.type==='talk')for(const target of step.targets){assert.ok(ids.has(target),target);assert.ok(DIALOGUES[step.dialogues[target]]?.length,step.dialogues[target]);}
 for(const npc of NPCS)assert.ok(DIALOGUES[npc.idle]?.length,npc.idle);
 for(const quest of QUESTS)for(const step of quest.steps){if(step.intro)assert.ok(DIALOGUES[step.intro]?.length,step.intro);if(step.summon)assert.ok(step.at&&step.map&&step.kind,step.id);}
 store.setItem('v03-story-v1','{"quest":99,"step":0,"done":[]}');assert.equal(createQuestLog({quests:QUESTS,storage:store}).load(),false);
});
test('story: first fight coaching, driver talk, village cast, rest effect and save title',async()=>{
 const h=harness();h.finishSplash();await h.reveal();h.click('[data-action="new"]');await settle(40);
 h.battle.combat.hp=500;
 const hud=sel=>h.document.querySelector(sel),key=code=>h.document.dispatchEvent(Object.assign(new h.window.Event('keydown',{bubbles:true,cancelable:true}),{code}));
 h.shell.update(.016);
 assert.equal(hud('.v03-quest-title').textContent,'늑대와 마차');assert.equal(hud('.v03-quest-objective').textContent,'늑대를 물리치기 (0/1)');
 assert.deepEqual(h.made.map(v=>v.id),['driver']);assert.equal(h.made[0].placed.y,1.5);
 // Coaching runs in order: move → camera → attack → dodge → shield.
 assert.match(hud('.v03-hint').textContent,/^이동 · W A S D/);
 h.controller.state='slash';h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^이동/,'attacking early does not skip the movement lesson');
 h.controller.state='idle';h.player.position={x:2,z:0};h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^시점 돌리기/);
 for(let i=0;i<620;i++)h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^공격/,'an ignored lesson gives way after a few seconds');

 h.controller.state='slash';h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/회피/);
 h.controller.state='dodge';h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/방패/);
 h.controller.state='idle';h.controller.guarding=true;h.shell.update(.016);assert.equal(hud('.v03-hint').hidden,true);h.controller.guarding=false;
 // One-time tips: low health shows the potion card once, then it expires.
 assert.equal(hud('.v03-tip-title').textContent,'길잡이 빛');assert.equal(hud('.v03-tip').hidden,true,'the first tip card has expired');
 h.battle.combat.hp=200;h.shell.update(.016);
 assert.equal(hud('.v03-tip').hidden,false);assert.equal(hud('.v03-tip-title').textContent,'회복약');assert.match(hud('.v03-tip-lead').textContent,/숫자 1 키/);
 for(let i=0;i<500;i++)h.shell.update(.016);assert.equal(hud('.v03-tip').hidden,true);h.battle.combat.hp=500;
 // No talking during combat; the title/prologue never count defeats.
 // The guide light leads to the wolf during the fight, stopping short of it.
 h.battle.encounters=[{active:true,brain:{hp:300,maxHp:300,mode:'idle'},actor:{position:{x:2,z:14}}}];h.battle.combatCount=1;for(let i=0;i<200;i++)h.shell.update(.016);
 assert.ok(h.guide.shown&&h.guide.shown.z>4&&h.guide.shown.z<12.2,JSON.stringify(h.guide.shown));
 h.player.position={x:-65.6,z:-23.6};h.battle.combatCount=2;h.shell.update(.016);assert.equal(hud('.v03-prompt').hidden,true);
 h.shell.defeat({kind:'wolf'});h.battle.encounters=[];h.battle.combatCount=0;h.battle.livingCount=0;h.shell.update(.016);
 assert.equal(hud('.v03-quest-objective').textContent,'마부와 이야기하기');assert.match(hud('.v03-prompt').textContent,/E · 마부와 이야기하기/);
 assert.equal(hud('.v03-tip-title').textContent,'강공격','the next tip waits its turn');
 const potionKey=[];h.window.addEventListener('keydown',()=>potionKey.push('game'));
 key('KeyE');await settle();assert.deepEqual(potionKey,[],'E near an NPC talks and never reaches the potion key');assert.equal(h.shell.blocksGame,true);
 const portrait=hud('.v03-dialogue-portrait');assert.equal(portrait.hidden,false);assert.match(portrait.src,/portraits\/driver\.webp$/);assert.equal(hud('.v03-dialogue-who').textContent,'마부');assert.ok(h.log.filter(x=>x==='suspend:true').length>=2);
 // E advances every line and closes the last one without reopening the talk.
 for(let i=0;i<4;i++){key('KeyE');await settle(2);}await settle();
 assert.equal(hud('.v03-dialogue').hidden,true,'E closes the conversation');
 assert.equal(h.shell.blocksGame,false);assert.equal(hud('.v03-quest-objective').textContent,'길을 따라 마을로 가기');assert.equal(h.log.at(-1),'suspend:false');
 // Walking away: the light follows the navigation path toward the village gate, ahead of the player.
 h.player.position={x:-66,z:-24};for(let i=0;i<300;i++)h.shell.update(.016);
 assert.equal(h.shell.inspect().story.guide,'exit:village');assert.ok(Math.hypot(h.guide.shown.x+66,h.guide.shown.z+24)>4,'the light is ahead of the player');
 assert.equal(h.log.includes('startWorld'),false);
 h.state.mapId='village';h.state.character='warrior-v3';h.shell.update(.016);
 assert.equal(hud('.v03-quest-title').textContent,'달빛 여관');assert.ok(h.log.includes('startWorld'),'the world wakes after the opening quest');assert.equal(h.made[0].disposed,true);assert.deepEqual(h.made.slice(1).map(v=>v.id),['innkeeper','elder','herbalist','chief','youth']);
 assert.deepEqual(h.marks.at(-1),[{x:-3.4,z:10.6,glyph:'?'}],'the innkeeper carries a ? on the minimap');
 assert.equal(h.save.meta().title,'달빛 여관');assert.match(hud('.v03-banner').textContent,/완료 · 늑대와 마차/);
 h.player.position={x:-3.4,z:10.6};h.shell.update(.016);assert.equal(hud('.v03-prompt').textContent,'E · 여관 주인과 이야기하기');assert.equal(h.document.documentElement.dataset.v03Cursor,'talk','the cursor offers a conversation');hud('.v03-prompt').dispatchEvent(new h.window.Event('click',{bubbles:true,cancelable:true}));await settle();
 for(let i=0;i<5;i++)key('Space');await settle();
 assert.ok(h.log.includes('rest'));assert.ok(h.shell.inspect().story.tips.includes('rest'));assert.equal(hud('.v03-quest-title').textContent,'사람들이 기억하는 성녀');assert.equal(hud('.v03-quest-objective').textContent,'주민 세 사람의 이야기 듣기 (0/3)');
 // A later document resumes the same quest step.
 const again=harness({local:h.local,session:(()=>{const s=memory();createSaveSession({local:h.local,session:s,edition:E}).request(1,'load');return s;})()});
 again.state.mapId='village';again.shell.update(.016);await settle();again.shell.update(.016);
 assert.equal(again.document.querySelector('.v03-quest-title').textContent,'사람들이 기억하는 성녀');
});

test('guide track keeps a lead, waits for the player and survives a path rebuild',async()=>{
 const {createGuideTrack}=await import('../src/v03/guide-track.js'),track=createGuideTrack();
 assert.equal(track.update(.1,{x:0,z:0}),false);
 track.setPath([{x:0,z:0},{x:0,z:40}]);const player={x:0,z:0};
 for(let i=0;i<120;i++)track.update(1/60,player);
 assert.ok(Math.abs(track.position.z-7)<.2,'waits about seven metres ahead: '+track.position.z);
 player.z=10;for(let i=0;i<120;i++)track.update(1/60,player);assert.ok(Math.abs(track.position.z-17)<.3);
 // Rebuilding the path from the player's new position does not pull the light back.
 const before=track.position.z;track.setPath([{x:0,z:10},{x:0,z:40}]);assert.ok(Math.abs(track.position.z-before)<.01);
 player.z=38;let arrived=false;for(let i=0;i<240;i++)arrived=track.update(1/60,player,{stopShort:1.5});
 assert.equal(arrived,true);assert.ok(Math.abs(track.position.z-38.5)<.01);
 // A corner is followed along the path, not cut across.
 track.clear();track.setPath([{x:0,z:0},{x:0,z:5},{x:5,z:5}]);for(let i=0;i<300;i++)track.update(1/60,{x:0,z:4});
 assert.ok(Math.abs(track.position.z-5)<.01&&track.position.x>4.9);
});
