import test from 'node:test';
import assert from 'node:assert/strict';
import {ChapterJourney,CHAPTER_SAVE,CHAPTER_BACKUP,CHAPTER_PRESERVED} from '../src/chapter-quest-state.js';
import {GoldLoot,GOLD_LEDGER_KEY} from '../src/gold-loot.js';
import {releaseStorage} from '../src/release-storage.js';

function memory(seed={}){const data=new Map(Object.entries(seed));return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};}

test('missing, denied and no-op storage cannot claim a durable save',()=>{
 for(const storage of [undefined,releaseStorage(undefined,'moonforest-0.2'),{getItem(){throw Error('denied');},setItem(){throw Error('denied');}},{getItem:()=>null,setItem(){}}]){
  const journey=new ChapterJourney(storage);journey.collect('apple',2,'one');assert.equal(journey.volatile,true);assert.notEqual(journey.saveState,'saved');assert.equal(journey.value.bag.apple,2);
 }
});
test('quota failure keeps the whole temporary reward, retry persists it exactly once',()=>{
 const store=memory();let fail=true;const storage={...store,setItem:(key,value)=>{if(fail)throw Error('quota');return store.setItem(key,value);}};
 const journey=new ChapterJourney(storage);journey.collect('apple',2,'one');assert.equal(journey.saveState,'failed');assert.equal(store.getItem(CHAPTER_SAVE),null);fail=false;assert.equal(journey.save(),true);assert.equal(journey.saveState,'saved');assert.equal(new ChapterJourney(storage).collect('apple',2,'one'),false);
});
test('corrupt and future saves survive automatic writes and invalid imports byte-for-byte',()=>{
 for(const raw of ['{broken',JSON.stringify({version:999,bag:{gold:4321}})]){
  const storage=memory({[CHAPTER_SAVE]:raw}),journey=new ChapterJourney(storage);journey.collect('apple',1);assert.equal(storage.getItem(CHAPTER_SAVE),raw);assert.equal(journey.volatile,true);assert.equal(journey.importSave('{invalid'),false);assert.equal(storage.getItem(CHAPTER_SAVE),raw);assert.equal(JSON.parse(journey.exportSave()).preservedOriginal,raw);
 }
});
test('explicit valid recovery preserves rejected original, restores the last good snapshot and tokens',()=>{
 const storage=memory(),journey=new ChapterJourney(storage);journey.collect('apple',2,'one');assert.equal(journey.flushBackup(),true);const backup=storage.getItem(CHAPTER_BACKUP);storage.setItem(CHAPTER_SAVE,'{broken');const broken=new ChapterJourney(storage);assert.equal(broken.hasBackup,true);assert.equal(broken.recoverBackup(),true);assert.equal(storage.getItem(CHAPTER_PRESERVED),'{broken');assert.equal(storage.getItem(CHAPTER_SAVE),backup);assert.equal(broken.collect('apple',2,'one'),false);assert.equal(broken.value.bag.apple,2);
});
test('stale tabs cannot overwrite newer progress or replace it via import',()=>{
 const storage=memory(),first=new ChapterJourney(storage),second=new ChapterJourney(storage);first.collect('gold',10,'first');const raw=storage.getItem(CHAPTER_SAVE);second.collect('gold',20,'second');assert.equal(second.saveState,'conflict');assert.equal(second.volatile,true);assert.equal(storage.getItem(CHAPTER_SAVE),raw);assert.equal(second.importSave(first.exportSave()),false);assert.equal(storage.getItem(CHAPTER_SAVE),raw);
});
test('portable journal JSON validates before writing and does not manufacture invalid progress',()=>{
 const source=new ChapterJourney(memory());source.collect('apple',2,'one');const target=new ChapterJourney(memory());assert.equal(target.importSave(source.exportSave()),true);assert.equal(target.value.bag.apple,2);assert.equal(target.collect('apple',2,'one'),false);const raw=target.storage.getItem(CHAPTER_SAVE);assert.equal(target.importSave(JSON.stringify({version:7})),false);assert.equal(target.storage.getItem(CHAPTER_SAVE),raw);
});
test('backup flushing is separate from the atomic reward write and skips unchanged snapshots',()=>{
 const storage=memory();let writes=0;const original=storage.setItem;storage.setItem=(key,value)=>{writes++;original(key,value);};const journey=new ChapterJourney(storage);journey.collect('apple',2,'one');assert.equal(writes,1);journey.flushBackup();assert.equal(writes,2);journey.flushBackup();assert.equal(writes,2);
});
test('chapter gold remains monotonic above the old cap and reconciles with the wallet once',()=>{
 const storage=memory(),journey=new ChapterJourney(storage),gold=new GoldLoot({storage});journey.recordDefeatReward('kill:goblin',{gold:100000});assert.equal(gold.creditCumulative('chapter-one',journey.value.bag.gold),100000);journey.recordDefeatReward('kill:goblin',{gold:25});assert.equal(gold.creditCumulative('chapter-one',journey.value.bag.gold),25);assert.equal(gold.balance,100025);const nextJourney=new ChapterJourney(storage),nextGold=new GoldLoot({storage});assert.equal(nextJourney.value.bag.gold,100025);assert.equal(nextGold.creditCumulative('chapter-one',nextJourney.value.bag.gold),0);assert.equal(nextGold.balance,100025);
});
test('legacy cumulative gold migration preserves the existing wallet and its credit watermark',()=>{
 const storage=memory({[CHAPTER_SAVE]:JSON.stringify({version:1,bag:{gold:100000}}),[GOLD_LEDGER_KEY]:JSON.stringify({version:1,balance:321,credits:{'chapter-one':100000}})});const journey=new ChapterJourney(storage),gold=new GoldLoot({storage});assert.equal(gold.creditCumulative('chapter-one',journey.value.bag.gold),0);assert.equal(gold.balance,321);journey.recordDefeatReward('kill:goblin',{gold:25});assert.equal(gold.creditCumulative('chapter-one',journey.value.bag.gold),25);assert.equal(gold.balance,346);
});
test('wallet refuses stale tab and corrupt-ledger overwrites',()=>{
 const storage=memory(),first=new GoldLoot({storage}),second=new GoldLoot({storage});first.creditCumulative('chapter-one',10);const raw=storage.getItem(GOLD_LEDGER_KEY);second.creditCumulative('chapter-one',20);assert.equal(second.saveState,'conflict');assert.equal(storage.getItem(GOLD_LEDGER_KEY),raw);storage.setItem(GOLD_LEDGER_KEY,'{broken');const broken=new GoldLoot({storage});broken.creditCumulative('chapter-one',30);assert.equal(broken.saveState,'corrupt');assert.equal(storage.getItem(GOLD_LEDGER_KEY),'{broken');
});
