import test from 'node:test';
import {createStory} from '../src/v03/story.js';
import {NPCS,DIALOGUES} from '../src/v03/data/chapter1.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createAttractPilot} from '../src/v03/attract-pilot.js';
import {t,setPack,localizeChapter,cloneChapter,tr} from '../src/v03/i18n.js';
import {createTitleScreen,slotSummary,formatPlayTime} from '../src/v03/title-screen.js';
import {createOpening,dreamSeconds,DREAM_BEATS,INTRO} from '../src/v03/opening.js';
import {setupV03,AMBUSH,TITLE_FOE,OPENING_STAGE} from '../src/v03/boot.js';
import {createSaveSession,readIntent} from '../src/v03/save-slots.js';
import {setTypewriterEnabled} from '../src/v03/typewriter.js';

// These flows assert whole lines and one key per line; typing is covered by
// tests/v03-typewriter.test.js.
setTypewriterEnabled(false);

const E='moonforest-0.3';
const instant=()=>Promise.resolve();
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(times=12){for(let i=0;i<times;i++)await tick();}
// 새로하기 → a slot → chapter one; 불러오기 → a slot → a chapter (user, 2026-11-24 21:07).
async function newGame(h,slot=1){h.click('[data-action="new"]');await settle();h.click(`.v03-slot[data-slot="${slot}"]`);await settle();h.click('[data-chapter="1"]');}
async function loadGame(h,slot,chapter=1){h.click('[data-action="load"]');await settle();h.click(`.v03-slot[data-slot="${slot}"]`);await settle();h.click(`[data-chapter="${chapter}"]`);}
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
 // Two metres from the edge it never swings at air: it steps in instead.
 const ring={player:{x:0,z:0},target:{x:0,z:3},targetRadius:1,cameraAlpha:0,actions};
 for(let i=0;i<80;i++)pilot.update(.016,ring);
 assert.equal(calls.includes('attack'),false,'no swing out of reach');assert.ok(pilot.movement.y!==0||pilot.movement.x!==0,'closing in');
 calls.length=0;pilot.reset();
 const near={player:{x:0,z:0},target:{x:0,z:2},targetRadius:1,cameraAlpha:0,actions};
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
 // No entry is boxed until the menu is moved with the keys (arrows or W/S); the pointer takes it away again.
 const press=(key,code)=>{const event=new document.defaultView.Event('keydown',{bubbles:true,cancelable:true});event.key=key;event.code=code;title.element.dispatchEvent(event);return event.defaultPrevented;};
 assert.equal(title.element.classList.contains('is-keyed'),false);assert.equal(title.element.tabIndex,-1);
 assert.equal(press('Enter','Enter'),false);assert.equal(title.element.classList.contains('is-keyed'),false,'other keys do not mark the menu');
 assert.equal(press('s','KeyS'),true);assert.equal(title.element.classList.contains('is-keyed'),true,'W/S move the menu like the arrows');
 title.element.dispatchEvent(new document.defaultView.Event('pointermove',{bubbles:true}));assert.equal(title.element.classList.contains('is-keyed'),false);
 assert.equal(press('ArrowDown','ArrowDown'),true);assert.equal(title.element.classList.contains('is-keyed'),true);
 title.show();assert.equal(title.element.classList.contains('is-keyed'),false,'shown again: unmarked');
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
// Painted prologue (2026-11-18): slow cross-fades per beat, still skippable.
test('prologue lasts 30 to 40 seconds, shows the entrance and every beat and can be skipped',async()=>{
 assert.ok(dreamSeconds()>=30&&dreamSeconds()<=40,String(dreamSeconds()));
 const {document}=dom(),seen=[];
 const opening=createOpening({doc:document,wait:async()=>{const text=document.querySelector('.v03-opening-line').textContent;if(text&&seen.at(-1)!==text)seen.push(text);}});
 assert.equal(await opening.play(),'done');assert.deepEqual(seen,[...INTRO.lines.map(row=>t(row.key)),...DREAM_BEATS.map(beat=>t(beat.key))]);assert.equal(opening.active,true);
 await opening.release();assert.equal(opening.active,false);
 let waits=0;const quick=createOpening({doc:document,wait:async()=>{if(++waits===3)document.querySelectorAll('.v03-opening-skip')[1].dispatchEvent(new document.defaultView.Event('click'));}});
 assert.equal(await quick.play(),'skipped');assert.ok(waits<12);
});

test('village quest markers sample only visible heads; talk range drops out immediately in combat',async t=>{
 const {document}=dom(),heights=[],pins=[],events=[],shown=new Map();
 let combatReads=0,fighting=false,groundLift=0;
 const battle={encounters:[],get combatCount(){combatReads++;return Number(fighting);}};
 const player={position:{x:45,z:45}},world={scene:{isDisposed:false},mapId:'village',terrain:{heightAt(x,z){heights.push({x,z});return x*.3+z*.2+groundLift;}}};
 const api={world,battle,input:{setSuspended(){}},getPlayer:()=>player,getController:()=>null,setMapMarkers:rows=>pins.push(rows)};
 const quest={id:'marker-qa',title:'Visit',steps:[{id:'speak',type:'talk',text:'Visit',targets:['elder']}]};
 const content={QUESTS:[quest],NPCS,DIALOGUES:{'inn-idle':[{text:'Welcome'}]}};
 const markers={
  set(id,glyph,x,y,z){events.push({id,glyph});if(glyph)shown.set(id,{glyph,x,y,z});else shown.delete(id);},
  update(){},clear(){shown.clear();},dispose(){}
 };
 const story=createStory({api,doc:document,save:{journey:memory(),touch(){}},content,createMarkers:()=>markers,
  createVisual:()=>({place(x,y,z){this.position={x,y,z};},dispose(){}})});
 t.after(()=>story.dispose());story.start();
 const frame=()=>story.update(1/60,{ready:true,mapId:'village',character:'warrior-v3'});
 frame();heights.length=0;events.length=0;combatReads=0;
 const count=60;
 for(let i=0;i<count;i++)frame();
 t.diagnostic('60 distant village frames: terrain height samples '+heights.length+', marker set calls '+events.length+', story combat-count reads '+combatReads);
 assert.equal(heights.length,count);assert.equal(events.length,count);assert.equal(combatReads,count,'the slow-motion system still checks combat each frame');
 assert.deepEqual([...shown.keys()],['elder']);assert.equal(pins.length,1);
 const elder=story.castVisual('elder');elder.position.x+=1;groundLift=2;frame();
 const at=elder.position;assert.deepEqual(shown.get('elder'),{glyph:'?',x:at.x,y:at.x*.3+at.z*.2+groundLift+2.55,z:at.z});
 const inn=story.castVisual('innkeeper');player.position={...inn.position};
 frame();assert.equal(story.near,true);fighting=true;frame();assert.equal(story.near,false);fighting=false;frame();assert.equal(story.near,true);
 document.querySelector('.v03-prompt').click();assert.equal(story.dialogueOpen,true);
 events.length=0;heights.length=0;frame();frame();
 assert.equal(shown.size,0);assert.deepEqual(events,[{id:'elder',glyph:null}]);assert.equal(heights.length,0);assert.deepEqual(pins.at(-1),[]);
 document.querySelector('.v03-dialogue-next').click();await settle(2);
 assert.equal(story.dialogueOpen,false);frame();assert.deepEqual([...shown.keys()],['elder']);assert.equal(pins.at(-1)[0].x,at.x);
});

function harness({local=memory(),session=memory(),ready=true,inPlace=false,stopWorld=false,reloadProgress=false,travel=null,iphone=false,wait=instant}={}){
 const {document,window,root}=dom(),log=[];
 if(iphone)Object.defineProperty(document,'defaultView',{value:new Proxy(window,{get(target,key){return key==='navigator'?{userAgent:'iPhone',maxTouchPoints:5}:target[key];}})});
 let resolveSplash;window.__moonforestSplash={done:new Promise(r=>{resolveSplash=r;}),remove:()=>{log.push('splash-removed');resolveSplash();}};
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
 const api={root,save,world:{camera,scene:{isDisposed:false},navigation:{free:()=>true,path:(from,to)=>[{x:(from.x+to.x)/2,z:(from.z+to.z)/2+3},{x:to.x,z:to.z}]},terrain:{heightAt:()=>1.5}},battle,wait,random:()=>.5,createVisual,createGuide:()=>guide,createMarkers:null,setMapMarkers:list=>marks.push(list),placeProps:async props=>{log.push('props:'+props.map(p=>p.id).join(','));return true;},rest:()=>log.push('rest'),
  input:{setSuspended:v=>log.push('suspend:'+v)},actions:{attack:()=>log.push('attack'),dodge:()=>log.push('dodge'),guard:()=>log.push('guard'),move:()=>{}},
  toast:m=>log.push('toast:'+m),creditGold:(source,n)=>{log.push('gold:'+source+':'+n);return n;},getPlayer:()=>player,getController:()=>controller,getState:()=>state,
  resetStage:stage=>log.push('resetStage:'+(stage?`${stage.x},${stage.z}`:'spawn')),openSettings:()=>log.push('settings'),travel:travel?id=>travel(id,state,log):async id=>{log.push('travel:'+id);state.character=id;return true;},
  prepareWorld:()=>log.push('prepareWorld'),prefetchScore:key=>log.push('prefetch:'+key),startWorld:()=>log.push('startWorld'),exit:()=>log.push('exit'),wake:()=>{}};
 if(inPlace)api.restartProgress=()=>{log.push('restartProgress');return true;};
 if(stopWorld)api.stopWorld=()=>log.push('stopWorld');
 if(reloadProgress)api.reloadProgress=()=>{log.push('reloadProgress');return true;};
 const shell=setupV03(api);
 // This shell fixture has a camera stub and DOM only. Real GLB loading is
 // exercised separately against a Babylon scene.
 shell.story.prepareOpeningCast=async id=>shell.story.prepare(id);
 const click=selector=>document.querySelector(selector).dispatchEvent(new window.Event('click',{bubbles:true}));
 return {api,document,window,shell,log,state,battle,camera,save,local,session,click,finishSplash:()=>resolveSplash(),controller,player,made,marks,guide,
  reveal:async()=>{await settle();shell.update(.016);await settle();for(let i=0;i<90;i++)shell.update(.016);await settle();}};
}

