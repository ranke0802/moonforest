import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,PBRMaterial,RawTexture,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {InternalTexture} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import {VillageTextureStreaming} from '../src/village-texture-streaming.js';
import {highTextureBytes} from '../src/village-texture-budget.js';

// Real Texture ownership/readiness and production streaming state. Controlled
// viewport notifications and backend completion do not measure browser/GPU time.
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const listeners=observable=>observable.observers.filter(observer=>!observer._willBeUnregistered).length;
function timers(){
  let now=0,next=0,peak=0;const tasks=new Map();
  return {now:()=>now,setTimeout(fn,ms){const id=++next;tasks.set(id,{fn,at:now+ms});peak=Math.max(peak,tasks.size);return id;},clearTimeout:id=>tasks.delete(id),
    advance(ms){now+=ms;for(const [id,task]of [...tasks])if(task.at<=now&&tasks.delete(id))task.fn();},get size(){return tasks.size;},get peak(){return peak;}};
}
function viewport(){
  let settling=false,disposed=false,peak=0;const listeners=new Set();
  const snapshot=()=>({settling,disposed});
  return {isSettling:()=>settling,snapshot,subscribe(fn){listeners.add(fn);peak=Math.max(peak,listeners.size);return()=>listeners.delete(fn);},
    begin(){settling=true;},stable(){settling=false;for(const fn of [...listeners])fn(snapshot());},dispose(){disposed=true;settling=false;for(const fn of [...listeners])fn(snapshot());},
    get size(){return listeners.size;},get peak(){return peak;},callbacks:()=>[...listeners]};
}
function fixture(t,{gate=viewport(),timeout=45000}={}){
  const clock=timers(),engine=new NullEngine({textureSize:2048,renderWidth:1560,renderHeight:720}),scene=new Scene(engine),camera=new ArcRotateCamera('camera',0,1.2,4,Vector3.Zero(),scene);
  engine.getCaps().maxTextureSize=8192;engine.getCaps().etc2={};camera.fov=.65;camera.getViewMatrix();camera.getProjectionMatrix();
  const world={scene,camera,touchDevice:true,villageStreaming:{active:true,pending:null},viewportResize:gate};
  const material=new PBRMaterial('rock',scene),original=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,scene);original.getInternalTexture().isReady=true;material.albedoTexture=original;material.metadata={villageToon:true};
  const profile={shading:'toon-color',textures:{albedo:{url:'rock.ktx2',width:2048,height:2048,codec:'etc1s',alpha:false,gpuBlockBytes:8}},resources:['rock.ktx2']};
  const assets=new Map([['rock',{baseLevel:0,config:{highTextures:profile},source:{materials:[material]}}]]);
  const records=[{placement:{asset:'rock'},root:{isEnabled:()=>true},meshes:[{isInFrustum:()=>true,getBoundingInfo:()=>({boundingSphere:{centerWorld:camera.target,radiusWorld:2}})}]}];
  const callbacks=[],streams=[],create=engine.createTexture.bind(engine);
  engine.createTexture=(...args)=>{
    if(!String(args[0]).startsWith('https://viewport.test/'))return create(...args);
    const internal=new InternalTexture(engine,1);Object.assign(internal,{url:args[0],isReady:false,width:2048,height:2048,generateMipMaps:true});engine.getLoadedTexturesCache().push(internal);scene.addPendingData(internal);
    callbacks.push({internal,args,complete(){scene.removePendingData(internal);internal.isReady=true;args[5]?.();internal.onLoadedObservable.notifyObservers(internal);},error(){scene.removePendingData(internal);args[6]?.('late backend error');}});return internal;
  };
  const observerBaseline={render:listeners(scene.onAfterRenderObservable),lost:listeners(engine.onContextLostObservable),restored:listeners(engine.onContextRestoredObservable)};
  const make=()=>{
    const stats={},stream=new VillageTextureStreaming(world,assets,records,new URL('https://viewport.test/assets/'),stats,{textureTimers:clock,viewportWaitTimeoutMs:timeout});stream.clock=clock.now;stream.wanted.set('rock',1);streams.push(stream);return {stream,stats};
  };
  t.after(()=>{for(const stream of streams)stream.dispose();engine.dispose();assert.equal(clock.size,0);assert.equal(gate?.size??0,0);});
  return {clock,engine,scene,camera,world,gate,material,original,profile,assets,records,callbacks,observerBaseline,make,...make()};
}

