import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,PBRMaterial,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {prepareVillageStart,loadStreamedVillage} from '../src/village-streamed-environment.js';
import {readMapContainer} from '../src/map-container.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {CAVE_LABORATORY_GEOMETRY as contract} from '../src/cave-laboratory-geometry.js';
import {CAVE_ENTRY} from '../src/witch-cave-layout.js';
import {mapShaderCacheSize} from '../src/map-shader-cache.js';

const base=new URL('../public/assets/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,base)));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const observers=scene=>['onBeforeRenderObservable','onAfterRenderObservable','onDisposeObservable','onNewMaterialAddedObservable','onMaterialRemovedObservable','onNewMeshAddedObservable','onMeshRemovedObservable'].map(key=>scene[key].observers.length);
const inventory=scene=>({meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,geometries:scene.geometries.length,observers:observers(scene)});
function readyRaw(scene){for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;}
function attributes(mesh){return Object.fromEntries(['position','normal','uv'].map(kind=>[kind,Array.from(mesh.getVerticesData(kind))]));}

// Uses actual spatial plans, actual compressed geometry decoded offline, the
// pinned glTF AssetContainer, real streaming/atmosphere/FoW and same-scene map
// replacement. Only image decoding/upload and real GPU rasterization are absent.
test('native far closure gates surface replacement and survives twelve cave/forest round trips without retained scene resources',async t=>{
 const saved=globalThis.location;globalThis.location={href:'https://native-lifecycle.test/ArcherPreviewSite/?character=warrior-v5'};t.after(()=>globalThis.location=saved);
 t.mock.method(globalThis,'fetch',async url=>{const name=new URL(url).pathname.split('/').at(-1);assert.ok(name.endsWith('.json'),'image/model fetch is not hidden by this fixture');return new Response(readFileSync(new URL(name,base)));});
 const engine=new NullEngine({renderWidth:1560,renderHeight:720}),world=createWorld(engine,{cave:true,touchDevice:true}),scene=world.scene,camera=world.camera,decode=new Map(),containers=[];
 engine.getCaps().instancedArrays=true;t.after(()=>engine.dispose());
 const views=[],outside=[];let calls=0;
 async function containerFor(model,scene){
  const name=model.pathname.split('/').at(-1);let parsed=decode.get(name);
  if(!parsed){parsed=await readRuntimeGltf(new URL('content/'+name,base));decode.set(name,parsed);}
  const gltf=structuredClone(parsed.gltf);
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+Buffer.from(parsed.files.get(buffer.uri).data).toString('base64');
  const container=await readMapContainer(scene,gltf,'',{skipMaterials:true,fileName:name});
  // Keep each authored alpha/culling policy; only unavailable image decoding is
  // replaced. Container owns these fixture materials, so disposal is genuine.
  const materials=gltf.materials.map((m,i)=>{const material=new PBRMaterial(name+'-'+i,scene);material.backFaceCulling=!m.doubleSided;material.transparencyMode=m.alphaMode==='BLEND'?2:m.alphaMode==='MASK'?1:0;return material;});
  for(const mesh of container.meshes.filter(m=>m.getTotalVertices()>0)){const source=gltf.meshes[0]?.primitives[0]?.material??0;mesh.material=materials[source];}
  container.materials.push(...materials);containers.push(container);calls++;readyRaw(scene);return container;
 }
 for(let trip=0;trip<12;trip++){
  if(trip)replaceWorldMap(world,'warrior-v5');
  camera.setTarget(new Vector3(CAVE_ENTRY.x,world.terrain.heightAt(CAVE_ENTRY.x,CAVE_ENTRY.z)+1.1,CAVE_ENTRY.z));
  world.caveFog.update(new Vector3(CAVE_ENTRY.x,world.terrain.heightAt(CAVE_ENTRY.x,CAVE_ENTRY.z),CAVE_ENTRY.z),trip,{force:true});readyRaw(scene);
  const start=await prepareVillageStart(world),record=start.records.find(r=>r.placement.asset===contract.assetId),far=start.assets.get(contract.assetId).levels.find(l=>l.level===2),ceiling=scene.getMeshByName('cave-distant-ceiling'),oldCeiling=Array.from(ceiling.getIndices()),oldCover=world.caveFog.cover,oldFloor=attributes(world.ground),oldIndices=Array.from(world.ground.getIndices()),oldFog=world.caveFog,oldAtmosphere=world.caveAtmosphere;
  assert.equal(start.records.length,159);assert.equal(start.assets.size,29);assert.deepEqual([start.plan[0].id,start.plan[0].level],[contract.assetId,2]);
  assert.equal(record.root.isEnabled(),false);assert.equal(scene.metadata.caveLaboratoryGeometry??null,null);assert.equal(world.caveAtmosphere.inspect().laboratoryRevision,null);
  const requested=deferred(),release=deferred();let gated=false;
  const promise=loadStreamedVillage(world,{initialize:async()=>{},ground:async()=>{},loadContainer:async(model,scene)=>{if(!gated&&model.pathname.endsWith(far.model.split('/').at(-1))){gated=true;requested.resolve();await release.promise;}return containerFor(model,scene);}});
  await requested.promise;
  assert.equal(record.structuralReady,false);assert.equal(record.root.isEnabled(),false);assert.deepEqual(Array.from(ceiling.getIndices()),oldCeiling,'old ceiling remains intact while required closure is pending');assert.equal(world.caveFog.cover,oldCover);assert.equal(oldCover.isDisposed(),false);
  release.resolve();await promise;await new Promise(r=>setTimeout(r,0));
  assert.equal(world.environment.ready,true);assert.equal(record.structuralReady,true);assert.equal(record.root.isEnabled(),true);assert.ok(start.assets.get(contract.assetId).tiers.has(2));assert.equal(scene.metadata.caveLaboratoryGeometry,contract);assert.equal(world.caveAtmosphere.inspect().laboratoryRevision,contract.revision);
  assert.notDeepEqual(Array.from(ceiling.getIndices()),oldCeiling);assert.equal(oldCover.isDisposed(),true);assert.equal(world.caveFog.patches.length,world.ground.subMeshes.length);for(const [i,patch]of world.caveFog.patches.entries())assert.equal(patch.source,world.ground.subMeshes[i]);
  assert.deepEqual(attributes(world.ground),oldFloor,'same source position/UV/protected normal bits survive activation');assert.deepEqual(Array.from(world.ground.getIndices()),oldIndices);assert.equal(world.ground.getTotalIndices()/3,73728);
  const currentCover=world.caveFog.cover,before=inventory(scene);for(let n=0;n<3;n++)assert.equal(world.caveAtmosphere.activateLaboratoryGeometry(),true);assert.deepEqual(inventory(scene),before,'same revision activation performs no allocation');assert.equal(world.caveFog.cover,currentCover);
  // The closed structure is the deliberate exception to hidden-prop submission.
  record.cellActive=false;record.occluded=true;world.caveFog.updateRecords([record]);assert.equal(record.root.isEnabled(),true);
  readyRaw(scene);world.tick(trip);scene.render();views.push(inventory(scene));assert.ok(mapShaderCacheSize(engine)<=12);
  const owners=[...start.assets.values()].flatMap(asset=>[...asset.tiers.values()].map(tier=>tier.container));
  await world.releaseEnvironment();for(const owner of owners)for(const mesh of owner.meshes)assert.equal(mesh.isDisposed(),true);assert.equal(world.villagePrepared,null);assert.equal(world.villageStreaming,null);
  replaceWorldMap(world,'warrior-v4');await new Promise(r=>setTimeout(r,0));
  assert.equal(world.camera,camera);assert.equal(oldFog.disposed,true);assert.equal(oldAtmosphere.inspect().disposed,true);assert.equal(scene.metadata.caveLaboratoryGeometry??null,null);assert.equal(scene.metadata.caveFogRuntime??null,null);assert.equal(record.root.isDisposed(),true);outside.push(inventory(scene));
 }
 for(const value of views.slice(1))assert.deepEqual(value,views[0],'loaded cave scene resources remain bounded across visits');for(const value of outside.slice(1))assert.deepEqual(value,outside[0],'released cave owns no accumulating observer/mesh/material/texture');
 t.diagnostic(JSON.stringify({roundTrips:12,actualGeometryLoads:calls,loaded:views[0],forestAfterRelease:outside[0],retainedLinkedPrograms:mapShaderCacheSize(engine),nativeTriangles:read('witch-cave.json').assets[contract.assetId].lods.map(l=>l.triangles),limits:'NullEngine; offline geometry; no image decode, real mobile GPU time or thermal measurement'}));
});
