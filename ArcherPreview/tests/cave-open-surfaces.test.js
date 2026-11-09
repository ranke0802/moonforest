import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,ArcRotateCamera,Vector3,PBRMaterial,TransformNode} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {configureVillageSurfaceCulling,CAVE_OPEN_SURFACE_ASSETS,R2_REVIEWED_TWO_SIDED_ASSETS,caveStructuralRecord,installVillageGeometry} from '../src/village-streamed-environment.js';
import {prepareVillageInstancing} from '../src/village-instancing.js';
import {prepareTreeOcclusion} from '../src/tree-occlusion.js';
import {applyVillageToon} from '../src/village-toon.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {sourcePath} from '../../Sources/resolve-source.mjs';

const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base)));

test('only an approved R2 near asset preserves its authored two-sided material in every map',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());
 const expected=['forest-03-fallen-log','chest-common','cave-08-timber-brace','cave-09-iron-gate-leaf','cave-11-sluice-shutter','cave-12-lift-platform','cave-14-hidden-pressure-stone','cave-19-apothecary-shelf'];
 assert.deepEqual(R2_REVIEWED_TWO_SIDED_ASSETS,expected);
 for(const id of expected){
  for(const cave of [true,false]){
   const material=new PBRMaterial(id+String(cave),scene);material.backFaceCulling=false;const mesh={material},marker={revision:'approved-review-r2-2026-11-09',assetId:id},counts=[scene.meshes.length,scene.materials.length,scene.textures.length];
   configureVillageSurfaceCulling(mesh,{assetId:id,category:'prop',cave,level:0,r2Geometry:marker});assert.equal(material.backFaceCulling,false,id+' approved near');
   assert.deepEqual([scene.meshes.length,scene.materials.length,scene.textures.length],counts,'no extra mesh, material, or texture');
   configureVillageSurfaceCulling(mesh,{assetId:id,category:'prop',cave,level:1,r2Geometry:marker});assert.equal(material.backFaceCulling,true,id+' old distant LOD');
   configureVillageSurfaceCulling(mesh,{assetId:id,category:'prop',cave,level:0,r2Geometry:marker});assert.equal(material.backFaceCulling,false,id+' near after LOD change');
   material.dispose();
  }
 }
 for(const id of ['village-approach','cave-derived-laboratory-rock','unknown']){const material=new PBRMaterial(id,scene);material.backFaceCulling=false;configureVillageSurfaceCulling({material},{assetId:id,category:'prop',level:0,r2Geometry:{revision:'approved-review-r2-2026-11-09',assetId:id}});assert.equal(material.backFaceCulling,true,id+' is outside the R2 exception');material.dispose();}
 const oneSided=new PBRMaterial('one-sided',scene);configureVillageSurfaceCulling({material:oneSided},{assetId:'chest-common',category:'prop',level:0,r2Geometry:{revision:'approved-review-r2-2026-11-09',assetId:'chest-common'}});assert.equal(oneSided.backFaceCulling,true,'one-sided source remains one-sided');
 for(const category of ['tree','plant']){const material=new PBRMaterial(category,scene);configureVillageSurfaceCulling({material},{assetId:'unrelated',category,level:0});assert.equal(material.backFaceCulling,false,'existing foliage policy is unchanged');material.dispose();}
});

test('approved village exterior preserves authored sidedness only for its exact separate marker',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());
 const marker={revision:'approved-village-exterior-2026-11-09',assetId:'village-approach'};
 for(const level of [0,1,2]){
  const material=new PBRMaterial('exterior-'+level,scene);material.backFaceCulling=false;const counts=[scene.meshes.length,scene.geometries.length,scene.materials.length,scene.textures.length];
  configureVillageSurfaceCulling({material},{assetId:'village-approach',category:'background',level,approvedVillageExterior:marker});assert.equal(material.backFaceCulling,false);
  assert.deepEqual([scene.meshes.length,scene.geometries.length,scene.materials.length,scene.textures.length],counts,'no additional mesh, material, texture, or pass');material.dispose();
 }
 for(const [id,approval]of [['village-approach',undefined],['village-approach',{...marker,revision:'unapproved'}],['village-approach',{...marker,assetId:'other'}],['other',marker]]){
  const material=new PBRMaterial('control',scene);material.backFaceCulling=false;configureVillageSurfaceCulling({material},{assetId:id,category:'background',level:0,approvedVillageExterior:approval});assert.equal(material.backFaceCulling,true,'nonmatching or absent exterior marker remains unchanged');material.dispose();
 }
 const oneSided=new PBRMaterial('exterior-one-sided',scene);configureVillageSurfaceCulling({material:oneSided},{assetId:'village-approach',category:'background',level:0,approvedVillageExterior:marker});assert.equal(oneSided.backFaceCulling,true,'authored one-sided materials stay one-sided');
});

