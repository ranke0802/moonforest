import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,AssetContainer,MeshBuilder,PBRMaterial,VertexBuffer,MorphTargetManager} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {PrepareDefinesForMorphTargets,PrepareDefinesAndAttributesForMorphTargets,BindMorphTargetParameters} from '@babylonjs/core/Materials/materialHelper.functions.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {applyHitFlash} from '../src/hit-feedback.js';
import {applyElenaStyle} from '../src/elena-style.js';

const base=new URL('../public/assets/',import.meta.url);
const hash=values=>createHash('sha256').update(Buffer.from(Float32Array.from(values).buffer)).digest('hex');
const counts=scene=>[scene.meshes.length,scene.transformNodes.length,scene.skeletons.length,scene.animationGroups.length,scene.morphTargetManagers.length,scene.geometries.length,scene.textures.length];
async function packedFixture(t,id,{textureMode=false}={}){
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  if(textureMode){
    // Preserve Babylon's texture-mode data and binding path without a GPU.
    // NullEngine lacks texture arrays; its inert raw texture holds the same data.
    Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxTextureSize:4096});
    engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{
      const texture=engine.createRawTexture(data,w,h,format,mips,invertY,sampling,compression,type);texture.depth=depth;texture.is2DArray=true;return texture;
    };
  }
  const config=JSON.parse(readFileSync(new URL(id+'.json',base))),source=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(source.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  for(const group of container.animationGroups)group.stop();
  const library=new BossModelLibrary(scene,id);library.load=async()=>{};library.config=config;library.container=container;
  t.after(()=>{container.dispose();loader.dispose();scene.dispose();engine.dispose();});
  return {engine,scene,container,library,config};
}

for(const id of ['elena','mourning-elena'])test(`${id} keeps one packed resident asset through repeated requests without cloning`,async t=>{
  const {scene,container,library}=await packedFixture(t,id);
  let clones=0;const clone=container.instantiateModelsToScene.bind(container);container.instantiateModelsToScene=(...args)=>{clones++;return clone(...args);};
  const first=await library.instantiate(),before=counts(scene);
  for(let i=0;i<20;i++)assert.strictEqual((await library.instantiate()).asset,first.asset);
  assert.equal(clones,0);assert.deepEqual(counts(scene),before);
  assert.deepEqual(first.asset.meshes,container.meshes);assert.strictEqual(first.asset.skeletons,container.skeletons);assert.strictEqual(first.asset.animationGroups,container.animationGroups);
  assert.equal(first.asset.meshes.filter(m=>m.getTotalVertices()).reduce((n,m)=>n+m.getTotalIndices()/3,0),id==='elena'?103930:143228);
});

test('counted bear instances still receive separate actors',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine),container=new AssetContainer(scene),body=MeshBuilder.CreateBox('bear',{},scene);
  container.meshes=[body];container.removeAllFromScene();const library=new BossModelLibrary(scene,'guardian-bear');library.load=async()=>{};library.config={};library.container=container;
  t.after(()=>{container.dispose();scene.dispose();engine.dispose();});
  const a=await library.instantiate(),b=await library.instantiate();assert.notStrictEqual(a.asset,b.asset);assert.notStrictEqual(a.asset.meshes[0],b.asset.meshes[0]);assert.strictEqual(a.asset.meshes[0].geometry,b.asset.meshes[0].geometry);
});

