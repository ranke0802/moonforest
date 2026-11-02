import test from 'node:test';
import assert from 'node:assert/strict';
import {ChapterJourney,CHAPTER_SAVE} from '../src/chapter-quest-state.js';
import {CHAPTER_QUESTS} from '../src/chapter-quest-data.js';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}};
const finish=(j,id)=>{if(j.status(id)==='available')j.accept(id);for(const o of CHAPTER_QUESTS.find(q=>q.id===id).objectives)j.record(o.key,o.count);return j.claim(id);};
test('nineteen authored quests form an acyclic prerequisite graph; optional quests never block the main path',()=>{
 assert.equal(CHAPTER_QUESTS.length,19);const keys=new Set(CHAPTER_QUESTS.map(q=>q.id));assert.equal(keys.size,19);
 for(const q of CHAPTER_QUESTS){assert.ok(q.objectives.length);for(const p of q.requires)assert.ok(keys.has(p));if(q.type==='메인')assert.ok(q.requires.every(p=>p.startsWith('M')));}
 const j=new ChapterJourney(memory());for(let i=0;i<10;i++)assert.ok(finish(j,'M'+String(i).padStart(2,'0')));assert.equal(j.value.done.filter(id=>id[0]==='Q').length,0);
});
test('early evidence survives reload and turn-in is exactly once, including consumed apples and rewards',()=>{
 const storage=memory(),j=new ChapterJourney(storage);j.record('inspect:bandage',1,'point:bandage');j.collect('apple',4,'apples');assert.equal(j.collect('apple',4,'apples'),false);finish(j,'M00');assert.equal(j.accept('Q01'),true);j.record('apple:strike',3);
 const next=new ChapterJourney(storage);assert.equal(next.value.facts['inspect:bandage'],1);assert.equal(next.status('Q01'),'ready');assert.ok(next.claim('Q01'));assert.equal(next.value.bag.apple,0);assert.equal(next.value.bag.pie,2);assert.equal(next.claim('Q01'),null);assert.equal(new ChapterJourney(storage).value.bag.pie,2);
});
test('incomplete and locked quests grant nothing; optional future model events remain pending',()=>{
 const j=new ChapterJourney(memory());assert.equal(j.claim('M07'),null);assert.equal(j.accept('M07'),false);assert.equal(j.value.xp,0);finish(j,'M00');finish(j,'M01');finish(j,'M02');assert.ok(j.accept('Q08'));for(const id of ['archer','warrior','shaman'])j.record('read:'+id);assert.equal(j.status('Q08'),'active');assert.equal(j.claim('Q08'),null);
});
test('a full health bar does not consume food, and successful use persists independently from map saves',()=>{
 const storage=memory(),j=new ChapterJourney(storage);finish(j,'M00');j.accept('Q01');j.record('apple:strike',3);j.collect('apple',4);j.claim('Q01');assert.equal(j.use('pie',()=>false),false);assert.equal(j.value.bag.pie,2);assert.ok(j.use('pie',()=>true));assert.equal(new ChapterJourney(storage).value.bag.pie,1);assert.ok(storage.getItem(CHAPTER_SAVE));
});
test('corrupt saves and unavailable storage preserve an operational session without invented progress',()=>{
 const j=new ChapterJourney({getItem:()=>'{broken',setItem:()=>{throw Error('quota');}});assert.deepEqual(j.value.done,[]);j.record('visit:village',1,'visit:village');assert.equal(j.volatile,true);assert.equal(j.record('visit:village',1,'visit:village'),false);assert.equal(j.record('bad',Infinity),false);assert.equal(j.value.xp,0);
});

import {GoldLoot} from '../src/gold-loot.js';
test('quest gold reconciles into the real wallet once after reload and retains combat loot',()=>{const storage=memory(),gold=new GoldLoot({storage});assert.equal(gold.creditCumulative('chapter-one',120),120);gold.drop('goblin',{x:0,z:0});gold.update(1,{x:0,z:0});const reload=new GoldLoot({storage});assert.equal(reload.balance,130);assert.equal(reload.creditCumulative('chapter-one',120),0);assert.equal(reload.creditCumulative('chapter-one',135),15);assert.equal(reload.balance,145);});
