import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonsterGroupScheduler} from '../src/monster-group-scheduler.js';
test('prewarm prepares due packs while the game is not running and reveals them on the first update',async()=>{
 let ready=false;const spawned=[],committed=[];
 const s=createMonsterGroupScheduler({preparationGroups:2,canCommit:()=>ready,focus:()=>({x:0,z:0}),spawn:async row=>{await new Promise(r=>setTimeout(r,5));spawned.push(row.id);return {id:row.id};},commit:handles=>committed.push(...handles.map(h=>h.id))});
 s.load([{id:'a1',groupId:'a',spawnMode:'start',x:0,z:0},{id:'a2',groupId:'a',spawnMode:'start',x:0,z:0},{id:'b1',groupId:'b',spawnMode:'start',x:9,z:0},{id:'c1',groupId:'c',spawnMode:'start',x:20,z:0},{id:'d1',groupId:'d',spawnMode:'timed',delaySeconds:30,x:0,z:5}]);
 await s.prewarm({deadlineMs:2000});
 assert.deepEqual(spawned.sort(),['a1','a2','b1','c1'],'every nearby pack due now is prepared, beyond the 2-at-a-time limit; a delayed pack waits');
 assert.deepEqual(committed,[],'nothing is shown during loading');
 assert.ok(s.inspect().filter(g=>g.id!=='d').every(g=>g.state==='prepared'));
 ready=true;s.update(0);
 assert.deepEqual(committed.sort(),['a1','a2','b1','c1']);
 assert.ok(s.inspect().filter(g=>g.id!=='d').every(g=>g.state==='active'));
});

test('prewarm prepares only packs near the player; far packs wait for play, one at a time',async()=>{
 let ready=false;const spawned=[],committed=[];
 const s=createMonsterGroupScheduler({preparationGroups:1,canCommit:()=>ready,focus:()=>({player:{x:0,z:0},spot:{x:200,z:0}}),spawn:async row=>{await new Promise(r=>setTimeout(r,5));spawned.push(row.id);return {id:row.id};},commit:handles=>committed.push(...handles.map(h=>h.id))});
 s.load([{id:'n1',groupId:'n',spawnMode:'start',x:10,z:0},{id:'m1',groupId:'m',spawnMode:'start',x:0,z:40},{id:'f1',groupId:'f',spawnMode:'start',x:120,z:0},{id:'g1',groupId:'g',spawnMode:'start',x:190,z:0}]);
 await s.prewarm({deadlineMs:2000});
 assert.deepEqual(spawned.sort(),['m1','n1'],'only the packs within 45 m are prepared behind the loading screen');
 ready=true;s.update(0);
 assert.deepEqual(committed.sort(),['m1','n1']);
 const preparing=s.inspect().filter(g=>g.state==='preparing').length;
 assert.equal(preparing,1,'far packs are prepared one at a time in play');
});
test('prewarm without a known player position warms at most two packs',async()=>{
 const spawned=[];
 const s=createMonsterGroupScheduler({canCommit:()=>false,spawn:async row=>{spawned.push(row.id);return {id:row.id};}});
 s.load(['a','b','c','d'].map((g,i)=>({id:g+'1',groupId:g,spawnMode:'start',x:i*100,z:0})));
 await s.prewarm({deadlineMs:1000});
 assert.equal(spawned.length,2);
});
