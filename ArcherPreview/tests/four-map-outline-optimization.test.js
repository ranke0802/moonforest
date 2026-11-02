import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,PBRMaterial,TransformNode,HemisphericLight} from '@babylonjs/core';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import '@babylonjs/loaders/glTF/index.js';
import {CHAPTER_POINTS} from '../src/chapter-quest-points.js';
import {createQuestProps} from '../src/chapter-quest-props.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {applyVillageToon} from '../src/village-toon.js';
import {prepareVillageInstancing} from '../src/village-instancing.js';
import {applyPlainsViewDistance} from '../src/plains-view-distance.js';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {lootRarity} from '../src/loot-rarity.js';
import {readMapContainer} from '../src/map-container.js';

const assetBase=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('quest-props.json',assetBase)));
const chest=manifest.assets['chest-common'],profile=chest.lods[1],modelUrl=new URL(profile.model,assetBase);
const maps=['village','great-plains','monster-forest','witch-cave'],results=[];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const observers=observable=>observable.observers.filter(o=>!o._willBeUnregistered).length;
const snapshot=scene=>({meshes:scene.meshes.length,geometries:scene.geometries.length,materials:scene.materials.length,textures:scene.textures.length,before:observers(scene.onBeforeRenderObservable),after:observers(scene.onAfterRenderObservable),dispose:observers(scene.onDisposeObservable),newMaterial:observers(scene.onNewMaterialAddedObservable),removedMaterial:observers(scene.onMaterialRemovedObservable),newMesh:observers(scene.onNewMeshAddedObservable),removedMesh:observers(scene.onMeshRemovedObservable),stages:scene._afterRenderingMeshStage.length,pending:scene.getWaitingItemsCount()});

function fixture(t){
  const engine=new NullEngine({renderWidth:960,renderHeight:540});engine.getCaps().instancedArrays=true;
  const scene=new Scene(engine),camera=new FreeCamera('qa-camera',new Vector3(0,1,-3),scene);camera.target=Vector3.Zero();camera.setTarget(camera.target);camera.maxZ=400;
  new HemisphericLight('qa-light',Vector3.Up(),scene);
  // RawTexture upload completion is a GPU boundary absent in NullEngine.
  caveFogFallback(scene).getInternalTexture().isReady=true;void scene.defaultMaterial;
  const world={scene,camera,mapId:'village',touchDevice:true,terrain:{heightAt:()=>0},lighting:{direction:Vector3.Up(),shadowsActive:false,registerMeshes(){}},prefetchResources:async()=>{}};
  t.after(()=>{world.caveFog?.dispose();scene.dispose();engine.dispose();});return {engine,scene,camera,world};
}
function lookAt(camera,x,z,distance=3){camera.position.set(x,1.2,z-distance);camera.target.set(x,.35,z);camera.setTarget(camera.target);camera.getViewMatrix(true);camera.getProjectionMatrix(true);}
function record(scene,source,name,x,z,tier=0){const root=new TransformNode(name,scene);root.position.set(x,0,z);const mesh=source.createInstance(name+'-mesh');mesh.parent=root;mesh.computeWorldMatrix(true);return {root,meshes:[mesh],placement:{kind:'prop',tier,x,z},min:mesh.getBoundingInfo().boundingBox.minimumWorld.clone(),max:mesh.getBoundingInfo().boundingBox.maximumWorld.clone()};}
function scenery(f,x,z){
  const source=MeshBuilder.CreateBox('ordinary-scenery',{size:.6},f.scene),material=new PBRMaterial('ordinary-pbr',f.scene);source.material=material;source.isVisible=false;prepareVillageInstancing([source]);applyVillageToon([source],f.world.lighting);
  const r=record(f.scene,source,'ordinary-root',x-.8,z),ink=new VillageOutlines(f.world,[r],{});return {source,record:r,ink,dispose(){ink.dispose();r.root.dispose();material.dispose();source.dispose();}};
}
function capture(sources,owner){
  const calls=[];
  for(const source of sources){const original=source._processRendering;source._processRendering=function(mesh,sub,effect,fill,batch,...rest){const ink=owner(source);calls.push({source,ink:ink?.drawing===true,effect,instances:[...(batch.visibleInstances[sub._id]??[])]});return original.call(this,mesh,sub,effect,fill,batch,...rest);};}
  return calls;
}
function coupled(calls){
  for(let i=0;i<calls.length;i++)if(calls[i].ink){const base=calls[i-1];assert.equal(base?.ink,false,'ink must immediately follow a successful base submission');assert.equal(calls[i].source,base.source);assert.ok(calls[i].instances.length>0);assert.ok(calls[i].instances.every(mesh=>base.instances.includes(mesh)),'ink can only use instances from that exact base/LOD batch');}
}
function noTint(source){assert.equal(Object.hasOwn(source.instancedBuffers,'villageInkTint'),false);assert.equal(Object.hasOwn(source._userInstancedBuffersStorage.strides,'villageInkTint'),false);}
function fogUniform(ink,start,end){for(const material of [ink.material,ink.tintedMaterial])if(material){assert.equal(material._vectors2.inkFogRange.x,start);assert.equal(material._vectors2.inkFogRange.y,end);}}