test('settling viewport defers admission without reserving, evicting or creating a texture',async t=>{
  const f=fixture(t);f.stream.update(0);f.clock.advance(250);f.gate.begin();
  for(let frame=0;frame<30;frame++){f.stream.update(f.clock.now());f.clock.advance(5);}
  assert.equal(f.stats.highTextureStage,'viewport-wait:admission');assert.equal(f.stats.highTextureViewportWaiting,true);
  assert.equal(f.stream.pending,null);assert.equal(f.stats.highTextureReserved,0);assert.equal(f.callbacks.length,0);assert.equal(f.clock.size,0);assert.equal(f.gate.size,0);
  assert.equal(f.stream.start('rock'),undefined);assert.equal(f.material.albedoTexture,f.original);
  f.gate.stable();f.stream.update(f.clock.now());const pending=f.stream.pendingTask;assert.ok(pending);assert.equal(f.callbacks.length,1);
  f.callbacks[0].complete();await pending;assert.equal(f.stats.highTextureLoads,1);assert.equal(f.stats.highTextureViewportWaiting,false);
});

test('rotation during resource await pauses before updateURL, retains one reservation, then resumes the same job',async t=>{
  const f=fixture(t);let release,resourceCalls=0;f.world.prefetchResources=()=>{resourceCalls++;return new Promise(resolve=>release=resolve);};
  const pending=f.stream.start('rock'),reserved=f.stats.highTextureReserved;assert.equal(f.stats.highTextureStage,'resources');
  f.gate.begin();release();await flush();assert.equal(f.stats.highTextureStage,'viewport-wait:texture:albedo');
  assert.equal(f.callbacks.length,0);assert.equal(resourceCalls,1);assert.equal(f.stats.highTextureReserved,reserved);assert.equal(reserved,highTextureBytes(f.profile,f.stream.textureCapabilities));
  const waiter=f.stream.viewportWait;
  for(let turn=0;turn<20;turn++){f.gate.begin();f.clock.advance(10);f.stream.update(f.clock.now());assert.equal(f.stream.viewportWait,waiter);assert.equal(f.stream.start('rock'),undefined);}
  assert.equal(f.clock.size,1);assert.equal(f.gate.size,1);assert.equal(listeners(f.scene.onAfterRenderObservable),f.observerBaseline.render+1);
  f.gate.stable();await flush();assert.equal(f.callbacks.length,1);assert.equal(f.stats.highTextureStage,'texture:albedo');assert.equal(f.gate.size,0);
  f.callbacks[0].complete();await pending;assert.equal(resourceCalls,1);assert.equal(f.stats.highTextureLoads,1);assert.equal(f.stats.highTextureReserved,0);assert.equal(f.clock.size,0);
  assert.equal(f.material.albedoTexture.getSize().width,2048);assert.equal(f.callbacks[0].internal.generateMipMaps,true);assert.equal(f.assets.get('rock').config.highTextures,f.profile);
});

test('rotation keeps an already-started decode and waits after readiness before promoting its one allocation',async t=>{
  const f=fixture(t),pending=f.stream.start('rock'),callback=f.callbacks[0],reserved=f.stats.highTextureReserved;
  f.gate.begin();for(let i=0;i<20;i++)f.stream.update(i*250);
  assert.equal(f.callbacks.length,1);assert.equal(callback.internal._references,1);assert.equal(f.stream.textureWaiters.size,1);
  callback.complete();await flush();assert.equal(f.stats.highTextureStage,'viewport-wait:promote');assert.equal(f.material.albedoTexture,f.original);
  assert.equal(f.stats.highTextureReserved,reserved);assert.equal(f.stats.highTextureLoads,0);assert.equal(f.gate.size,1);assert.equal(f.clock.size,1);
  f.clock.advance(200);f.gate.stable();await pending;
  assert.equal(f.callbacks.length,1);assert.equal(f.material.albedoTexture.getInternalTexture(),callback.internal);assert.equal(f.stats.highTextureLoads,1);
  assert.equal(f.stats.highTextureLastPromoteMs,0,'viewport wait is outside the synchronous assignment clock');assert.equal(f.clock.size,0);assert.equal(f.gate.size,0);
});

