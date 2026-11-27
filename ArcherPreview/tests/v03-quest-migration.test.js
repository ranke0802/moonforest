// 2026-11-27 homecoming line: saves written in the shipped order (M00…M09, index only)
// are read at the nearest point of the new line, never paid twice, never stuck.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {GoldLoot} from '../src/gold-loot.js';
import {QUESTS,ERRANDS,NPCS,DIALOGUES} from '../src/v03/data/chapter1.js';
import {questKey,chapterProgress} from '../src/v03/chapter-progress.js';
import {createQuestLog,readCursor} from '../src/v03/quests.js';
import {createErrandLog} from '../src/v03/errands.js';
import {recordedQuestIds} from '../src/v03/character-progression.js';
import {slotStorage} from '../src/v03/save-slots.js';
import {createStory} from '../src/v03/story.js';
import {createTownEconomy} from '../src/v03/town-economy.js';

const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
const main=questKey(1),errandKey=main+':errands';
const OLD_STEPS={M00:4,M01:1,M02:2,M03:3,M04:2,M05:2,M06:3,M07:3,M08:1,M09:1};
const OLD=Object.keys(OLD_STEPS);
// old [quest, step] -> new [quest id, step id, alpha errand]
const EXPECT={
 'M00/0':['M00','fight'],'M00/3':['M00','road'],'M01/0':['M01','inn'],'M02/0':['M10','father'],'M02/1':['M10','father'],
 'M03/0':['M10','father'],'M03/1':['M03','hunt'],'M03/2':['M03','report'],'M04/0':['M04','father'],'M04/1':['M04','report'],
 'M05/0':['M11','herbalist'],'M05/1':['M11','herbalist'],'M06/0':['M11','herbalist',null],'M06/1':['M11','herbalist',{step:0,count:0}],
 'M06/2':['M11','herbalist',{step:1,count:0}],'M07/0':['M11','herbalist','finished'],'M07/1':['M07','goblins','finished'],
 'M07/2':['M07','clues','finished'],'M08/0':['M08','saint','finished'],'M09/0':['M09','report','finished'],
};
const eventsFor=step=>step.type==='defeat'?Array.from({length:step.count},()=>({type:'defeat',kind:step.kind??'boar',map:step.map})):
 step.type==='talk'?step.targets.map(npc=>({type:'talk',npc})):[{type:'reach',map:step.map}];

test('every old checkpoint lands on the nearest step of the new line',()=>{
 for(const [id,steps] of Object.entries(OLD_STEPS))for(let step=0;step<steps;step++){
  const cursor=readCursor({quest:OLD.indexOf(id),step,count:2,done:[]},QUESTS),want=EXPECT[`${id}/${step}`];
  assert.ok(cursor?.migrated,`${id}/${step} moves`);
  const quest=QUESTS[cursor.quest];
  if(want){assert.equal(quest.id,want[0],`${id}/${step}`);assert.equal(quest.steps[cursor.step].id,want[1],`${id}/${step}`);
   if(want.length>2)assert.deepEqual(cursor.errand?.state??null,want[2]&&typeof want[2]==='object'?{...want[2],count:want[2].step===0?2:0}:want[2],`${id}/${step} errand`);}
 }
 // Counts carry over only into the same hunt.
 assert.equal(readCursor({quest:3,step:1,count:2,done:[]},QUESTS).count,2);assert.equal(readCursor({quest:7,step:1,count:4,done:[]},QUESTS).count,4);
 assert.equal(readCursor({quest:4,step:0,count:1,done:[]},QUESTS).count,0,'the bear step becomes the father talk');
 // The end stays the end (chapter 2 stays open), and the new format reads back by id.
 const end=readCursor({quest:10,step:0,count:0,done:[]},QUESTS);assert.equal(end.quest,QUESTS.length);assert.equal(end.errand.state,'finished');
 assert.deepEqual(readCursor({v:2,id:'M11',quest:0,step:1,count:0,done:['chief']},QUESTS),{quest:QUESTS.findIndex(q=>q.id==='M11'),step:1,count:0,done:['chief']});
 assert.equal(readCursor({v:2,id:'nope',quest:3,step:0,count:0,done:[]},QUESTS),null);
 assert.equal(readCursor({quest:11,step:0,count:0,done:[]},QUESTS),null);
 const storage=memory();storage.setItem(main,JSON.stringify({quest:10,step:0,count:0,done:[]}));
 assert.ok(chapterProgress(storage,{1:QUESTS,2:['E01','E02']}).available(2),'an old finished slot still opens chapter 2');
});

