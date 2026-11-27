// 2026-11-27 first player review (story 8, guidance 7), 1127-chapter: the two early hunts
// teach different things (two kinds of beast; the bear's dodge-then-strike and a reward pick),
// Jeffrey waits at the cave mouth for the forest report, the hobgoblin camp is off the cave
// routes, deliver errands lead to where the item drops, and the alpha errand counts the alpha only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {QUESTS,ERRANDS,NPCS,DIALOGUES,REUNIONS,TIPS,ROUTES} from '../src/v03/data/chapter1.js';
import {createStory} from '../src/v03/story.js';
import {createErrandLog} from '../src/v03/errands.js';
import {CHAPTER_CAMPS} from '../src/v03/chapter-wildlife.js';
import {FOREST_CAVE_PORTAL,MAP_PORTALS,FOREST_SPAWN} from '../src/map-route.js';
import {PLAINS_MONSTER_SPAWNS} from '../src/plains-monster-spawns.js';
import {LOOT_TABLES} from '../src/v03/town-items.js';
import {CHOICE_ARM_MS} from '../src/v03/dialogue.js';
import {setTypewriterEnabled} from '../src/v03/typewriter.js';
import {setPack} from '../src/v03/i18n.js';
import ko from '../src/v03/locales/ko.js';

setTypewriterEnabled(false);
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
const settle=async(n=3)=>{for(let i=0;i<n;i++)await new Promise(resolve=>setTimeout(resolve,0));};
function play(questId,stepId,{map='village',settled=null,greeted=NPCS.map(n=>n.id),errands=null}={}){
 setPack('ko',ko);
 const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>'),journey=memory(),player={position:{x:0,z:0}};
 let clock=0;Object.defineProperty(window,'performance',{value:{now:()=>clock},configurable:true});
 const quest=QUESTS.findIndex(q=>q.id===questId),step=QUESTS[quest].steps.findIndex(s=>s.id===stepId);
 journey.setItem('v03-story-v1',JSON.stringify({v:2,id:questId,quest,step,count:0,done:[]}));
 journey.setItem('v03-greeted-v1',JSON.stringify(greeted));
 if(errands)journey.setItem('v03-errands-v1',JSON.stringify(errands));
 const world={scene:{isDisposed:false},mapId:map,terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>null}};
 const api={world,battle:{encounters:[],combatCount:0},input:{setSuspended(){}},getPlayer:()=>player,getController:()=>null,creditGold:(_s,n)=>n,addPotions:n=>n,grantArmor:()=>true,toast(){},rest(){},
  ...(settled?{settleQuest:(q,s)=>{settled.push({id:q.id,reward:q.reward,step:s?.id});return {gold:q.reward.gold??0,potions:q.reward.potions??0,armor:q.reward.armor??null,xp:0};},hasSettledQuest:()=>false}:{})};
 const story=createStory({api,doc:document,save:{journey,touch:()=>true},content:{QUESTS,ERRANDS,NPCS,DIALOGUES,REUNIONS,TIPS,ROUTES},
  createVisual:(_scene,key,{id})=>({id,key,disposed:false,place(x,y,z){this.position={x,y,z};},dispose(){this.disposed=true;}}),
  createGuide:()=>({show(){},hide(){},dispose(){}})});
 story.start();
 const at=m=>{world.mapId=m;};
 const frame=()=>story.update(1/60,{ready:true,mapId:world.mapId,character:'x'});frame();
 const cast=()=>story.inspect().cast;
 // Talk through; at a menu take the option with this id (its button order is the options' order).
 async function talk(id,{pick=null}={}){
  const pos=story.castVisual(id).position;Object.assign(player.position,{x:pos.x,z:pos.z});frame();
  document.querySelector('.v03-prompt').click();const said=[];let menu=null;
  for(let i=0;i<60&&story.dialogueOpen;i++){
   const choices=document.querySelector('.v03-dialogue-choices');
   if(choices&&!choices.hidden){
    const entries=[...document.querySelectorAll('.v03-dialogue-choice')];menu={line:document.querySelector('.v03-dialogue-text').textContent,labels:entries.map(e=>e.textContent)};
    clock+=CHOICE_ARM_MS+20;entries[pick??0].click();await settle(3);continue;
   }
   const text=document.querySelector('.v03-dialogue-text').textContent;if(text!==said.at(-1))said.push(text);
   document.querySelector('.v03-dialogue-next').click();await settle(1);
  }
  await settle();frame();return {said,menu};
 }
 return {story,frame,cast,talk,journey,player,at,world};
}

