import test from 'node:test';
import assert from 'node:assert/strict';
import {ERRANDS,QUESTS,NPCS,DIALOGUES} from '../src/v03/data/chapter1.js';
import {createErrandLog} from '../src/v03/errands.js';
import {createWaveRaid,createWaveErrand,waveQueue,wavePlan,WAVE_KINDS,WAVE_ELITE,tuneWaveFoe} from '../src/v03/defense-waves.js';
import {CHAPTER_COMBAT} from '../src/v03/chapter-enemy-brain.js';
import ko from '../src/v03/locales/ko.js';
import en from '../src/v03/locales/en.js';
import ja from '../src/v03/locales/ja.js';
import vi from '../src/v03/locales/vi.js';
import zh from '../src/v03/locales/zh.js';
import {GoldLoot} from '../src/gold-loot.js';
import {createTownEconomy} from '../src/v03/town-economy.js';

const W01=ERRANDS.find(errand=>errand.id==='W01'),STEP=W01.steps[0];
const flush=async(n=6)=>{for(let i=0;i<n;i++)await new Promise(resolve=>setImmediate(resolve));};
function memory(){const map=new Map();return {getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),map};}

// The table agreed for the ten stages (goblin, archer, elite, hp×, damage×).
const TABLE=[[3,0,0,1,1],[4,0,0,1,1],[4,1,0,1.1,1],[5,2,0,1.15,1.05],[4,2,1,1.2,1.1],[6,2,0,1.3,1.15],[6,3,0,1.35,1.2],[7,3,1,1.45,1.25],[8,4,0,1.5,1.3],[8,4,2,1.6,1.35]];

test('W01 is Jeffrey’s errand after the bear, with the ten agreed stages and rewards',()=>{
 assert.equal(W01.giver,'youth');assert.equal(W01.after,'M04');assert.ok(QUESTS.some(q=>q.id==='M04'));
 assert.ok(NPCS.some(npc=>npc.id==='youth'));assert.ok(!ERRANDS.some(errand=>errand.id==='M05'),'the old raid id is not reused');
 assert.equal(STEP.type,'waves');assert.deepEqual(STEP.targets,['youth']);assert.equal(STEP.map,'village');
 assert.deepEqual(STEP.at,{x:0,z:28,radius:11});assert.deepEqual(STEP.from,{x:-1.2,z:58});assert.equal(STEP.maxAlive,6);
 assert.equal(STEP.stages.length,10);
 STEP.stages.forEach((row,i)=>{
  const n=i+1,[goblin,archer,elite,hp,damage]=TABLE[i];
  assert.deepEqual([row.goblin,row.archer,row.elite,row.hp,row.damage],[goblin,archer,elite,hp,damage],'stage '+n);
  assert.equal(row.gold,n===10?0:40+20*n,'stage gold '+n);assert.equal(row.potions??0,[3,6,9].includes(n)?1:0,'stage potion '+n);
  assert.ok(DIALOGUES[row.line]?.length,'stage line '+n);
  assert.match(row.line,n<=4?/early/:n<=7?/mid/:n<=9?/late/:/last/);
 });
 assert.equal(W01.reward.gold,500,'stage 10: the errand reward on the report');
 for(const id of [W01.offer,W01.wait,W01.done,STEP.lines.retry])assert.ok(id.startsWith('jeffrey-waves-')&&DIALOGUES[id]?.length,id);
 for(const kind of Object.values(STEP.kinds))assert.ok(CHAPTER_COMBAT[kind],kind+' is a chapter foe');
 for(const id of ['raid-start','youth-goblin'])assert.ok(DIALOGUES[id]?.length,id+' kept');
});