test('chapters: a returning warrior finishes the original slot, reads Elena’s journal, faces phase two and keeps both clears',async()=>{
 const local=memory(),session=memory(),seed=createSaveSession({local,session,edition:E,now:()=>50});
 const {QUESTS}=await import('../src/v03/data/chapter1.js');
 const {questKey,chapterProgress}=await import('../src/v03/chapter-progress.js');
 const {elenaJournal}=await import('../src/v03/data/chapter2.js');
 seed.commit({chapter:1,character:'warrior-v3',title:'남겨진 방',playSeconds:37});
 seed.journey.setItem(questKey(1),JSON.stringify({quest:QUESTS.length-1,step:0,count:0,done:[]}));
 const h=harness({local,session,stopWorld:true,reloadProgress:true,travel:async(character,state)=>{
  state.character=character;state.mapId=({'warrior-v3':'village','warrior-v5':'witch-cave','warrior-plains':'great-plains'})[character];return true;
 }});
 const tick=()=>h.shell.update(.02);
 async function panel(){
  h.click('[data-action="load"]');await settle();h.click('[data-slot="1"]');await settle();
 }
 async function talk(id){
  const npc=NPCS.find(row=>row.id===id);Object.assign(h.player.position,{x:npc.x,z:npc.z});tick();
  assert.equal(h.shell.inspect().story.near,id);h.click('.v03-prompt');assert.equal(h.shell.story.dialogueOpen,true);
 }
 async function finishDialogue(){
  for(let i=0;i<22&&h.shell.story.dialogueOpen;i++)h.click('.v03-dialogue-next');
  await settle();assert.equal(h.shell.story.dialogueOpen,false);
 }
 async function back(){assert.equal(await h.shell.returnToTitle(),true);await settle();}
 try{
  h.finishSplash();await h.reveal();await panel();assert.equal(h.document.querySelector('[data-chapter="2"]').disabled,true);
  h.click('[data-chapter="1"]');await settle(40);tick();assert.equal(h.shell.story.log.quest().id,'M09');
  await talk('innkeeper');await finishDialogue();assert.equal(h.shell.story.log.finished,true);
  assert.equal(h.log.filter(e=>e.startsWith('gold:v03-quest-M09')).length,1);
  await back();await panel();
  assert.equal(h.document.querySelector('[data-chapter="2"]').disabled,false);
  assert.equal(h.document.querySelector('[data-chapter="3"]').disabled,true);
  h.click('[data-chapter="2"]');await settle(40);tick();assert.equal(h.save.meta().chapter,2);
  await talk('innkeeper');assert.match(h.document.querySelector('.v03-dialogue-portrait').getAttribute('src'),/01\.webp/);await finishDialogue();
  assert.equal(h.save.journey.getItem('v03-gallery-v1:scene:journal-heal'),'1');
  assert.equal(h.document.querySelector('.v03-dialogue-portrait').hasAttribute('src'),false);
  await back();await loadGame(h,1,2);await settle(40);tick();
  assert.equal(h.shell.story.log.step().id,'palisade');await talk('youth');await finishDialogue();
  await h.api.travel('warrior-v5');tick();assert.equal(h.shell.story.dialogueOpen,true);await finishDialogue();assert.equal(h.shell.story.log.step().id,'sanctuary');
  h.shell.defeat({kind:'elena',phase:1});assert.equal(h.shell.story.log.step().id,'sanctuary');
  h.shell.defeat({kind:'elena',phase:2});assert.equal(h.shell.story.log.step().id,'last-page');
  await h.api.travel('warrior-v3');tick();await talk('innkeeper');await finishDialogue();
  const completed=h.save.journey.getItem(questKey(2));
  const status=()=>chapterProgress(h.save.journey,{1:QUESTS,2:elenaJournal('ko').QUESTS});
  assert.deepEqual([...status().done].sort(),[1,2]);assert.equal(status().available(3),false);
  await back();await panel();h.click('[data-replay="2"]');await settle(40);tick();assert.equal(h.shell.story.log.step().id,'inn');
  await talk('innkeeper');await finishDialogue();assert.equal(h.save.journey.getItem(questKey(2)),completed);
  await back();await panel();h.click('[data-chapter="1"]');await settle(40);assert.equal(h.shell.story.log.finished,true);
  assert.equal(h.log.filter(e=>e.startsWith('gold:v03-quest-M09')).length,1);assert.equal(h.save.index()[1].used,false);
  // The second chapter has no wagon props. Replaying chapter one in the same
  // document must restore them before the camera's model gate is asked to run.
  await back();await loadGame(h,1,2);await settle(40);await back();
  const prepareCast=h.shell.story.prepareOpeningCast;
  let preparedWagon=false;
  h.shell.story.prepareOpeningCast=async(...args)=>{
   const before=h.log.length;await prepareCast(...args);
   preparedWagon=h.log.slice(before).includes('props:v03-opening-wagon');
  };
  await panel();h.click('[data-replay="1"]');await settle(40);assert.equal(h.shell.story.log.quest().id,'M00');assert.equal(preparedWagon,true);
  // Restore a player part way through a replay of a potion-paying chapter-one quest.
  await back();h.save.journey.setItem(questKey(1,true),JSON.stringify({quest:1,step:0,count:0,done:[]}));
  let potions=0;h.api.addPotions=count=>{potions+=count;return count;};
  await loadGame(h,1,1);await settle(40);await h.api.travel('warrior-v3');tick();
  await talk('innkeeper');await finishDialogue();assert.equal(h.shell.story.log.quest().id,'M02');assert.equal(potions,0);
  assert.equal(JSON.parse(h.save.journey.getItem(questKey(1))).quest,QUESTS.length);
 }finally{h.shell.dispose();}
});
test('the actual title gallery ignores the attract fight and lists discoveries after an in-place return',async t=>{
 const h=harness({stopWorld:true});t.after(()=>h.shell.dispose());
 h.finishSplash();await h.reveal();
 const browse=async()=>{
  h.click('[data-action="gallery"]');await settle(30);
  return h.document.querySelector('.v03-gallery');
 };
 h.shell.defeat({kind:'wolf'});h.shell.combatEvent('enemy',h.battle.encounters[0],10);
 const empty=await browse();assert.equal(empty.querySelectorAll('li').length,0);
 h.click('.v03-panel-back');await settle();
 await newGame(h);await settle(40);
 assert.equal(h.shell.screen,'play');
 h.shell.defeat({kind:'hobgoblin-boss'});
 assert.equal(await h.shell.returnToTitle(),true);
 const filled=await browse();
 assert.equal(filled.querySelectorAll('[data-category=scenes] img').length,6);
 assert.equal(filled.querySelector('[data-category=bestiary] li').textContent,'홉고블린');
 assert.equal(filled.querySelectorAll('[data-category=bestiary] li').length,1);
 h.click('.v03-panel-back');await settle();
});
test('chapters: all five localized journals have matching objectives, controls and CG, and an old terminal save opens its sequel',async()=>{
 const {chapterWords}=await import('../src/v03/chapter-select.js');
 const {elenaJournal}=await import('../src/v03/data/chapter2.js');
 const {CHAPTERS,chapterProgress,questKey}=await import('../src/v03/chapter-progress.js');
 const {QUESTS}=await import('../src/v03/data/chapter1.js');
 const sets={1:QUESTS,2:CHAPTERS[1].questIds};
 const storage=memory(),langNames=new Set();
 for(const lang of ['ko','en','ja','zh','vi']){
  const words=chapterWords(lang),episode=elenaJournal(lang);langNames.add(words.menu);
  assert.equal(words.chapters.length,7);assert.ok(words.again&&words.complete&&words.reset);
  assert.deepEqual(episode.QUESTS.map(q=>q.id),sets[2]);
  for(const quest of episode.QUESTS)for(const step of quest.steps){
   assert.ok(step.text);for(const line of [...Object.values(step.dialogues??{}),step.reading].filter(Boolean))assert.ok(episode.DIALOGUES[line].length);
  }
  for(const rows of Object.values(episode.DIALOGUES))for(const line of rows){
   assert.ok(line.text);if(line.illustration)assert.ok(readFileSync(new URL(line.illustration)).length);
   if(lang!=='ko')assert.doesNotMatch(line.text,/[가-힣]/u);
  }
 }
 assert.equal(langNames.size,5);
 storage.setItem(questKey(1),JSON.stringify({quest:10,step:1,done:[]}));
 assert.equal(chapterProgress(storage,sets).available(2),false);
 storage.setItem(questKey(1),JSON.stringify({quest:QUESTS.length,step:0,done:[],count:0}));
 const progress=chapterProgress(storage,sets);assert.equal(progress.available(2),true);assert.equal(progress.select(3),null);
});
test('iPhone starts the dream without priming the roaming population or decoding extra scores',async()=>{
 const h=harness({iphone:true});
 h.finishSplash();await h.reveal();
 assert.equal(h.log.includes('prepareWorld'),false);
 assert.deepEqual(h.log.filter(row=>row.startsWith('prefetch:')),[]);
 assert.equal(h.document.querySelector('.v03-opening-haze'),null);
 let releaseWolf;
 const pending=new Promise(r=>{releaseWolf=r;});
 const summon=h.battle.summon;
 h.battle.summon=async(...args)=>{await pending;return summon(...args);};
 // Keep the wolf pending through the ordinary new-game entry.
 const hold=h.shell.story.prepare.bind(h.shell.story);let preparations=0;
 h.shell.story.prepare=id=>{preparations++;return hold(id);};
 await newGame(h);
 for(let turn=0;turn<4;turn++)await Promise.resolve();
 assert.equal(h.shell.screen,'opening');assert.equal(preparations,0);
 releaseWolf();await settle(40);
 assert.equal(preparations,1);assert.equal(h.shell.screen,'play');
 assert.ok(h.log.includes(`summon:${AMBUSH.kind}:1`));
 h.shell.dispose();
});

