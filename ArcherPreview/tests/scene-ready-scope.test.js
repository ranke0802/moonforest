import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,ThinEngine,Scene,MeshBuilder,StandardMaterial,ShaderMaterial,TransformNode,FreeCamera,ArcRotateCamera,Vector3,Vector2,DirectionalLight,ShadowGenerator} from '@babylonjs/core';
import {currentFrameReadiness,waitForSceneReady} from '../src/scene-ready.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

async function fixture(t,{arc=false}={}){
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;engine.getCaps().instancedArrays=true;
 const camera=arc?new ArcRotateCamera('current-camera',Math.PI/2,1.1,8,Vector3.Zero(),scene):new FreeCamera('current-camera',new Vector3(0,2,8),scene);if(!arc)camera.setTarget(Vector3.Zero());
 const box=MeshBuilder.CreateBox('visible-player',{},scene),material=new StandardMaterial('visible-paint',scene);material.disableLighting=true;box.material=material;scene.setTransformMatrix(camera.getViewMatrix(true),camera.getProjectionMatrix(true));
 t.after(()=>{scene.dispose();engine.dispose();});await waitForSceneReady(scene,{timeoutMs:2000,wait:()=>new Promise(r=>setTimeout(r,1))});return {engine,scene,camera,box,material};
}
const fault=()=>({isReady:()=>false,getCompilationError:()=> 'controlled required shader error',allFallbacksProcessed:()=>true});

test('actual SDK global readiness checks a disabled boss, while scoped readiness ignores its unsubmitted material and unrelated pending token',async t=>{
 const f=await fixture(t),boss=MeshBuilder.CreateBox('retained-hidden-boss',{},f.scene),root=new TransformNode('retained-disabled-parent',f.scene);boss.parent=root;root.setEnabled(false);boss.material=new StandardMaterial('hidden-unready',f.scene);let calls=0;boss.material.isReadyForSubMesh=()=>{calls++;return false;};
 assert.equal(f.scene.isReady(),false);const count=calls,token={owner:'optional-background'};f.scene.addPendingData(token);await waitForSceneReady(f.scene);assert.equal(calls,count);assert.equal(f.scene._pendingData.includes(token),true);assert.equal(currentFrameReadiness(f.scene).meshes.includes(boss.name),false);f.scene.removePendingData(token);
});

test('an unused failed/pending engine program cannot fail a ready camera frame, but a required visible failure names its mesh/material',async t=>{
 const f=await fixture(t);f.engine._compiledEffects.unused=fault();const original=f.engine.areAllEffectsReady;f.engine.areAllEffectsReady=ThinEngine.prototype.areAllEffectsReady;assert.equal(f.scene.isReady(),false);await waitForSceneReady(f.scene);delete f.engine._compiledEffects.unused;f.engine.areAllEffectsReady=original;
 const material=new ShaderMaterial('required-visible-material',f.scene,{vertexSource:'',fragmentSource:''},{attributes:['position'],uniforms:[]},false);f.box.material=material;material.isReady=()=>false;material.getEffect=fault;
 await assert.rejects(waitForSceneReady(f.scene),error=>error.message.includes('셰이더')&&error.message.includes('visible-player/required-visible-material')&&error.blocker.kind==='view');
});

test('visible geometry/material wait is finite, retains exact hot-swapping state and reports current blocker on timeout',async t=>{
 const f=await fixture(t),ready=f.material.isReadyForSubMesh.bind(f.material);let time=0,queries=0;f.material.isReadyForSubMesh=()=>{queries++;return false;};const swapping=f.material.allowShaderHotSwapping;
 await assert.rejects(waitForSceneReady(f.scene,{now:()=>time,wait:async()=>{time+=15000;}}),error=>error.name==='TimeoutError'&&error.timeoutMs===45000&&error.blocker.mesh===f.box.name&&error.blocker.material===f.material.name);assert.equal(time,45000);assert.equal(f.material.allowShaderHotSwapping,swapping);assert.ok(queries>=3);f.material.isReadyForSubMesh=ready;
});

test('only selected LOD is checked and an intentional null LOD remains unsubmitted',async t=>{
 const f=await fixture(t),far=MeshBuilder.CreateBox('far-LOD',{},f.scene),m=new StandardMaterial('far-pending',f.scene);far.material=m;let calls=0;m.isReadyForSubMesh=()=>{calls++;return false;};f.box.addLODLevel(12,far);
 await waitForSceneReady(f.scene);assert.equal(calls,0);f.camera.position.z=25;f.camera.setTarget(Vector3.Zero());const state=currentFrameReadiness(f.scene);assert.equal(state.ready,false);assert.ok(state.blockers.some(b=>b.mesh==='far-LOD'));f.box.removeLODLevel(far);far.dispose();f.box.addLODLevel(1,null);assert.equal(currentFrameReadiness(f.scene).meshes.includes(f.box.name),false);
});

test('enabled instances still check their rendering source while a disabled source or unrelated parent stays unsubmitted',async t=>{
 const f=await fixture(t),instance=f.box.createInstance('visible-instance');f.box.setEnabled(false);let actualFlag;const ready=f.material.isReadyForSubMesh.bind(f.material);f.material.isReadyForSubMesh=(mesh,sub,use)=>{actualFlag=use;return ready(mesh,sub,use);};
 await waitForSceneReady(f.scene,{wait:()=>new Promise(r=>setTimeout(r,1))});const state=currentFrameReadiness(f.scene);assert.ok(state.meshes.includes(instance.name));assert.ok(!state.meshes.includes(f.box.name));assert.equal(actualFlag,true);f.scene.render();assert.ok(f.scene.getActiveMeshes().data.slice(0,f.scene.getActiveMeshes().length).includes(instance));
});

