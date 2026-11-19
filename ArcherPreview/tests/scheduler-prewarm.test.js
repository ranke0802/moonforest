import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonsterGroupScheduler} from '../src/monster-group-scheduler.js';
test('prewarm prepares due packs while the game is not running and reveals them on the first update',async()=>{
 let ready=false;const spawned=[],committed=[];
 const s=createMonsterGroupScheduler({preparationGroups:2,canCommit:()=>ready,spawn:async row=>{await new Promise(r=>setTimeout(r,5));spawned.push(row.id);return {id:row.id};},commit:handles=>committed.push(...handles.map(h=>h.id))});
 s.load([{id:'a1',groupId:'a',spawnMode:'start',x:0,z:0},{id:'a2',groupId:'a',spawnMode:'start',x:0,z:0},{id:'b1',groupId:'b',spawnMode:'start',x:9,z:0},{id:'c1',groupId:'c',spawnMode:'start',x:20,z:0},{id:'d1',groupId:'d',spawnMode:'timed',delaySeconds:30,x:0,z:5}]);
 await s.prewarm({deadlineMs:2000});
 assert.deepEqual(spawned.sort(),['a1','a2','b1','c1'],'every pack due now is prepared, beyond the 2-at-a-time limit; a delayed pack waits');
 assert.deepEqual(committed,[],'nothing is shown during loading');
 assert.ok(s.inspect().filter(g=>g.id!=='d').every(g=>g.state==='prepared'));
 ready=true;s.update(0);
 assert.deepEqual(committed.sort(),['a1','a2','b1','c1']);
 assert.ok(s.inspect().filter(g=>g.id!=='d').every(g=>g.state==='active'));
});