test('a stage queue spreads the archers and brings the elites last',()=>{
 assert.deepEqual(waveQueue({goblin:3}),['goblin-warrior','goblin-warrior','goblin-warrior']);
 const q=waveQueue({goblin:4,archer:2,elite:1});
 assert.equal(q.length,7);assert.equal(q.filter(k=>k===WAVE_KINDS.archer).length,2);assert.equal(q.at(-1),WAVE_KINDS.elite);
 assert.notEqual(q.indexOf(WAVE_KINDS.archer),q.length-2,'archers are not all at the back');
 for(let n=1;n<=10;n++){const plan=wavePlan(STEP,n),[g,a,e]=TABLE[n-1];assert.equal(plan.queue.length,g+a+e);assert.equal(plan.maxAlive,6);}
 assert.equal(wavePlan(STEP,11),null);
});

test('the stage scale tunes HP once and every hit (elite on top)',()=>{
 const plan=wavePlan(STEP,10),profile={...CHAPTER_COMBAT['goblin-warrior']},enc={profile,brain:{hp:profile.hp,maxHp:profile.hp}};
 tuneWaveFoe(enc,'goblin-warrior',plan);
 assert.equal(enc.brain.maxHp,Math.round(115*1.6));assert.equal(enc.brain.hp,enc.brain.maxHp);
 assert.equal(enc.attackDamage({damage:18}),Math.round(18*1.35));assert.equal(enc.profile.damage,Math.round(18*1.35),'arrows and spells read the profile');
 assert.equal(CHAPTER_COMBAT['goblin-warrior'].damage,18,'the shared profile is untouched');
 const boss={profile:{...CHAPTER_COMBAT['hobgoblin-boss']},brain:{hp:780,maxHp:780}};tuneWaveFoe(boss,'hobgoblin-boss',plan);
 assert.equal(boss.brain.maxHp,Math.round(780*1.6*WAVE_ELITE.hp));assert.equal(boss.attackDamage({damage:48}),Math.round(48*1.35*WAVE_ELITE.damage));assert.ok(boss.waveElite);
});

// A stand-in for the chapter foe factory: same create/dispose shape, no engine.
function fakeEnemies(){
 const made=[];let onDefeat=null,factories=0,disposed=0;
 const module={createChapterEnemyFactory({onDefeat:report}){factories++;onDefeat=report;return {
  async create({kind,id,x,z,home,isCurrent}){
   await null;if(!isCurrent())throw Object.assign(new Error('cancelled'),{name:'AbortError'});
   const profile={...CHAPTER_COMBAT[kind]};
   const handle={id,kind,home,disposed:false,encounter:{kind,profile,brain:{hp:profile.hp,maxHp:profile.hp,engaged:false,returning:false},actor:{position:{x,z}},spawn:{x,z},corpseGone:false},
    dispose(){if(!this.disposed){this.disposed=true;disposed++;}}};
   made.push(handle);return handle;
  },dispose(){}};}};
 return {module,made,kill(handle){handle.encounter.brain.hp=0;onDefeat({id:handle.id,kind:handle.kind,position:handle.encounter.actor.position});handle.encounter.corpseGone=true;},get factories(){return factories;},get disposed(){return disposed;}};
}
function raidWorld(){
 const world={mapId:'village',scene:{isDisposed:false},navigation:null},player={position:{x:0,z:26}},defeats=[],enemies=fakeEnemies();
 const raid=createWaveRaid({world,battle:{},getPlayer:()=>player,onDefeat:event=>defeats.push(event),loadEnemies:async()=>enemies.module,onError:()=>{}});
 return {world,player,defeats,enemies,raid};
}

