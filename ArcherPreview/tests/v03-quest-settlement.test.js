import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {GoldLoot,GOLD_LEDGER_KEY} from '../src/gold-loot.js';
import {QUESTS,ERRANDS,NPCS,DIALOGUES} from '../src/v03/data/chapter1.js';
import {questKey} from '../src/v03/chapter-progress.js';
import {recordedQuestIds} from '../src/v03/character-progression.js';
import {slotStorage} from '../src/v03/save-slots.js';
import {createStory} from '../src/v03/story.js';
import {createTownEconomy} from '../src/v03/town-economy.js';

const main=questKey(1),errands=main+':errands';
function disk(){
 const data=new Map();
 return {fault:null,getItem:key=>data.get(key)??null,removeItem:key=>data.delete(key),
  setItem(key,value){
   const fault=this.fault?.(key,value);
   if(fault==='before')throw Error('storage refused');
   data.set(key,String(value));
   if(fault==='after')throw Error('page interrupted after storage accepted the write');
  }};
}
const road={quest:0,step:3,count:0,done:[]};
function open(storage,{replay=false}={}){
 const wallet=new GoldLoot({storage}),town=createTownEconomy(wallet);
 if(!replay)town.creditQuests(recordedQuestIds(storage,{1:QUESTS}),true,{QUESTS,ERRANDS});
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>'),player={position:{x:0,z:0}};
 const world={scene:{isDisposed:false},mapId:'village',terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>null}};
 const api={world,battle:{encounters:[],combatCount:0},input:{setSuspended(){}},getPlayer:()=>player,getController:()=>null,
  itemCount:id=>town.state.bag[id]??0,spendItem:()=>assert.fail('a final delivery must only be charged inside the reward transaction'),
  settleQuest:(quest,step)=>town.settleQuest(quest,step),hasSettledQuest:id=>town.hasSettledQuest(id)};
 const story=createStory({api,doc:document,save:{journey:storage,touch(){}},content:{QUESTS,ERRANDS,NPCS,DIALOGUES},
  createVisual:()=>({place(x,y,z){this.position={x,y,z};},dispose(){}})});
 story.start({key:questKey(1,replay),replay});
 async function talkTo(npc){
  const frame=()=>story.update(1/60,{ready:true,mapId:'village',character:'warrior-v3'});
  frame();Object.assign(player.position,story.castVisual(npc).position);frame();document.querySelector('.v03-prompt').click();
  assert.ok(story.dialogueOpen);
  for(let i=0;i<30&&story.dialogueOpen;i++)document.querySelector('.v03-dialogue-next').click();
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {town,story,talkTo};
}
const balance=town=>[town.gold,town.state.bag.potion??0,town.progression.totalXp];
test('quest completion and the full payout survive each write boundary and retry once',()=>{
 for(const fault of ['refuse ledger','interrupt after ledger','refuse story','ordinary']){
  const raw=disk(),storage=slotStorage(raw,'test03',1);
  storage.setItem(main,JSON.stringify(road));let {town,story}=open(storage);
  raw.fault=key=>key.endsWith(GOLD_LEDGER_KEY)?({'refuse ledger':'before','interrupt after ledger':'after'})[fault]:
   key.endsWith(main)&&fault==='refuse story'?'before':null;
  const result=story.log.notify({type:'reach',map:'village'});
  if(fault.includes('ledger')){assert.equal(result.changed,false);assert.equal(story.log.step().id,'road');}
  else assert.equal(result.questDone,'M00');
  story.dispose();raw.fault=null;
  ({town,story}=open(storage));
  if(fault==='refuse ledger'){
   assert.deepEqual(balance(town),[0,3,0]);assert.equal(story.log.step().id,'road');
   assert.equal(story.log.notify({type:'reach',map:'village'}).questDone,'M00');
  }
  assert.equal(story.log.quest().id,'M01');assert.deepEqual(balance(town),[30,4,60],fault);
  assert.deepEqual(town.settleQuest(QUESTS[0]),{});assert.deepEqual(balance(town),[30,4,60]);story.dispose();
 }
});
test('delivery cost, XP, gold and potions settle together across failed writes, repeated dialogue and reload',async()=>{
 for(const id of ['S03','S06']){
  const raw=disk(),storage=slotStorage(raw,'test03',1),q=ERRANDS.find(row=>row.id===id),item=q.steps[0].item;
  // No active main dialogue shares this NPC.
  storage.setItem(main,JSON.stringify({quest:0,step:0,count:0,done:[]}));
  storage.setItem(errands,JSON.stringify({active:{[id]:{step:0,count:0}},finished:[]}));
  let {town,story,talkTo}=open(storage);assert.ok(town.grant(item));const base=balance(town);
  raw.fault=key=>key.endsWith(GOLD_LEDGER_KEY)?'before':null;
  await talkTo(q.giver);assert.equal(town.state.bag[item],1);assert.deepEqual(balance(town),base);
  assert.ok(JSON.parse(storage.getItem(errands)).active[id]);
  raw.fault=key=>key.endsWith(errands)?'before':null;
  await talkTo(q.giver);assert.equal(town.state.bag[item]??0,0);assert.ok(JSON.parse(storage.getItem(errands)).active[id]);
  const paid=balance(town);assert.equal(paid[0],q.reward.gold);assert.equal(paid[1],3+(q.reward.potions??0));assert.ok(paid[2]>0);
  story.dispose();raw.fault=null;({town,story}=open(storage));
  assert.deepEqual(JSON.parse(storage.getItem(errands)).finished,[id]);
  assert.deepEqual(town.settleQuest(q,q.steps[0]),{});assert.deepEqual(balance(town),paid);assert.equal(town.state.bag[item]??0,0);story.dispose();
 }
});
test('a shipped completion, a replay and another save slot cannot pay again into this wallet',()=>{
 const raw=disk(),one=slotStorage(raw,'test03',1),two=slotStorage(raw,'test03',2);
 one.setItem(main,JSON.stringify({quest:1,step:0,count:0,done:[]}));
 let wallet=new GoldLoot({storage:one}),town=createTownEconomy(wallet);
 wallet.creditCumulative('v03-quest-M00',30);town.creditQuests(['M00']);assert.ok(town.grant('potion'));assert.ok(town.drink());
 let loaded=open(one);assert.deepEqual(balance(loaded.town),[30,3,60]);
 assert.deepEqual(loaded.town.settleQuest(QUESTS[0]),{});loaded.story.dispose();
 one.setItem(questKey(1,true),JSON.stringify(road));loaded=open(one,{replay:true});
 assert.equal(loaded.story.log.notify({type:'reach',map:'village'}).questDone,'M00');
 assert.deepEqual(balance(loaded.town),[30,3,60]);loaded.story.dispose();
 two.setItem(main,JSON.stringify(road));loaded=open(two);assert.deepEqual(balance(loaded.town),[0,3,0]);
 assert.equal(loaded.story.log.notify({type:'reach',map:'village'}).questDone,'M00');assert.deepEqual(balance(loaded.town),[30,4,60]);loaded.story.dispose();
 loaded=open(one);assert.deepEqual(balance(loaded.town),[30,3,60]);loaded.story.dispose();
});