test('FoW-hidden and off-camera objects are omitted while active shadow casters remain required, with render-pass state restored',async t=>{
 const f=await fixture(t),wall=MeshBuilder.CreateBox('fog-hidden',{},f.scene);wall.material=new StandardMaterial('fog-pending',f.scene);wall.material.isReadyForSubMesh=()=>false;wall.metadata={caveFogVisible:false};f.scene.metadata.caveFogRuntime={disposed:false};
 const caster=MeshBuilder.CreateBox('off-camera-caster',{},f.scene);caster.position.x=1000;caster.computeWorldMatrix(true);caster.material=f.material;const light=new DirectionalLight('current-sun',new Vector3(-1,-2,-1),f.scene),shadow=new ShadowGenerator(512,light);shadow.addShadowCaster(caster,false);let ready=false,checks=0;shadow.isReady=()=>{checks++;return ready;};
 const pass=f.engine.currentRenderPassId,state=currentFrameReadiness(f.scene);assert.ok(!state.meshes.includes(wall.name));assert.ok(!state.meshes.includes(caster.name));assert.ok(state.shadows.includes(caster.name));assert.ok(state.blockers.some(b=>b.kind==='shadow'));assert.equal(f.engine.currentRenderPassId,pass);assert.ok(checks>0);ready=true;await waitForSceneReady(f.scene);assert.equal(f.engine.currentRenderPassId,pass);
 f.scene.metadata.caveFogRuntime=null;assert.ok(currentFrameReadiness(f.scene).blockers.some(b=>b.mesh===wall.name),'old cave visibility metadata cannot hide a newly visible object after leaving cave');
});

test('current custom instanced outline is checked and matches a selected base draw without enabling hidden sources',async t=>{
 const f=await fixture(t,{arc:true}),instance=f.box.createInstance('ink-instance'),root=new TransformNode('plot',f.scene);instance.parent=root;const world={scene:f.scene,camera:f.camera,cave:false,touchDevice:false},stats={},record={root,meshes:[instance],placement:{kind:'building'},fogVisible:true};
 const ink=new VillageOutlines(world,[record],stats);t.after(()=>ink.dispose());f.box.setEnabled(false);instance.instancedBuffers.villageInk=new Vector2(1,.5);const original=ink.material.isReady;let queries=0;ink.material.isReady=(mesh,use)=>{assert.equal(use,true);assert.equal(mesh,f.box);queries++;return false;};
 const state=currentFrameReadiness(f.scene);assert.ok(state.outlines.includes(instance.name));assert.ok(state.blockers.some(b=>b.kind==='outline'&&b.material==='village-ink'));assert.equal(f.box.isEnabled(),false);assert.equal(queries,1);ink.material.isReady=original;
 caveFogFallback(f.scene).getInternalTexture().isReady=true;await ink.prepare();await waitForSceneReady(f.scene);f.scene.render();
 assert.ok(stats.outlineDraws>0,'the actual after-base instanced ink stage draws the selected source');assert.ok(currentFrameReadiness(f.scene).outlines.includes(instance.name));
});

test('camera postprocess readiness stays required and names the camera',async t=>{
 const f=await fixture(t);f.camera.isReady=()=>false;let time=0;
 await assert.rejects(waitForSceneReady(f.scene,{now:()=>time,wait:async()=>{time+=45000;}}),error=>error.blocker.kind==='camera'&&error.blocker.mesh===f.camera.name);
});

test('outline readiness uses only the matching source and selected LOD variant',async t=>{
 const f=await fixture(t,{arc:true}),root=new TransformNode('roots',f.scene),plain=f.box.createInstance('plain');plain.parent=root;
 const chest=MeshBuilder.CreateBox('chest-source',{},f.scene),far=MeshBuilder.CreateBox('chest-far',{},f.scene);chest.material=far.material=f.material;chest.addLODLevel(1,far);
 const graded=chest.createInstance('graded');graded.parent=root;graded.position.x=1;graded.computeWorldMatrix(true);
 const ink=new VillageOutlines({scene:f.scene,camera:f.camera,cave:false,touchDevice:false},[
  {root,meshes:[plain],placement:{kind:'tree'}},
  {root,meshes:[graded],placement:{kind:'ground-detail',tier:5}},
 ],{});t.after(()=>ink.dispose());f.box.setEnabled(false);chest.setEnabled(false);far.setEnabled(false);
 plain.instancedBuffers.villageInk=new Vector2(1,.004);graded.instancedBuffers.villageInk=new Vector2(1,.028);
 const mono=[],tinted=[];ink.material.isReady=(mesh)=>{mono.push(mesh.name);return true;};ink.tintedMaterial.isReady=(mesh)=>{tinted.push(mesh.name);return true;};
 const state=currentFrameReadiness(f.scene);
 assert.ok(state.outlines.includes(plain.name));assert.ok(state.outlines.includes(graded.name));
 assert.deepEqual(mono,['visible-player']);assert.deepEqual(tinted,['chest-far']);
});