test('at most six foes are up at once; each fall lets the next one in',async()=>{
 const {raid,enemies,defeats}=raidWorld(),plan=wavePlan(STEP,10);// 14 foes
 assert.ok(raid.begin(plan));
 await flush(40);
 const alive=()=>enemies.made.filter(h=>!h.disposed&&h.encounter.brain.hp>0).length;
 assert.equal(alive(),6,'six come in while Jeffrey talks');assert.equal(raid.left,14);
 assert.ok(enemies.made.every(h=>!h.encounter.brain.returning),'no one marches before the talk ends');
 raid.go();
 assert.ok(enemies.made.every(h=>h.encounter.brain.returning),'then they march on the palisade');
 assert.ok(enemies.made.every(h=>h.home.radius>=STEP.at.radius&&h.home.x===STEP.at.x&&h.home.z===STEP.at.z));
 let killed=0;
 while(raid.left){
  const target=enemies.made.find(h=>!h.disposed&&h.encounter.brain.hp>0);assert.ok(target,'someone to fight at '+killed);
  enemies.kill(target);killed++;raid.update(.3);await flush(12);
  assert.ok(alive()<=6,'never more than six');
 }
 assert.equal(killed,14);assert.equal(enemies.made.length,14);assert.ok(raid.done);
 assert.equal(defeats.length,14);assert.ok(defeats.every(event=>event.family==='goblin'&&event.wave===10));
 assert.equal(defeats.filter(event=>event.kind==='hobgoblin-boss').length,2);
 raid.end();raid.update(.3);assert.ok(!raid.running);assert.ok(enemies.made.every(h=>h.disposed),'faded corpses are released');
});

test('engaging: inside the palisade ring the foes fight; the raid is gone with the map',async()=>{
 const {raid,enemies,player,world}=raidWorld();
 raid.begin(wavePlan(STEP,1));await flush(20);raid.go();
 const foe=enemies.made[0];foe.encounter.actor.position={x:0,z:34};player.position={x:0,z:28};
 raid.update(.3);
 assert.ok(foe.encounter.brain.engaged);assert.ok(!foe.encounter.brain.returning);
 world.mapId='great-plains';raid.update(.3);
 assert.ok(raid.disposed);assert.ok(enemies.made.every(h=>h.disposed),'leaving the village releases every foe');
});

// The errand side with the story's errand log and a small game stand-in.
function errandGame({mainDone=new Set(['M04'])}={}){
 const storage=memory(),errands=createErrandLog({errands:ERRANDS,storage}),flashes=[],toasts=[],results=[],paid=[];
 const {raid,enemies,player,world}=raidWorld();
 const bag={potion:3},gear={'old-sword':{hp:40,wearUnits:2}},controller={stamina:80,maxStamina:100},combat={hp:420,maxHp:500};
 let resets=[];
 world.chapterResidents={raid:()=>raid};
 const api={world,battle:{combat,onChange(){}},getPlayer:()=>player,getController:()=>controller,
  resetStage:stage=>{resets.push(stage);player.position={x:stage.x,z:stage.z};combat.hp=combat.maxHp;controller.stamina=controller.maxStamina;return true;},
  itemCount:id=>bag[id]??0,grantItem:(id,n)=>{bag[id]=(bag[id]??0)+n;return true;},spendItem:(id,n)=>{bag[id]-=n;return true;},
  addPotions:n=>{bag.potion+=n;paid.push(['potion',n]);return n;},creditGold:(source,total)=>{paid.push([source,total]);return total;},
  gearCondition:()=>structuredClone(gear),restoreGearCondition:snapshot=>{Object.assign(gear,structuredClone(snapshot));},
  toast:text=>toasts.push(text),playSound(){}};
 const waves=createWaveErrand({api,storage:()=>storage,hud:{flash:text=>flashes.push(text)},content:{ERRANDS,NPCS},results:rows=>results.push(...rows)});
 waves.bind(errands,undefined);
 const done=id=>mainDone.has(id);
 // The story's order: a hand-in first, then a stage, then the offer.
 const talk=()=>{const waiting=errands.waitingOn('youth');if(waiting)return {kind:'turnIn',errand:waiting,dialogue:waiting.done};return waves.talk('youth',done)??(errands.offerFor('youth',done)===W01?{kind:'offer',errand:W01,dialogue:W01.offer}:null);};
 const after=row=>{if(row.kind==='offer'){errands.accept(W01.id);waves.after(row);}else if(row.kind==='turnIn')errands.complete(W01.id,'youth');else waves.after(row);};
 async function winStage(){
  await flush(30);
  while(raid.left){const target=enemies.made.find(h=>!h.disposed&&h.encounter.brain.hp>0);enemies.kill(target);raid.update(.3);await flush(10);}
  waves.update(.016,'village',false);
 }
 return {storage,errands,waves,raid,enemies,player,world,bag,gear,controller,combat,flashes,toasts,results,paid,talk,after,winStage,get resets(){return resets;}};
}

