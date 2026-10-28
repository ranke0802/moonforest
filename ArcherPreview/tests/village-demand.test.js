import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {NullEngine,Scene,ArcRotateCamera,Vector3,MeshBuilder,AssetContainer,StandardMaterial} from '@babylonjs/core';
import {VILLAGE_PLACEMENTS,VILLAGE_SPAWN} from '../src/village-layout.js';
import {placementBounds,villageDemand,VillageGeometryStreaming} from '../src/village-demand.js';
import {installVillageGeometry} from '../src/village-streamed-environment.js';
import {villageLodSources,projectedCoverage,villageLodTier} from '../src/village-lod.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {createVillageTransform} from '../src/village-environment.js';
import {createVillageTerrain} from '../src/village-terrain.js';
const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('village.json',base)));
function fixture(t,touch=false){
 const engine=new NullEngine({renderWidth:touch?900:1280,renderHeight:touch?450:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const camera=new ArcRotateCamera('camera',Math.PI*.38,.88,touch?13:17,new Vector3(VILLAGE_SPAWN.x,1.1,VILLAGE_SPAWN.z),scene);camera.minZ=.05;camera.fov=.65;
 const world={scene,camera,touchDevice:touch,terrain:{heightAt:()=>0}};
 const records=VILLAGE_PLACEMENTS.map(placement=>({placement,bounds:placementBounds(world,placement,manifest.assets[placement.asset])}));
 t.after(()=>engine.dispose());return {world,records};
}
test('real village startup requests a subset of tiers and leaves distant off-camera assets deferred',t=>{
 for(const touch of [false,true]){
  const {world,records}=fixture(t,touch),plan=villageDemand(world,records);
  const paths=items=>new Set(items.flatMap(({id,level})=>villageLodSources(manifest.assets[id],touch).find(l=>l.level===level).resources));
  const all=Object.keys(manifest.assets).flatMap(id=>[0,1,2].map(level=>({id,level}))),bytes=paths=>[...paths].reduce((n,p)=>n+statSync(new URL(p,base)).size,0);
  const before=bytes(paths(all)),after=bytes(paths(plan));assert.ok(plan.length<60);assert.ok(after<before*.8);
  const first=new Set(plan.map(r=>r.id+':'+r.level));world.camera.alpha+=Math.PI;
  assert.ok(villageDemand(world,records).some(r=>!first.has(r.id+':'+r.level)),'turning requests missing resources');
  t.diagnostic(JSON.stringify({touch,initialModels:plan.length,previousModels:75,initialBytes:after,previousBytes:before}));
 }
});
test('streaming loads one tier at a time, waits for activation and never automatically retries a failed tier',async t=>{
 const {world,records}=fixture(t),loaded=new Set(),requests=[],stats={};let finish;
 const stream=new VillageGeometryStreaming(world,records,r=>{requests.push(r);return new Promise(resolve=>{finish=()=>{loaded.add(r.id+':'+r.level);resolve();};});},r=>loaded.has(r.id+':'+r.level),stats);
 t.after(()=>stream.dispose());stream.update(0);assert.equal(requests.length,0);stream.active=true;stream.update(300);stream.update(600);assert.equal(requests.length,1);
 finish();await stream.pending;stream.update(900);assert.equal(requests.length,2);assert.notDeepEqual(requests[0],requests[1]);finish();await stream.pending;
 const next=villageDemand(world,records).find(r=>!loaded.has(r.id+':'+r.level));stream.load=async()=>{throw new Error('503');};stream.update(1200);await stream.pending;
 assert.ok(stream.failed.has(next.id+':'+next.level));let nextRequest;stream.load=async r=>{nextRequest=r;loaded.add(r.id+':'+r.level);};stream.update(1500);await stream.pending;assert.notDeepEqual(nextRequest,next);
});
test('far-to-near promotion retains exact geometry, existing instance identity and native LOD selection',async t=>{
 const {world}=fixture(t),asset={tiers:new Map(),baseLevel:Infinity},containers=[];
 const make=(level,segments)=>{const c=new AssetContainer(world.scene),m=MeshBuilder.CreateSphere('level'+level,{segments},world.scene);m.material=new StandardMaterial('mat'+level,world.scene);c.meshes.push(m);c.materials.push(m.material);c.removeAllFromScene();containers.push(c);return c;};
 const far=make(2,4);installVillageGeometry(asset,far,2,world);
 const copy=asset.source.instantiateModelsToScene(n=>'instance-'+n,false,{doNotInstantiate:false}),instance=copy.rootNodes[0];assert.equal(instance.sourceMesh,asset.baseMeshes[0]);
 const initialGeometry=far.meshes[0].geometry,mid=make(1,8);installVillageGeometry(asset,mid,1,world);
 assert.equal(instance.sourceMesh.geometry,mid.meshes[0].geometry);assert.equal(asset.tiers.get(2).meshes[0].geometry,initialGeometry);
 const near=make(0,16);installVillageGeometry(asset,near,0,world);assert.equal(instance.sourceMesh.geometry,near.meshes[0].geometry);assert.equal(instance.material,near.meshes[0].material);
 assert.equal(copy.rootNodes.length,1);assert.equal(instance.sourceMesh,far.meshes[0]);
 const levels=instance.sourceMesh.getLODLevels();assert.deepEqual(levels.map(l=>l.distanceOrScreenCoverage).sort((a,b)=>a-b),[.035,.22]);
 for(const distance of [.4,3,10]){
  world.camera.radius=distance;world.camera.setTarget(Vector3.Zero());world.camera.getViewMatrix();world.camera.getProjectionMatrix();instance.computeWorldMatrix(true);
  const selected=instance.sourceMesh.getLOD(world.camera,instance.getBoundingInfo().boundingSphere);
  const tier=villageLodTier(projectedCoverage(world.camera,instance.getBoundingInfo().boundingSphere));
  assert.ok(selected.geometry===asset.tiers.get(tier).meshes[0].geometry,'native LOD at '+distance);
 }
 const stats={},ink=new VillageOutlines(world,[],stats),record={meshes:[instance],placement:{kind:'building'},root:instance};ink.addRecords([record]);ink.addRecords([record]);assert.equal(ink.entries.length,1);assert.equal(ink.sources.size,3);ink.dispose();
});
test('real cottage, trees, walls and gate LODs promote complete draw ranges without changing transforms or normals',async t=>{
 const {world}=fixture(t);
 for(const id of ['house-01-cottage','tree-01-round-oak','tree-02-slender-pine','wall-01-straight','wall-02-corner','wall-03-breached','wood-03-plank-gate']){
  const config=manifest.assets[id],asset={tiers:new Map(),baseLevel:Infinity},placement=VILLAGE_PLACEMENTS.find(p=>p.asset===id),record=createVillageTransform(world,placement,config);
  let instances,matrices;
  for(const level of [2,1,0]){
   const {gltf,files}=await readRuntimeGltf(new URL(config.lods[level].model,base));
   for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
   const loader=new GLTFFileLoader();loader.skipMaterials=true;
   const container=await loader.loadAssetContainerAsync(world.scene,{json:gltf},'');
   const meshes=container.meshes.filter(m=>m.getTotalVertices()>0);
   for(const m of meshes)m.material=new StandardMaterial(id+level,world.scene);
   installVillageGeometry(asset,container,level,world);
   if(!instances){const entries=container.instantiateModelsToScene(n=>'real-'+n,false,{doNotInstantiate:false});for(const node of entries.rootNodes)node.parent=record.facing;instances=record.root.getChildMeshes().filter(m=>m.getTotalVertices()>0);matrices=instances.map(m=>Array.from(m.computeWorldMatrix(true).m));}
   assert.equal(instances.length,meshes.length,'no duplicate archived LOD instance');
   for(let i=0;i<instances.length;i++){
    assert.ok(instances[i].sourceMesh.geometry===meshes[i].geometry,'exact geometry at level '+level);
    const ranges=m=>m.subMeshes.map(s=>[s.materialIndex,s.verticesStart,s.verticesCount,s.indexStart,s.indexCount]);
    assert.deepEqual(ranges(instances[i].sourceMesh),ranges(meshes[i]),id+' complete source draw ranges at level '+level);
    assert.deepEqual(ranges(instances[i]),ranges(meshes[i]),id+' complete instance draw ranges at level '+level);
    assert.deepEqual(Array.from(instances[i].getVerticesData('normal')),Array.from(meshes[i].getVerticesData('normal')));
    assert.deepEqual(Array.from(instances[i].computeWorldMatrix(true).m),matrices[i]);
   }
  }
 }
});
test('streaming bounds contain every real near model across all 698 placements, including walls sunken into slopes',async t=>{
 const {world}=fixture(t);world.terrain=createVillageTerrain();let checked=0;
 for(const [id,config]of Object.entries(manifest.assets)){
  const {gltf,files}=await readRuntimeGltf(new URL(config.lods[0].model,base));for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(world.scene,{json:gltf},'');
  for(const placement of VILLAGE_PLACEMENTS.filter(p=>p.asset===id)){
   const {root,facing}=createVillageTransform(world,placement,config),bounds=placementBounds(world,placement,config),copies=container.instantiateModelsToScene(n=>n+'-bounds',false,{doNotInstantiate:false});for(const node of copies.rootNodes)node.parent=facing;
   for(const m of root.getChildMeshes().filter(m=>m.getTotalVertices()>0)){
    m.computeWorldMatrix(true);const box=m.getBoundingInfo().boundingBox;
    for(const axis of ['x','y','z'])assert.ok(box.minimumWorld[axis]>=bounds.min[axis]&&box.maximumWorld[axis]<=bounds.max[axis],placement.id+' '+axis+' bounds must remain conservative');
   }
   checked++;root.dispose();
  }
  container.dispose();loader.dispose();
 }
 assert.equal(checked,VILLAGE_PLACEMENTS.length);
});