test('a second rotation between load completion and promotion resumes once without subscriber/timer growth',async t=>{
  const f=fixture(t);let release;f.world.prefetchResources=()=>new Promise(resolve=>release=resolve);
  const pending=f.stream.start('rock');f.gate.begin();release();await flush();f.gate.stable();await flush();
  assert.equal(f.callbacks.length,1);assert.equal(f.gate.size,0);f.gate.begin();f.callbacks[0].complete();await flush();
  assert.equal(f.stats.highTextureStage,'viewport-wait:promote');assert.equal(f.gate.size,1);assert.equal(f.clock.size,1);
  f.gate.stable();await pending;assert.equal(f.callbacks.length,1);assert.equal(f.stats.highTextureLoads,1);assert.equal(f.gate.peak,1);assert.equal(f.clock.peak,1);
});

test('stable-to-pending races recheck both boundaries without renewing the admitted job deadline',async t=>{
  const f=fixture(t,{timeout:100});let release;f.world.prefetchResources=()=>new Promise(resolve=>release=resolve);
  const pending=f.stream.start('rock');f.gate.begin();release();await flush();const deadline=f.stream.viewportWaitDeadline;
  f.clock.advance(20);f.gate.stable();f.gate.begin();await flush();
  assert.equal(f.callbacks.length,0);assert.equal(f.gate.size,1);assert.equal(f.clock.size,1);assert.equal(f.stream.viewportWaitDeadline,deadline);
  f.gate.stable();await flush();assert.equal(f.callbacks.length,1);
  f.gate.begin();f.callbacks[0].complete();await flush();f.clock.advance(20);f.gate.stable();f.gate.begin();await flush();
  assert.equal(f.material.albedoTexture,f.original);assert.equal(f.gate.size,1);assert.equal(f.clock.size,1);assert.equal(f.stream.viewportWaitDeadline,deadline);
  f.gate.stable();await pending;assert.equal(f.stats.highTextureLoads,1);assert.equal(f.callbacks.length,1);assert.equal(f.clock.size,0);assert.equal(f.gate.peak,1);
});

test('an asset removed during either viewport wait cannot start decoding or overwrite its working material',async t=>{
  for(const boundary of ['texture','promote']){
    const f=fixture(t);let release;
    if(boundary==='texture')f.world.prefetchResources=()=>new Promise(resolve=>release=resolve);
    const pending=f.stream.start('rock');f.gate.begin();if(release)release();else f.callbacks[0].complete();await flush();
    assert.equal(f.stats.highTextureStage,boundary==='texture'?'viewport-wait:texture:albedo':'viewport-wait:promote');
    f.stream.wanted.clear();f.gate.stable();await pending;
    assert.equal(f.callbacks.length,boundary==='texture'?0:1);assert.equal(f.stats.highTextureLoads,0);assert.equal(f.stats.highTextureReserved,0);assert.equal(f.stats.highTextureError,null);
    assert.equal(f.material.albedoTexture,f.original);assert.equal(f.gate.size,0);assert.equal(f.clock.size,0);
    if(boundary==='promote')assert.equal(f.callbacks[0].internal._references,0);
  }
});

test('scene disposal aborts a waiting job and removes its owned deadline, subscription and engine observers',async t=>{
  const f=fixture(t),pending=f.stream.start('rock');f.gate.begin();f.callbacks[0].complete();await flush();f.scene.dispose();await pending;
  assert.equal(f.stream.disposed,true);assert.equal(f.stats.highTextureReserved,0);assert.equal(f.stats.highTextureLoads,0);assert.equal(f.stats.highTextureError,null);
  assert.equal(f.gate.size,0);assert.equal(f.clock.size,0);assert.equal(listeners(f.engine.onContextLostObservable),0);assert.equal(listeners(f.engine.onContextRestoredObservable),0);
});

