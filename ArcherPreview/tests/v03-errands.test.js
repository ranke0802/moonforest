// Optional errands (2026-11-24, #11·#13): the log's rules, and that chapter
// one's errands, greetings and dialogue lines exist and can be completed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createErrandLog} from '../src/v03/errands.js';
import {createQuestLog} from '../src/v03/quests.js';
import {GoldLoot} from '../src/gold-loot.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {ERRANDS,QUESTS,NPCS,DIALOGUES} from '../src/v03/data/chapter1.js';
import {TOWN_ITEMS,RECIPES,LOOT_TABLES} from '../src/v03/town-items.js';
import {CHAPTER_CAMPS} from '../src/v03/chapter-wildlife.js';

const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};};
const sample=[
 {id:'A',giver:'youth',after:'M01',title:'a',steps:[{id:'hunt',text:'hunt',type:'defeat',map:'great-plains',count:2},{id:'back',text:'back',type:'talk',targets:['youth'],turnIn:true}]},
 {id:'B',giver:'smith',after:'M02',title:'b',steps:[{id:'forge',text:'forge',type:'town',action:'forge'},{id:'give',text:'give',type:'deliver',item:'iron-scrap',count:2,targets:['smith']}]},
 {id:'C',giver:'chief',title:'c',steps:[{id:'archers',text:'archers',type:'defeat',kind:'goblin-archer',count:1}]},
];

test('errands are offered after their main quest, run side by side and persist',()=>{
 const storage=memory(),log=createErrandLog({errands:sample,storage}),done=new Set(['M01']),mainDone=id=>done.has(id);
 assert.equal(log.offerFor('youth',mainDone)?.id,'A');assert.equal(log.offerFor('smith',mainDone),null,'B waits for M02');
 assert.equal(log.offerFor('chief',mainDone)?.id,'C','no after: offered at once');
 assert.ok(log.accept('A'));assert.ok(!log.accept('A'),'once');assert.equal(log.offerFor('youth',mainDone),null);
 assert.equal(log.givenBy('youth')?.id,'A');assert.equal(log.waitingOn('youth'),null,'the hunt comes first');
 assert.deepEqual(log.notify({type:'defeat',kind:'fox',map:'great-plains'}),[{id:'A',stepDone:false,errandDone:false}]);
 assert.equal(log.objective('A'),'hunt (1/2)');
 assert.deepEqual(log.notify({type:'defeat',kind:'wolf',map:'monster-forest'}),[],'another map does not count');
 assert.deepEqual(log.notify({type:'defeat',kind:'boar',map:'great-plains'}),[{id:'A',stepDone:true,errandDone:false}]);
 assert.equal(log.waitingOn('youth')?.id,'A');assert.equal(log.complete('A','smith'),null,'only the target hands in');
 // A later document reads the same record.
 const again=createErrandLog({errands:sample,storage});assert.ok(again.load());assert.equal(again.step('A').id,'back');
 assert.deepEqual(again.complete('A','youth'),{id:'A',stepDone:true,errandDone:true});
 assert.ok(again.isFinished('A'));assert.equal(again.offerFor('youth',mainDone),null,'never offered again');
 // town and deliver steps; a goblin family member counts for its own kind.
 done.add('M02');assert.ok(again.accept('B'));assert.ok(again.accept('C'));
 assert.deepEqual(again.notify({type:'town',action:'repair',item:'oathblade'}),[]);
 assert.deepEqual(again.notify({type:'town',action:'forge',item:'oathblade'}),[{id:'B',stepDone:true,errandDone:false}]);
 assert.equal(again.objective('B',1),'give (1/2)');assert.equal(again.waitingOn('smith')?.id,'B');
 assert.deepEqual(again.notify({type:'defeat',kind:'goblin',family:'goblin',source:'goblin-warrior'}),[]);
 assert.deepEqual(again.notify({type:'defeat',kind:'goblin',family:'goblin',source:'goblin-archer'}),[{id:'C',stepDone:true,errandDone:true}]);
 assert.deepEqual(again.complete('B','smith'),{id:'B',stepDone:true,errandDone:true});
 // Damaged or foreign records are dropped, not trusted.
 storage.setItem('v03-errands-v1',JSON.stringify({active:{A:{step:9},Z:{step:0}},finished:['B','nope']}));
 const third=createErrandLog({errands:sample,storage});assert.ok(third.load());assert.deepEqual(third.snapshot(),{active:{},finished:['B']});
 storage.setItem('v03-errands-v1','{');assert.equal(createErrandLog({errands:sample,storage}).load(),false);
});

