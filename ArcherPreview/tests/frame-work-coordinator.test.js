import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameWorkCoordinator,createFrameWorkLease,setFrameWorkContext,frameWorkSnapshot} from '../src/frame-work-coordinator.js';
import {VillageWorkBudget} from '../src/village-work-budget.js';
import {createBossPreparation} from '../src/boss-preparation.js';

test('two preparation owners share one budget and each scheduling opportunity resets only once',()=>{
 let time=0;const coordinator=new FrameWorkCoordinator({now:()=>time});coordinator.begin({active:true,frameId:1});
 const a=createFrameWorkLease({coordinator,now:()=>time}),b=createFrameWorkLease({coordinator,now:()=>time});
 time+=1.2;a.charge(1.2);time+=.9;b.charge(.9);assert.equal(a.due(),true);assert.equal(b.due(),true);
 const ta=a.beforeWait(),tb=b.beforeWait();a.afterWait(ta);a.charge(1.4);b.afterWait(tb);
 assert.equal(coordinator.usedMs,1.4,'second waiter cannot erase work already done in the new opportunity');
 time+=.3;b.checkpoint();assert.ok(Math.abs(coordinator.usedMs-1.7)<1e-9);
 coordinator.begin({active:true,frameId:2});assert.equal(coordinator.usedMs,0);
});

test('checkpoints exclude another owner charged time and never count a first asynchronous load',()=>{
 let time=0;const coordinator=new FrameWorkCoordinator();coordinator.begin({active:true,frameId:1});
 const budget=new VillageWorkBudget(()=>true,()=>false,{coordinator,now:()=>time,milliseconds:10000});
 time=500;assert.equal(budget.due(),false);assert.equal(coordinator.usedMs,0);
 const other=createFrameWorkLease({coordinator,now:()=>time});time+=1.2;other.charge(1.2);time+=.4;budget.due();
 assert.ok(Math.abs(coordinator.usedMs-1.6)<1e-9,'elapsed placement checkpoint subtracts concurrent owner work');
});

test('scene leases retain their own generation and loading curtains bypass shared work',async()=>{
 let time=0;const scene={},otherScene={};const c=setFrameWorkContext(scene,{active:true,frameId:1,generation:1});
 const a=createFrameWorkLease({scene,now:()=>time});setFrameWorkContext(otherScene,{active:true,frameId:1});
 a.charge(1);assert.equal(frameWorkSnapshot(scene).usedMs,1);assert.equal(frameWorkSnapshot(otherScene).usedMs,0);
 setFrameWorkContext(scene,{active:false,frameId:2,generation:2});a.charge(100);assert.equal(c.usedMs,0);
 setFrameWorkContext(scene,{active:true,frameId:3,generation:2});a.charge(100);assert.equal(c.usedMs,0,'old generation cannot spend a new world budget');
 const sync=createBossPreparation({scene,incremental:false,now:()=>time,frame:async()=>assert.fail('synchronous loading must not be queued')});
 await sync.step('foreground',()=>{time+=20;});assert.equal(c.usedMs,0);assert.equal(await sync.run((function*(){yield;return 7;})()),7);
 setFrameWorkContext(scene,{active:false,frameId:4,generation:2});
 const bypass=createBossPreparation({scene,now:()=>time,frame:async()=>{}});await bypass.step('curtain',()=>{time+=20;});assert.equal(c.usedMs,0);
});

test('concurrent village placement and actor setup yield under the same 2ms budget without reordering',async()=>{
 let time=0,frameId=0,frameStart=0,done=false,failure;const scene={},waiters=[],chunks=[],placed=[],prepared=[];
 const coordinator=setFrameWorkContext(scene,{active:true,frameId,budgetMs:2});
 const frame=()=>new Promise(resolve=>waiters.push(resolve));
 const village=new VillageWorkBudget(()=>true,()=>false,{scene,now:()=>time,frame,milliseconds:3});
 const boss=createBossPreparation({scene,now:()=>time,frame,budgetMs:3,maxBlocks:100});
 const tasks=Promise.all([
  (async()=>{for(let i=0;i<20;i++){if(village.due())await village.yield();placed.push(i);time+=.4;}village.due();})(),
  (async()=>{for(let i=0;i<20;i++)await boss.step('actor',()=>{prepared.push(i);time+=.4;});})()
 ]).then(()=>{done=true;},error=>{failure=error;done=true;});
 for(let i=0;!done&&i<100;i++){
  for(let j=0;j<30;j++)await Promise.resolve();
  if(waiters.length){chunks.push(time-frameStart);frameStart=time;coordinator.begin({active:true,frameId:++frameId});const batch=waiters.splice(0);for(const resolve of batch)resolve();}
 }
 await tasks;if(failure)throw failure;assert.ok(done);chunks.push(time-frameStart);
 assert.deepEqual(placed,Array.from({length:20},(_,i)=>i));assert.deepEqual(prepared,placed);
 assert.ok(chunks.every(ms=>ms<=2.401),JSON.stringify(chunks));assert.ok(coordinator.yields>0);assert.ok(Math.abs(time-16)<1e-9);
});

test('legacy pause boundaries account unwrapped work and awaited I/O does not spend preparation budget',async()=>{
 let time=0,frames=0;const coordinator=new FrameWorkCoordinator();coordinator.begin({active:true,frameId:1});
 const p=createBossPreparation({coordinator,now:()=>time,frame:async()=>{frames++;},budgetMs:1000,maxBlocks:100});
 await p.pause();time+=1.1;await p.pause();assert.ok(Math.abs(coordinator.usedMs-1.1)<1e-9);
 const other=createFrameWorkLease({coordinator,now:()=>time});time+=1;other.charge(1);await p.pause();assert.equal(frames,2);
 await p.wait(Promise.resolve().then(()=>{time+=200;}));assert.equal(coordinator.usedMs,0,'async completion resets the owner checkpoint, without charging I/O elapsed');
 await p.pause();assert.equal(frames,2);
});

test('shared waits retain cancellation, deadline and generator return contracts',async()=>{
 let time=0,current=true;const coordinator=new FrameWorkCoordinator();coordinator.begin({active:true,frameId:1});
 const p=createBossPreparation({coordinator,now:()=>time,frame:async()=>{},isCurrent:()=>current,timeoutMs:10,budgetMs:3,maxBlocks:100});
 const order=[];const result=await p.run((function*(){for(let i=0;i<8;i++){time+=.4;order.push(i);yield;}return 42;})());assert.equal(result,42);assert.deepEqual(order,[0,1,2,3,4,5,6,7]);
 current=false;await assert.rejects(p.step('cancelled',()=>assert.fail('cancelled callback')),{name:'AbortError'});assert.equal(p.pendingWaits,0);
 const deadline=createBossPreparation({coordinator,now:()=>time,frame:async()=>{time+=20;},timeoutMs:10});await assert.rejects(deadline.step('late',()=>assert.fail('timed-out callback')),{name:'TimeoutError'});assert.equal(deadline.pendingWaits,0);
});
