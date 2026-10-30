import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,MeshBuilder,FreeCamera,Vector3,PBRMaterial,VertexBuffer,Skeleton,Bone,Matrix,RenderingGroup,TransformNode,DirectionalLight,ShadowGenerator} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {trimEmptyBoneSlots,opaqueSurfaceBeforeInk,orderCharacterInkAfterSurfaces} from '../src/character-render-cost.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

function fixture(t){
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const camera=new FreeCamera('render-cost',new Vector3(0,1,8),scene);camera.setTarget(Vector3.Zero());
  caveFogFallback(scene).getInternalTexture().isReady=true;
  t.after(()=>{scene.dispose();engine.dispose();});return {engine,scene};
}
function rigged(t,slots=8){
  const {scene}=fixture(t),mesh=MeshBuilder.CreateBox('skin',{},scene),n=mesh.getTotalVertices();
  mesh.skeleton=new Skeleton('rig','rig',scene);new Bone('root',mesh.skeleton,null,Matrix.Identity());
  mesh.setVerticesData(VertexBuffer.MatricesIndicesKind,new Float32Array(n*4));mesh.setVerticesData(VertexBuffer.MatricesWeightsKind,Float32Array.from({length:n*4},(_,i)=>i%4===0?1:0));
  if(slots>4){mesh.setVerticesData(VertexBuffer.MatricesIndicesExtraKind,new Float32Array(n*4));mesh.setVerticesData(VertexBuffer.MatricesWeightsExtraKind,new Float32Array(n*4));}
  mesh.numBoneInfluencers=slots;return mesh;
}
const checksum=data=>createHash('sha256').update(Buffer.from(Float32Array.from(data).buffer)).digest('hex');
const streams=mesh=>Object.fromEntries(mesh.getVerticesDataKinds().map(kind=>[kind,checksum(mesh.getVerticesData(kind))]));

test('bone-slot trimming removes only all-vertex exact-zero trailing slots without rewriting any stream',t=>{
  const mesh=rigged(t),extra=mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind);extra[(mesh.getTotalVertices()-1)*4]=.125;
  const before=streams(mesh),indices=Array.from(mesh.getIndices());
  assert.equal(trimEmptyBoneSlots(mesh),5);assert.equal(mesh.numBoneInfluencers,5);
  assert.deepEqual(streams(mesh),before);assert.deepEqual(Array.from(mesh.getIndices()),indices);
  assert.equal(trimEmptyBoneSlots(mesh),5,'repeat preparation is stable');
});

test('tiny nonzero, invalid, missing and CPU-skin weight data retain their original shader contract',t=>{
  const mesh=rigged(t,4),weights=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
  weights[3]=1e-30;assert.equal(trimEmptyBoneSlots(mesh),4,'no visual-error threshold or quantization');
  weights[3]=NaN;assert.equal(trimEmptyBoneSlots(mesh),4);weights[3]=0;
  mesh.computeBonesUsingShaders=false;assert.equal(trimEmptyBoneSlots(mesh),4);mesh.computeBonesUsingShaders=true;
  mesh.removeVerticesData(VertexBuffer.MatricesWeightsKind);assert.equal(trimEmptyBoneSlots(mesh),4);
});

test('opaque ink ordering preserves surface/material batching and existing alpha/transparent comparators',t=>{
  const {scene}=fixture(t),alpha=()=>17,transparent=()=>23,previous=(a,b)=>a.order-b.order;
  scene.setRenderingOrder(0,previous,alpha,transparent);
  orderCharacterInkAfterSurfaces(scene);const sort=scene._renderingManager._customOpaqueSortCompareFn[0];
  const entry=(name,ink,order)=>({name,order,getMesh:()=>({metadata:{moonforestOutline:ink}})});
  const entries=[entry('ink2',true,2),entry('surface3',false,3),entry('ink1',true,1),entry('surface1',false,1)];
  assert.deepEqual(entries.sort(sort).map(e=>e.name),['surface1','surface3','ink1','ink2']);
  assert.strictEqual(scene._renderingManager._customAlphaTestSortCompareFn[0],alpha);assert.strictEqual(scene._renderingManager._customTransparentSortCompareFn[0],transparent);
  orderCharacterInkAfterSurfaces(scene);assert.strictEqual(scene._renderingManager._customOpaqueSortCompareFn[0],sort);
  orderCharacterInkAfterSurfaces(scene,1);assert.equal(typeof scene._renderingManager._customOpaqueSortCompareFn[1],'function');
  assert.equal(opaqueSurfaceBeforeInk(previous)(entry('a',false,5),entry('b',false,2)),3);
});

test('actual opaque draw queue submits late-spawned boss surfaces before the earlier shared ink material',{timeout:10000},async t=>{
  const {scene}=fixture(t),meshes=[];
  for(let i=0;i<2;i++){
    const body=MeshBuilder.CreateSphere(`boss-${i}`,{segments:8},scene);body.position.x=(i-.5)*1.5;
    body.material=new PBRMaterial(`painted-${i}`,scene);body.material.unlit=true;
    const asset={meshes:[body]},shell=attachCharacterOutlines(asset,'elena')[0];meshes.push(body,shell);
    for(const mesh of asset.meshes)await mesh.material.forceCompilationAsync(mesh);
  }
  assert.strictEqual(meshes[1].material,meshes[3].material);
  assert.ok(RenderingGroup.PainterSortCompare(meshes[1].subMeshes[0],meshes[2].subMeshes[0])<0,'baseline material sorting draws cached ink before a later body');
  const draws=[];for(const mesh of meshes){const render=mesh._processRendering;mesh._processRendering=function(...args){draws.push(mesh);return render.apply(this,args);};}
  scene.render();assert.equal(draws.length,4,'no new draw, depth prepass or render target');
  assert.deepEqual(draws.slice(0,2),[meshes[0],meshes[2]]);assert.deepEqual(draws.slice(2),[meshes[1],meshes[3]]);
  for(const shell of [meshes[1],meshes[3]]){assert.equal(shell.material.disableDepthWrite,true);assert.equal(shell.metadata.outlinePixels,.5);assert.equal(shell.receiveShadows,false);}
  meshes[0].visibility=.5;meshes[1].visibility=.5;draws.length=0;scene.render();
  assert.equal(draws.length,4);assert.ok(draws.indexOf(meshes[0])>draws.indexOf(meshes[2]),'fading actors retain the separate transparent queue');
});

