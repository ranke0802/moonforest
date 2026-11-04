// Independent SDK sampler lifecycle/CPU-overhead probe. No GPU/phone claims.
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,StandardMaterial,Observable} from '@babylonjs/core';
import {RenderCpuSampler} from '../../src/render-cpu-sampler.js';
import {SceneDiagnostics} from '../../src/scene-diagnostics.js';
import {prepareMapMaterials} from '../../src/map-shader-cache.js';

const descriptors=(owner,names)=>Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(owner,name)]));
const engineNames=['drawElementsType','drawArraysType','enableEffect','bindBuffers','bindVertexArrayObject','setTexture','updateDynamicVertexBuffer','updateDynamicIndexBuffer'];
const sceneNames=['getActiveMeshCandidates'];
const e=new NullEngine(),one=new Scene(e),two=new Scene(e),probe=new SceneDiagnostics({driverFactory:()=>null});
const beforeEngine=descriptors(e,engineNames),beforeOne=descriptors(one,sceneNames),beforeTwo=descriptors(two,sceneNames);
const observerCounts=()=>[e.onEndFrameObservable,e.onContextLostObservable,e.onContextRestoredObservable,one.onBeforeRenderObservable,one.onAfterRenderObservable,two.onBeforeRenderObservable,two.onAfterRenderObservable].map(o=>o.observers.filter(v=>!v._willBeUnregistered).length);
const beforeObservers=observerCounts();
for(let i=0;i<50;i++){
 probe.setEnabled(true,one);probe.setActive(true);probe.cpu.begin();assert.ok(probe.cpu.pending);probe.setActive(false);
 assert.deepEqual(descriptors(e,engineNames),beforeEngine);assert.deepEqual(descriptors(one,sceneNames),beforeOne);
 probe.setActive(true);probe.cpu.begin();probe.resetGpu();assert.equal(probe.cpu.pending,null);
 probe.cpu.begin();probe.setEnabled(true,two);assert.deepEqual(descriptors(one,sceneNames),beforeOne);
 probe.cpu.begin();e.onContextLostObservable.notifyObservers();assert.equal(probe.cpu.pending,null);assert.equal(probe.cpu.sample().status,'context-lost');
 assert.deepEqual(descriptors(e,engineNames),beforeEngine);assert.deepEqual(descriptors(two,sceneNames),beforeTwo);
 e.onContextRestoredObservable.notifyObservers();probe.cpu.begin();e.onEndFrameObservable.notifyObservers();assert.equal(probe.cpu.pending,null);
 probe.setEnabled(false);assert.deepEqual(descriptors(e,engineNames),beforeEngine);assert.deepEqual(descriptors(one,sceneNames),beforeOne);assert.deepEqual(descriptors(two,sceneNames),beforeTwo);
 assert.deepEqual(observerCounts(),beforeObservers);
}
probe.setEnabled(true,one);probe.setActive(true);probe.cpu.begin();one.dispose();assert.deepEqual(descriptors(e,engineNames),beforeEngine);assert.equal(probe.instrumentation,null);probe.dispose();two.dispose();e.dispose();

// Own engine and scene descriptors, both data and accessor, survive all paths.
let time=0;const noop=()=>{};
const engine={onEndFrameObservable:new Observable(),onContextLostObservable:new Observable(),onContextRestoredObservable:new Observable()};
const originalDraw=function(value){assert.equal(this,engine);time++;if(value==='error')throw Error('original draw error');return value;};
Object.defineProperty(engine,'drawElementsType',{configurable:true,enumerable:true,writable:false,value:originalDraw});
let candidateCalls=0;const candidate=function(){assert.equal(this,scene);candidateCalls++;return {data:[],length:0};};
const scene={getEngine:()=>engine,getFrameId:()=>0,onBeforeRenderObservable:new Observable(),onAfterRenderObservable:new Observable()};
Object.defineProperty(scene,'getActiveMeshCandidates',{configurable:true,enumerable:true,get:()=>candidate});
const originalDescriptors=[Object.getOwnPropertyDescriptor(engine,'drawElementsType'),Object.getOwnPropertyDescriptor(scene,'getActiveMeshCandidates')];
const sampler=new RenderCpuSampler(scene,{now:()=>time});sampler.setActive(true);sampler.begin();assert.equal(engine.drawElementsType(9),9);assert.equal(scene.getActiveMeshCandidates().length,0);sampler.end();
assert.deepEqual([Object.getOwnPropertyDescriptor(engine,'drawElementsType'),Object.getOwnPropertyDescriptor(scene,'getActiveMeshCandidates')],originalDescriptors);
time=2000;sampler.begin();assert.throws(()=>engine.drawElementsType('error'),/original draw error/);engine.onEndFrameObservable.notifyObservers();assert.equal(sampler.pending,null);
assert.deepEqual([Object.getOwnPropertyDescriptor(engine,'drawElementsType'),Object.getOwnPropertyDescriptor(scene,'getActiveMeshCandidates')],originalDescriptors);
time=4000;sampler.begin();const retained=scene.getActiveMeshCandidates,external=function(...args){return Reflect.apply(retained,this,args);};Object.defineProperty(scene,'getActiveMeshCandidates',{configurable:true,value:external});sampler.dispose();
assert.equal(scene.getActiveMeshCandidates,external);assert.equal(scene.getActiveMeshCandidates().length,0);assert.equal(candidateCalls,2);