test('a stale document cannot overwrite the winner or refresh awarded armor on re-entry',()=>{
 const raw=disk(),storage=slotStorage(raw,'test03',1),index=QUESTS.findIndex(q=>q.id==='M04');
 storage.setItem(main,JSON.stringify({quest:index,step:1,count:0,done:[]}));
 const first=open(storage),stale=open(storage),priorGold=first.town.gold,report={type:'talk',npc:'chief'};
 raw.fault=key=>key.endsWith(main)?'before':null;
 assert.equal(first.story.log.notify(report).questDone,'M04');
 assert.equal(stale.story.log.notify(report).changed,false);
 assert.equal(first.town.gold,priorGold+120);assert.equal(first.town.state.equipped.armor,'leather-coat');
 first.story.dispose();stale.story.dispose();raw.fault=null;
 const healed=open(storage);assert.equal(healed.story.log.quest().id,'M05');assert.ok(healed.town.wearDefense(false));assert.ok(healed.town.flush());
 const hp=healed.town.gear('leather-coat').hp;healed.story.dispose();
 const last=open(storage);assert.equal(last.town.gold,priorGold+120);assert.equal(last.town.state.bag['leather-coat'],1);
 assert.deepEqual(last.town.settleQuest(QUESTS[index]),{});assert.equal(last.town.gear('leather-coat').hp,hp);last.story.dispose();
});
test('a replayed delivery and a failed herbalist purchase leave the normal inventory intact',async()=>{
 const raw=disk(),storage=slotStorage(raw,'test03',1),q=ERRANDS.find(row=>row.id==='S03');
 const wallet=new GoldLoot({storage}),initial=createTownEconomy(wallet);wallet.creditCumulative('seed',60);initial.grant('boar-meat');
 storage.setItem(questKey(1,true)+':errands',JSON.stringify({active:{S03:{step:0,count:0}},finished:[]}));
 const replay=open(storage,{replay:true});await replay.talkTo(q.giver);
 assert.deepEqual(JSON.parse(storage.getItem(questKey(1,true)+':errands')).finished,['S03']);
 assert.equal(replay.town.state.bag['boar-meat'],1);assert.equal(replay.town.hasSettledQuest('S03'),false);
 assert.deepEqual(balance(replay.town),[60,3,0]);replay.story.dispose();
 const regular=open(storage);raw.fault=key=>key.endsWith(GOLD_LEDGER_KEY)?'before':null;
 assert.equal(regular.town.buy('herbalist','potion'),false);assert.deepEqual(balance(regular.town),[60,3,0]);regular.story.dispose();
 raw.fault=null;const retry=open(storage);assert.deepEqual(balance(retry.town),[60,3,0]);
 assert.ok(retry.town.buy('herbalist','potion'));const paid=retry.town.gold;assert.ok(paid<60);retry.story.dispose();
 const next=open(storage);assert.deepEqual(balance(next.town),[paid,4,0]);next.story.dispose();
});

