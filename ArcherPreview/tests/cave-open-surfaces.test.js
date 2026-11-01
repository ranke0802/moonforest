import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,ArcRotateCamera,Vector3,PBRMaterial,TransformNode} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {configureVillageSurfaceCulling,CAVE_OPEN_SURFACE_ASSETS,caveStructuralRecord,installVillageGeometry} from '../src/village-streamed-environment.js';
import {prepareVillageInstancing} from '../src/village-instancing.js';
import {prepareTreeOcclusion} from '../src/tree-occlusion.js';
import {applyVillageToon} from '../src/village-toon.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base)));
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
 assert.equal(lods,24);
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
