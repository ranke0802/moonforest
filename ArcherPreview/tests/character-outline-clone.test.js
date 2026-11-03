import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,Mesh,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {attachCharacterOutlines,isRuntimeOutline} from '../src/character-outlines.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

const base=new URL('../public/assets/',import.meta.url),results=[];
const cases=[['warrior-v3','warrior'],['guardian-bear','bear'],['hooded-goblin','goblin'],['elena','elena'],['mourning-elena','elena']];
const vector=v=>[v.x,v.y,v.z];
function snapshot(mesh){
 const box=mesh.getBoundingInfo().boundingBox,sphere=mesh.getBoundingInfo().boundingSphere;
 return {matrix:[...mesh.computeWorldMatrix(true).m],pose:[...mesh.getPoseMatrix().m],
  minimum:vector(box.minimum),maximum:vector(box.maximum),minimumWorld:vector(box.minimumWorld),maximumWorld:vector(box.maximumWorld),sphereCenter:vector(sphere.centerWorld),sphereRadius:sphere.radiusWorld,
  enabled:mesh.isEnabled(),visible:mesh.isVisible,visibility:mesh.visibility,sideOrientation:mesh.sideOrientation,renderingGroupId:mesh.renderingGroupId,alphaIndex:mesh.alphaIndex,layerMask:mesh.layerMask,
  isPickable:mesh.isPickable,checkCollisions:mesh.checkCollisions,receiveShadows:mesh.receiveShadows,alwaysSelectAsActiveMesh:mesh.alwaysSelectAsActiveMesh,
  numBoneInfluencers:mesh.numBoneInfluencers,computeBonesUsingShaders:mesh.computeBonesUsingShaders,metadata:mesh.metadata,
  submeshes:mesh.subMeshes.map(s=>({range:[s.materialIndex,s.verticesStart,s.verticesCount,s.indexStart,s.indexCount],min:vector(s.getBoundingInfo().minimum),max:vector(s.getBoundingInfo().maximum)}))};
}
async function loaded(id){
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('view',new Vector3(0,1,-8),scene);
 Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
 engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{const texture=engine.createRawTexture(data,w,h,format,mips,invertY,sampling,compression,type);texture.depth=depth;texture.is2DArray=true;return texture;};
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const manifest=JSON.parse(readFileSync(new URL(id+'.json',base))),{gltf,files}=await readRuntimeGltf(new URL(manifest.model,base));
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+files.get(b.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');container.addAllToScene();
 return {engine,scene,loader,container};
}

test('actual packed character outlines match native clone bounds, rigs, pose, visibility and resource ownership',async t=>{
 for(const [id,kind]of cases){
  const f=await loaded(id);t.after(()=>{f.container.dispose();f.loader.dispose();f.scene.dispose();f.engine.dispose();});
  const sources=f.container.meshes.filter(m=>m.getTotalVertices()&&m.isVerticesDataPresent(VertexBuffer.NormalKind)&&!/outline/i.test(m.name)&&!/Lament_Mouth_Interior/.test(m.name)&&(kind!=='warrior'||['Golden_Oathblade','Bunnyguard_Shield'].includes(m.name)));
  assert.ok(sources.length,id+' real eligible source meshes');
  for(const source of sources){
   for(let i=0;i<(source.morphTargetManager?.numTargets??0);i++)source.morphTargetManager.getTarget(i).influence=(i%3)*.13;
   source.computeWorldMatrix(true);const originalSourceMatrix=[...source.getWorldMatrix().m],originalSourceBounds=snapshot(source),scene=f.scene;
   const stats={baseline:[],optimized:[]};let expected,expectMaterial,expectEffect,managerCount=scene.morphTargetManagers.length;
   for(let run=0;run<4;run++)for(const mode of run%2?['optimized','baseline']:['baseline','optimized']){
    if(mode==='baseline')source.clone=function(...args){return Mesh.prototype.clone.apply(this,args);};else delete source.clone;
    const start=performance.now(),shell=attachCharacterOutlines({meshes:[source]},kind,{skipBoneProof:true,deferCameraCulling:true})[0],elapsed=performance.now()-start;
    assert.ok(shell);assert.equal(shell.parent,source);assert.equal(shell.geometry,source.geometry);assert.equal(shell.skeleton,source.skeleton);assert.equal(shell.morphTargetManager,source.morphTargetManager);assert.equal(scene.morphTargetManagers.length,managerCount);
    assert.equal(isRuntimeOutline(shell),true);assert.equal(shell.getClassName(),'Mesh');assert.ok(shell instanceof Mesh);
    assert.equal(shell.material.isReadyForSubMesh(shell,shell.subMeshes[0]),true,'actual outline shader compiles');const effect=shell.subMeshes[0].effect;
    const shader={defines:effect.defines,attributes:effect.getAttributesNames()};
    const state=snapshot(shell),dataCount=shell._internalAbstractMeshDataInfo._positions?.length??0;
    if(mode==='baseline'){expected=state;expectMaterial=shell.material;expectEffect=shader;assert.equal(dataCount,source.getTotalVertices());}
    else{assert.deepEqual(state,expected,id+' '+source.name+' clone state');assert.deepEqual(shader,expectEffect,'shader flags and vertex streams');assert.equal(shell.material,expectMaterial);assert.equal(dataCount,0,'no unused CPU point array');}
    stats[mode].push(elapsed);shell.dispose(false,false);assert.equal(scene.morphTargetManagers.length,managerCount);assert.equal(source.isDisposed(),false);assert.equal(source.geometry.isDisposed(),false);
    assert.deepEqual([...source.getWorldMatrix().m],originalSourceMatrix);assert.deepEqual(snapshot(source),originalSourceBounds);
   }
   delete source.clone;const median=a=>[...a.slice(1)].sort((a,b)=>a-b)[1];
   results.push({id,name:source.name,vertices:source.getTotalVertices(),morphTargets:source.morphTargetManager?.numTargets??0,boundsAndPropertiesEqual:true,sharedGeometry:true,sharedSkeleton:true,sharedMorphManager:true,independentShellDisposed:true,warmMedianMs:{native:median(stats.baseline),optimized:median(stats.optimized)}});
  }
 }
 if(process.env.OUTLINE_CLONE_AUDIT){mkdirSync(process.env.OUTLINE_CLONE_AUDIT,{recursive:true});writeFileSync(process.env.OUTLINE_CLONE_AUDIT+'/clone-comparison.json',JSON.stringify({scope:'Babylon 9.31 NullEngine actual five packed models; source images skipped, no GPU/device FPS measurement. Skip bone-proof and camera-culling stages to isolate shell construction; separate tests exercise them.',results},null,2));}
});

test('custom mesh clone behavior keeps the original fallback and later SDK bounding refresh semantics',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>{scene.dispose();engine.dispose();});
 const source=Mesh.CreateBox('bear',2,scene);let calls=0;source.clone=function(...args){calls++;return Mesh.prototype.clone.apply(this,args);};
 const shell=attachCharacterOutlines({meshes:[source]},'bear',{skipBoneProof:true})[0];assert.equal(calls,1);assert.equal(shell.constructor,Mesh);
 shell.dispose();delete source.clone;const fast=attachCharacterOutlines({meshes:[source]},'bear',{skipBoneProof:true})[0];assert.equal(fast._internalAbstractMeshDataInfo._positions,null);
 fast.refreshBoundingInfo(true,true);assert.equal(fast._internalAbstractMeshDataInfo._positions.length,source.getTotalVertices());
 fast.dispose();let observed=0;source.onClonedObservable.add(clone=>{observed++;assert.equal(clone._internalAbstractMeshDataInfo._positions.length,source.getTotalVertices());});
 const observedShell=attachCharacterOutlines({meshes:[source]},'bear',{skipBoneProof:true})[0];assert.equal(observed,1);assert.equal(observedShell.constructor,Mesh);
});