test('only a successful promotion requests the optional first-draw CPU capture',async t=>{
  const f=fixture(t),requests=[];f.world.requestDrawCpuCapture=reason=>requests.push(reason);
  const pending=f.stream.start('rock');f.gate.begin();f.callbacks[0].complete();await flush();assert.deepEqual(requests,[]);
  f.gate.stable();await pending;assert.deepEqual(requests,['texture-promote']);f.stream.release('rock');assert.deepEqual(requests,['texture-promote']);
  f.world.requestDrawCpuCapture=()=>{throw Error('diagnostic fixture');};const second=f.stream.start('rock');f.callbacks[1].complete();await second;
  assert.equal(f.stats.highTextureLoads,2);assert.equal(f.stats.highTextureError,null);assert.equal(f.material.albedoTexture.getInternalTexture(),f.callbacks[1].internal);
});

test('map disposal releases a promotion wait immediately and stale notifications cannot overwrite a new stream',async t=>{
  const f=fixture(t),pending=f.stream.start('rock');f.gate.begin();f.callbacks[0].complete();await flush();const stale=f.gate.callbacks();
  f.stream.dispose();await pending;assert.equal(f.clock.size,0);assert.equal(f.gate.size,0);assert.equal(f.stats.highTextureReserved,0);assert.equal(f.callbacks[0].internal._references,0);
  assert.equal(f.stats.highTextureStage,'disposed');assert.equal(f.material.albedoTexture,f.original);
  f.gate.stable();const fresh=f.make(),current=fresh.stream.start('rock');f.callbacks[1].complete();await current;const currentTexture=f.material.albedoTexture;
  for(const notify of stale)notify({settling:false});f.callbacks[0].complete();f.callbacks[0].error();await flush();
  assert.equal(f.material.albedoTexture,currentTexture);assert.equal(fresh.stats.highTextureLoads,1);assert.equal(f.stats.highTextureLoads,0);assert.equal(fresh.stats.highTextureError,null);
  assert.equal(listeners(f.scene.onAfterRenderObservable),f.observerBaseline.render+1);assert.equal(listeners(f.engine.onContextLostObservable),f.observerBaseline.lost+1);
});

test('fixed viewport deadline is not renewed by repeated rotation and late stable callbacks cannot promote',async t=>{
  const f=fixture(t,{timeout:100});t.mock.method(console,'warn',()=>{});const pending=f.stream.start('rock');f.gate.begin();f.callbacks[0].complete();await flush();const stale=f.gate.callbacks();
  for(let i=0;i<4;i++){f.clock.advance(20);f.gate.begin();f.stream.update(f.clock.now());}
  assert.equal(f.clock.size,1);f.clock.advance(20);await pending;
  assert.equal(f.stream.viewportWait,null);assert.equal(f.clock.size,0);assert.equal(f.gate.size,0);assert.equal(f.stats.highTextureReserved,0);
  assert.match(f.stats.highTextureError,/초과/);assert.equal(f.material.albedoTexture,f.original);assert.equal(f.callbacks[0].internal._references,0);
  f.gate.stable();for(const notify of stale)notify({settling:false});await flush();assert.equal(f.stats.highTextureLoads,0);assert.equal(f.stream.start('rock'),undefined);assert.equal(f.callbacks.length,1);
});

test('context loss cleans viewport wait, blocks admission until restore, and keeps the working base material',async t=>{
  const f=fixture(t),pending=f.stream.start('rock');f.gate.begin();f.callbacks[0].complete();await flush();
  f.engine.onContextLostObservable.notifyObservers(f.engine);await pending;
  assert.equal(f.stream.contextLost,true);assert.equal(f.stream.viewportWait,null);assert.equal(f.clock.size,0);assert.equal(f.gate.size,0);assert.equal(f.stats.highTextureReserved,0);assert.equal(f.stats.highTextureError,null);
  f.gate.stable();for(let i=0;i<20;i++){f.stream.update(i*250);assert.equal(f.stream.start('rock'),undefined);}assert.equal(f.callbacks.length,1);assert.equal(f.material.albedoTexture,f.original);
  f.engine.onContextRestoredObservable.notifyObservers(f.engine);assert.equal(f.stream.contextLost,false);const restored=f.stream.start('rock');f.callbacks[1].complete();await restored;assert.equal(f.stats.highTextureLoads,1);
});

