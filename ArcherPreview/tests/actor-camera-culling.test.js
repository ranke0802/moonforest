import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,VertexBuffer,Skeleton,Bone,Matrix,Space,MorphTargetManager,MorphTarget,DirectionalLight,ShadowGenerator,PBRMaterial} from '@babylonjs/core';
import {prepareActorCameraCulling,prepareActorCameraCullingAsync,actorIntersectsCamera} from '../src/mourning-camera-culling.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {GoblinEncounter} from '../src/goblin-encounter.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

function fixture(t){
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine),camera=new FreeCamera('main',new Vector3(0,0,-10),scene);camera.setTarget(Vector3.Zero());
 const mesh=MeshBuilder.CreateBox('ordinary-goblin-body',{},scene);mesh.alwaysSelectAsActiveMesh=true;
 const asset={meshes:[mesh]};
 const frame=()=>{scene.incrementRenderId();scene.setTransformMatrix(camera.getViewMatrix(true),camera.getProjectionMatrix(true));};
 t.after(()=>{scene.dispose();engine.dispose();});return {engine,scene,camera,mesh,asset,frame};
}

test('ordinary actor and its shell share one decision without changing visibility; alternate shadow planes use the original method',t=>{
 const f=fixture(t),{mesh,asset,scene,engine,frame}=f,shell=mesh.clone('ordinary-body / silhouette');shell.metadata={moonforestOutline:true,outlineWidth:.006,characterStyleGroup:'boss'};asset.meshes.push(shell);
 let shadowCalls=0;mesh.isInFrustum=function(planes){shadowCalls++;return planes[0].d===73;};const original=mesh.isInFrustum;
 const group=prepareActorCameraCulling(asset);assert.ok(group);assert.strictEqual(prepareActorCameraCulling(asset),group);
 frame();assert.equal(actorIntersectsCamera(mesh),true);assert.equal(mesh.alwaysSelectAsActiveMesh,false);
 mesh.position.x=100;shell.position.x=100;frame();assert.equal(actorIntersectsCamera(mesh),false);assert.equal(actorIntersectsCamera(shell),false);assert.equal(mesh.isInFrustum(scene._frustumPlanes),false);
 const updates=group.updates,query=group.query,queries=group.queries;assert.equal(actorIntersectsCamera(mesh),false);assert.equal(group.updates,updates);assert.strictEqual(group.query,query);assert.equal(group.queries,queries,'same camera/pose/pass reuses its decision');
 const alternate=[{d:73}];assert.equal(mesh.isInFrustum(alternate),true);assert.equal(shadowCalls,1);
 assert.equal(mesh.isVisible,true);assert.equal(mesh.isEnabled(),true);engine.currentRenderPassId++;assert.equal(actorIntersectsCamera(mesh),false);assert.equal(group.queries,queries+1,'a different render pass cannot reuse a camera query');
 group.dispose();assert.strictEqual(mesh.isInFrustum,original);assert.equal(mesh.alwaysSelectAsActiveMesh,true);assert.equal(actorIntersectsCamera(mesh),true);assert.equal(actorIntersectsCamera(shell),true);
});

test('generic bounds include simultaneous morphs and current bone transforms, including changes within one render ID',t=>{
 const {scene,mesh,asset,frame}=fixture(t),n=mesh.getTotalVertices(),skeleton=new Skeleton('normal-rig','normal-rig',scene),bone=new Bone('normal-bone',skeleton,null,Matrix.Identity());mesh.skeleton=skeleton;
 mesh.setVerticesData(VertexBuffer.MatricesIndicesKind,new Float32Array(n*4));mesh.setVerticesData(VertexBuffer.MatricesWeightsKind,Float32Array.from({length:n*4},(_,i)=>i%4===0?1:0));
 const manager=new MorphTargetManager(scene),positions=mesh.getVerticesData(VertexBuffer.PositionKind);
 for(const dx of [-6,-4]){const target=new MorphTarget('reach-'+dx,1,scene);target.setPositions(Float32Array.from(positions,(value,i)=>value+(i%3===0?dx:0)));manager.addTarget(target);}mesh.morphTargetManager=manager;
 const group=prepareActorCameraCulling(asset);assert.ok(group);mesh.position.x=10;frame();assert.equal(actorIntersectsCamera(mesh),true,'combined morph reach enters the camera');
 mesh.position.x=100;assert.equal(actorIntersectsCamera(mesh),false,'world transform invalidates the same-frame bound');
 bone.setPosition(new Vector3(-100,0,0),Space.LOCAL);assert.equal(actorIntersectsCamera(mesh),true,'same-frame dirty bone transform invalidates the bound');
 bone.setPosition(new Vector3(0,0,0),Space.LOCAL);skeleton.prepare(true);assert.equal(actorIntersectsCamera(mesh),false,'an external same-frame skin refresh cannot leave a stale camera bound');
 manager.getTarget(0).influence=-.1;assert.equal(actorIntersectsCamera(mesh),true,'unsupported morph range fails open');assert.equal(group.valid,false);
});