test('M03: two wolves and a fox; a boar or a third wolf does not count, the guide skips full parts',()=>{
 const h=play('M03','hunt',{map:'great-plains'});
 try{
  const kill=kind=>h.story.defeat({kind,actorDefinitionId:kind+'.r1'});
  kill('boar');assert.equal(h.story.log.snapshot().count,0,'boar: not in this hunt');
  kill('gray-wolf');kill('stylized-wolf');kill('wolf-3');
  assert.equal(h.story.log.snapshot().count,2,'only two wolves');
  assert.match(h.story.log.objective(),/\(2\/3\)$/);
  // The light: nearest den that still has a fox (the village-side fox dens), not the lone wolf next to the player.
  Object.assign(h.player.position,{x:-82,z:0});for(let i=0;i<3;i++)h.frame();
  assert.match(String(h.story.inspect().guide),/^den:plains-fox-/,'the wolves are done: a fox den');
  kill('fox');assert.equal(h.story.log.step().id,'report');
 }finally{h.story.dispose();}
 // Kinds on the plains really hold both parts near the village road.
 const kinds=new Set(PLAINS_MONSTER_SPAWNS.maps['great-plains'].map(r=>r.definitionId.split('.')[0]));
 for(const part of QUESTS.find(q=>q.id==='M03').steps[1].quota)assert.ok(part.kinds.some(k=>kinds.has(k)),part.id);
});

test('M04: the bear is introduced with dodge-then-strike, and its report ends with a reward pick saved by id',async()=>{
 const intro=DIALOGUES[QUESTS.find(q=>q.id==='M04').steps.find(s=>s.id==='bear').intro];
 assert.ok(intro?.length,'the bear step has an arrival line');
 assert.ok(TIPS.some(tip=>tip.id==='boss'&&tip.when==='step:M04/bear'),'the boss card still opens with the step');
 assert.ok(DIALOGUES['jeffrey-bear'].some(l=>/헛치게/.test(l.text)),'Jeffrey says how to fight it');
 const settled=[];
 const h=play('M04','report',{settled});
 try{
  const {said,menu}=await h.talk('youth',{pick:1});
  assert.deepEqual(said.slice(0,DIALOGUES['jeffrey-truth'].length),DIALOGUES['jeffrey-truth'].map(l=>l.text));
  assert.equal(menu.line,DIALOGUES['jeffrey-bear-reward'][0].text);
  assert.deepEqual(menu.labels,['가죽 갑옷 (방어력 +2) · 120 G','회복 물약 3개 · 120 G','240 G'].map(s=>s.replace('가죽 갑옷 (방어력 +2)',ko.ui['reward.armor.leather'])));
  assert.equal(h.story.log.quest().id,'M11');
  assert.deepEqual(settled.map(r=>[r.id,r.reward]),[['M04',{gold:120,potions:3}]],'paid the picked reward');
  assert.deepEqual(JSON.parse(h.journey.getItem('v03-reward-pick-v1')),{M04:'potions'},'saved by id');
 }finally{h.story.dispose();}
});

