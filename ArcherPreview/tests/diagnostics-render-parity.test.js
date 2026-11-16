import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,StandardMaterial} from '@babylonjs/core';
import {SceneDiagnostics} from '../src/scene-diagnostics.js';
import {RenderCpuSampler} from '../src/render-cpu-sampler.js';
import {LongFrameRecording} from '../src/long-frame-recording.js';
import {prepareMapMaterials} from '../src/map-shader-cache.js';
import {setFrameWorkContext,createFrameWorkLease,frameWorkSnapshot} from '../src/frame-work-coordinator.js';

// This exercises real SDK rendering and the public diagnostic/recording APIs.
// NullEngine cannot establish device FPS, GPU scheduling or thermal behavior.
const modes=[
 {name:'off',enabled:false,record:false,detail:false},
 {name:'basic',enabled:true,record:false,detail:false},
 {name:'recording',enabled:true,record:true,detail:false},
 {name:'detailed-recording',enabled:true,record:true,detail:true},
];

function observerCounts(owner){
 return Object.fromEntries(Object.keys(owner).filter(key=>key.endsWith('Observable')&&Array.isArray(owner[key]?.observers))
  .map(key=>[key,owner[key].observers.filter(observer=>!observer._willBeUnregistered).length]));
}

test('diagnostics OFF, basic, recording and detailed recording preserve the same real scene submission and state',async t=>{
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);
 t.after(()=>{scene.dispose();engine.dispose();});engine.maxFPS=60;
 const camera=new FreeCamera('camera',new Vector3(0,2,-8),scene);camera.setTarget(Vector3.Zero());
 const source=MeshBuilder.CreateBox('source',{},scene),material=new StandardMaterial('material',scene);
 material.disableLighting=true;source.material=material;
 const instance=source.createInstance('instance');instance.position.x=2;
 const hidden=source.clone('hidden');hidden.isVisible=false;hidden.position.x=-2;
 const disabled=source.clone('disabled');disabled.setEnabled(false);disabled.position.z=2;
 await prepareMapMaterials([source]);
 // Establish the normal scene's lazy SDK observers before comparing modes;
 // they belong to first-use material setup, not diagnostic instrumentation.
 engine.beginFrame();scene.render();engine.endFrame();

 // Retain the exact native return values as well as submitted draw arguments.
 const calls=[],returns=[],owned=[];
 for(const name of ['drawElementsType','drawArraysType','setTexture']){
  const original=engine[name],descriptor=Object.getOwnPropertyDescriptor(engine,name);
  function observe(...args){const value=Reflect.apply(original,this,args);returns.push({method:name,value});if(name.startsWith('draw'))calls.push({method:name,args:args.slice()});return value;}
  Object.defineProperty(engine,name,{configurable:true,writable:true,value:observe});owned.push({name,observe,descriptor});
 }
 t.after(()=>{for(const {name,descriptor}of owned){if(descriptor)Object.defineProperty(engine,name,descriptor);else delete engine[name];}});
 const nativeCandidates=scene.getActiveMeshCandidates;
 const baseObservers={scene:observerCounts(scene),engine:observerCounts(engine)};
 let time=0,queries=0;
 // Controlled, nonblocking timer driver: GPU query lifecycle is exercised,
 // while no actual GPU timing or performance claim is made.
 const probe=new SceneDiagnostics({now:()=>time,driverFactory:()=>({
  lost:()=>false,disjoint:()=>false,busy:()=>false,begin:()=>({id:++queries}),end(){},available:()=>true,result:()=>1000000,remove(){},
 })});
 t.after(()=>probe.dispose());
 const recordings=[],results=[];
 for(const mode of modes){
  time=0;probe.setEnabled(mode.enabled,scene);probe.setDrawCpuEnabled(mode.detail);probe.setActive(mode.enabled);
  assert.equal(probe.cpu instanceof RenderCpuSampler,mode.detail);
  const recording=new LongFrameRecording({now:()=>time});if(mode.record)recording.start({mode:mode.name});
  const frames=[];
  for(let phase=0;phase<3;phase++){
   time=phase*300;
   const start=time;
   setFrameWorkContext(scene,{active:true,frameId:phase,generation:7,budgetMs:2});
   const lease=createFrameWorkLease({scene,now:()=>time});lease.charge(.75);
   source.rotation.y=phase*.125;source.position.x=phase*.1;
   instance.position.z=phase*.2;material.alpha=1;hidden.isVisible=false;disabled.setEnabled(false);
   // Cover periodic capture, coalesced event capture and retained continuous
   // hooks, using the same public switches used by the recording controller.
   if(mode.detail&&phase===1){probe.requestDrawCpuCapture('enemy-defeat');probe.requestDrawCpuCapture('texture-promote');}
   if(mode.detail&&phase===2)probe.setContinuous(true);
   calls.length=0;returns.length=0;
   engine.beginFrame();scene.render();engine.endFrame();
   time+=4;
   const metrics=probe.sample();
   recording.record({startMs:start,intervalMs:300,workMs:4,targetFps:engine.maxFPS,metrics,sections:{},context:()=>({map:'fixture'})});
   const budget=frameWorkSnapshot(scene);
   frames.push({
    calls:structuredClone(calls),returns:returns.slice(),
    meshes:[source,instance,hidden,disabled].map(mesh=>({
     world:Array.from(mesh.getWorldMatrix().m),visible:mesh.isVisible,visibility:mesh.visibility,enabled:mesh.isEnabled(),
     material:mesh.material?.uniqueId,instances:mesh.instances?.length??0,
    })),
    material:{alpha:material.alpha,disableLighting:material.disableLighting,diffuse:material.diffuseColor.asArray()},
    active:scene.getActiveMeshes().data.slice(0,scene.getActiveMeshes().length).map(mesh=>mesh.name),
    indices:scene.getActiveIndices(),size:[engine.getRenderWidth(),engine.getRenderHeight(),engine.getHardwareScalingLevel()],fps:engine.maxFPS,
    budget:{active:budget.active,budgetMs:budget.budgetMs,usedMs:budget.usedMs,generation:budget.generation,frameId:budget.frameId,due:lease.due()},
   });
   assert.ok(calls.length>0,`${mode.name} actually submits draws`);
   if(mode.detail)assert.equal(metrics.drawCpu.latest.reason,phase===0?'periodic':phase===1?'texture-promote':'continuous');
  }
  if(mode.record){recording.stop();recordings.push(recording.snapshot());}
  results.push({mode:mode.name,frames});
  // Pause keeps historical samples only; disposal removes all owned hooks
  // and SDK instrumentation observers before the next mode is run.
  probe.setActive(false);
  if(mode.detail){assert.ok(probe.sample().drawCpu.retained);assert.equal(probe.cpu.hooks.length,0);}
  probe.setContinuous(false);probe.setEnabled(false);
  for(const {name,observe}of owned)assert.equal(engine[name],observe,`${mode.name}: ${name} restored`);
  assert.equal(scene.getActiveMeshCandidates,nativeCandidates);
  assert.deepEqual({scene:observerCounts(scene),engine:observerCounts(engine)},baseObservers,`${mode.name}: observers restored`);
 }
 for(const result of results.slice(1))assert.deepEqual(result.frames,results[0].frames,result.mode);
 assert.ok(queries>0,'enabled diagnostics really exercised the timer lifecycle');
 assert.equal(recordings.length,2);
 assert.equal(recordings[0].frames,3);assert.equal(recordings[0].detailFrames.length,0);
 assert.equal(recordings[1].frames,3);assert.equal(recordings[1].detailFrames.length,1);
 assert.equal(recordings[1].detailFrames[0].render.drawCpu.reason,'continuous');
 // Actual commands/visual state match; profiling counters and recording data
 // intentionally differ and are not treated as game-state parity failures.
});
