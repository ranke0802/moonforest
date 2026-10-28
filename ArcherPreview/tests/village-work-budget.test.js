import test from 'node:test';
import assert from 'node:assert/strict';
import {VillageWorkBudget} from '../src/village-work-budget.js';

test('runtime setup yields to frames in bounded chunks without skipping, duplicating or reordering placements',async()=>{
 let time=0,frameWork=0;const chunks=[],placements=[];
 const work=new VillageWorkBudget(()=>true,()=>false,{now:()=>time,frame:async()=>{chunks.push(frameWork);frameWork=0;}});
 for(let i=0;i<120;i++){
  if(work.due())await work.yield();
  placements.push(i);time+=.8;frameWork+=.8;
 }
 assert.deepEqual(placements,Array.from({length:120},(_,i)=>i));
 assert.ok(chunks.length>=29);assert.ok(chunks.every(ms=>ms<=3.21),'one atomic item may finish past the 3ms budget');
});
test('startup incurs no frame waits, and disposal while waiting cancels remaining placement work',async()=>{
 let time=0,cancelled=false,active=false,release,placed=0;
 const work=new VillageWorkBudget(()=>active,()=>cancelled,{now:()=>time,frame:()=>new Promise(resolve=>{release=resolve;})});
 time=100;assert.equal(work.due(),false);active=true;assert.equal(work.due(),true);
 const pending=(async()=>{if(work.due())await work.yield();if(cancelled)return;placed++;})();
 assert.equal(placed,0);cancelled=true;release();await pending;assert.equal(placed,0);assert.equal(work.due(),false);
});