test('offered only after the bear; the offer talk starts stage 1',async()=>{
 const early=errandGame({mainDone:new Set()});
 early.errands.accept('S01');// S01 aside, Jeffrey has nothing new before M04
 assert.equal(early.talk(),null);
 const g=errandGame();g.errands.accept('S01');
 const offer=g.talk();assert.equal(offer.kind,'offer');assert.equal(offer.dialogue,'jeffrey-waves-offer');
 assert.ok(g.raid.running,'stage 1 foes are prepared during the offer');
 g.after(offer);
 assert.equal(g.waves.phase,'fight');assert.equal(g.waves.stage,1);assert.ok(g.flashes.at(-1).includes('1'));
 await flush(20);assert.match(g.waves.objective('W01'),/1\/10.*3/);
});

test('stages 1→10 are kept in the record, paid once, then reported for the final reward',async()=>{
 const g=errandGame();g.errands.accept('S01');
 g.after(g.talk());await g.winStage();
 assert.equal(g.errands.count('W01'),1);
 assert.deepEqual(g.paid,[['v03-errand-W01-1',60]]);
 // Talking during warm-up and again: the same stage, the band's line.
 for(let n=2;n<=10;n++){
  const row=g.talk();assert.equal(row.kind,'wave');assert.equal(row.stage,n);assert.equal(row.dialogue,STEP.stages[n-1].line);
  g.after(row);await g.winStage();assert.equal(g.errands.count('W01'),n,'stage '+n);
 }
 assert.equal(g.paid.filter(([id])=>id==='potion').length,3,'potions at 3, 6 and 9');
 assert.ok(!g.paid.some(([id])=>id==='v03-errand-W01-10'),'stage 10 pays through the report');
 // A reloaded record: same count, same receipts, no second payment.
 const again=createErrandLog({errands:ERRANDS,storage:g.storage});assert.ok(again.load());assert.equal(again.count('W01'),10);
 const before=g.paid.length;g.waves.bind(again,undefined);
 assert.equal(g.waves.talk('youth',()=>true),null,'all stages cleared: the report waits');
 assert.equal(again.waitingOn('youth')?.id,'W01');
 assert.match(again.objective('W01'),/10\/10/);
 const finished=again.complete('W01','youth');assert.ok(finished.errandDone);assert.ok(again.isFinished('W01'));
 assert.equal(g.paid.length,before);
});

test('a reward already paid is not paid again',async()=>{
 const g=errandGame();g.errands.accept('S01');
 g.after(g.talk());await g.winStage();
 // The record lost its count (an interrupted write) but the receipt stays.
 const log=createErrandLog({errands:ERRANDS,storage:g.storage});log.load();
 log.snapshot();g.storage.setItem('v03-errands-v1',JSON.stringify({active:{W01:{step:0,count:0}},finished:[]}));log.load();g.waves.bind(log,undefined);
 const row=g.talk();assert.equal(row.stage,1);g.after(row);await g.winStage();
 assert.equal(g.paid.filter(([id])=>id==='v03-errand-W01-1').length,1);
});

