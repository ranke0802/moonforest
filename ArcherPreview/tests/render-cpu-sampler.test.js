import test from 'node:test';
import assert from 'node:assert/strict';
import {Observable,NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,StandardMaterial} from '@babylonjs/core';
import {RenderCpuSampler} from '../src/render-cpu-sampler.js';
import {prepareMapMaterials} from '../src/map-shader-cache.js';

function fixture(){
 let time=0;
 const forbidden=()=>{throw new Error('synchronous GL read must not be used');};
 const prototype={drawElementsType(value){assert.equal(this,engine);time+=3;if(value==='throw')throw new Error('draw failed');return value;},
  drawArraysType(){time+=2;},enableEffect(effect){this._currentEffect=effect;time+=1;},setTexture(){time+=.5;},bindBuffers(){this.setTexture();time+=1;},
  _uploadDataToTextureDirectly(){time+=4;},createEffect(){time+=2;}};
 const engine=Object.assign(Object.create(prototype),{onEndFrameObservable:new Observable(),onContextLostObservable:new Observable(),onContextRestoredObservable:new Observable(),_gl:{finish:forbidden,readPixels:forbidden,getParameter:forbidden,clientWaitSync:forbidden}});
 const scene={getEngine:()=>engine,getFrameId:()=>7,getActiveMeshCandidates(){assert.equal(this,scene);time+=.25;return {data:[],length:0};},onBeforeRenderObservable:new Observable(),onAfterRenderObservable:new Observable()};
 const sampler=new RenderCpuSampler(scene,{now:()=>time});
 return {sampler,engine,scene,setTime:value=>{time=value;},begin:()=>scene.onBeforeRenderObservable.notifyObservers(),end:()=>scene.onAfterRenderObservable.notifyObservers(),prototype};
}

test('CPU sampling is bounded, preserves receiver/results and never calls synchronous GPU queries',()=>{
 const f=fixture();f.begin();assert.equal(f.engine.drawElementsType,f.prototype.drawElementsType);f.end();assert.equal(f.sampler.sample().latest,null);
 f.sampler.setActive(true);f.begin();assert.equal(f.engine.drawElementsType(42),42);const effect={};f.engine.enableEffect(effect);f.engine.enableEffect(effect);f.engine.bindBuffers();f.engine._uploadDataToTextureDirectly();f.engine.createEffect();f.scene.getActiveMeshCandidates();f.end();
 const result=f.sampler.sample().latest;assert.equal(result.sceneFrameId,7);assert.equal(result.groups.drawCommands.ms,3);assert.equal(result.groups.drawCommands.calls,1);assert.equal(result.groups.effectEnable.calls,2);assert.equal(result.effectChanges,1);assert.equal(result.groups.bufferBinding.ms,1.5);assert.equal(result.groups.textureSet.ms,.5);
 assert.equal(result.groups.candidateSelection.ms,.25);assert.equal(result.groups.candidateSelection.calls,1);
 assert.equal(result.groups.textureUpload.ms,4);assert.equal(result.groups.textureUpload.calls,1);assert.equal(result.groups.shaderPrepare.ms,2);assert.equal(result.groups.shaderPrepare.calls,1);
 assert.deepEqual(result.slowCalls.map(c=>c.method),['drawElementsType','_uploadDataToTextureDirectly','createEffect']);
 assert.equal(Object.hasOwn(f.engine,'drawElementsType'),false,'restore prototype instead of retaining own property');
 f.sampler.setActive(true);f.begin();assert.equal(f.engine.drawElementsType,f.prototype.drawElementsType,'same active value cannot reset throttle');f.end();
 f.setTime(1100);f.begin();f.engine.drawArraysType();f.end();assert.equal(f.sampler.sample().latest.sampleId,2);assert.equal(result.groups.drawCommands.calls,1,'completed samples never mutate');
 f.sampler.setActive(false);assert.equal(f.sampler.sample().latest,null);assert.equal(f.sampler.sample().retained.sampleId,2);f.sampler.dispose();
});