test('world-space hull displacement retains a body just beyond the camera edge',t=>{
 const {scene,camera,mesh,asset,frame}=fixture(t);camera.mode=1;camera.orthoLeft=-5;camera.orthoRight=5;camera.orthoTop=3;camera.orthoBottom=-3;
 const shell=mesh.clone('world-hull');shell.metadata={moonforestOutline:true,outlineWidth:.2,characterStyleGroup:'boss'};asset.meshes.push(shell);scene.metadata={characterStyleSettings:{boss:{outlineWidth:.5}}};
 const group=prepareActorCameraCulling(asset);mesh.position.x=shell.position.x=5.6;frame();assert.equal(actorIntersectsCamera(mesh),true,'0.2m hull can reach inside');
 mesh.position.x=shell.position.x=5.8;frame();assert.equal(actorIntersectsCamera(mesh),false);assert.ok(group);
});

test('unsupported sources fail open atomically, async preparation installs ordinary actors and disposal unregisters the group',async t=>{
 const {scene,mesh,asset,frame}=fixture(t),other=MeshBuilder.CreateBox('mutable-body',{updatable:true},scene);other.alwaysSelectAsActiveMesh=true;asset.meshes.push(other);
 assert.equal(prepareActorCameraCulling(asset),null);assert.equal(mesh.alwaysSelectAsActiveMesh,true);assert.equal(actorIntersectsCamera(mesh),true);
 asset.meshes.pop();const group=await prepareActorCameraCullingAsync(asset,createBossPreparation({incremental:false}));assert.ok(group);mesh.position.x=100;frame();assert.equal(actorIntersectsCamera(mesh),false);
 mesh.dispose();assert.equal(group.disposed,true);assert.equal(actorIntersectsCamera(mesh),true);
});

test('normal GoblinEncounter preparation installs camera culling through the common actor preparation path',async t=>{
 const {scene,mesh,asset,frame}=fixture(t),light=new DirectionalLight('sun',new Vector3(0,-1,1),scene),shadows=new ShadowGenerator(64,light);caveFogFallback(scene).getInternalTexture().isReady=true;
 mesh.material=new PBRMaterial('ordinary-paint',scene);mesh.material.unlit=true;Object.assign(asset,{animationGroups:[],transformNodes:[]});
 const encounter=new GoblinEncounter({scene,terrain:{heightAt:()=>0},shadows},()=>{},()=>{},()=>{},{loadAsset:async()=>({asset,config:{scale:1,catalog:[],animations:{}}})});
 encounter.preparePaint=()=>{};encounter.prepareAnimator=()=>({dispose(){}});
 await encounter.prepareHidden({preparation:createBossPreparation({incremental:false})});assert.equal(encounter.assetPrepared,true);assert.equal(mesh.alwaysSelectAsActiveMesh,false);
 encounter.actor.setEnabled(true);encounter.actor.position.x=100;frame();assert.equal(actorIntersectsCamera(mesh),false);assert.equal(mesh.isVisible,true);assert.equal(encounter.actor.isEnabled(),true);
 assert.ok(prepareActorCameraCulling(asset));shadows.dispose();
});

test('distance-rejected actors leave shadow membership and return without reviving fading or finished corpses',t=>{
 const {scene,camera,mesh,asset,frame}=fixture(t),light=new DirectionalLight('sun',new Vector3(0,-1,1),scene),shadows=new ShadowGenerator(64,light);
 const encounter=new BossEncounter({scene,shadows},()=>{});Object.assign(encounter,{asset,actor:mesh,active:true});const list=()=>shadows.getShadowMap().renderList;
 encounter.setShadowCasting(true);encounter.updateRenderRange(camera.globalPosition);assert.ok(list().includes(mesh));
 mesh.position.x=1000;encounter.updateRenderRange(camera.globalPosition);assert.equal(mesh.isVisible,false);assert.equal(list().includes(mesh),false);
 encounter.setShadowCasting(true);assert.equal(list().includes(mesh),false,'pooled reactivation cannot readd a caster while its cached global range gate is closed');
 mesh.position.x=0;encounter.updateRenderRange(camera.globalPosition);assert.equal(mesh.isVisible,true);assert.equal(list().includes(mesh),true);
 prepareActorCameraCulling(asset);camera.setTarget(new Vector3(0,0,-100));frame();assert.equal(actorIntersectsCamera(mesh),false);encounter.updateRenderRange(camera.globalPosition);assert.equal(list().includes(mesh),true,'camera-frustum exclusion keeps the original offscreen shadow caster');
 encounter.death.advance(.1);encounter.setShadowCasting(false);mesh.position.x=1000;encounter.updateRenderRange(camera.globalPosition);mesh.position.x=0;encounter.updateRenderRange(camera.globalPosition);assert.equal(list().includes(mesh),false,'near return during the existing death fade cannot revive its shadow');
 encounter.death.advance(20);mesh.position.x=1000;encounter.updateRenderRange(camera.globalPosition);assert.equal(list().includes(mesh),false);shadows.dispose();
});