test('old unpaid or partially paid gold is restored once using the cumulative source watermark',()=>{
 for(const credited of [0,10,30]){
  const raw=disk(),storage=slotStorage(raw,'test03',1);
  storage.setItem(main,JSON.stringify({quest:1,step:0,count:0,done:[]}));
  if(credited){const wallet=new GoldLoot({storage});wallet.creditCumulative('v03-quest-M00',credited);}
  const first=open(storage);assert.deepEqual(balance(first.town),[30,3,60]);first.story.dispose();
  const second=open(storage),oldClient=new GoldLoot({storage});
  assert.deepEqual(balance(second.town),[30,3,60]);assert.equal(oldClient.creditCumulative('v03-quest-M00',30),0);second.story.dispose();
 }
 const raw=disk(),storage=slotStorage(raw,'test03',1);storage.setItem('moonforest-gold-v1','90');
 storage.setItem(main,JSON.stringify({quest:1,step:0,count:0,done:[]}));
 const old=open(storage);assert.equal(old.town.gold,90,'a plain legacy gold total has no source history');old.story.dispose();
});

// Wallets captured from 1e39c7f5 after it reopened an a1cbbaf8 payout and
// made an ordinary shop purchase. That writer dropped settledQuests. The
// separate story/errand write had been interrupted immediately after payout.
function oldShopWallet(id){
 const mainQuest=id==='M00';
 return {version:1,balance:mainQuest?0:16,credits:mainQuest?{'v03-quest-M00':30}:{'v03-errand-S03':20},town:{
  version:1,bag:{'field-sword':1,'field-shield':1,...(mainQuest?{potion:6}:{potion:4,'moon-herb':1})},
  equipped:{sword:'field-sword',shield:'field-shield',armor:null},condition:{'field-sword':{level:0,max:180,hp:180},'field-shield':{level:0,max:145,hp:145}},
  opened:[],drops:[],progression:{totalXp:mainQuest?60:65,skills:{weaponCare:0,guardTraining:0,endurance:0},quests:[id]},quick:'potion',boost:0,boostRate:1.5,
 }};
}
test('an old shop can spend the entire M00 payout or strip a delivered S03 receipt: three resumes repair only the cursor',()=>{
 for(const id of ['M00','S03']){
  const raw=disk(),storage=slotStorage(raw,'test03',1),saved=oldShopWallet(id);
  storage.setItem(GOLD_LEDGER_KEY,JSON.stringify(saved));
  storage.setItem(main,JSON.stringify(id==='M00'?road:{quest:0,step:0,count:0,done:[]}));
  if(id==='S03')storage.setItem(errands,JSON.stringify({active:{S03:{step:0,count:0}},finished:[]}));
  for(let cycle=0;cycle<3;cycle++){
   const {town,story}=open(storage);
   assert.deepEqual(town.state.settledQuests,[id]);
   if(id==='M00')assert.equal(story.log.quest().id,'M01');
   else assert.deepEqual(JSON.parse(storage.getItem(errands)),{active:{},finished:['S03']});
   assert.deepEqual(balance(town),[saved.balance,saved.town.bag.potion,saved.town.progression.totalXp]);
   assert.deepEqual(town.state.bag,saved.town.bag,'recovery needs no replacement meat');
   assert.deepEqual(JSON.parse(storage.getItem(GOLD_LEDGER_KEY)).credits,saved.credits);
   story.dispose();
  }
 }
});
test('a stale cursor and only one surviving payment marker cannot settle a delivery',()=>{
 for(const missing of ['xp','gold','partial']){
  const raw=disk(),storage=slotStorage(raw,'test03',1),saved=oldShopWallet('S03');
  if(missing==='xp')saved.town.progression.quests=[];
  else saved.credits['v03-errand-S03']=missing==='partial'?19:0;
  storage.setItem(GOLD_LEDGER_KEY,JSON.stringify(saved));
  storage.setItem(errands,JSON.stringify({active:{S03:{step:0,count:0}},finished:[]}));
  const {town,story}=open(storage);
  assert.equal(town.hasSettledQuest('S03'),false);assert.ok(JSON.parse(storage.getItem(errands)).active.S03);
  assert.deepEqual(town.state.bag,saved.town.bag);assert.equal(town.gold,saved.balance);story.dispose();
 }
});