test('non-configurable own methods are left intact without cancelling remaining probes',()=>{
 const f=fixture(),original=f.engine.drawElementsType;Object.defineProperty(f.engine,'drawElementsType',{value:original,writable:true,configurable:false});
 const descriptor=Object.getOwnPropertyDescriptor(f.engine,'drawElementsType');f.sampler.setActive(true);f.begin();f.engine.drawElementsType(1);f.engine.drawArraysType();f.end();
 assert.deepEqual(Object.getOwnPropertyDescriptor(f.engine,'drawElementsType'),descriptor);assert.equal(f.sampler.sample().latest.groups.drawCommands.calls,1);f.sampler.dispose();
});

test('failed render, pause, loss, replacement and disposal restore owned methods and clear stale results',()=>{
 const f=fixture(),original=f.engine.drawElementsType;f.sampler.setActive(true);f.begin();assert.throws(()=>f.engine.drawElementsType('throw'),/draw failed/);f.engine.onEndFrameObservable.notifyObservers();assert.equal(f.engine.drawElementsType,original);assert.equal(f.sampler.sample().latest,null);
 f.setTime(1100);f.begin();const retained=f.engine.drawElementsType;const external=function(...args){return Reflect.apply(retained,this,args);};f.engine.drawElementsType=external;f.sampler.setActive(false);assert.equal(f.engine.drawElementsType,external);assert.equal(f.engine.drawElementsType(9),9);
 f.engine.drawElementsType=original;f.sampler.setActive(true);f.begin();f.engine.onContextLostObservable.notifyObservers();assert.equal(f.sampler.sample().status,'context-lost');assert.equal(f.engine.drawElementsType,original);f.begin();assert.equal(f.engine.drawElementsType,original);
 f.engine.onContextRestoredObservable.notifyObservers();f.begin();f.end();f.sampler.reset();assert.equal(f.sampler.sample().latest,null);f.setTime(3000);f.begin();f.sampler.dispose();assert.equal(f.engine.drawElementsType,original);assert.equal(f.sampler.sample().status,'disabled');
});

test('real SDK scene draws and effect/texture bindings match before, during and after sampled frames',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('camera',new Vector3(0,2,-8),scene);camera.setTarget(Vector3.Zero());
 const mesh=MeshBuilder.CreateBox('box',{},scene);mesh.material=new StandardMaterial('material',scene);await prepareMapMaterials([mesh]);
 const batches=[],original=engine.drawElementsType;engine.drawElementsType=function(...args){batches.push(args);return Reflect.apply(original,this,args);};
 const baseline=engine.drawElementsType,sampler=new RenderCpuSampler(scene);const snapshots=[];
 for(const enabled of [false,true,false]){sampler.setActive(enabled);batches.length=0;engine.beginFrame();scene.render();engine.endFrame();snapshots.push({batches:structuredClone(batches),active:scene.getActiveMeshes().length});assert.equal(engine.drawElementsType,baseline);}
 assert.ok(snapshots[0].batches.length>0);assert.deepEqual(snapshots[1],snapshots[0]);assert.deepEqual(snapshots[2],snapshots[0]);assert.ok(sampler.sample().retained.groups.drawCommands.calls>0);sampler.dispose();engine.dispose();
});

