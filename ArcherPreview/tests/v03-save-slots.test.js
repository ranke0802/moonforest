import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseRoute} from '../src/release-route.js';
import {SLOT_COUNT,editionStorage,slotStorage,readSlotIndex,writeSlotMeta,wipeSlot,chooseBootSlot,createSaveSession,writeIntent} from '../src/v03/save-slots.js';

const E='moonforest-0.3';
function memory(seed={}){
 const map=new Map(Object.entries(seed));
 return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>{map.set(k,String(v));},removeItem:k=>{map.delete(k);},dump:()=>Object.fromEntries(map)};
}

test('0.3 entry is an edition on the 0.2 combat release and opens the plains by default',()=>{
 const route=releaseRoute('https://test.invalid/game/moonforest-0.3.html');
 assert.equal(route.edition,E);assert.equal(route.release,'moonforest-0.2');assert.equal(route.enabled,true);
 assert.equal(route.label,'MoonForest 0.3');assert.equal(route.url.searchParams.get('character'),'warrior-plains');
 const kept=releaseRoute('https://test.invalid/moonforest-0.3.html?character=warrior-v3&release=moonforest-0.1&uiTest=1');
 assert.equal(kept.url.searchParams.get('character'),'warrior-v3');assert.equal(kept.release,'moonforest-0.2');assert.equal(kept.url.searchParams.has('uiTest'),false);
});
test('0.1 and 0.2 routes do not gain an edition',()=>{
 assert.equal(releaseRoute('https://test.invalid/moonforest-0.2.html').edition,null);
 assert.equal(releaseRoute('https://test.invalid/moonforest-0.2.html').label,'MoonForest 0.2 ver');
 assert.equal(releaseRoute('https://test.invalid/?character=moonforest-0.1').edition,null);
 assert.equal(releaseRoute('https://test.invalid/?character=archer').edition,null);
});
test('preferences inherit an allowlist only; slot progress is isolated',()=>{
 const raw=memory(),old={getItem:k=>({'archer-render-quality':'balanced','moonforest-gold-v1':'900'})[k]??null};
 const pref=editionStorage(raw,old,E);
 assert.equal(pref.getItem('archer-render-quality'),'balanced');assert.equal(pref.getItem('moonforest-gold-v1'),null);
 pref.setItem('archer-render-quality','high');assert.equal(pref.getItem('archer-render-quality'),'high');
 const one=slotStorage(raw,E,1),two=slotStorage(raw,E,2);
 one.setItem('moonforest-gold-v1','15');assert.equal(two.getItem('moonforest-gold-v1'),null);assert.equal(one.getItem('moonforest-gold-v1'),'15');
 assert.deepEqual(Object.keys(raw.dump()).sort(),['moonforest-0.3:pref:archer-render-quality','moonforest-0.3:slot1:moonforest-gold-v1']);
});
test('slot index sanitizes damaged data and wipe removes exactly one slot',()=>{
 const raw=memory({'moonforest-0.3:slots:v1':'{broken','unrelated':'keep','moonforest-0.2:storage:x':'keep'});
 assert.equal(readSlotIndex(raw,E).length,SLOT_COUNT);assert.ok(readSlotIndex(raw,E).every(m=>!m.used));
 assert.equal(writeSlotMeta(raw,E,2,{title:'늑대와 마차',chapter:1,playSeconds:75.9,level:1e9,savedAt:1000}),true);
 const meta=readSlotIndex(raw,E)[1];assert.equal(meta.used,true);assert.equal(meta.playSeconds,75);assert.equal(meta.level,99);assert.equal(meta.createdAt,1000);
 assert.equal(writeSlotMeta(raw,E,7,{}),false);
 slotStorage(raw,E,2).setItem('a','1');slotStorage(raw,E,3).setItem('a','3');
 assert.equal(wipeSlot(raw,E,2),true);
 assert.equal(slotStorage(raw,E,2).getItem('a'),null);assert.equal(slotStorage(raw,E,3).getItem('a'),'3');
 assert.equal(readSlotIndex(raw,E)[1].used,false);assert.equal(raw.getItem('unrelated'),'keep');assert.equal(raw.getItem('moonforest-0.2:storage:x'),'keep');
});
test('boot slot: explicit request, then first empty, then last played',()=>{
 const used=slot=>({slot,used:true,savedAt:slot*10}),empty=slot=>({slot,used:false});
 assert.equal(chooseBootSlot([used(1),empty(2),empty(3)]),2);
 assert.equal(chooseBootSlot([used(1),empty(2),empty(3)],{requested:1}),1);
 assert.equal(chooseBootSlot([used(1),used(2),used(3)],{last:2}),2);
 assert.equal(chooseBootSlot([used(1),used(2),used(3)]),3);
 assert.equal(chooseBootSlot([empty(1),empty(2),empty(3)],{requested:9}),1);
});
test('a save session consumes its intent once and commits the bound slot',()=>{
 const local=memory(),session=memory();let clock=5000;
 writeIntent(session,E,{slot:3,mode:'load'});
 const first=createSaveSession({local,session,edition:E,now:()=>clock});
 assert.equal(first.slot,3);assert.deepEqual(first.intent,{slot:3,mode:'load'});
 const again=createSaveSession({local,session,edition:E,now:()=>clock});
 assert.equal(again.intent,null);assert.equal(again.slot,1);
 assert.equal(again.touch({playSeconds:9}),false);assert.equal(again.meta().used,false,'touch never creates a save');assert.equal(again.commit({title:'꿈',chapter:1,character:'warrior-plains'}),true);
 assert.equal(again.meta().used,true);assert.equal(again.meta().createdAt,5000);
 clock=9000;again.touch({playSeconds:42});assert.equal(again.meta().savedAt,9000);assert.equal(again.meta().createdAt,5000);assert.equal(again.meta().title,'꿈');
 const next=createSaveSession({local,session,edition:E});assert.equal(next.slot,2);
 assert.equal(writeIntent(null,E,{slot:1,mode:'new'}),false);
});
