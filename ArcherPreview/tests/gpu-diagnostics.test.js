import test from 'node:test';
import assert from 'node:assert/strict';
import {Observable} from '@babylonjs/core/Misc/observable.js';
import {NullEngine,Scene} from '@babylonjs/core';
import {GpuFrameSampler,SceneDiagnostics,gpuTimerDriver} from '../src/scene-diagnostics.js';

function gpuFixture({webgl1=false,supported=true}={}){
  let time=0,current=null,disjoint=false,lost=false;
  const calls={created:0,ended:0,deleted:0,availability:0,results:0,forbidden:0},queries=[];
  const create=()=>{const q={id:++calls.created,available:false,ns:0};queries.push(q);return q;};
  const begin=(_,q)=>{assert.equal(current,null,'elapsed queries must not overlap');current=q;};
  const end=()=>{assert.ok(current,'only end an active query');current=null;calls.ended++;};
  const read=(q,kind)=>{if(kind===2){calls.availability++;return q.available;}calls.results++;assert.equal(q.available,true,'read result only after availability');return q.ns;};
  const remove=q=>{assert.notEqual(current,q,'active queries end before deletion');assert.equal(q.deleted,undefined);q.deleted=true;calls.deleted++;};
  const forbid=()=>{calls.forbidden++;throw new Error('synchronous GPU operation');};
  const extension={TIME_ELAPSED_EXT:10,GPU_DISJOINT_EXT:11,CURRENT_QUERY_EXT:1,QUERY_RESULT_AVAILABLE_EXT:2,QUERY_RESULT_EXT:3};
  if(webgl1)Object.assign(extension,{createQueryEXT:create,beginQueryEXT:begin,endQueryEXT:end,getQueryEXT:()=>current,getQueryObjectEXT:read,deleteQueryEXT:remove});
  const gl={CURRENT_QUERY:1,QUERY_RESULT_AVAILABLE:2,QUERY_RESULT:3,createQuery:create,beginQuery:begin,endQuery:end,getQuery:()=>current,getQueryParameter:read,deleteQuery:remove,getParameter:()=>disjoint,isContextLost:()=>lost,finish:forbid,readPixels:forbid,fenceSync:forbid,clientWaitSync:forbid};
  const engine={_gl:gl,getCaps:()=>({timerQuery:supported?extension:null}),onBeginFrameObservable:new Observable(),onEndFrameObservable:new Observable(),onContextLostObservable:new Observable(),onContextRestoredObservable:new Observable()};
  const sampler=new GpuFrameSampler(engine,{now:()=>time});
  return {engine,sampler,calls,queries,setTime:t=>time=t,begin:at=>{time=at;engine.onBeginFrameObservable.notifyObservers();},end:at=>{time=at;engine.onEndFrameObservable.notifyObservers();},complete:(ms=8.25)=>{queries.at(-1).available=true;queries.at(-1).ns=ms*1e6;},disjoint:v=>disjoint=v,lose:()=>{lost=true;current=null;engine.onContextLostObservable.notifyObservers();},restore:()=>{lost=false;engine.onContextRestoredObservable.notifyObservers();}};
}

for(const webgl1 of [false,true])test(`native WebGL${webgl1?'1':'2'} timer is asynchronous, unique, throttled and never blocks`,()=>{
  const f=gpuFixture({webgl1}),s=f.sampler;
  f.begin(0);f.end(10);assert.equal(f.calls.created,0,'disabled sampler creates no query');
  s.setActive(true);f.begin(20);f.end(30);assert.equal(f.calls.created,1);assert.equal(f.calls.results,0);assert.equal(s.sample().status,'pending');assert.equal(s.sample().meanMs,null);
  f.begin(40);f.end(50);assert.equal(f.calls.created,1,'keep at most one outstanding query');assert.equal(f.calls.results,0);
  f.complete(8.25);f.begin(60);f.end(70);const sample=s.sample();
  assert.equal(sample.status,'valid');assert.equal(sample.meanMs,8.25);assert.equal(sample.latest.startAtMs,20);assert.equal(sample.latest.endAtMs,30);assert.equal(sample.latest.availableAtMs,60);assert.equal(sample.samples,1);assert.equal(f.calls.deleted,1);
  const id=sample.latest.sampleId;for(let t=80;t<250;t+=20){f.begin(t);f.end(t+2);assert.equal(s.sample().latest.sampleId,id);}
  assert.equal(f.calls.results,1,'latest rereads do not read the GL result again');assert.equal(f.calls.created,1);
  f.begin(270);f.end(280);f.complete(0);f.begin(290);f.end(300);assert.equal(s.sample().samples,2);assert.notEqual(s.sample().latest.sampleId,id);assert.equal(s.sample().latest.ms,0,'an actual valid zero remains distinguishable from missing data');
  s.dispose();assert.equal(f.calls.forbidden,0);assert.equal(f.calls.created,f.calls.deleted);
});