test('four actual map point sets render shipped chest geometry with graded ink and return to a resource plateau on repeated trips',async t=>{
  await MeshoptDecoder.ready;const previous=MeshoptCompression._Default;
  MeshoptCompression._Default={decodeGltfBufferAsync:async(bytes,count,stride,mode,filter)=>{const output=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(output,count,stride,bytes,mode,filter);return output;}};
  t.after(()=>{MeshoptCompression._Default=previous;});
  const json=JSON.parse(readFileSync(modelUrl));
  for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+readFileSync(new URL(buffer.uri,modelUrl)).toString('base64');
  // Preserve shipped mesh/accessor/node bytes. Omit image decoding only; GPU
  // texture upload and raster output are outside this CPU/SDK integration test.
  delete json.images;delete json.textures;delete json.samplers;delete json.materials;
  json.extensionsRequired=(json.extensionsRequired??[]).filter(value=>value!=='KHR_texture_basisu');
  json.extensionsUsed=(json.extensionsUsed??[]).filter(value=>value!=='KHR_texture_basisu');
  for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  const f=fixture(t),baseline=snapshot(f.scene);let visits=0,tier5Draws=0,warmedBaseline;
  const props=createQuestProps(f.world,{baseUrl:new URL('https://qa.test/assets/quest-props.json'),readManifest:async()=>manifest,loadContainer:async(_url,scene,options)=>readMapContainer(scene,structuredClone(json),assetBase.href,{...options,fileName:modelUrl.pathname.split('/').at(-1)})});
  t.after(()=>props.dispose());
  // Two complete four-map circuits exercise the same live scene and props owner.
  for(let circuit=0;circuit<2;circuit++)for(const map of maps){
    f.world.mapId=map;f.world.plains=map==='great-plains';f.world.cave=map==='witch-cave';f.scene.fogStart=65;f.scene.fogEnd=80;
    const points=CHAPTER_POINTS.filter(point=>point.map===map).map(point=>({...point})),target=points.filter(point=>point.tier).sort((a,b)=>b.tier-a.tier)[0];assert.ok(target);
    lookAt(f.camera,target.x,target.z);
    if(f.world.cave){f.world.caveFog=new CaveFogRuntime(f.world,{isOpaque:()=>false});f.world.caveFog.texture.getInternalTexture().isReady=true;f.world.caveFog.update(target,0,{force:true});}
    const ordinary=scenery(f,target.x,target.z);await ordinary.source.material.forceCompilationAsync(ordinary.source,{useInstances:true});await ordinary.ink.prepare();
    noTint(ordinary.source);assert.equal(ordinary.ink.tintedMaterial,null);assert.ok(!ordinary.ink.material.options.attributes.includes('villageInkTint'));
    await props.load(points);props.update(points,target,point=>point.id===target.id);await props.whenIdle();assert.equal(props.inspect().modelFailures,0);assert.equal(props.inspect().markerInstances,points.length);
    const ink=f.scene._afterRenderingMeshStage.map(step=>step.component).find(component=>component instanceof VillageOutlines&&component.stats===props.stats);assert.ok(ink?.tintedMaterial);
    const sources=[...ink.sources],geometryTriangles=[...new Set(sources.map(source=>source.geometry))].reduce((total,geometry)=>total+geometry.getTotalIndices()/3,0);assert.equal(geometryTriangles,profile.triangles);
    const meshes=target.visual.getChildMeshes().filter(mesh=>mesh.getTotalVertices()>0);assert.ok(meshes.length);
    for(const mesh of meshes){assert.equal(mesh.geometry,mesh.sourceMesh.geometry);assert.equal(mesh.instancedBuffers.villageInkTint.toHexString().toLowerCase(),lootRarity(target.tier).color);assert.equal(ink.entries.find(entry=>entry.mesh===mesh).inkWidth,.028);}
    assert.equal(props.inspect().visible,1);const calls=capture([...sources,ordinary.source],source=>sources.includes(source)?ink:ordinary.ink);
    for(const scale of [1,1.5,2,1]){
      applyPlainsViewDistance(f.world,scale);ink.next=ordinary.ink.next=0;calls.length=0;f.scene.render();coupled(calls);
      assert.ok(calls.some(call=>call.ink&&sources.includes(call.source)),'real chest ink submission must occur');assert.ok(calls.some(call=>call.ink&&call.source===ordinary.source),'real monochrome scenery ink submission must occur');
      for(const call of calls.filter(call=>call.ink&&sources.includes(call.source)))assert.equal(call.effect,ink.tintedMaterial.getEffect());
      if(map==='great-plains'){fogUniform(ink,65*scale,80*scale);fogUniform(ordinary.ink,65*scale,80*scale);}else{fogUniform(ink,65,80);fogUniform(ordinary.ink,65,80);}
      assert.equal(f.engine.getDepthWrite(),true);noTint(ordinary.source);if(target.tier===5)tier5Draws++;
    }
    // Collected/ineligible props cannot leave a detached colored hull behind.
    props.update(points,target,()=>false);ink.next=0;calls.length=0;f.scene.render();assert.ok(!calls.some(call=>sources.includes(call.source)));
    props.release();ordinary.dispose();f.world.caveFog?.dispose();f.world.caveFog=null;await tick();
    const after=snapshot(f.scene),core=({textures,dispose,...value})=>value;
    assert.deepEqual(core(after),core(baseline),`all map-owned meshes/materials/geometry/hooks released after ${map} visit ${circuit}`);
    if(circuit===0&&map===maps.at(-1))warmedBaseline=after;
    // Babylon lazily installs its scene-level BRDF texture and scene components
    // on the first PBR/glTF draw. A full first circuit warms these shared owners;
    // every later map must return to exactly that same complete snapshot.
    if(circuit>0)assert.deepEqual(after,warmedBaseline,`complete warmed resource/observer plateau after ${map} visit ${circuit}`);visits++;
  }
  assert.equal(visits,8);assert.equal(tier5Draws,8);results.push({case:'actual-four-map-chest-and-monochrome-render',visits,shippedChestTriangles:profile.triangles,pointsByMap:Object.fromEntries(maps.map(map=>[map,CHAPTER_POINTS.filter(point=>point.map===map).length])),tier5Draws,coldBaseline:baseline,warmedBaseline,warmedSceneTextureNames:f.scene.textures.map(texture=>texture.name),plateau:true});
});