test('r9 body, prayer hands, cloth, halo and all morph streams remain exact through bone/ink/shadow optimization',{timeout:15000},async t=>{
  const {engine,scene}=fixture(t);
  Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
  engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{const tex=engine.createRawTexture(data,w,h,format,mips,invertY,sampling,compression,type);tex.depth=depth;tex.is2DArray=true;return tex;};
  const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base))),{gltf,files}=await readRuntimeGltf(new URL(config.model,base));
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+files.get(b.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json:gltf},'');asset.addAllToScene();for(const group of asset.animationGroups)group.stop();
  const actor=new TransformNode('actor',scene);asset.meshes[0].parent=actor;actor.scaling.setAll(config.scale);
  const before=new Map(asset.meshes.filter(m=>m.getTotalVertices()).map(m=>[m,{streams:streams(m),indices:checksum(m.getIndices()),geometry:m.geometry,skeleton:m.skeleton,manager:m.morphTargetManager,slots:m.numBoneInfluencers}]));
  const morphs=()=>asset.morphTargetManagers.map(manager=>Array.from({length:manager.numTargets},(_,i)=>{const target=manager.getTarget(i);return [checksum(target.getPositions()),checksum(target.getNormals())];}));const originalMorphs=morphs();
  const painted=new PBRMaterial('r9-painted',scene);painted.unlit=true;
  for(const mesh of before.keys()){mesh.material=painted;if(mesh.skeleton)mesh.skeleton.useTextureToStoreBoneMatrices=true;}
  const shells=attachCharacterOutlines(asset,'elena'),changed=[...before].filter(([mesh,old])=>mesh.numBoneInfluencers!==old.slots);
  assert.equal(changed.length,2);assert.equal(changed.reduce((sum,[mesh])=>sum+mesh.getTotalVertices(),0),4301);
  const body=asset.meshes.find(m=>m.name==='Elina_Chimera_Skin');assert.equal(body.numBoneInfluencers,4);assert.equal(body.getTotalVertices(),89940);
  for(const [mesh,old]of before){assert.deepEqual(streams(mesh),old.streams);assert.equal(checksum(mesh.getIndices()),old.indices);assert.strictEqual(mesh.geometry,old.geometry);assert.strictEqual(mesh.skeleton,old.skeleton);assert.strictEqual(mesh.morphTargetManager,old.manager);}
  assert.deepEqual(morphs(),originalMorphs);
  const animator=new MourningElenaAnimator(asset,config,actor);
  for(const [motion,time]of [['idle',.7],['walk',1.1],['cast',1.6],['dead',.8],['dead',3.2],['dead',5.2]]){
    animator.reset();animator.transition(motion,{clipTime:0});animator.update(time);animator.sample(0);
    for(const [mesh,old]of changed){
      mesh.numBoneInfluencers=old.slots;const p=mesh.getPositionData(true,true),n=mesh.getNormalsData(true,true);mesh.numBoneInfluencers=3;
      assert.deepEqual(mesh.getPositionData(true,true),p,`${mesh.name} ${motion} ${time} position`);assert.deepEqual(mesh.getNormalsData(true,true),n,`${mesh.name} ${motion} ${time} normal`);
      const shell=shells.find(m=>m.parent===mesh);assert.equal(shell.numBoneInfluencers,3);assert.strictEqual(shell.geometry,mesh.geometry);assert.strictEqual(shell.skeleton,mesh.skeleton);assert.strictEqual(shell.morphTargetManager,mesh.morphTargetManager);
    }
  }
  const light=new DirectionalLight('sun',new Vector3(-1,-2,1),scene),shadows=new ShadowGenerator(1024,light);shadows.normalBias=.02;
  for(const [mesh]of changed){
    const shell=shells.find(m=>m.parent===mesh);await mesh.material.forceCompilationAsync(mesh);await shell.material.forceCompilationAsync(shell);
    mesh.material.isReadyForSubMesh(mesh,mesh.subMeshes[0]);shell.material.isReadyForSubMesh(shell,shell.subMeshes[0]);
    assert.match(mesh.subMeshes[0].effect.defines,/#define NUM_BONE_INFLUENCERS 3/);assert.match(shell.subMeshes[0].effect.defines,/#define NUM_BONE_INFLUENCERS 3/);
    shadows.addShadowCaster(mesh,false);
  }
  await shadows.forceCompilationAsync();const enginePass=engine.currentRenderPassId;engine.currentRenderPassId=shadows.getShadowMap().renderPassId;
  for(const [mesh]of changed){assert.equal(shadows.isReady(mesh.subMeshes[0],false,false),true);assert.match(mesh.subMeshes[0]._getDrawWrapper().effect.defines,/#define NUM_BONE_INFLUENCERS 3/);}
  engine.currentRenderPassId=enginePass;assert.equal(shadows.getShadowMap().refreshRate,1);
  animator.dispose();shadows.dispose();loader.dispose();
});