test('opt-in event capture catches the first subsequent draw, coalesces requests and bounds repeated event probes',()=>{
 const f=fixture();assert.equal(f.sampler.requestCapture('enemy-defeat'),false);
 f.sampler.setActive(true);f.begin();f.end();assert.equal(f.sampler.sample().latest.reason,'periodic');
 f.setTime(100);assert.equal(f.sampler.requestCapture('enemy-defeat'),true);f.begin();f.engine.drawElementsType(1);f.end();
 assert.equal(f.sampler.sample().latest.reason,'enemy-defeat');assert.equal(f.sampler.sample().latest.sampleId,2);
 f.setTime(110);f.sampler.requestCapture('viewport-commit');f.sampler.requestCapture('texture-promote');f.begin();f.end();assert.equal(f.sampler.sample().latest.sampleId,2);
 f.setTime(349);f.begin();f.end();assert.equal(f.sampler.sample().latest.sampleId,2);
 f.setTime(350);f.begin();f.end();assert.equal(f.sampler.sample().latest.sampleId,3);assert.equal(f.sampler.sample().latest.reason,'texture-promote');
 assert.equal(f.engine.drawElementsType,f.prototype.drawElementsType);assert.equal(f.sampler.hooks.length,0);
 f.sampler.dispose();
});

test('event requests never survive pause, reset, context loss or disposal',()=>{
 const f=fixture();f.sampler.setActive(true);f.sampler.requestCapture('enemy-defeat');f.sampler.setActive(false);f.sampler.setActive(true);f.begin();f.end();assert.equal(f.sampler.sample().latest.reason,'periodic');
 f.sampler.requestCapture('viewport-commit');f.sampler.reset();f.begin();f.end();assert.equal(f.sampler.sample().latest.reason,'periodic');
 f.sampler.requestCapture('texture-promote');f.engine.onContextLostObservable.notifyObservers();assert.equal(f.sampler.requestCapture('enemy-defeat'),false);
 f.engine.onContextRestoredObservable.notifyObservers();f.begin();f.end();assert.equal(f.sampler.sample().latest.reason,'periodic');
 f.sampler.requestCapture('enemy-defeat');f.sampler.dispose();assert.equal(f.sampler.requestCapture('viewport-commit'),false);assert.equal(f.sampler.requested,null);assert.equal(f.sampler.hooks.length,0);
});

test('slow sampled renders are retained in a bounded history, separately from the latest sample',()=>{
 const f=fixture();f.sampler.setActive(true);
 for(let i=0;i<10;i++){f.setTime(i*1100);f.begin();f.setTime(i*1100+60+i);f.end();}
 let result=f.sampler.sample();assert.equal(result.slowSamples.length,8);assert.equal(result.slowSamples[0].sampleId,3);assert.equal(result.slowSamples.at(-1).sampleId,10);
 f.setTime(11000);f.begin();f.end();result=f.sampler.sample();assert.equal(result.latest.sampleId,11);assert.equal(result.slowSamples.at(-1).sampleId,10);
 f.sampler.reset();assert.equal(f.sampler.sample().slowSamples.length,0);f.sampler.dispose();
});

test('only retained slow effect calls inspect bounded define fingerprints, never shader source or fast calls',()=>{
 const f=fixture();let reads=0;const options={get defines(){reads++;return '#define UNLIT\n#define ALPHABLEND\n#define NUM_BONE_INFLUENCERS 4\n#define NUM_MORPH_INFLUENCERS 1\n'+('x'.repeat(20000))+'\n#define FOG\n';}};
 f.engine.createEffect=function(){f.setTime(0);};f.sampler.setActive(true);f.begin();f.engine.createEffect('pbr',options);f.end();assert.equal(reads,0,'fast cached effects never inspect define text');
 f.sampler.dispose();const g=fixture();g.sampler.setActive(true);g.begin();
 for(let i=0;i<20;i++)g.engine.createEffect('pbr',options);
 g.end();const calls=g.sampler.sample().latest.slowCalls;assert.equal(calls.length,8);assert.equal(reads,8,'discarded slow calls also avoid inspection');
 for(const call of calls){assert.equal(call.variant.ALPHABLEND,true);assert.equal(call.variant.UNLIT,true);assert.equal(call.variant.FOG,false,'text after limit is not inspected');assert.equal(call.variant.NUM_BONE_INFLUENCERS,4);assert.equal(call.variant.NUM_MORPH_INFLUENCERS,1);assert.ok(JSON.stringify(call).length<500);}
 g.sampler.dispose();
});