test('disjoint, timeout and stale states never report fabricated zero timings',()=>{
  const f=gpuFixture(),s=f.sampler;s.setActive(true);f.begin(0);f.end(10);f.complete();f.begin(20);f.end(25);assert.equal(s.sample().status,'valid');
  f.setTime(2011);assert.equal(s.sample().status,'stale');assert.equal(s.sample().meanMs,null);assert.equal(s.sample().latest,null);
  f.begin(2020);f.end(2030);f.disjoint(true);f.begin(2040);f.begin(2050);assert.equal(s.sample().status,'disjoint');assert.equal(s.sample().disjointEvents,1);assert.equal(s.sample().meanMs,null);assert.equal(f.calls.created,f.calls.deleted);
  f.disjoint(false);f.begin(2300);f.end(2310);f.begin(5301);assert.equal(s.sample().status,'timeout');assert.equal(s.sample().timeouts,1);assert.equal(s.sample().latest,null);assert.equal(f.calls.created,f.calls.deleted);
  s.dispose();
});

test('pause retains historical completed results but disposes pending query; map/reset clear retained data',()=>{
  const f=gpuFixture(),s=f.sampler;s.setActive(true);f.begin(10);f.end(15);f.complete(11);f.begin(20);f.end(25);const first=s.sample().latest;
  f.begin(270);assert.equal(f.calls.created,2);s.setActive(false);
  assert.equal(f.calls.deleted,2);assert.equal(f.calls.ended,2);f.setTime(5000);
  const frozen=s.sample();assert.equal(frozen.status,'paused');assert.equal(frozen.meanMs,null);assert.equal(frozen.latest,null);assert.equal(frozen.retained.latest.sampleId,first.sampleId);assert.equal(frozen.retained.meanMs,11);assert.equal(frozen.retained.ageMs,4985);assert.equal(frozen.retained.historical,true);
  for(let i=0;i<30;i++){f.begin(5100+i*33);f.end(5101+i*33);}assert.equal(f.calls.created,2);
  s.reset('paused');assert.equal(s.sample().retained,null);s.setActive(true);f.begin(7000);f.end(7010);f.complete(9);f.begin(7020);assert.notEqual(s.sample().latest.sampleId,first.sampleId);
  s.reset();assert.equal(s.sample().latest,null);assert.equal(s.sample().status,'pending');s.dispose();
});

test('context loss invalidates handles without GL calls and restoration starts a new epoch',()=>{
  const f=gpuFixture(),s=f.sampler;s.setActive(true);f.begin(0);f.end(10);f.complete();f.begin(20);const id=s.sample().latest.sampleId;
  f.begin(270);const callsBefore={...f.calls};f.lose();assert.equal(s.sample().status,'context-lost');assert.equal(s.sample().latest,null);assert.equal(s.sample().retained,null);assert.deepEqual(f.calls,callsBefore);
  f.begin(300);f.end(310);assert.deepEqual(f.calls,callsBefore);f.restore();f.begin(400);f.end(410);f.complete(6);f.begin(420);assert.equal(s.sample().latest.ms,6);assert.notEqual(s.sample().latest.sampleId,id);s.dispose();
});

test('external timer capture never overlaps, unsupported/error instrumentation cannot stop game frames',()=>{
  const unsupported=gpuFixture({supported:false});unsupported.sampler.setActive(true);unsupported.begin(0);unsupported.end(10);assert.equal(unsupported.sampler.sample().status,'unsupported');assert.equal(unsupported.sampler.sample().meanMs,null);assert.equal(unsupported.calls.created,0);unsupported.sampler.dispose();
  const f=gpuFixture();f.sampler.setActive(true);f.engine._captureGPUFrameTime=true;f.begin(0);assert.equal(f.calls.created,0);assert.equal(f.sampler.sample().status,'busy');f.engine._captureGPUFrameTime=false;f.begin(300);f.end(310);f.sampler.dispose();
  const broken=new GpuFrameSampler(f.engine,{driverFactory:()=>{throw new Error('unsupported driver');}});broken.setActive(true);assert.doesNotThrow(()=>f.begin(400));assert.equal(broken.sample().status,'error');assert.equal(broken.sample().meanMs,null);broken.dispose();
  assert.equal(gpuTimerDriver({getCaps:()=>({})}),null);
});

test('repeated real scene toggles, replacement, map reset and disposal release all GPU observers and handles',async()=>{
  const engine=new NullEngine(),one=new Scene(engine),two=new Scene(engine),f=gpuFixture(),probe=new SceneDiagnostics({now:()=>0,driverFactory:()=>gpuTimerDriver(f.engine)});
  const observables=[engine.onBeginFrameObservable,engine.onEndFrameObservable,engine.onContextLostObservable,engine.onContextRestoredObservable],counts=()=>observables.map(o=>o.observers.length),before=counts();
  for(let i=0;i<20;i++){
    probe.setEnabled(true,one);probe.setActive(true);engine.onBeginFrameObservable.notifyObservers();engine.onEndFrameObservable.notifyObservers();probe.resetGpu();assert.equal(f.calls.created,f.calls.deleted);probe.setEnabled(false);await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(counts(),before);assert.deepEqual(probe.sample(),{});
  }
  probe.setEnabled(true,one);probe.setActive(true);engine.onBeginFrameObservable.notifyObservers();probe.setEnabled(true,two);assert.equal(f.calls.created,f.calls.deleted);two.dispose();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(counts(),before);assert.deepEqual(probe.sample(),{});
  probe.dispose();one.dispose();engine.dispose();
});