for(const entry of ['title','new-intent']){
 test('an immediate skip waits for both the real cast gate and the first wolf via '+entry,async t=>{
  const local=memory(),session=memory();let endBeat;
  if(entry==='new-intent')createSaveSession({local,session,edition:E}).request(1,'new');
  const h=harness({local,session,wait:ms=>ms===100?new Promise(done=>{endBeat=done;}):instant()});t.after(()=>h.shell.dispose());
  let readyCast,readyWolf;
  const normalSummon=h.battle.summon;
  h.battle.summon=async(player,count,kind)=>{
   if(kind===AMBUSH.kind)await new Promise(done=>{readyWolf=done;});
   return normalSummon(player,count,kind);
  };
  h.shell.story.prepareOpeningCast=()=>new Promise(done=>{readyCast=done;});
  if(entry==='title'){h.finishSplash();await h.reveal();await newGame(h);}
  else{await settle();h.shell.update(.016);}
  await settle();
  h.click('.v03-opening-skip');endBeat?.();await settle();
  assert.equal(h.shell.screen,'opening');assert.equal(h.document.querySelector('.v03-opening-preparation').hidden,false);
  if(entry==='title')readyCast();else readyWolf();
  await settle();assert.equal(h.shell.screen,'opening');assert.equal(h.shell.story.started,false);
  if(entry==='title')readyWolf();else readyCast();
  await settle(40);assert.equal(h.shell.screen,'play');
  assert.equal(h.log.filter(x=>x==='summon:'+AMBUSH.kind+':1').length,1);
 });
}
test('the opening can retry a cast failure without summoning a second wolf',async t=>{
 const h=harness();t.after(()=>h.shell.dispose());let tries=0;
 h.shell.story.prepareOpeningCast=async()=>{if(++tries===1)throw new Error('simulated cast failure');};
 h.finishSplash();await h.reveal();await newGame(h);await settle(40);
 assert.equal(h.shell.screen,'opening');const panel=h.document.querySelector('.v03-opening-preparation');
 assert.equal(panel.hidden,false);const retry=panel.querySelector('button');assert.equal(retry.hidden,false);
 retry.click();await settle(40);
 assert.equal(h.shell.screen,'play');assert.equal(tries,2);
 assert.equal(h.log.filter(x=>x==='summon:'+AMBUSH.kind+':1').length,1);
});
test('leaving a stalled opening prevents a late asset completion from starting play',async t=>{
 const h=harness();t.after(()=>h.shell.dispose());let done,signal;
 h.shell.story.prepareOpeningCast=(_map,options)=>{signal=options.signal;return new Promise(resolve=>{done=resolve;});};
 h.finishSplash();await h.reveal();await newGame(h);await settle(40);
 h.document.querySelector('.v03-opening-preparation').lastElementChild.click();
 assert.equal(signal.aborted,true);done();await settle(40);
 assert.equal(h.shell.screen,'title');assert.equal(h.shell.story.started,false);
});

test('dream retains at most two pictures and removes image references on release, cancel and disposal',async()=>{
 const {document}=dom();const cuts=[];let peak=0;
 const urls=()=>[...document.querySelectorAll('.v03-opening-art[src]')].map(el=>el.getAttribute('src'));
 const opening=createOpening({doc:document,flat:true,onCut:cut=>cuts.push(cut),wait:async()=>{peak=Math.max(peak,new Set(urls()).size);}});
 for(let cycle=0;cycle<4;cycle++){
  assert.deepEqual(urls(),[]);await opening.play();await opening.release();assert.deepEqual(urls(),[]);
  opening.cover({art:true});assert.equal(urls().length,1);opening.cancel();
 }
 assert.equal(peak,2);assert.deepEqual(cuts.slice(0,7),['intro','warm','day','alarm','void','voice','wake']);
 opening.cover({art:true});opening.dispose();assert.deepEqual(urls(),[]);
});