test('actual approved R2 near glTFs retain authored two-sided render materials after toon setup',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;t.after(()=>engine.dispose());
 let ledger;try{ledger=JSON.parse(readFileSync(sourcePath('approved-review-r2-2026-11-09','approval.json')));}catch{t.skip('R2 sources have not been staged');return;}
 for(const id of R2_REVIEWED_TWO_SIDED_ASSETS){
  const entry=ledger.assets.find(row=>row.id===id);assert.ok(entry,id);const app=entry.applications[0],live=JSON.parse(readFileSync(new URL(app.manifest,base))).assets[id];
  if(!live.r2Geometry){t.skip('R2 candidate assets have not been applied');return;}
  const source=await readRuntimeGltf(new URL(live.lods[0].model,base));assert.ok(source.gltf.materials.every(mat=>mat.doubleSided===true),id+' actual glTF');
  for(const buffer of source.gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+Buffer.from(source.files.get(buffer.uri).data).toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:source.gltf},''),meshes=container.meshes.filter(mesh=>mesh.getTotalVertices());assert.ok(meshes.length,id);
  for(const mesh of meshes){const material=new PBRMaterial(id+'-actual',scene);material.backFaceCulling=false;mesh.material=material;}
  applyVillageToon(meshes,{direction:Vector3.Up(),shadowsActive:false});
  for(const mesh of meshes){const geometry=mesh.geometry,counts=[scene.meshes.length,scene.geometries.length,scene.materials.length,scene.textures.length];configureVillageSurfaceCulling(mesh,{cave:app.manifest==='witch-cave.json',assetId:id,category:live.category,level:0,r2Geometry:live.r2Geometry});assert.equal(mesh.material.backFaceCulling,false,id);assert.equal(mesh.geometry,geometry);assert.deepEqual([scene.meshes.length,scene.geometries.length,scene.materials.length,scene.textures.length],counts);}
  container.dispose();
 }
});
async function loadSource(scene,id,level){
 const source=await readRuntimeGltf(new URL(manifest.assets[id].lods.find(l=>l.level===level).model,base));
 for(const b of source.gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(source.files.get(b.uri).data).toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;
 const container=await loader.loadAssetContainerAsync(scene,{json:source.gltf},''),meshes=container.meshes.filter(m=>m.getTotalVertices());
 for(const mesh of meshes){const material=new PBRMaterial(id+'-'+level,scene);material.backFaceCulling=!source.gltf.materials[0].doubleSided;material.twoSidedLighting=!!source.gltf.materials[0].doubleSided;mesh.material=material;}
 return {container,meshes,source};
}
function openEdges(mesh){
 const p=mesh.getVerticesData('position'),indices=mesh.getIndices(),welded=new Map(),ids=[];
 for(let i=0;i<p.length;i+=3){const key=[p[i],p[i+1],p[i+2]].map(v=>Math.round(v*1e5)).join(':');if(!welded.has(key))welded.set(key,welded.size);ids.push(welded.get(key));}
 const edges=new Map();for(let i=0;i<indices.length;i+=3)for(const [a,b]of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]){const u=ids[a],v=ids[b],key=Math.min(u,v)+':'+Math.max(u,v);edges.set(key,(edges.get(key)??0)+1);}return [...edges.values()].filter(v=>v===1).length;
}

test('only reviewed open cave assets retain authored coloured back faces in all three real LODs',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;t.after(()=>engine.dispose());
 let lods=0;
 for(const id of CAVE_OPEN_SURFACE_ASSETS)for(const level of [0,1,2]){
  const {container,meshes,source}=await loadSource(scene,id,level);
  assert.ok(source.gltf.materials.every(m=>m.doubleSided),id+' authored sidedness');
  assert.ok(meshes.reduce((n,m)=>n+openEdges(m),0)>0,id+' actual open topology');
  for(const mesh of meshes){
   const positions=mesh.getVerticesData('position'),indices=mesh.getIndices(),geometry=mesh.geometry,counts=[scene.meshes.length,scene.geometries.length,scene.materials.length,scene.textures.length];
   configureVillageSurfaceCulling(mesh,{cave:true,assetId:id,category:manifest.assets[id].category});
   assert.equal(mesh.material.backFaceCulling,false);assert.equal(mesh.material.twoSidedLighting,true);assert.equal(mesh.material.metadata.villageAuthoredBackFaceCulling,false);
   assert.equal(mesh.geometry,geometry);assert.deepEqual(mesh.getVerticesData('position'),positions);assert.deepEqual(mesh.getIndices(),indices);assert.deepEqual([scene.meshes.length,scene.geometries.length,scene.materials.length,scene.textures.length],counts,'no surface copies, textures or extra passes');
   configureVillageSurfaceCulling(mesh,{cave:false,assetId:id,category:manifest.assets[id].category});assert.equal(mesh.material.backFaceCulling,true,'other maps keep their existing policy');
   configureVillageSurfaceCulling(mesh,{cave:true,assetId:id,category:manifest.assets[id].category});assert.equal(mesh.material.backFaceCulling,false,'map return uses original authored state');
  }
  container.dispose();lods++;
 }
 assert.equal(lods,21);
 // An ID alone must never turn a deliberately one-sided source two-sided.
 const material=new PBRMaterial('one-sided-control',scene);configureVillageSurfaceCulling({material},{cave:true,assetId:'cave-15-resurrection-altar',category:'prop'});assert.equal(material.backFaceCulling,true);
 for(const id of ['cave-01-eroded-wall','cave-06-stalactite-canopy','cave-s01-solid-cliff-base']){const {container,meshes}=await loadSource(scene,id,0);for(const mesh of meshes){configureVillageSurfaceCulling(mesh,{cave:true,assetId:id,category:'rock'});assert.equal(mesh.material.backFaceCulling,true,id+' stays culled');}container.dispose();}
});