test('real fog gating and cold native LOD batches retain coupled monochrome and tinted outline submissions',async t=>{
  const f=fixture(t);f.world.cave=true;f.world.mapId='witch-cave';f.scene.fogStart=65;f.scene.fogEnd=80;
  const fog=f.world.caveFog=new CaveFogRuntime(f.world,{isOpaque:x=>x>=0&&x<1});fog.texture.getInternalTexture().isReady=true;
  const near=MeshBuilder.CreateBox('native-near',{size:2},f.scene),far=MeshBuilder.CreateBox('native-far',{size:1.9},f.scene);
  for(const source of [near,far]){source.material=new PBRMaterial(source.name,f.scene);source.isVisible=false;prepareVillageInstancing([source]);applyVillageToon([source],f.world.lighting);}near.addLODLevel(12,far);
  const visible=record(f.scene,near,'graded-visible',-5,0,2),hidden=record(f.scene,near,'graded-hidden',5,0,5),ordinary=scenery(f,-5,0);
  f.world.villagePrepared={records:[visible,hidden]};fog.update({x:-5,z:0},0,{force:true});assert.equal(hidden.fogVisible,false);assert.equal(hidden.root.isEnabled(),false);
  const ink=new VillageOutlines(f.world,[visible,hidden],{}),materials=[near.material,far.material];t.after(()=>{ink.dispose();ordinary.dispose();visible.root.dispose();hidden.root.dispose();for(const material of materials)material.dispose();for(const source of [near,far])source.dispose();});
  for(const source of [near,far,ordinary.source])await source.material.forceCompilationAsync(source,{useInstances:true});await ink.prepare();await ordinary.ink.prepare();
  const calls=capture([near,far,ordinary.source],source=>source===ordinary.source?ordinary.ink:ink),seen=new Set();let cold=false;
  const ready=far.material.isReadyForSubMesh.bind(far.material);far.material.isReadyForSubMesh=(...args)=>!cold&&ready(...args);
  for(let frame=0;frame<16;frame++){
    const distance=frame%2?20:6;f.camera.position.set(-5,3,distance);f.camera.target.set(-5,0,0);f.camera.setTarget(f.camera.target);cold=frame%4===1;ink.next=ordinary.ink.next=0;calls.length=0;f.scene.render();coupled(calls);
    for(const call of calls){assert.ok(!call.instances.includes(hidden.meshes[0]),'hidden grade5 must never enter a base or ink batch');if(cold)assert.notEqual(call.source,far,'a cold base cannot leave its outline visible');if(call.ink&&[near,far].includes(call.source))seen.add(call.source);}
    assert.equal(f.engine.getDepthWrite(),true);noTint(ordinary.source);assert.equal(hidden.root.isEnabled(),false);
  }
  assert.deepEqual(seen,new Set([near,far]));assert.ok(ink.stats.outlineDraws>0);assert.ok(!ordinary.ink.material.getEffect().vertexSourceCode.includes('attribute vec3 villageInkTint'));assert.match(ink.tintedMaterial.getEffect().fragmentSourceCode,/caveFogHidesInk/);assert.match(ordinary.ink.material.getEffect().fragmentSourceCode,/caveFogHidesInk/);
  results.push({case:'actual-sdk-fog-and-cold-lod-outline-coupling',frames:16,lodSources:seen.size,hiddenTier5Submissions:0});
});

test.after(()=>{
  const folder=new URL('../reports/outline-cost-2026-11-03/',import.meta.url);mkdirSync(folder,{recursive:true});writeFileSync(new URL('four-map-validation.json',folder),JSON.stringify({passed:results.length===2,cases:results,limitations:['Node/Babylon NullEngine submission and lifecycle QA; no GPU rasterization, visual-quality, device-FPS or thermal measurement.','Four-map test uses every actual CHAPTER_POINTS row and shipped 4479-triangle chest Meshopt geometry; image and KTX upload are omitted. Non-chest scenery and alternate LOD geometry are controlled SDK fixtures.','Fog line-of-sight uses the real runtime with a controlled opaque wall or open field; it does not visually validate every authored dungeon wall.'],browserAutomation:false},null,2)+'\n');
});