test('a slow opening wagon and horse survive the handoff and are released on each map visit',async t=>{
 const {NullEngine,Scene,SceneLoader}=await import('@babylonjs/core');
 const engine=new NullEngine(),scene=new Scene(engine);const h=harness();
 const pending=[],imports=[];
 t.mock.method(SceneLoader,'ImportMeshAsync',(_filter,_url,file)=>new Promise(resolve=>{
  imports.push(file);pending.push(()=>resolve({meshes:[],skeletons:[],animationGroups:[],transformNodes:[]}));
 }));
 const story=h.shell.story;h.api.world.scene=scene;h.api.world.navigation.obstacles=[];
 const counts=()=>[scene.meshes.length,scene.materials.length,scene.textures.length,scene.geometries.length,scene.transformNodes.length,scene.onBeforeRenderObservable.observers.length,scene.onDisposeObservable.observers.length];
 const baseline=counts();
 try{
  for(let cycle=0;cycle<4;cycle++){
   story.prepare('great-plains');story.start({fresh:false});story.update(0,h.state);
   assert.deepEqual(imports.splice(0).sort(),['covered-wagon-shafts.glb','wagon-horse-rig.glb']);
   for(const finish of pending.splice(0))finish();await settle();
   assert.ok(scene.getTransformNodeByName('v03-story-wagon'));assert.ok(scene.getTransformNodeByName('v03-wagon-horse'));
   story.stop();await new Promise(resolve=>setTimeout(resolve,5));assert.deepEqual(counts(),baseline);
  }
 }finally{h.shell.dispose();scene.dispose();engine.dispose();}
});

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
 await newGame(h);await settle(40);
 assert.equal(h.shell.screen,'play');assert.equal(h.shell.blocksProgress,false);assert.equal(h.shell.blocksGame,false);assert.equal(h.shell.pilotMovement,null);
 assert.ok(h.log.includes(`resetStage:${OPENING_STAGE.x},${OPENING_STAGE.z}`));assert.ok(h.log.includes(`summon:${AMBUSH.kind}:${AMBUSH.count}`));assert.ok(h.log.includes('suspend:false'));
 assert.deepEqual([h.camera.alpha,h.camera.beta,h.camera.radius],[1,.9,17],'title camera is restored before the stage reset');
 assert.equal(h.save.meta().used,true);assert.equal(h.save.meta().title,'늑대와 마차');assert.equal(h.document.querySelector('.v03-title').hidden,true);
 assert.ok(h.log.includes('props:v03-opening-wagon'),'story scenery is placed behind the prologue');
 h.battle.livingCount=0;for(let i=0;i<1000;i++)h.shell.update(.016);assert.ok(h.save.meta().playSeconds>=15);
 assert.equal(h.save.journey.getItem('v03-gallery-v1:scene:wagon'),'1','the visible wagon sequence is recorded');
 assert.equal(h.log.includes('startWorld'),false,'roaming monsters wait until the opening quest is done');
});
test('back to the title: only from play, and without the game\'s hooks the caller falls back to the reload',async()=>{
 const h=harness();h.finishSplash();await h.reveal();
 assert.equal(await h.shell.returnToTitle(),false,'not from the title itself');
 await newGame(h);await settle(40);assert.equal(h.shell.screen,'play');
 assert.equal(await h.shell.returnToTitle(),false,'a game without the stopWorld hook falls back to the reload');assert.equal(h.shell.screen,'play');
});
test('back to the title: with the game\'s hooks the same page shows the title again and the record goes on',async()=>{
 const h=harness({stopWorld:true});
 h.finishSplash();await h.reveal();await newGame(h);await settle(40);assert.equal(h.shell.screen,'play');
 h.battle.livingCount=0;for(let i=0;i<200;i++)h.shell.update(.016);
 const quest=h.shell.inspect().story.quest,made=h.made.length;assert.ok(quest);
 h.log.length=0;
 assert.equal(await h.shell.returnToTitle(),true);
 assert.equal(h.shell.screen,'title');assert.equal(h.document.documentElement.dataset.v03Screen,'title');
 assert.equal(h.document.querySelector('.v03-title').hidden,false);
 assert.ok(h.log.includes('stopWorld'));assert.ok(h.log.some(line=>line.startsWith('resetStage:')&&line!=='resetStage:spawn'),'the stage is cleared where the player stands');assert.ok(h.log.includes(`summon:${TITLE_FOE.kind}:${TITLE_FOE.count}`),'the title battle runs again');
 assert.equal(h.shell.inspect().story.started,false);assert.equal(h.shell.inspect().story.cast.length,0,'the cast is put away');
 assert.ok(h.made.filter(v=>v.disposed).length>0||made===0);
 assert.equal(h.shell.blocksProgress,true);assert.equal(h.document.querySelector('[data-action="load"]').disabled,false);
 for(let i=0;i<60;i++)h.shell.update(.016);assert.notEqual(h.shell.pilotMovement,null,'the showcase drives the player again');
 // Continue: the same record, on the same page.
 h.log.length=0;await loadGame(h,h.save.slot);await settle(40);
 assert.equal(h.shell.screen,'play');assert.equal(h.shell.inspect().story.started,true);assert.equal(h.shell.inspect().story.quest,quest,'the same quest goes on');
 assert.ok(h.log.some(line=>line.startsWith('resetStage:')&&line!=='resetStage:spawn'),'back where the player left, not at the map spawn');
 assert.ok(h.shell.inspect().story.cast.length>=0);assert.equal(h.shell.blocksProgress,false);
 // And back once more: it works every time, not only the first.
 assert.equal(await h.shell.returnToTitle(),true);assert.equal(h.shell.screen,'title');
});
test('title actions: settings, gallery, quit, and not-ready new game',async()=>{
 const h=harness({ready:false});h.finishSplash();await settle();h.shell.update(.016);
 assert.equal(h.shell.pilotMovement,null);assert.equal(h.log.some(x=>x.startsWith('summon')),false);
 h.click('[data-action="new"]');await settle();assert.equal(h.shell.screen,'title','nothing happens before the scene is ready');
 h.state.ready=true;await h.reveal();
 h.click('[data-action="settings"]');await settle();assert.equal(h.document.querySelectorAll('.v03-language').length,5,'five languages offered');
 assert.equal(h.document.querySelector('.v03-language.is-current')?.dataset.language,'ko');
 h.click('.v03-settings-game');await settle();assert.ok(h.log.includes('settings'));
 h.click('[data-action="gallery"]');await settle();assert.equal(h.document.querySelectorAll('.v03-gallery-row').length,3);h.click('.v03-panel-back');await settle();
 h.click('[data-action="quit"]');await settle();h.click('.v03-panel-accept');await settle();
 assert.ok(h.log.includes('exit'));assert.equal(h.shell.screen,'exit');assert.equal(h.shell.blocksGame,true);
});
test('loading another record on the same page: the slot is bound, the game reads it again, nothing reloads',async()=>{
 const local=memory(),session=memory();
 const seed=createSaveSession({local,session,edition:E,now:()=>10});seed.commit({title:'달빛 여관',chapter:1,character:'warrior-plains',place:'윈드몬 대평원',playSeconds:321});seed.journey.setItem('moonforest-gold-v1','77');
 const h=harness({local,session,reloadProgress:true,stopWorld:true});assert.equal(h.save.slot,2,'boots into the first empty slot');
 let replaced=null;h.window.location={href:'https://test.invalid/moonforest-0.3.html?character=warrior-plains',replace:url=>{replaced=url;}};
 h.finishSplash();await h.reveal();
 await loadGame(h,1);await settle(40);
 assert.equal(replaced,null,'no reload');assert.equal(readIntent(session,E),null,'no intent left for a next document');
 assert.equal(h.save.slot,1);assert.equal(h.save.journey.getItem('moonforest-gold-v1'),'77','the page now reads record 1');
 assert.ok(h.log.includes('reloadProgress'));assert.equal(h.shell.screen,'play');assert.equal(h.shell.inspect().story.started,true);
 assert.ok(h.shell.inspect().playSeconds>=321,'the record\'s own play time');
 // And the record that was bound before is untouched.
 assert.equal(createSaveSession({local,session:memory(),edition:E}).index()[1].used,false);
});
test('a record on another map keeps its own place while the page is still on the way there; a failed trip reloads',async()=>{
 const seedRecord=local=>{const seed=createSaveSession({local,session:memory(),edition:E,now:()=>10});seed.commit({title:'달빛 여관',chapter:1,character:'warrior-v3',place:'숲의 경계 마을',placeKey:'warrior-v3',playSeconds:50});};
 // The trip takes a while; a save happens in the middle of it (the tab is hidden).
 let finish;const local=memory(),session=memory();seedRecord(local);
 const h=harness({local,session,reloadProgress:true,travel:(id,state,log)=>new Promise(resolve=>{log.push('travel:'+id);finish=()=>{state.character=id;resolve(true);};})});
 h.finishSplash();await h.reveal();assert.equal(h.state.character,'warrior-plains');
 await loadGame(h,1);await settle(20);
 assert.ok(h.log.includes('travel:warrior-v3'));
 h.window.dispatchEvent(new h.window.Event('pagehide'));for(let i=0;i<1100;i++)h.shell.update(.016);
 assert.equal(h.save.meta().character,'warrior-v3','the record still says where it was saved, not where the page stands');assert.equal(h.save.meta().place,'숲의 경계 마을');
 finish();await settle(20);for(let i=0;i<1100;i++)h.shell.update(.016);
 assert.equal(h.save.meta().character,'warrior-v3');assert.equal(h.shell.screen,'play');
 // The trip fails: the record is opened on its own map in a clean document instead.
 const local2=memory(),session2=memory();seedRecord(local2);let replaced=null;
 const g=harness({local:local2,session:session2,reloadProgress:true,travel:async(id,state,log)=>{log.push('travel:'+id);return false;}});
 g.window.location={href:'https://test.invalid/moonforest-0.3.html?character=warrior-plains',replace:url=>{replaced=url;}};
 g.finishSplash();await g.reveal();await loadGame(g,1);await settle(40);
 assert.ok(replaced&&new URL(replaced).searchParams.get('character')==='warrior-v3','reloads on the record\'s map');
 assert.equal(g.save.meta().character,'warrior-v3');assert.deepEqual(readIntent(session2,E),{slot:1,mode:'load'});
});
test('existing saves: load another slot reloads with an intent; overwrite wipes first',async()=>{
 const local=memory(),session=memory();
 const seed=createSaveSession({local,session,edition:E,now:()=>10});seed.commit({title:'달빛 여관',chapter:1,character:'warrior-v3',place:'숲의 경계 마을'});seed.journey.setItem('moonforest-gold-v1','77');
 const h=harness({local,session});assert.equal(h.save.slot,2,'boots into the first empty slot');
 let replaced=null;h.window.location={href:'https://test.invalid/moonforest-0.3.html?release=moonforest-0.2&character=warrior-plains&arrival=portal',replace:url=>{replaced=url;}};
 h.finishSplash();await h.reveal();assert.equal(h.document.querySelector('[data-action="load"]').disabled,false);
 await loadGame(h,1);await settle();
 assert.match(replaced,/character=warrior-v3/);assert.doesNotMatch(replaced,/arrival/);
 const next=createSaveSession({local,session,edition:E});assert.deepEqual(next.intent,{slot:1,mode:'load'});assert.equal(next.slot,1);assert.equal(next.journey.getItem('moonforest-gold-v1'),'77');
 replaced=null;h.click('[data-action="new"]');await settle();h.click('.v03-slot[data-slot="1"]');await settle();
 assert.equal(replaced,null,'overwrite asks first');h.click('.v03-panel-accept');await settle();h.click('[data-chapter="1"]');await settle();
 assert.match(replaced,/moonforest-0\.3\.html/);assert.doesNotMatch(replaced,/character=/);
 const fresh=createSaveSession({local,session,edition:E});assert.deepEqual(fresh.intent,{slot:1,mode:'new'});assert.equal(fresh.meta().used,false);assert.equal(fresh.journey.getItem('moonforest-gold-v1'),null);
});
test('new game over a used slot restarts in place: no reload, the slot is wiped and rebound',async()=>{
 const local=memory(),session=memory();
 const seed=createSaveSession({local,session,edition:E,now:()=>10});seed.commit({title:'달빛 여관',chapter:1,character:'warrior-v3',place:'숲의 경계 마을'});seed.journey.setItem('moonforest-gold-v1','77');
 const h=harness({local,session,inPlace:true});assert.equal(h.save.slot,2);
 let replaced=null;h.window.location={href:'https://test.invalid/moonforest-0.3.html?release=moonforest-0.2&character=warrior-plains',replace:url=>{replaced=url;}};
 h.finishSplash();await h.reveal();
 h.click('[data-action="new"]');await settle();h.click('.v03-slot[data-slot="1"]');await settle();h.click('.v03-panel-accept');await settle();h.click('[data-chapter="1"]');await settle(20);
 assert.equal(replaced,null,'no page reload: the click that started the game keeps its sound');
 assert.ok(h.log.includes('restartProgress'));assert.equal(h.save.slot,1);assert.equal(h.save.journey.getItem('moonforest-gold-v1'),null,'the old record is gone');
 assert.ok(['opening','play'].includes(h.shell.screen));assert.equal(h.save.meta().used,true,'the slot is a save again once the game starts');
});
test('a document opened with an intent skips logo and title',async()=>{
 const local=memory(),session=memory();createSaveSession({local,session,edition:E}).request(1,'new');
 const h=harness({local,session,ready:false});
 assert.equal(h.shell.screen,'opening');assert.ok(h.log.includes('splash-removed'));assert.equal(h.document.querySelector('.v03-title').hidden,true);
 h.shell.update(.016);assert.equal(h.log.some(x=>x.startsWith('summon')),false);
 h.state.ready=true;await settle();h.shell.update(.016);await settle(40);
 assert.equal(h.shell.screen,'play');assert.ok(h.log.includes(`summon:${AMBUSH.kind}:${AMBUSH.count}`));assert.equal(h.save.meta().used,true);
 const local2=memory(),session2=memory();const s=createSaveSession({local:local2,session:session2,edition:E});s.commit({title:'x',character:'warrior-v3'});s.journey.setItem('v03-story-v1','{"quest":1,"step":0,"count":0,"done":[]}');s.request(1,'load');
 const r=harness({local:local2,session:session2});assert.equal(r.shell.screen,'resume');await settle();r.shell.update(.016);await settle();
 assert.equal(r.shell.screen,'play');assert.ok(r.log.includes('startWorld'));assert.equal(r.log.some(x=>x.startsWith('summon')),false);
});
test('a map trip builds the next place\'s cast behind the loading picture',async()=>{
 // main.js reports ready only after the trip ends, so the story's frame update cannot
 // build the cast while the picture covers the stage; arrival() builds it (2026-11-23).
 const local=memory(),session=memory();const s=createSaveSession({local,session,edition:E});s.commit({title:'x',character:'warrior-plains'});s.journey.setItem('v03-story-v1','{"quest":1,"step":0,"count":0,"done":[]}');s.request(1,'load');
 const r=harness({local,session});await settle();r.shell.update(.016);await settle();r.shell.update(.016);
 assert.equal(r.shell.screen,'play');const before=r.made.length;
 r.state.ready=false;r.state.mapId='village';r.state.character='warrior-v3';r.shell.update(.016);
 assert.equal(r.made.length,before,'nothing is built from the frame update during the trip');
 assert.equal(await r.shell.arrival(50),true,'the cast settles behind the cover');
 const folk=r.made.slice(before);assert.deepEqual(folk.map(v=>v.id),NPCS.filter(npc=>npc.map==='village').map(npc=>npc.id));assert.ok(folk.every(v=>v.placed&&!v.disposed));
 r.state.ready=true;r.shell.update(.016);r.shell.update(.016);
 assert.equal(r.made.length,before+folk.length,'the first frame in play does not build it again');assert.ok(folk.every(v=>!v.disposed));
 assert.equal(r.document.querySelector('.v03-place-name').textContent,'몬트하임 마을','the place name still comes with the first frame');
 assert.equal(await r.shell.arrival(50),true,'a second call keeps the same cast');assert.equal(r.made.length,before+folk.length);
 // With frames to watch, the cover stays until a run of smooth frames (or the cap).
 let clock=0,calls=0;const step=()=>calls<10?100:16;r.window.requestAnimationFrame=callback=>{calls++;clock+=step();setImmediate(()=>callback(clock));return calls;};
 assert.equal(await r.shell.arrival(4000),true);assert.equal(calls,9+12,`nine slow frames, then a run of twelve smooth ones (${calls})`);
 calls=-1e9;const started=performance.now();assert.equal(await r.shell.arrival(60),true,'the cast is there, the cap ends the wait');assert.ok(performance.now()-started<1000);
 delete r.window.requestAnimationFrame;
});
test('a loading failure hands the screen back to the game error card',async()=>{
 const h=harness();h.finishSplash();await settle();h.shell.update(.016);await settle();
 h.state.failed=true;h.shell.update(.016);
 assert.equal(h.shell.screen,'failed');assert.equal(h.shell.blocksProgress,true);assert.equal(h.document.querySelector('.v03-title').hidden,true);assert.equal(h.shell.pilotMovement,null);assert.ok(h.log.includes('suspend:false'));
 h.window.dispatchEvent(new h.window.Event('pagehide'));assert.equal(h.save.meta().used,false,'a failed start never creates a save');
});
test('the loading cover never scrolls; only the error card may',()=>{
 // The drifting light layer is larger than the screen on purpose and scale:1 makes the cover its
 // containing block, so overflow:auto offered it as scroll on PC and phones (2026-11-23, user).
 const html=readFileSync(new URL('../moonforest-0.3.html',import.meta.url),'utf8'),rule=html.match(/#app>#loading\{[^}]*\}/)?.[0]??'';
 assert.match(rule,/overflow:hidden;overflow:clip/);assert.doesNotMatch(rule,/overflow:auto/);
 assert.match(html,/#app>#loading\.error\{overflow:auto\}/);assert.match(html,/#app>#loading\.error::after\{content:none\}/);
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
 assert.equal(log.notify({type:'defeat',kind:'gray-wolf'}).stepDone,true,'the first fight counts whatever was defeated');assert.equal(log.step().id,'wagon');
 const counted=createQuestLog({quests:[{id:'T',title:'t',steps:[{id:'a',text:'잡기',type:'defeat',kind:'wolf',count:3}]}],storage:memory()});counted.reset();
 assert.equal(counted.notify({type:'defeat',kind:'bear'}).changed,false);counted.notify({type:'defeat',kind:'wolf'});assert.equal(counted.objective(),'잡기 (1/3)');counted.notify({type:'defeat',kind:'wolf'});assert.equal(counted.notify({type:'defeat',kind:'wolf'}).questDone,'T');
 assert.equal(log.dialogueFor('driver'),'driver-wagon');assert.equal(log.dialogueFor('elder'),null);
 const again=createQuestLog({quests:QUESTS,storage:store});assert.equal(again.load(),true);assert.equal(again.step().id,'wagon');
 log.notify({type:'talk',npc:'driver'});assert.equal(log.dialogueFor('driver'),'driver-thanks');log.notify({type:'talk',npc:'driver'});assert.equal(log.notify({type:'reach',map:'great-plains'}).changed,false);
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
 for(let i=0;i<4;i++)log.notify({type:'defeat',kind:'goblin',map:'village'});assert.equal(log.notify({type:'talk',npc:'youth'}).questDone,'M05');
 assert.equal(log.notify({type:'talk',npc:'driver'}).stepDone,true);assert.equal(log.notify({type:'defeat',kind:'gray-wolf',map:'great-plains'}).changed,false,'only the alpha counts');
 assert.equal(log.notify({type:'defeat',kind:'wolf',map:'great-plains'}).stepDone,true);assert.equal(log.notify({type:'talk',npc:'chief'}).questDone,'M06');
 log.notify({type:'reach',map:'monster-forest'});for(let i=0;i<5;i++)log.notify({type:'defeat',kind:'goblin',map:'monster-forest'});assert.equal(log.notify({type:'reach',map:'witch-cave'}).questDone,'M07');
 assert.equal(log.notify({type:'defeat',kind:'elena',map:'witch-cave'}).questDone,'M08');assert.equal(log.notify({type:'talk',npc:'innkeeper'}).questDone,'M09');assert.equal(log.finished,true);assert.equal(log.objective(),'');
 // Data integrity: every referenced dialogue and NPC exists.
 const ids=new Set(NPCS.map(n=>n.id));
 for(const quest of QUESTS)for(const step of quest.steps)if(step.type==='talk')for(const target of step.targets){assert.ok(ids.has(target),target);assert.ok(DIALOGUES[step.dialogues[target]]?.length,step.dialogues[target]);}
 for(const npc of NPCS)assert.ok(DIALOGUES[npc.idle]?.length,npc.idle);
 for(const quest of QUESTS)for(const step of quest.steps){if(step.intro)assert.ok(DIALOGUES[step.intro]?.length,step.intro);if(step.summon)assert.ok(step.at&&step.map,step.id);}
 store.setItem('v03-story-v1','{"quest":99,"step":0,"done":[]}');assert.equal(createQuestLog({quests:QUESTS,storage:store}).load(),false);
});
test('story: first fight coaching, driver talk, village cast, rest effect and save title',async()=>{
 const h=harness();h.finishSplash();await h.reveal();await newGame(h);await settle(40);
 h.battle.combat.hp=500;
 const hud=sel=>h.document.querySelector(sel),key=code=>h.document.dispatchEvent(Object.assign(new h.window.Event('keydown',{bubbles:true,cancelable:true}),{code}));
 h.shell.update(.016);
 assert.equal(hud('.v03-quest-title').textContent,'늑대와 마차');assert.equal(hud('.v03-quest-objective').textContent,'늑대를 물리치기 (0/1)');
 assert.deepEqual(h.made.map(v=>v.id),['driver']);assert.equal(h.made[0].placed.y,2.55,'the driver rides on the wagon bench');
 // The ambush scene plays first: no control, the wolf is held, captions run.
 assert.equal(h.shell.story.sceneActive,true);assert.equal(h.shell.allows('move'),false);assert.equal(h.shell.allows('attack'),false);
 assert.equal(h.document.documentElement.dataset.v03Lock,'move camera attack dodge guard potion');
 h.shell.update(.016);assert.ok(h.shell.story.cameraFocus,'the first shot frames the wolf, not the player');
 // The driver's scream comes after the slow approach and the sleeping warrior (9 s).
 for(let i=0;i<560;i++)h.shell.update(.016);assert.equal(hud('.v03-caption').hidden,true,'no line over the opening shots');
 for(let i=0;i<30;i++)h.shell.update(.016);assert.match(hud('.v03-caption-text').textContent,/으아악/);
 for(let i=0;i<650;i++)h.shell.update(.016);assert.equal(h.shell.story.sceneActive,false);assert.equal(hud('.v03-caption').hidden,true);
 // Coaching runs in the order the user set (2026-11-20): move → camera →
 // dodge → guard stance (held) → normal attack → shield shove → heavy attack,
 // each allowing only its own action.
 assert.equal(h.shell.allows('move'),true);assert.equal(h.shell.allows('attack'),false);assert.equal(h.shell.allows('camera'),false);
 assert.equal(h.document.documentElement.dataset.v03Lock,'camera attack dodge guard potion');
 assert.equal(hud('.v03-hint-what').textContent,'이동');assert.equal(hud('.v03-hint-how').textContent,'W A S D','what to do and how are two lines, never one joined string');
 h.controller.state='slash';h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^이동/,'attacking early does not skip the movement lesson');
 h.controller.state='idle';const from={...h.player.position};h.player.position={...from,x:from.x+2};h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^이동/,'a couple of steps are not enough: the walk lasts eight metres');
 h.player.position={...from,x:from.x+9};h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^시점 돌리기/);
 assert.equal(h.shell.allows('camera'),true);assert.equal(h.shell.allows('move'),false);
 for(let i=0;i<2600;i++)h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/회피/,'an ignored lesson gives way only after a long wait');
 assert.equal(h.shell.allows('dodge'),true);assert.equal(h.shell.allows('attack'),false);

 h.controller.state='slash';h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/회피/,'only a dodge passes the dodge lesson');
 h.controller.state='dodge';h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^방어 태세/);
 // The guard has to be held: a moment of it is not enough.
 h.controller.state='idle';h.controller.guarding=true;for(let i=0;i<10;i++)h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^방어 태세/);
 for(let i=0;i<50;i++)h.shell.update(.016);h.controller.guarding=false;assert.match(hud('.v03-hint').textContent,/^연속 공격/);
 // The chain has to reach its third hit: one swing, or the held heavy attack, is not enough.
 h.controller.state='slash';h.controller.attackIndex=1;h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^연속 공격/,'one swing does not pass the combo lesson');
 h.controller.state='judgment';h.controller.attackIndex=0;h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^연속 공격/,'the held heavy attack does not pass the combo lesson');
 h.controller.state='attack';h.controller.attackIndex=2;h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^방패 밀치기/,'two hits in a row pass it (the third hit is gone, user 2026-11-21)');
 h.controller.state='shieldPush';h.controller.attackIndex=0;h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^강공격/);
 h.controller.state='slash';h.controller.attackIndex=1;h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^강공격/,'a normal attack does not pass the heavy attack lesson');
 h.controller.state='attack';h.controller.attackIndex=2;h.shell.update(.016);assert.match(hud('.v03-hint').textContent,/^강공격/,'nor does the chain\'s second hit');
 h.controller.state='judgment';h.controller.attackIndex=0;h.shell.update(.016);h.controller.state='idle';
 // The lessons done: one line stays in the middle until the wolf is down.
 assert.equal(hud('.v03-hint').hidden,false);assert.equal(hud('.v03-hint-what').textContent,'늑대를 처치하세요');
 assert.equal(h.shell.allows('attack')&&h.shell.allows('potion'),true,'free fight after the lessons');assert.equal(h.document.documentElement.dataset.v03Lock,undefined);
 // One-time tips: low health shows the potion card once, then it expires.
 assert.ok(!h.shell.inspect().story.tips.includes('guide'),'the guide light card waits for the light itself');
 // Stamina is explained as soon as the first-fight lessons are over.
 h.shell.update(.016);assert.equal(hud('.v03-tip-title').textContent,'스태미나');
 for(let i=0;i<500;i++)h.shell.update(.016);assert.equal(hud('.v03-tip').hidden,true);
 h.battle.combat.hp=200;h.shell.update(.016);
 assert.equal(hud('.v03-tip').hidden,false);assert.equal(hud('.v03-tip-title').textContent,'물약');assert.match(hud('.v03-tip-lead').textContent,/숫자 1~4/);
 for(let i=0;i<500;i++)h.shell.update(.016);assert.equal(hud('.v03-tip').hidden,true);h.battle.combat.hp=500;
 // No talking during combat; the title/prologue never count defeats.
 // No guide light in the opening fight (it starts with the driver's talk) nor in any fight (2026-11-19).
 h.battle.encounters=[{active:true,brain:{hp:300,maxHp:300,mode:'idle'},actor:{position:{x:2,z:14}}}];h.battle.combatCount=1;for(let i=0;i<200;i++)h.shell.update(.016);
 assert.equal(h.guide.shown,null,'the guide light stays hidden during the opening fight');
 {const d=h.shell.inspect().story.cast.find(c=>c.id==='driver');h.player.position={x:d.x,z:d.z};}h.battle.combatCount=2;h.shell.update(.016);assert.equal(hud('.v03-prompt').hidden,true);
 h.shell.defeat({kind:'wolf'});h.battle.encounters=[];h.battle.combatCount=0;h.battle.livingCount=0;h.shell.update(.016);
 assert.equal(hud('.v03-quest-objective').textContent,'마부를 도와 마차 세우기');assert.equal(hud('.v03-prompt').getAttribute('aria-label'),'마부와 이야기하기');assert.equal(hud('.v03-prompt-key').textContent,'E');assert.equal(hud('.v03-prompt-name').textContent,'마부');assert.equal(hud('.v03-prompt-action').textContent,'이야기하기');assert.equal(hud('.v03-prompt-mark').hidden,true,'no ? or ! after the button: the mark over his head says it');
 assert.ok(h.shell.inspect().story.tips.includes('guide'),'the guide light appears after the fight, and its card with it');
 const potionKey=[];h.window.addEventListener('keydown',()=>potionKey.push('game'));
 key('KeyE');await settle();assert.deepEqual(potionKey,[],'E near an NPC talks and never reaches the potion key');assert.equal(h.shell.blocksGame,false,'the world keeps moving while talking');assert.equal(h.log.at(-1),'suspend:true','input is held instead');
 const portrait=hud('.v03-dialogue-portrait');assert.equal(portrait.hidden,false);assert.match(portrait.src,/portraits\/driver\.webp$/);assert.equal(hud('.v03-dialogue-who').textContent,'마부');assert.ok(h.log.filter(x=>x==='suspend:true').length>=2);
 // E advances every line and closes the last one without reopening the talk.
 // Three lines; then the driver goes to the wagon and the warrior pushes it
 // up with him (E three times at the roof side); his thanks follow.
 const next=hud('.v03-dialogue-next');
 // The key is a small text hint on the name's line (2026-11-26), not a badge beside the button.
 assert.equal(next.previousElementSibling,null);assert.equal(hud('.v03-dialogue-hint').textContent,'E 다음');
 assert.equal(next.textContent,'다음');
 for(let i=0;i<3;i++){
  if(i===2){assert.equal(next.textContent,'닫기');assert.equal(hud('.v03-dialogue-hint').textContent,'E 닫기');}
  key('KeyE');await settle(2);
 }await settle();
 assert.equal(hud('.v03-dialogue').hidden,true);assert.equal(hud('.v03-quest-objective').textContent,'마부를 도와 마차 세우기','the step completes when the wagon stands');
 const spot=h.shell.inspect().story.lift;assert.ok(spot,'the wagon waits for a push');
 key('KeyE');await settle();assert.equal(h.shell.inspect().story.lift.count,0,'pushing needs the warrior at the wagon');
 h.player.position={x:spot.x,z:spot.z};h.shell.update(.016);assert.match(hud('.v03-prompt').getAttribute('aria-label'),/마부를 기다리는 중/,'until the driver calls');
 assert.equal(hud('.v03-bubble-body').textContent,'자, 내가 구령을 넣을 테니 같이 밀자꾸나!');
 // The driver calls each heave first ("하나!"); E before his call does nothing.
 key('KeyE');await settle();assert.equal(h.shell.inspect().story.lift.count,0,'no push before the driver calls');
 for(let push=1;push<=3;push++){for(let i=0;i<130;i++)h.shell.update(.016);assert.match(hud('.v03-bubble-body').textContent,[/하나/,/둘/,/셋/][push-1],'his count is a bubble over his head');assert.equal(hud('.v03-caption').hidden,true);assert.match(hud('.v03-prompt').getAttribute('aria-label'),new RegExp(`밀기 \\(${push-1}/3\\)`));key('KeyE');await settle();for(let i=0;i<40;i++)h.shell.update(.016);await settle();}
 assert.equal(h.log.filter(x=>x==='guard').length,0,'a heave is a push now, not a shield shove');assert.equal(hud('.v03-bubble').hidden,true,'the count goes with the last heave');
 assert.equal(hud('.v03-dialogue').hidden,false,'the thanks start by themselves once it stands');
 for(let i=0;i<DIALOGUES['driver-thanks'].length;i++){key('KeyE');await settle(2);}await settle();
 assert.equal(hud('.v03-dialogue').hidden,true,'E closes the conversation');
 assert.equal(h.shell.blocksGame,false);assert.equal(hud('.v03-quest-objective').textContent,'길을 따라 몬트하임 마을로 가기');assert.equal(h.log.at(-1),'suspend:false');
 // Walking away: the light follows the navigation path toward the village gate, ahead of the player.
 h.player.position={x:-66,z:-24};for(let i=0;i<300;i++)h.shell.update(.016);
 assert.equal(h.shell.inspect().story.guide,'exit:village');assert.ok(Math.hypot(h.guide.shown.x+66,h.guide.shown.z+24)>4,'the light is ahead of the player');
 assert.equal(h.log.includes('startWorld'),false);
 h.state.mapId='village';h.state.character='warrior-v3';h.shell.update(.016);
 assert.equal(hud('.v03-quest-title').textContent,'달빛 여관');assert.ok(h.log.includes('startWorld'),'the world wakes after the opening quest');assert.equal(h.made[0].disposed,true);assert.deepEqual(h.made.slice(1).map(v=>v.id),NPCS.filter(npc=>npc.map==='village').map(npc=>npc.id));
 assert.deepEqual(h.marks.at(-1),[{x:-3.4,z:10.6,glyph:'?'}],'the innkeeper carries a ? on the minimap');
 assert.equal(h.save.meta().title,'달빛 여관');
 // The quest's end is a guide card (not the banner in the middle): title, the quest, what comes next.
 h.shell.update(.016);assert.equal(hud('.v03-tip-title').textContent,'퀘스트 완료');assert.equal(hud('.v03-tip-lead').textContent,'늑대와 마차');assert.equal(hud('.v03-tip-text').textContent,'다음 · 달빛 여관');assert.doesNotMatch(hud('.v03-banner').textContent,/완료/);
 // Arriving in the village shows its name in the middle of the screen.
 assert.equal(hud('.v03-place-name').textContent,'몬트하임 마을');assert.equal(hud('.v03-place').hidden,false);assert.ok(hud('.v03-place').classList.contains('is-shown'));
 h.player.position={x:-3.4,z:10.6};h.shell.update(.016);assert.equal(hud('.v03-prompt').getAttribute('aria-label'),'여관 주인과 이야기하기');assert.equal(hud('.v03-prompt-mark').hidden,true);assert.equal(h.document.documentElement.dataset.v03Cursor,'talk','the cursor offers a conversation');hud('.v03-prompt').dispatchEvent(new h.window.Event('click',{bubbles:true,cancelable:true}));await settle();
 for(let i=0;i<5;i++)key('Space');await settle();
 assert.ok(h.log.includes('rest'));assert.ok(h.shell.inspect().story.tips.includes('rest'));assert.equal(hud('.v03-quest-title').textContent,'사람들이 기억하는 성녀');assert.equal(hud('.v03-quest-objective').textContent,'주민 세 사람의 이야기 듣기 (0/3)');
 assert.ok(h.log.includes('gold:v03-quest-M00:30'),'M00 pays its gold reward once');assert.equal(h.log.filter(x=>x.startsWith('gold:v03-quest-M00')).length,1);
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
 assert.ok(Math.abs(track.position.z-5.5)<.2,'waits about five and a half metres ahead: '+track.position.z);
 player.z=10;for(let i=0;i<120;i++)track.update(1/60,player);assert.ok(Math.abs(track.position.z-15.5)<.3);
 // Rebuilding the path from the player's new position does not pull the light back.
 const before=track.position.z;track.setPath([{x:0,z:10},{x:0,z:40}]);assert.ok(Math.abs(track.position.z-before)<.01);
 player.z=38;let arrived=false;for(let i=0;i<240;i++)arrived=track.update(1/60,player,{stopShort:1.5});
 assert.equal(arrived,true);assert.ok(Math.abs(track.position.z-38.5)<.01);
 // A corner is followed along the path, not cut across.
 track.clear();track.setPath([{x:0,z:0},{x:0,z:5},{x:5,z:5}]);for(let i=0;i<300;i++)track.update(1/60,{x:0,z:4.6});
 assert.ok(Math.abs(track.position.z-5)<.01&&track.position.x>4.9);
});
test('the displayed guide leads a 14 m/s gallop through a turn and route rebuilds, then waits',ctx=>{
 const corner=24,goal={x:60,z:corner};
 for(const fps of [15,30,60]){
  const {document}=dom(),dt=1/fps,riding={active:false},player={position:{x:0,z:0}},battle={encounters:[],combatCount:0};
  let shown=null,travel=0,paths=0;
  const guide={show(x,y,z){shown={x,y,z};},hide(){shown=null;},dispose(){}};
  const world={scene:{isDisposed:false},mapId:'village',riding,terrain:{heightAt:(x,z)=>.02*x+.01*z},
   navigation:{free:()=>true,path(from,to){paths++;return from.z<corner?[{x:0,z:corner},to]:[to];}}};
  const api={world,battle,input:{setSuspended(){}},getPlayer:()=>player,getController:()=>null};
  const quest={id:'ride',title:'Ride',steps:[{id:'exit',type:'reach',map:'great-plains',text:'Exit'}]};
  const content={QUESTS:[quest],NPCS:[],ROUTES:{village:{'great-plains':goal}}};
  const story=createStory({api,doc:document,save:{journey:memory(),touch(){}},content,createGuide:()=>guide});
  ctx.after(()=>story.dispose());story.start();
  function frame(speed){
   travel+=speed*dt;player.position.z=Math.min(corner,travel);player.position.x=Math.max(0,travel-corner);
   story.update(dt,{ready:true,mapId:'village',character:'warrior-v3'});
  }
  const lead=()=>shown.x+shown.z-travel;
  for(let i=0;i<2*fps;i++)frame(0);
  for(let i=0;i<3*fps;i++)frame(3);
  assert.ok(lead()>3&&lead()<6,'walking lead at '+fps+' FPS: '+lead());
  riding.active=true;const before=paths;
  for(let i=0;i<Math.round(2.4*fps);i++){
   const last=shown;frame(14);
   assert.ok(lead()>3&&lead()<7,'visible lead during gallop at '+fps+' FPS: '+lead());
   assert.ok(Math.hypot(shown.x-last.x,shown.z-last.z)<20*dt,'the light jumps at a turn or route rebuild');
   assert.ok(shown.y>world.terrain.heightAt(shown.x,shown.z)+.7);
  }
  assert.ok(paths>=before+2,'the gallop crosses two navigation updates');
  for(let i=0;i<3*fps;i++)frame(0);
  assert.ok(lead()>4.5&&lead()<6.5,'the light waits within its usual lead');
  riding.active=false;
  while(travel<goal.x+goal.z)frame(3);
  for(let i=0;i<2*fps;i++)frame(0);
  assert.ok(Math.hypot(shown.x-goal.x,shown.z-goal.z)<1,'the light waits at the quest destination');
  battle.combatCount=1;frame(0);assert.equal(shown,null);
 }
});
test('errands: a first greeting once, an errand offered after its main quest, the service event and the hand-in pay once',async()=>{
 const h=harness(),bag=new Map();let townEvent=null;
 Object.assign(h.api,{itemCount:id=>bag.get(id)??0,
  grantItem:(id,n)=>{bag.set(id,(bag.get(id)??0)+n);h.log.push(`grant:${id}:${n}`);return true;},
  spendItem:(id,n)=>{if((bag.get(id)??0)<n)return false;bag.set(id,bag.get(id)-n);h.log.push(`spend:${id}:${n}`);return true;},
  onTownEvent:fn=>{townEvent=fn;},addPotions:n=>{h.log.push('potions:'+n);return n;}});
 h.finishSplash();await h.reveal();await newGame(h);await settle(40);
 const story=h.shell.story,hud=sel=>h.document.querySelector(sel),key=code=>h.document.dispatchEvent(Object.assign(new h.window.Event('keydown',{bubbles:true,cancelable:true}),{code}));
 assert.equal(typeof townEvent,'function','the story listens to village services while it plays');
 // Up to M02's report by events (the talks themselves are covered by the story test above).
 for(const event of [{type:'defeat',kind:'wolf'},{type:'talk',npc:'driver'},{type:'talk',npc:'driver'},{type:'reach',map:'village'},{type:'talk',npc:'innkeeper'},
  {type:'talk',npc:'elder'},{type:'talk',npc:'herbalist'},{type:'talk',npc:'youth'}])story.log.notify(event);
 h.state.mapId='village';h.state.character='warrior-v3';for(let i=0;i<3;i++)h.shell.update(.016);await settle();
 const talk=async(id,lines)=>{
  const member=h.shell.inspect().story.cast.find(row=>row.id===id);h.player.position={x:member.x,z:member.z};h.shell.update(.016);
  key('KeyE');await settle();const said=[];
  for(let i=0;i<lines;i++){said.push(hud('.v03-dialogue-text').textContent);key('KeyE');await settle(2);}
  await settle();h.shell.update(.016);return said;
 };
 assert.equal(hud('.v03-quest-errand').hidden,true,'no errand before M02 is reported');
 assert.deepEqual(await talk('innkeeper',DIALOGUES['inn-report'].length),DIALOGUES['inn-report'].map(line=>line.text));
 assert.equal(hud('.v03-quest-title').textContent,'마을의 부탁');assert.equal(hud('.v03-quest-errand').hidden,true,'no errand yet');
 // The minimap's mark nearest a villager (they stroll a little around their spot).
 const glyphAt=(run,id)=>{const npc=run.shell.inspect().story.cast.find(row=>row.id===id);let best=null,bestSq=9;for(const mark of run.marks.at(-1)){const sq=(mark.x-npc.x)**2+(mark.z-npc.z)**2;if(sq<bestSq){best=mark.glyph;bestSq=sq;}}return best;};
 assert.equal(glyphAt(h,'herbalist'),'+');assert.equal(glyphAt(h,'youth'),'+');assert.equal(glyphAt(h,'chief'),'?','the main quest keeps its own mark');assert.equal(glyphAt(h,'smith'),null,'the smith’s errand waits for the bear');
 // The smith greets once, then has his short line.
 assert.deepEqual(await talk('smith',1),[DIALOGUES['smith-greet'][0].text]);
 assert.deepEqual(await talk('smith',1),[DIALOGUES['smith-idle'][0].text]);
 // The herbalist offers her errand and hands over the herbs for it.
 assert.deepEqual(await talk('herbalist',3),DIALOGUES['herbalist-errand'].map(line=>line.text));
 assert.ok(h.log.includes('grant:moon-herb:2'));assert.equal(hud('.v03-quest-errand').hidden,false);
 assert.equal(hud('.v03-errand-title').textContent,'물약 한 병');assert.equal(hud('.v03-errand-step').textContent,'약초사에게서 회복약 한 병 조제하기');
 assert.equal(hud('.v03-quest-title').textContent,'마을의 부탁','the main line stays on top');
 townEvent({type:'town',action:'repair',item:'oathblade'});h.shell.update(.016);assert.equal(hud('.v03-errand-step').textContent,'약초사에게서 회복약 한 병 조제하기');
 townEvent({type:'town',action:'craft',item:'potion'});h.shell.update(.016);assert.equal(hud('.v03-errand-step').textContent,'약초사에게 알리기');
 assert.equal(glyphAt(h,'herbalist'),'!');
 assert.deepEqual(await talk('herbalist',3),DIALOGUES['herbalist-errand-done'].map(line=>line.text));
 assert.ok(h.log.includes('gold:v03-errand-S02:10'));assert.ok(h.log.includes('potions:1'));assert.equal(hud('.v03-quest-errand').hidden,true);
 assert.deepEqual(await talk('herbalist',1),[DIALOGUES['herbalist-idle'][0].text],'done errands are not offered again; her greeting was the errand talk');
 assert.equal(h.log.filter(row=>row.startsWith('gold:v03-errand-S02')).length,1);
 // A later document keeps the errand finished and the greetings given.
 const again=harness({local:h.local,session:(()=>{const s=memory();createSaveSession({local:h.local,session:s,edition:E}).request(1,'load');return s;})()});
 again.state.mapId='village';again.shell.update(.016);await settle();again.shell.update(.016);
 assert.equal(again.shell.story.log.quest().id,'M03');
 // Its cast and minimap marks come with the first frames on the map.
 for(let i=0;i<60&&!again.marks.at(-1)?.length;i++){again.shell.update(.016);await settle(2);}
 assert.equal(glyphAt(again,'herbalist'),null);assert.equal(glyphAt(again,'youth'),'+');
});
test('title: 새로하기 → slot (overwrite confirmed) → chapter wipes only once a chapter is chosen; 불러오기 → used slot → its chapters',async()=>{
 const {questKey}=await import('../src/v03/chapter-progress.js'),{QUESTS}=await import('../src/v03/data/chapter1.js');
 const local=memory(),session=memory(),seed=createSaveSession({local,session,edition:E,now:()=>10});
 seed.commit({title:'남겨진 방',chapter:1,character:'warrior-v3',place:'몬트하임 마을',playSeconds:90});seed.journey.setItem('moonforest-gold-v1','77');
 seed.journey.setItem(questKey(1),JSON.stringify({quest:QUESTS.length,step:0,count:0,done:[]}));// chapter one cleared: chapter two is open
 const h=harness({local,session,inPlace:true,reloadProgress:true,stopWorld:true});
 const q=selector=>h.document.querySelector(selector),all=selector=>[...h.document.querySelectorAll(selector)];
 const press=button=>button.dispatchEvent(new h.window.Event('click',{bubbles:true})),back=()=>press(all('.v03-panel-back').at(-1));
 const recordKept=()=>{const index=createSaveSession({local,session:memory(),edition:E}).index();return index[0].used===true;};
 h.finishSplash();await h.reveal();
 assert.deepEqual(all('.v03-menu-item').slice(0,2).map(b=>b.textContent),['새로하기','불러오기']);
 // 새로하기: any slot, empty or used.
 h.click('[data-action="new"]');await settle();
 assert.equal(q('.v03-panel-title').textContent,'새로하기');assert.deepEqual(all('.v03-slot').map(b=>b.disabled),[false,false,false]);
 // A used slot asks first; cancelling goes back and keeps the record.
 h.click('.v03-slot[data-slot="1"]');await settle();assert.match(q('.v03-panel-note').textContent,/1번 기록/);
 back();await settle();assert.equal(q('.v03-panel').hidden,true);assert.ok(recordKept());
 // Accepted, the chapter list is a new game's: chapter one only, nothing to continue, replay or reset.
 h.click('[data-action="new"]');await settle();h.click('.v03-slot[data-slot="1"]');await settle();h.click('.v03-panel-accept');await settle();
 assert.equal(q('[data-chapter="1"]').disabled,false);assert.equal(q('[data-chapter="2"]').disabled,true,'the old record’s clears do not carry over');
 assert.equal(q('[data-replay]'),null);assert.equal(q('[data-reset-slot]'),null);
 // Backing out of the chapter list still keeps the record.
 back();await settle();assert.equal(q('.v03-panel').hidden,true);assert.ok(recordKept());assert.equal(h.shell.screen,'title');
 // 불러오기: only used slots, then that record's chapters (its clears, replay, no start-over).
 h.click('[data-action="load"]');await settle();
 assert.equal(q('.v03-panel-title').textContent,'불러오기');assert.deepEqual(all('.v03-slot').map(b=>b.disabled),[false,true,true]);
 h.click('.v03-slot[data-slot="1"]');await settle();
 assert.equal(q('[data-chapter="2"]').disabled,false,'its own clears');assert.ok(q('[data-replay="1"]'));assert.equal(q('[data-reset-slot]'),null,'no start-over in the load path');
 back();await settle();assert.equal(h.shell.screen,'title');assert.ok(recordKept());
 // 새로하기 for real: the slot is wiped and the new game starts in place.
 h.click('[data-action="new"]');await settle();h.click('.v03-slot[data-slot="1"]');await settle();h.click('.v03-panel-accept');await settle();h.click('[data-chapter="1"]');await settle(20);
 assert.ok(h.log.includes('restartProgress'));assert.equal(h.save.slot,1);assert.equal(h.save.journey.getItem('moonforest-gold-v1'),null,'the old record is gone');
 assert.ok(['opening','play'].includes(h.shell.screen));
});
test('title: the two entries read in all five languages',async()=>{
 const {document}=dom();
 try{
  for(const id of ['ko','en','ja','vi','zh']){
   const pack=(await import(`../src/v03/locales/${id}.js`)).default;setPack(id,pack);
   const title=createTitleScreen({doc:document,wait:instant});
   const labels=[...title.element.querySelectorAll('.v03-menu-item')].map(b=>b.textContent);
   assert.deepEqual(labels.slice(0,2),[pack.ui['menu.new'],pack.ui['menu.load']],id);
   const pick=title.chooseSlot({mode:'new',index:[{slot:1,used:false},{slot:2,used:false},{slot:3,used:false}],bootSlot:1});
   assert.equal(title.element.querySelector('.v03-panel-title').textContent,pack.ui['menu.new']);title.closePanel();await pick;
   title.dispose();
  }
 }finally{setPack('ko',(await import('../src/v03/locales/ko.js')).default);}
});