test('herbalist crafting saves the purchase and errand across the same journey',()=>{
 const storage=memory();
 const wallet=new GoldLoot({storage});
 wallet.creditCumulative('village-allowance',40);
 const town=createTownEconomy(wallet);
 const errands=createErrandLog({errands:ERRANDS,storage});
 const errand=errands.offerFor('herbalist',id=>id==='M10');
 assert.equal(errand.id,'S02');
 assert.ok(errands.accept(errand.id));
 town.onEvent=event=>errands.notify(event);
 const potionCount=town.state.bag.potion??0;
 assert.equal(town.craft('herbalist','potion'),false);
 assert.equal(errands.step(errand.id).type,'town');
 assert.ok(town.grant('moon-herb',2));
 assert.ok(town.craft('herbalist','potion'));
 const restoredTown=createTownEconomy(new GoldLoot({storage}));
 const restoredErrands=createErrandLog({errands:ERRANDS,storage});
 assert.ok(restoredErrands.load());
 assert.equal(restoredTown.state.bag['moon-herb']??0,0);
 assert.equal(restoredTown.state.bag.potion,potionCount+1);
 assert.equal(restoredTown.gold,40-RECIPES.herbalist.potion.gold);
 assert.equal(restoredErrands.waitingOn('herbalist')?.id,errand.id);
 assert.ok(restoredErrands.complete(errand.id,'herbalist')?.errandDone);
 assert.equal(restoredErrands.complete(errand.id,'herbalist'),null);
});

test('main quests report which ids are done',()=>{
 const log=createQuestLog({quests:QUESTS,storage:memory()});log.reset();
 assert.equal(log.isDone('M00'),false);
 log.notify({type:'defeat',kind:'wolf'});log.notify({type:'talk',npc:'driver'});log.notify({type:'talk',npc:'driver'});log.notify({type:'reach',map:'village'});
 assert.equal(log.isDone('M00'),true);assert.equal(log.isDone('M01'),false);assert.equal(log.isDone('nope'),false);
});

test('chapter one errands can be offered, done and handed in with the game as it is',()=>{
 const npcs=new Set(NPCS.map(npc=>npc.id)),quests=QUESTS.map(quest=>quest.id),campKinds=new Set(Object.values(CHAPTER_CAMPS).flat().map(row=>row.kind));
 assert.ok(ERRANDS.length>=5);assert.equal(new Set(ERRANDS.map(e=>e.id)).size,ERRANDS.length);
 for(const errand of ERRANDS){
  assert.ok(npcs.has(errand.giver),errand.id+' giver');assert.ok(quests.includes(errand.after),errand.id+' after');
  for(const id of [errand.offer,errand.wait,errand.done])assert.ok(DIALOGUES[id]?.length,`${errand.id} dialogue ${id}`);
  assert.ok(errand.reward.gold>0||errand.reward.potions>0,errand.id+' pays something');
  for(const step of errand.steps){
   assert.ok(step.text,errand.id+'/'+step.id);
   if(step.type==='talk'||step.type==='deliver')for(const id of step.targets)assert.ok(npcs.has(id),`${errand.id}/${step.id} target`);
   if(step.type==='deliver'){
    // The item drops from something the player meets in chapter one.
    assert.ok(TOWN_ITEMS[step.item],step.item);
    assert.ok(Object.values(LOOT_TABLES).some(rows=>rows.some(([id])=>id===step.item)),step.item+' drops');
   }
   if(step.type==='town'){
    assert.ok(['craft','forge','repair','buy'].includes(step.action));
    if(step.action==='craft')assert.ok(Object.values(RECIPES).some(table=>table[step.item]),step.item+' has a recipe');
   }
   // wolf: the plains alpha (a 0.2 resident of the Great Plains), hunted for the driver since 2026-11-27.
   if(step.type==='defeat'&&step.kind)assert.ok(campKinds.has(step.kind)||step.kind==='wolf'&&step.map==='great-plains',step.kind+' lives in a chapter camp');
  }
  // Errands that need materials give the first ones (give:<item>:<n>).
  if(errand.steps.some(step=>step.type==='town'&&step.action==='craft'))assert.ok(DIALOGUES[errand.offer].some(line=>line.effects?.some(e=>e.startsWith('give:moon-herb'))));
  if(errand.steps.some(step=>step.type==='town'&&step.action==='forge'))assert.ok(DIALOGUES[errand.offer].some(line=>line.effects?.some(e=>e.startsWith('give:iron-scrap'))));
 }
 for(const npc of NPCS){assert.ok(npc.clue||DIALOGUES[npc.idle]?.length,npc.id+' idle');if(npc.greet)assert.ok(DIALOGUES[npc.greet]?.length,npc.id+' greet');}
 // The hooks other code relies on stay: the driver's thanks (horse offer) and every line's effects are known.
 assert.ok(DIALOGUES['driver-thanks'].length>=4);
 for(const [id,lines] of Object.entries(DIALOGUES))for(const line of lines)for(const effect of line.effects??[])assert.match(effect,/^(rest|right-wagon|give:[a-z-]+:\d+)$/,id);
 for(const [id,lines] of Object.entries(DIALOGUES))for(const line of lines)for(const effect of line.effects??[])if(effect.startsWith('give:'))assert.ok(TOWN_ITEMS[effect.split(':')[1]],id+' gives a real item');
});