test('falling in a stage puts everything back as at the talk; cleared stages stay',async()=>{
 const g=errandGame();g.errands.accept('S01');
 g.after(g.talk());await g.winStage();// stage 1 cleared
 g.player.position={x:-4,z:5};g.combat.hp=410;g.controller.stamina=55;g.bag.potion=4;g.gear['old-sword']={hp:38,wearUnits:5};
 const row=g.talk();g.after(row);await flush(30);
 // The fight: potions drunk, wear, then down.
 g.player.position={x:1,z:30};g.bag.potion=1;g.gear['old-sword']={hp:30,wearUnits:1};g.combat.hp=0;g.controller.stamina=0;
 assert.equal(g.waves.playerDown(),true,'the death screen is not shown');assert.equal(g.waves.playerDown(),true,'asked again in the same fall');
 g.waves.update(.016,'village',false);
 assert.deepEqual(g.resets.at(-1),{x:-4,z:5,map:'village'});
 assert.deepEqual(g.player.position,{x:-4,z:5});assert.equal(g.combat.hp,410);assert.equal(g.controller.stamina,55);
 assert.equal(g.bag.potion,4);assert.deepEqual(g.gear['old-sword'],{hp:38,wearUnits:5});
 assert.ok(g.enemies.made.every(h=>h.disposed),'the raid is cleared away');
 assert.equal(g.errands.count('W01'),1,'stage 1 stays cleared');assert.equal(g.waves.phase,null);
 const retry=g.talk();assert.equal(retry.stage,2);assert.equal(retry.dialogue,'jeffrey-waves-retry');
 g.after(retry);await g.winStage();assert.equal(g.errands.count('W01'),2);
 assert.equal(g.waves.playerDown(),false,'outside a stage the normal death screen stays');
});

test('leaving the village mid-stage cancels it without loss',async()=>{
 const g=errandGame();g.errands.accept('S01');
 g.after(g.talk());await flush(30);
 g.world.mapId='great-plains';g.raid.update(.3);g.waves.update(.016,'great-plains',false);
 assert.equal(g.waves.phase,null);assert.equal(g.errands.count('W01'),0);assert.equal(g.toasts.length,1);
 assert.ok(g.enemies.made.every(h=>h.disposed));assert.equal(g.resets.length,0,'no undo, no penalty');
});

test('a talk cut short drops the foes prepared for it',async()=>{
 const g=errandGame();g.errands.accept('S01');
 g.after(g.talk());await g.winStage();
 g.talk();await flush(20);assert.ok(g.raid.running);
 g.waves.update(.5,'village',false);g.waves.update(.5,'village',false);
 assert.ok(!g.raid.running);assert.equal(g.waves.phase,null);
});

test('five languages carry the errand, its lines and its HUD text',()=>{
 const keys=Object.keys(ko.ui).filter(key=>key.startsWith('waves.'));
 assert.ok(keys.length>=9);
 for(const [name,pack] of Object.entries({en,ja,vi,zh})){
  for(const key of keys)assert.ok(pack.ui[key],`${name} ${key}`);
  assert.ok(pack.story.errands.W01.title&&pack.story.errands.W01.steps.waves,name+' W01');
  for(const id of Object.keys(DIALOGUES).filter(id=>id.startsWith('jeffrey-waves-')))assert.equal(pack.story.dialogues[id]?.length,DIALOGUES[id].length,`${name} ${id}`);
 }
});

test('the economy hands out and puts back the wear of the worn gear',()=>{
 const economy=createTownEconomy(new GoldLoot({storage:memory()})),sword=economy.state.equipped.sword;
 for(let i=0;i<40;i++)economy.damageWeapon('swing-'+i);
 const snapshot=economy.wearSnapshot(),at=structuredClone(economy.state.condition[sword]);
 assert.ok(snapshot[sword]);
 for(let i=40;i<200;i++)economy.damageWeapon('swing-'+i);economy.wearDefense(true);
 assert.notDeepEqual(economy.state.condition[sword],at);
 assert.equal(economy.restoreWear(snapshot),true);
 assert.equal(economy.state.condition[sword].hp,at.hp);assert.equal(economy.state.condition[sword].wearUnits??0,at.wearUnits??0);
 assert.equal(economy.restoreWear(snapshot),false,'nothing left to change');
});