test('M07 report: Jeffrey waits at the cave mouth (not in the village) until the warrior has gone in',async()=>{
 const youths=NPCS.filter(n=>n.id==='youth');
 assert.deepEqual(youths.map(n=>n.map),['village','monster-forest']);
 const village=youths[0];assert.deepEqual([village.x,village.z],[-5.8,6.3],'off the crate pile');
 const v=play('M07','report',{map:'village'});
 try{
  assert.ok(!v.cast().some(r=>r.id==='youth'),'not in the village during the report');
  assert.equal(v.story.inspect().guide,'exit:monster-forest','the light goes back to the forest');
 }finally{v.story.dispose();}
 // S01 done, the palisade (W01) open: at the cave mouth he does not start it (NPCS waves:false).
 const h=play('M07','report',{map:'monster-forest',errands:{active:{},finished:['S01']}});
 try{
  Object.assign(h.player.position,{x:24.5,z:-36.5});h.frame();
  const jeffrey=h.cast().find(r=>r.id==='youth');assert.ok(jeffrey,'he stands in the forest');
  assert.ok(Math.hypot(jeffrey.x-FOREST_CAVE_PORTAL.x,jeffrey.z-FOREST_CAVE_PORTAL.z)<10,'by the cave mouth');
  const {said}=await h.talk('youth');
  assert.deepEqual(said,DIALOGUES['jeffrey-witch'].map(l=>l.text));
  assert.equal(h.story.log.quest().id,'M12');
  assert.ok(h.cast().some(r=>r.id==='youth'),'he stays while the cave step is open');
  const wait=await h.talk('youth');assert.deepEqual(wait.said,DIALOGUES['youth-cave-wait'].map(l=>l.text),'no palisade offer in the forest');
  assert.equal(JSON.parse(h.journey.getItem('v03-errands-v1')).active.W01,undefined);
 }finally{h.story.dispose();}
 const back=play('M08','saint',{map:'village'});
 try{assert.ok(back.cast().some(r=>r.id==='youth'),'home again afterwards');}finally{back.story.dispose();}
 const offer=play('M08','saint',{map:'village',errands:{active:{},finished:['S01']}});
 try{const {said}=await offer.talk('youth');assert.equal(said[0],DIALOGUES['jeffrey-waves-offer'][0].text,'the palisade is offered in the village');offer.story.waves.stop?.();}finally{offer.story.dispose();}
});

test('the hobgoblin camp is well off the cave portal, the cave arrival and the forest entry; its step leads there',()=>{
 const guard=CHAPTER_CAMPS['monster-forest'].filter(r=>r.id.startsWith('inner-guard'));
 const arrival=MAP_PORTALS['witch-cave'].arrival;
 for(const row of guard){
  for(const [name,p] of [['portal',FOREST_CAVE_PORTAL],['arrival',arrival]])assert.ok(Math.hypot(row.x-p.x,row.z-p.z)>row.home.combatRadius*2,`${row.id} ${name}`);
  assert.ok(Math.hypot(row.x-FOREST_SPAWN.x,row.z-FOREST_SPAWN.z)>40);
 }
 const step=QUESTS.find(q=>q.id==='M07').steps.find(s=>s.id==='hobgoblin');
 const boss=guard.find(r=>r.kind==='hobgoblin-boss');
 assert.ok(Math.hypot(boss.x-step.at.x,boss.z-step.at.z)<step.at.radius,'the step spot holds the boss');
 const trace=NPCS.find(n=>n.id==='clue-cave');
 assert.ok(guard.every(r=>Math.hypot(r.x-trace.x,r.z-trace.z)>r.home.combatRadius*2),'the camp does not hold up the trace');
});

test('M06 counts the alpha itself, not a wolf of its pack; the ghoul always leaves its mail link',()=>{
 const storage=memory(),log=createErrandLog({errands:ERRANDS,storage});log.reset();log.accept('M06');
 const plains={type:'defeat',map:'great-plains'};
 for(const [kind,actor] of [['gray-wolf','gray-wolf.r1'],['stylized-wolf','stylized-wolf.r1'],['wolf','gray-wolf.r1']])log.notify({...plains,kind,source:kind,actor});
 assert.deepEqual(log.step('M06').id,'alpha','pack wolves do not count');
 log.notify({...plains,kind:'wolf',source:'wolf',actor:'alpha-wolf.r8'});
 assert.equal(log.step('M06').id,'report');
 assert.deepEqual(LOOT_TABLES['ghoul-warrior'].find(([id])=>id==='ghoul-mail'),['ghoul-mail',1]);
});