test('texture morph pruning keeps stable r9 shader slots, identical skin/normals and shared shadow/outline bindings',async t=>{
  const {scene,library}=await packedFixture(t,'mourning-elena',{textureMode:true}),{asset}=await library.instantiate();
  const body=asset.meshes.find(m=>m.name==='Elina_Chimera_Skin');assert.ok(body,'select the authored body, not the separate mouth interior');
  const manager=body.morphTargetManager,targets=Array.from({length:manager.numTargets},(_,i)=>manager.getTarget(i));
  assert.equal(targets.length,11);
  const mouth=asset.meshes.find(m=>/Lament_Mouth_Interior/.test(m.name));assert.ok(mouth);const mouthManager=mouth.morphTargetManager;
  assert.notStrictEqual(mouthManager,manager);assert.equal(mouthManager.numTargets,1);assert.equal(new Set(asset.meshes.map(m=>m.morphTargetManager).filter(Boolean)).size,2);
  const original={positions:hash(body.getVerticesData(VertexBuffer.PositionKind)),normals:hash(body.getVerticesData(VertexBuffer.NormalKind)),targets:targets.map(target=>[hash(target.getPositions()),hash(target.getNormals())])};
  let synchronizations=0;const synchronize=manager.synchronize.bind(manager);manager.synchronize=()=>{synchronizations++;return synchronize();};
  MourningElenaEncounter.prototype.prepareAsset.call({asset});assert.equal(synchronizations,0,'keep the texture already prepared by the glTF loader');
  const texture=manager._targetStoreTexture;MourningElenaEncounter.prototype.prepareAsset.call({asset});assert.equal(synchronizations,0);assert.strictEqual(manager._targetStoreTexture,texture);
  assert.equal(mouthManager.isUsingTextureForTargets,true);assert.equal(mouthManager.numMaxInfluencers,1);assert.notStrictEqual(mouthManager._targetStoreTexture,texture);
  const painted=new PBRMaterial('test-elena-painted',scene);painted.unlit=true;
  for(const mesh of asset.meshes)if(mesh.getTotalVertices())mesh.material=painted;
  applyElenaStyle(asset);
  const managerCount=scene.morphTargetManagers.length,textureCount=scene.textures.length;
  let managerClones=0;const clone=manager.clone.bind(manager);manager.clone=(...args)=>{managerClones++;return clone(...args);};
  const shells=attachCharacterOutlines(asset,'elena'),shell=shells.find(m=>m.parent===body);
  assert.ok(!shells.some(m=>/Lament_Mouth_Interior/.test(m.name)),'collapsed mouth interior must not create an inflated ink mark');
  assert.equal(managerClones,0);assert.equal(scene.morphTargetManagers.length,managerCount);assert.equal(scene.textures.length,textureCount);
  assert.strictEqual(shell.geometry,body.geometry);assert.strictEqual(shell.skeleton,body.skeleton);assert.strictEqual(shell.morphTargetManager,manager);
  const references={};
  const cases=[[0,0,.5,0,0],[0,0,.7,.4,.3],[1,1,.6,.2,.4],[0,0,0,0,0]].map(row=>[...row,...Array(targets.length-row.length).fill(0)]);
  cases.push(targets.map(t=>t.name.startsWith('Death_')?.5:0),targets.map(t=>t.name==='Hair_Cast_Wind'?.7:0));
  for(const weights of cases){
    manager.areUpdatesFrozen=true;manager.optimizeInfluencers=false;targets.forEach((target,i)=>target.influence=weights[i]);manager.areUpdatesFrozen=false;
    const positions=body.getPositionData(true,true).slice(),normals=body.getNormalsData(true,true).slice();
    MourningElenaEncounter.prototype.prepareAsset.call({asset});
    assert.equal(manager.numInfluencers,weights.filter(Boolean).length);assert.equal(manager.numMaxInfluencers,11);
    assert.deepEqual(targets.map(target=>target.influence),weights);
    for(const [actual,expected] of [[body.getPositionData(true,true),positions],[body.getNormalsData(true,true),normals],[shell.getPositionData(true,true),positions],[shell.getNormalsData(true,true),normals]]){
      let error=0;for(let i=0;i<expected.length;i++)error=Math.max(error,Math.abs(actual[i]-expected[i]));assert.ok(error<1e-7,`morph/skin discrepancy ${error}`);
    }
    const pbr={NORMAL:true,UV1:true};PrepareDefinesForMorphTargets(body,pbr);assert.equal(pbr.NUM_MORPH_INFLUENCERS,11);assert.equal(pbr.MORPHTARGETS_NORMAL,true);
    for(const [name,normal] of [['outline',true],['shadow',false]]){
      const defines=[],attributes=['position','normal'];assert.equal(PrepareDefinesAndAttributesForMorphTargets(manager,defines,attributes,body,true,normal,false,false,false,false),11);
      references[name]??=defines;assert.deepEqual(defines,references[name]);
    }
    const bound={},effect={setFloat3(){},setFloatArray:(name,value)=>bound[name]=Array.from(value),setArray:(name,value)=>bound[name]=Array.from(value),setTexture:(name,value)=>bound[name]=value,setFloat:(name,value)=>bound[name]=value};
    BindMorphTargetParameters(body,effect);manager._bind(effect);assert.equal(bound.morphTargetCount,weights.filter(Boolean).length);assert.strictEqual(bound.morphTargets,texture);
  }
  applyHitFlash(asset.meshes,.22,.22);assert.equal(body.renderOverlay,false);assert.equal(body.overlayAlpha,.72);assert.equal(shell.renderOverlay,false);
  const uniforms={},effect={getUniformIndex:()=>0,setFloat:(name,value)=>uniforms[name]=value,setFloat2(){},setFloat3(){},setFloatArray(){},setArray(){},setTexture(){},setMatrices(){},setMatrix(){},setColor3(){}};
  shell.skeleton.prepare(true);shell.material.bind(shell.computeWorldMatrix(true),shell,effect,shell.subMeshes[0]);assert.equal(uniforms.hitFlash,.72);
  applyHitFlash(asset.meshes,0);shell.material.bind(shell.computeWorldMatrix(true),shell,effect,shell.subMeshes[0]);assert.equal(uniforms.hitFlash,0);
  assert.equal(hash(body.getVerticesData(VertexBuffer.PositionKind)),original.positions);assert.equal(hash(body.getVerticesData(VertexBuffer.NormalKind)),original.normals);assert.deepEqual(targets.map(target=>[hash(target.getPositions()),hash(target.getNormals())]),original.targets);
  assert.equal(synchronizations,0,'weight changes only update bindings, never rebuild the morph texture');
});