// On the integrated story (2026-11-27): Jeffrey's name, the quest panel page and the guide light.
import {parseHTML} from 'linkedom';
import {createStory} from '../src/v03/story.js';
import {QUESTS as STORY_QUESTS,ROUTES} from '../src/v03/data/chapter1.js';
import {setPack} from '../src/v03/i18n.js';

test('after the bear Jeffrey offers S01 first, then W01; its HUD line names him',()=>{
 const storage=memory(),errands=createErrandLog({errands:ERRANDS,storage}),done=id=>id==='M04';
 assert.equal(errands.offerFor('youth',done)?.id,'S01');errands.accept('S01');
 assert.equal(errands.offerFor('youth',done)?.id,'W01');
 const waves=createWaveErrand({api:{world:{mapId:'village'}},storage:()=>storage,hud:{},content:{ERRANDS,NPCS}});
 waves.bind(errands);errands.accept('W01');
 assert.equal(NPCS.find(npc=>npc.id==='youth').name,'제프리');
 assert.match(waves.objective('W01'),/^1\/10단계 · 제프리에게 말 걸기$/);
 for(const id of Object.keys(DIALOGUES).filter(id=>id.startsWith('jeffrey-waves-')))for(const line of DIALOGUES[id])assert.ok(['제프리','나'].includes(line.who),id);
});

test('the W01 page shows "n/10단계 · 남은 마물 k"; the light leads to Jeffrey, then to the palisade',async()=>{
 setPack('ko',ko);
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
 const values=new Map(),journey={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 journey.setItem('v03-story-v1',JSON.stringify({v:2,id:'M07',quest:STORY_QUESTS.findIndex(row=>row.id==='M07'),step:0,count:0,done:[]}));
 journey.setItem('v03-errands-v1',JSON.stringify({active:{W01:{step:0,count:2}},finished:[]}));
 journey.setItem('v03-quest-page-v1','W01');
 const player={position:{x:0,z:0}},enemies=fakeEnemies();
 const world={scene:{isDisposed:false},mapId:'village',terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>null}};
 const battle={encounters:[],combatCount:0,combat:{hp:500,maxHp:500}};
 const raid=createWaveRaid({world,battle,getPlayer:()=>player,onDefeat(){},loadEnemies:async()=>enemies.module,onError(){}});
 world.chapterResidents={raid:()=>raid};
 const api={world,battle,input:{setSuspended(){}},getPlayer:()=>player,getController:()=>null,creditGold:(_s,n)=>n,addPotions:n=>n,toast(){},itemCount:()=>0};
 const story=createStory({api,doc:document,save:{journey,touch:()=>true},content:{QUESTS:STORY_QUESTS,NPCS,DIALOGUES,ERRANDS,ROUTES},
  createVisual:()=>({place(x,y,z){this.position={x,y,z};},dispose(){}}),createGuide:()=>({show(){},hide(){},dispose(){}})});
 const at=()=>{for(let i=0;i<3;i++)story.update(1/60,{ready:true,mapId:'village',character:'warrior-v3'});return story.inspect().guide;};
 try{
  story.start();
  assert.equal(story.questPage,'W01');
  assert.equal(at(),'npc:youth','waiting: the light leads to Jeffrey');
  assert.match(document.body.textContent,/3\/10단계 · 제프리에게 말 걸기/);
  const talk=story.waves.talk('youth',()=>true);assert.equal(talk.stage,3);
  await flush(30);story.waves.after(talk);
  at();
  assert.equal(story.inspect().guide,'spot:W01','fighting: the palisade');
  assert.match(document.body.textContent,/3\/10단계 · 남은 마물 5/);
  enemies.kill(enemies.made[0]);raid.update(.3);await flush(10);at();
  assert.match(document.body.textContent,/3\/10단계 · 남은 마물 4/);
 }finally{story.dispose();raid.dispose();}
});
