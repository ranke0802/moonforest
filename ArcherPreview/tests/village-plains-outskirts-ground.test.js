import test from 'node:test';
import assert from 'node:assert/strict';
import {AssetContainer,MeshBuilder,NullEngine,PBRMaterial,RawTexture,Scene,StandardMaterial,Vector3} from '@babylonjs/core';
import {VillageGroundDetail} from '../src/village-ground.js';
import {VillageGroundShade} from '../src/village-toon.js';
import {applyVillagePlainsOutskirtsGround} from '../src/village-plains-outskirts-ground.js';

const config={surfaceStyle:'outskirts-ground'},rgba=new Uint8Array([96,144,80,128]);
function fixture(){
 const engine=new NullEngine(),scene=new Scene(engine),floorMaterial=new StandardMaterial('floor',scene),lighting={direction:new Vector3(.4,1,.6),shadowsActive:true},detail=RawTexture.CreateRGBATexture(rgba,1,1,scene,false);
 new VillageGroundDetail(floorMaterial,detail);new VillageGroundShade(floorMaterial,lighting);
 return {engine,scene,floorMaterial,lighting,detail};
}
function containerFor(world){
 const container=new AssetContainer(world.scene),original=new PBRMaterial('shipped-ground-material',world.scene),color=RawTexture.CreateRGBATexture(rgba,1,1,world.scene,false);original.albedoTexture=color;container.materials.push(original);container.textures.push(color);
 for(let i=0;i<2;i++){const mesh=MeshBuilder.CreateGround('patch-'+i,{width:2,height:2},world.scene);mesh.material=original;container.meshes.push(mesh);}
 return {container,original,color};
}
test('reciprocal ground borrows floor detail, preserves owned albedo/soil alpha and uses floor material plugins',()=>{
 const world=fixture(),{container,original,color}=containerFor(world),beforeObservers=world.scene.onBeforeRenderObservable.observers.length,beforeTextures=[...world.scene.textures];
 try{
  assert.equal(applyVillagePlainsOutskirtsGround(world,container,{config:{category:'rock'}}),false);assert.equal(container.meshes[0].material,original);
  assert.equal(applyVillagePlainsOutskirtsGround(world,container,{config}),true);const material=container.meshes[0].material;
  assert.equal(material.getClassName(),'StandardMaterial');assert.equal(container.meshes[1].material,material);assert.equal(material.diffuseTexture,color);assert.equal(material.useAlphaFromDiffuseTexture,false);assert.equal(material.alpha,1);
  assert.equal(material.pluginManager.getPlugin('MoonforestGroundDetail').texture,world.detail);assert.equal(material.pluginManager.getPlugin('MoonforestVillageToon').lighting,world.lighting);
  assert.ok(container.materials.includes(material));assert.deepEqual(container.textures,[color]);assert.deepEqual(world.scene.textures,beforeTextures,'no new texture/decode');
  assert.ok(container.meshes.every(m=>m.metadata.villageNoOutline&&m.metadata.villageNoShadowCaster));
  const count=container.materials.length;applyVillagePlainsOutskirtsGround(world,container,{config});assert.equal(container.materials.length,count,'idempotent per container');assert.equal(world.scene.onBeforeRenderObservable.observers.length,beforeObservers,'no frame observer');
 }finally{container.dispose();world.scene.dispose();world.engine.dispose();}
});
test('ground readiness fails before mutation when the original floor has not supplied detail',()=>{
 const world=fixture(),{container,original}=containerFor(world),floor=world.floorMaterial;world.floorMaterial=null;
 try{assert.throws(()=>applyVillagePlainsOutskirtsGround(world,container,{config}),/바닥 재질/);assert.equal(container.materials.length,1);assert.equal(container.meshes[0].material,original);}finally{world.floorMaterial=floor;container.dispose();world.scene.dispose();world.engine.dispose();}
});
test('hardware sRGB input conversion follows the actual owned InternalTexture flag and preserves alpha',()=>{
 const world=fixture(),{container,color}=containerFor(world);
 try{
  applyVillagePlainsOutskirtsGround(world,container,{config});const plugin=container.meshes[0].material.pluginManager.getPlugin('MoonforestOutskirtsGroundInput'),internal=color.getInternalTexture(),original=internal._useSRGBBuffer,values=[];
  try{for(const flag of[false,true,false]){internal._useSRGBBuffer=flag;plugin.bindForSubMesh({updateFloat:(name,value)=>values.push([name,value])});}}finally{internal._useSRGBBuffer=original;}
  assert.deepEqual(values,[['outskirtsHardwareSrgb',0],['outskirtsHardwareSrgb',1],['outskirtsHardwareSrgb',0]]);
  const code=plugin.getCustomCode('fragment').CUSTOM_FRAGMENT_UPDATE_ALPHA;assert.match(code,/if\(outskirtsHardwareSrgb>0\.5\)/);assert.match(code,/baseColor\.rgb=/);assert.doesNotMatch(code,/baseColor\.a\s*=/);
 }finally{container.dispose();world.scene.dispose();world.engine.dispose();}
});
test('twenty container round trips release each owned color once and leave the shared floor texture alive',()=>{
 const world=fixture();
 // PBR glTF loading itself creates the scene's shared BRDF lookup. Account for
 // that preexisting scene texture before measuring this conversion's lifetime.
 const warm=new PBRMaterial('native-loader-brdf-warmup',world.scene);warm.dispose();
 const baselineMaterials=world.scene.materials.length,baselineTextures=world.scene.textures.length;let detailDisposed=0,colorsDisposed=0;world.detail.onDisposeObservable.add(()=>detailDisposed++);
 try{
  for(let i=0;i<20;i++){
   const {container,color}=containerFor(world);color.onDisposeObservable.add(()=>colorsDisposed++);applyVillagePlainsOutskirtsGround(world,container,{config});container.dispose();
   assert.equal(detailDisposed,0);assert.equal(world.scene.textures.length,baselineTextures);assert.equal(world.scene.materials.length,baselineMaterials);assert.equal(world.scene.meshes.length,0);
  }
  assert.equal(colorsDisposed,20);
 }finally{world.detail.dispose();world.scene.dispose();world.engine.dispose();}
 assert.equal(detailDisposed,1);
});