test('context loss during active backend completion cancels its owner and stale completion cannot replace restored texture',async t=>{
  const f=fixture(t),pending=f.stream.start('rock'),old=f.callbacks[0];f.engine.onContextLostObservable.notifyObservers(f.engine);await pending;
  assert.equal(f.stream.textureWaiters.size,0);assert.equal(f.scene.getWaitingItemsCount(),0);assert.equal(old.internal._references,0);assert.equal(f.stats.highTextureError,null);
  f.engine.onContextRestoredObservable.notifyObservers(f.engine);const restored=f.stream.start('rock');f.callbacks[1].complete();await restored;const current=f.material.albedoTexture;
  old.complete();old.error();await flush();assert.equal(f.material.albedoTexture,current);assert.equal(f.stats.highTextureLoads,1);
});

test('disposing while a stable notification is queued cannot promote or leak the decoded texture',async t=>{
  const f=fixture(t),pending=f.stream.start('rock');f.gate.begin();f.callbacks[0].complete();await flush();f.gate.stable();f.stream.dispose();await pending;
  assert.equal(f.stats.highTextureLoads,0);assert.equal(f.stats.highTextureReserved,0);assert.equal(f.callbacks[0].internal._references,0);assert.equal(f.material.albedoTexture,f.original);assert.equal(f.clock.size,0);assert.equal(f.gate.size,0);
});

test('repeated retained-profile promotions and releases keep one observer set and no accumulated reservations',async t=>{
  const f=fixture(t),source=f.assets.get('rock').source,profile=f.profile;
  for(let cycle=0;cycle<20;cycle++){
    const pending=f.stream.start('rock');f.gate.begin();f.callbacks.at(-1).complete();await flush();assert.equal(f.clock.size,1);assert.equal(f.gate.size,1);
    f.gate.stable();await pending;assert.equal(f.stats.highTextureReserved,0);assert.equal(f.clock.size,0);assert.equal(f.gate.size,0);assert.equal(f.stream.textureWaiters.size,0);
    assert.equal(listeners(f.scene.onAfterRenderObservable),f.observerBaseline.render+1);assert.equal(listeners(f.engine.onContextLostObservable),f.observerBaseline.lost+1);assert.equal(listeners(f.engine.onContextRestoredObservable),f.observerBaseline.restored+1);
    assert.equal(f.assets.get('rock').source,source);assert.equal(f.assets.get('rock').config.highTextures,profile);assert.equal(f.stats.highTextureBytes,highTextureBytes(profile,f.stream.textureCapabilities));
    f.stream.release('rock');assert.equal(f.stats.highTextureBytes,0);assert.equal(f.material.albedoTexture,f.original);
  }
  assert.equal(f.callbacks.length,20);assert.equal(f.gate.peak,1);assert.equal(f.clock.peak,1);f.stream.dispose();
  assert.equal(listeners(f.scene.onAfterRenderObservable),f.observerBaseline.render);assert.equal(listeners(f.engine.onContextLostObservable),f.observerBaseline.lost);assert.equal(listeners(f.engine.onContextRestoredObservable),f.observerBaseline.restored);
});

test('an absent or disabled viewport gate preserves immediate Texture creation and promotion',async t=>{
  for(const gate of [null,{isSettling:()=>false}]){
    const f=fixture(t,{gate}),pending=f.stream.start('rock');assert.equal(f.callbacks.length,1);assert.equal(f.stats.highTextureStage,'texture:albedo');assert.equal(f.stream.viewportWait,null);
    f.callbacks[0].complete();await pending;assert.equal(f.stats.highTextureLoads,1);assert.equal(f.stats.highTextureStage,'idle');assert.equal(f.clock.size,0);
  }
});

test('a gate without subscribe resumes through the existing render observer and still has a finite deadline',async t=>{
  const gate={settling:false,isSettling(){return this.settling;}},f=fixture(t,{gate}),pending=f.stream.start('rock');gate.settling=true;f.callbacks[0].complete();await flush();
  assert.ok(f.stream.viewportWait.frameCheck);assert.equal(listeners(f.scene.onAfterRenderObservable),f.observerBaseline.render+1);assert.equal(f.clock.size,1);
  gate.settling=false;f.stream.update(0);await pending;assert.equal(f.stats.highTextureLoads,1);assert.equal(f.clock.size,0);
});