test('attribute-mode fallback preserves r9 body/mouth targets and binds each manager within the engine limit',async t=>{
  const {library}=await packedFixture(t,'mourning-elena'),{asset}=await library.instantiate();
  MourningElenaEncounter.prototype.prepareAsset.call({asset});
  const meshes=asset.meshes.filter(m=>m.morphTargetManager),managers=new Set(meshes.map(m=>m.morphTargetManager));
  assert.equal(managers.size,2);assert.deepEqual([...managers].map(m=>m.numTargets).sort((a,b)=>a-b),[1,11]);
  for(const mesh of meshes){
    const manager=mesh.morphTargetManager,expected=mesh.name==='Elina_Chimera_Skin'?11:1,active=Math.min(expected,MorphTargetManager.MaxActiveMorphTargetsInVertexAttributeMode);
    // Sample changed weights as the animator does after prepareAsset; Babylon
    // synchronizes attribute buffers on influence updates, not shader-slot setup.
    manager.areUpdatesFrozen=true;for(let i=0;i<expected;i++)manager.getTarget(i).influence=.25;manager.areUpdatesFrozen=false;
    assert.equal(manager.numTargets,expected);assert.equal(manager.isUsingTextureForTargets,false);assert.equal(manager.optimizeInfluencers,false);assert.equal(manager.numInfluencers,active);assert.equal(manager.numMaxInfluencers,expected);
    // This legacy fallback is limited to eight active targets by Babylon. The
    // supported mobile WebGL2 path above verifies all eleven authored targets.
    for(let i=0;i<expected;i++){assert.equal(manager.getTarget(i).hasPositions,true);assert.equal(manager.getTarget(i).hasNormals,true);}
    for(let i=0;i<active;i++){assert.ok(mesh.isVerticesDataPresent(`position${i}`),`${mesh.name} position${i}`);assert.ok(mesh.isVerticesDataPresent(`normal${i}`),`${mesh.name} normal${i}`);}
  }
});
