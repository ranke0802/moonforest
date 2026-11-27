import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapMaterialPreparation,prepareMapMaterials} from '../src/map-shader-cache.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {prepareModelShaders} from '../src/boss-shader-warmup.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {setFrameWorkContext,frameWorkSnapshot} from '../src/frame-work-coordinator.js';

function fixture(read=()=>true){
 const engine={currentRenderPassId:1,getCaps:()=>({instancedArrays:false})},scene={getEngine:()=>engine};
 const material={allowShaderHotSwapping:true,checkReadyOnEveryCall:false,isReady:read};
 const mesh={material,getScene:()=>scene,getTotalVertices:()=>3};return {engine,scene,material,mesh};
}
test('ready map submeshes cannot all bypass the actor shared preparation budget',async()=>{
 let clock=0,frame=0,start=0,checks=0;const slices=[],f=fixture(()=>{checks++;clock+=.6;return true;});
 const coordinator=setFrameWorkContext(f.scene,{active:true,frameId:frame,budgetMs:2});
 const meshes=Array.from({length:24},()=>({...f.mesh}));
 await prepareMapMaterials(meshes,{now:()=>clock,wait:async()=>{slices.push(clock-start);start=clock;coordinator.begin({active:true,frameId:++frame});}});
 slices.push(clock-start);assert.equal(checks,24);assert.ok(slices.every(ms=>ms<=2.401),JSON.stringify(slices));
 assert.ok(frame>=6);assert.equal(f.material.checkReadyOnEveryCall,false);assert.equal(f.material.allowShaderHotSwapping,true);
 assert.ok(Math.abs(frameWorkSnapshot(f.scene).totalPreparationMs-14.4)<1e-9);
});
test('repeated identical map mesh/submesh inputs are prepared once, distinct submeshes remain separate',async()=>{
 const calls=[],f=fixture();f.material._storeEffectOnSubMeshes=true;
 f.material.isReadyForSubMesh=(mesh,sub,instances)=>{calls.push([mesh,sub,instances]);return true;};
 f.mesh.subMeshes=[{getMaterial:()=>f.material},{getMaterial:()=>f.material}];
 await prepareMapMaterials([f.mesh,f.mesh,f.mesh],{instances:true,wait:async()=>{}});
 assert.equal(calls.length,2);assert.deepEqual(calls.map(row=>row[1]),[f.mesh.subMeshes[1],f.mesh.subMeshes[0]]);
 assert.ok(calls.every(row=>row[0]===f.mesh&&row[2]===true));
});
test('one thousand cached readiness checks coalesce rather than waiting four checks per frame',async()=>{
 let frames=0,checks=0;const f=fixture(()=>{checks++;return true;});
 await prepareMapMaterials(Array.from({length:1000},()=>({...f.mesh})),{now:()=>0,wait:async()=>{frames++;}});
 assert.equal(checks,1000);assert.equal(frames,4,'a CPU-cheap cached batch must not be delayed for 250 scheduling frames');
});
test('one cave LOD gives the UI its first frame, then warms surface and ink in order within the remaining slice',async()=>{
 for(const {installMs,cold,expected} of [
  {installMs:.25,cold:false,expected:['frame','surface','install','ink']},
  {installMs:1.5,cold:false,expected:['frame','surface','install','frame','ink']},
  {installMs:.25,cold:true,expected:['frame','surface','install','ink','frame','ink']},
 ]){
  let clock=0,checks=0;const events=[];
  const f=fixture(()=>{events.push('surface');return true;});
  const ink={isReady:()=>{events.push('ink');return ++checks>1||!cold;}};
  const outlines={world:{scene:f.scene},tintedSources:new Set(),materialFor:()=>ink};
  const preparation=createMapMaterialPreparation(f.scene,{now:()=>clock,wait:async()=>{events.push('frame');clock+=16;}});
  await prepareMapMaterials([f.mesh],{preparation});
  events.push('install');clock+=installMs;
  await VillageOutlines.prototype.prepare.call(outlines,[f.mesh],{preparation});
  assert.deepEqual(events,expected);
 }
});
test('final model readiness work is charged before returning to a different owner',async()=>{
 let clock=0;const f=fixture(()=>{clock+=1.1;return true;});setFrameWorkContext(f.scene,{active:true,frameId:1});
 const job=createBossPreparation({scene:f.scene,now:()=>clock,frame:async()=>{}});
 await prepareModelShaders({meshes:[f.mesh]},{preparation:job,includeInstanceVariants:false});
 assert.ok(Math.abs(frameWorkSnapshot(f.scene).usedMs-1.1)<1e-9,'the last SDK check must not disappear when no next pause follows');
});
test('map cancellation preserves the previous silent cancellation contract and stops all pending work',async()=>{
 let cancelled=false,checks=0;const f=fixture(()=>{checks++;return false;}),job=createBossPreparation({frame:async()=>{cancelled=true;},isCurrent:()=>!cancelled});
 await prepareMapMaterials([f.mesh],{cancelled:()=>cancelled,preparation:job});
 assert.equal(checks,0);assert.equal(job.pendingWaits,0);assert.equal(job.signal.aborted,true);
});
test('map shader timeout and compiler errors restore borrowed state and release waits',async()=>{
 for(const kind of ['timeout','compiler']){
  let clock=0;const f=fixture(()=>false),job=createBossPreparation({now:()=>clock,frame:async()=>{clock+=30000;}});
  if(kind==='compiler')f.material.getEffect=()=>({getCompilationError:()=> 'broken shader',allFallbacksProcessed:()=>true});
  await assert.rejects(prepareMapMaterials([f.mesh],{preparation:job}),kind==='timeout'?{name:'TimeoutError'}:/셰이더/);
  assert.equal(f.material.checkReadyOnEveryCall,false);assert.equal(f.material.allowShaderHotSwapping,true);assert.equal(job.pendingWaits,0);
 }
});