async function nativeFixture(sampled){
 const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('camera',new Vector3(0,0,-25),scene);camera.setTarget(Vector3.Zero());
 const materials=Array.from({length:4},(_,i)=>{const m=new StandardMaterial('paint-'+i,scene);m.disableLighting=true;return m;});
 const meshes=[];for(let i=0;i<80;i++){const mesh=MeshBuilder.CreateBox('box-'+i,{size:.4},scene);mesh.position.set((i%10-4.5)*.55,(Math.floor(i/10)-3.5)*.55,0);mesh.material=materials[i%4];meshes.push(mesh);}
 await prepareMapMaterials(meshes);const calls=[];const draw=engine.drawElementsType;engine.drawElementsType=function(...args){calls.push(args);return Reflect.apply(draw,this,args);};
 let sampler=sampled?new RenderCpuSampler(scene):null;sampler?.setActive(true);
 const baseline={engine:descriptors(engine,engineNames),scene:descriptors(scene,sceneNames)};
 const frame=()=>{engine.beginFrame();scene.render();engine.endFrame();};for(let i=0;i<30;i++){if(sampler)sampler.next=0;frame();}
 calls.length=0;if(sampler)sampler.next=0;frame();const expected=structuredClone(calls);assert.ok(expected.length>0);
 return {engine,scene,sampler,expected,frame,calls,baseline};
}
const fixtures=[await nativeFixture(false),await nativeFixture(true)],costs=[[],[]];
try{
 assert.deepEqual(fixtures[0].expected,fixtures[1].expected);
 for(let round=0;round<20;round++)for(const index of round%2?[1,0]:[0,1]){
  const f=fixtures[index];for(let i=0;i<20;i++){
   if(f.sampler)f.sampler.next=0;f.calls.length=0;const start=performance.now();f.frame();costs[index].push(performance.now()-start);
   assert.deepEqual(f.calls,f.expected);assert.deepEqual(descriptors(f.engine,engineNames),f.baseline.engine);assert.deepEqual(descriptors(f.scene,sceneNames),f.baseline.scene);
  }
 }
 const stats=values=>{const s=[...values].sort((a,b)=>a-b);return {samples:s.length,meanMs:s.reduce((a,b)=>a+b,0)/s.length,medianMs:s[Math.floor(s.length/2)],p95Ms:s[Math.ceil(s.length*.95)-1],maxMs:s.at(-1)};};
 const plain=stats(costs[0]),sampled=stats(costs[1]),latest=fixtures[1].sampler.sample().latest;
 const fault=fixtures[1],originalDraw=fault.engine.drawElementsType;fault.engine.drawElementsType=function(){throw Error('actual scene draw fault');};
 const faultDescriptors={engine:descriptors(fault.engine,engineNames),scene:descriptors(fault.scene,sceneNames)};fault.sampler.next=0;
 fault.engine.beginFrame();try{assert.throws(()=>fault.scene.render(),/actual scene draw fault/);}finally{fault.engine.endFrame();}
 assert.equal(fault.sampler.pending,null);assert.equal(fault.sampler.sample().latest,latest,'a failed render must not publish a partial sample');
 assert.deepEqual(descriptors(fault.engine,engineNames),faultDescriptors.engine);assert.deepEqual(descriptors(fault.scene,sceneNames),faultDescriptors.scene);fault.engine.drawElementsType=originalDraw;
 const sourceSha256Lf=Object.fromEntries(['src/render-cpu-sampler.js','src/scene-diagnostics.js'].map(path=>[path,createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
 const report={generatedAt:new Date().toISOString(),sourceSha256Lf,lifecycle:{roundTrips:50,enablePauseMapResetAndSceneReplacement:true,contextLossRestore:true,engineEndAfterError:true,actualSceneRenderErrorRestoredDescriptors:true,failedRenderDoesNotPublishPartialSample:true,sceneDisposal:true,observerPlateau:true,engineAndSceneOwnDescriptorsRestored:true,externalSceneWrapperPassthrough:true},
  nativeSdk:{drawCalls:fixtures[0].expected.length,drawBatchesExactlyEqual:true,engineAndSceneDescriptorsRestoredAfterEveryFrame:true,sampledGroups:latest.groups,effectCacheChanges:latest.effectChanges},
  localNodeOverhead:{plain,sampledEveryFrame:sampled,meanDeltaMs:sampled.meanMs-plain.meanMs,medianDeltaMs:sampled.medianMs-plain.medianMs,
   note:'Alternating20 batches of20 frames; sampling forced every measured frame to expose overhead. Production samples at most1Hz. No camera/asset quality changes. This is a NullEngine CPU fixture, not a device FPS or GPU result.'},
  limitations:['No WebGL shader-driver compilation, GPU execution, browser pixels/compositing, phone FPS or thermal benefit is measured.','Counter durations are inclusive and can overlap. Their sum is not scene render time. EffectChanges counts engine cached Effect identity changes, not GPU program changes.','Sampled frames include timing/wrapper overhead and may perturb the frame being observed. Do not infer the cause of earlier driver/texture stalls from this fixture.']};
 writeFileSync(new URL('audit-sampler-lifecycle.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{for(const f of fixtures){f.sampler?.dispose();f.engine.dispose();}}