test('from every old checkpoint the new line plays to its end',()=>{
 for(const [id,steps] of Object.entries(OLD_STEPS))for(let step=0;step<steps;step++){
  const storage=memory();storage.setItem(main,JSON.stringify({quest:OLD.indexOf(id),step,count:0,done:[]}));
  const log=createQuestLog({quests:QUESTS,storage,key:main});assert.ok(log.load(),`${id}/${step}`);
  for(let guard=0;guard<80&&!log.finished;guard++)for(const event of eventsFor(log.step()))log.notify(event);
  assert.equal(log.finished,true,`${id}/${step} reaches the end`);
  assert.equal(JSON.parse(storage.getItem(main)).id,'#end');
 }
});

function open(storage){
 const wallet=new GoldLoot({storage}),town=createTownEconomy(wallet);
 town.creditQuests(recordedQuestIds(storage,{1:QUESTS}),true,{QUESTS,ERRANDS});
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>'),player={position:{x:0,z:0}};
 const world={scene:{isDisposed:false},mapId:'great-plains',terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>null}};
 const api={world,battle:{encounters:[],combatCount:0},input:{setSuspended(){}},getPlayer:()=>player,getController:()=>null,
  itemCount:id=>town.state.bag[id]??0,settleQuest:(quest,step)=>town.settleQuest(quest,step),hasSettledQuest:id=>town.hasSettledQuest(id)};
 const story=createStory({api,doc:document,save:{journey:storage,touch(){}},content:{QUESTS,ERRANDS,NPCS,DIALOGUES},
  createVisual:()=>({place(x,y,z){this.position={x,y,z};},dispose(){}})});
 story.start({key:main});
 async function talkTo(npc,map){
  const frame=()=>story.update(1/60,{ready:true,mapId:map,character:map==='village'?'warrior-v3':'warrior-plains'});
  frame();Object.assign(player.position,story.castVisual(npc).position);frame();document.querySelector('.v03-prompt').click();
  assert.ok(story.dialogueOpen);
  for(let i=0;i<40&&story.dialogueOpen;i++)document.querySelector('.v03-dialogue-next').click();
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {town,wallet,story,talkTo};
}

test('a save past the alpha keeps it finished as the driver’s errand and is not paid again',()=>{
 const storage=slotStorage(memory(),'test03',1);
 // The shipped game had paid M00…M06 (gold ledger entry and XP record).
 const seed=new GoldLoot({storage}),seeded=createTownEconomy(seed);
 for(const id of ['M00','M01','M02','M03','M04','M05','M06']){const q={id,reward:{gold:{M06:250}[id]??0}};seeded.settleQuest(q);}
 storage.setItem(main,JSON.stringify({quest:7,step:1,count:3,done:[]}));
 const first=open(storage),gold=first.town.gold;
 assert.equal(first.story.log.quest().id,'M07');assert.equal(first.story.log.step().id,'goblins');assert.equal(first.story.log.snapshot().count,3);
 const errands=JSON.parse(storage.getItem(errandKey));assert.deepEqual(errands.finished,['M06']);
 assert.equal(JSON.parse(storage.getItem(main)).v,2,'written in the new format');
 const reopened=createErrandLog({errands:ERRANDS,storage,key:errandKey});assert.ok(reopened.load());assert.equal(reopened.offerFor('driver',()=>true),null,'the driver does not offer it again');
 first.story.dispose();
 const second=open(storage);assert.equal(second.town.gold,gold,'nothing more on the next visit');
 assert.equal(second.wallet.credits['v03-quest-M06'],250);assert.equal(second.wallet.credits['v03-errand-M06'],undefined);
 second.story.dispose();
});

test('an alpha hunt in progress continues as the errand and pays once, to the old ledger entry',async()=>{
 const storage=slotStorage(memory(),'test03',1);
 storage.setItem(main,JSON.stringify({quest:6,step:2,count:0,done:[]}));
 const first=open(storage);
 assert.equal(first.story.log.quest().id,'M11');
 assert.deepEqual(JSON.parse(storage.getItem(errandKey)).active,{M06:{step:1,count:0}},'the alpha is down: report to the driver');
 const before=first.town.gold;
 await first.talkTo('driver','great-plains');
 assert.deepEqual(JSON.parse(storage.getItem(errandKey)).finished,['M06']);
 assert.equal(first.town.gold,before+250);assert.equal(first.wallet.credits['v03-quest-M06'],250);
 first.story.dispose();
 const again=open(storage);assert.equal(again.town.gold,before+250);assert.deepEqual(JSON.parse(storage.getItem(errandKey)).finished,['M06']);again.story.dispose();
 // A hunt not yet taken waits for the driver's offer after the bear.
 const fresh=slotStorage(memory(),'test04',1);fresh.setItem(main,JSON.stringify({quest:6,step:0,count:0,done:[]}));
 const offered=open(fresh);assert.equal(JSON.parse(fresh.getItem(errandKey)??'{"active":{}}').active.M06,undefined);
 assert.equal(createErrandLog({errands:ERRANDS}).offerFor('driver',id=>offered.story.log.isDone(id))?.id,'M06');offered.story.dispose();
});