test('cold LOD promotion and actual instanced base/ink submission preserve the two-sided material without adding draws',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;engine.getCaps().instancedArrays=true;t.after(()=>engine.dispose());caveFogFallback(scene).getInternalTexture().isReady=true;
 const camera=new ArcRotateCamera('orbit',0,1.18,10,new Vector3(0,1,0),scene),lighting={direction:Vector3.Up(),shadowsActive:false},world={scene,camera,cave:true,lighting,touchDevice:true},asset={tiers:new Map(),baseLevel:Infinity},containers=new Map(),sources=new Set();
 for(const level of [2,1,0]){
  const {container,meshes}=await loadSource(scene,'cave-15-resurrection-altar',level);containers.set(level,container);
  prepareVillageInstancing(meshes);prepareTreeOcclusion(meshes);applyVillageToon(meshes,lighting);
  for(const mesh of meshes){configureVillageSurfaceCulling(mesh,{cave:true,assetId:'cave-15-resurrection-altar',category:'prop'});mesh.metadata={...mesh.metadata,villageLodLevel:level};sources.add(mesh);}
 }
 installVillageGeometry(asset,containers.get(2),2,world);
 const root=new TransformNode('actual-altar',scene),entries=asset.source.instantiateModelsToScene(n=>n+'instance',false,{doNotInstantiate:false});for(const node of entries.rootNodes)node.parent=root;
 const meshes=root.getChildMeshes().filter(m=>m.getTotalVertices()),record={root,meshes,placement:{kind:'prop'},fogVisible:true},stats={},ink=new VillageOutlines(world,[record],stats);t.after(()=>ink.dispose());
 const calls=[];function register(){for(const source of new Set([...sources,...asset.baseMeshes,...[...asset.tiers.values()].flatMap(v=>v.meshes)])){
  ink.sourceFor(source);if(source.__recorded)continue;source.__recorded=true;const original=source._processRendering;source._processRendering=function(mesh,sub,effect,fill,batch,...rest){const instances=batch.visibleInstances[sub._id]??[];if(instances.length){calls.push({ink:ink.drawing,count:instances.length,indices:sub.indexCount,level:source.metadata.villageLodLevel});if(!ink.drawing){assert.equal(source.material.backFaceCulling,false);assert.equal(source.material.stencil.funcRef,4);}}return original.call(this,mesh,sub,effect,fill,batch,...rest);};
 }}
 const seen=new Set();
 for(const level of [2,1,0]){
  if(level!==2)installVillageGeometry(asset,containers.get(level),level,world);register();for(const source of ink.sources)await source.material.forceCompilationAsync(source,{useInstances:true});await ink.prepare();
  for(let frame=0;frame<16;frame++){
   camera.alpha=frame*Math.PI/8;camera.beta=frame%2?1.18:2.0;camera.radius=frame%3?8:17;camera.getViewMatrix(true);ink.next=0;calls.length=0;scene.render();
   const baseCalls=calls.filter(c=>!c.ink),inkCalls=calls.filter(c=>c.ink);assert.equal(baseCalls.length,1,'single actual base batch per frame');assert.equal(inkCalls.length,1,'existing one ink pass remains');assert.equal(baseCalls[0].indices,inkCalls[0].indices,'base and ink use identical selected topology');seen.add(baseCalls[0].level);
  }
 }
 assert.deepEqual([...seen].sort(),[0,1,2]);assert.ok(stats.outlineDraws>=48);
});

test('cave entrance is structural even though its placement kind is landmark; forest fading policy is untouched',()=>{
 assert.equal(caveStructuralRecord({placement:{kind:'landmark'}},{config:{category:'rock'}}),true);
 assert.equal(caveStructuralRecord({placement:{kind:'rock'}},{config:{category:'prop'}}),true);
 assert.equal(caveStructuralRecord({placement:{kind:'prop'}},{config:{category:'prop'}}),false);
 const source=readFileSync(new URL('../src/village-streamed-environment.js',import.meta.url),'utf8');assert.match(source,/world\.cave&&caveStructuralRecord\(r,asset\)/,'only cave excludes the entrance from whole-object tree fading');
});
