import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,ArcRotateCamera,Vector3,MeshBuilder,AssetContainer,StandardMaterial} from '@babylonjs/core';
import {VILLAGE_PLACEMENTS,VILLAGE_SPAWN} from '../src/village-layout.js';
import {placementBounds,villageDemand,createVillageDemandIndex,VillageDemandCache,VillageGeometryStreaming} from '../src/village-demand.js';
import {installVillageGeometry} from '../src/village-streamed-environment.js';
import {villageLodSources,hasVillageGeometry,projectedCoverage,villageLodTier} from '../src/village-lod.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {createVillageTransform} from '../src/village-environment.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {CameraPitch} from '../src/camera-pitch.js';
import {PLAINS_VISTA_FAR} from '../src/outdoor-vista.js';
import {approvedVillageExteriorVersion} from '../scripts/approved-village-exterior-policy.mjs';
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

test('completed scenery tiers skip camera demand scans but immediately notice removed tiers and changed placements',async t=>{
 const {world,records}=fixture(t),loaded=new Set(),requests=[],stats={};
 for(const record of records)for(const level of [0,1,2])loaded.add(record.placement.asset+':'+level);
 const stream=new VillageGeometryStreaming(world,records,async r=>{requests.push(r);loaded.add(r.id+':'+r.level);},r=>loaded.has(r.id+':'+r.level),stats);
 t.after(()=>stream.dispose());stream.active=true;
 const realDemand=stream.demand.get.bind(stream.demand);let scans=0;
 stream.demand.get=()=>{scans++;return realDemand();};
 for(let i=1;i<=5;i++){world.camera.alpha+=.05;stream.update(i*250);}
 assert.equal(scans,0);assert.equal(stats.geometryCompleteSkips,5);assert.equal(requests.length,0);
 const wanted=villageDemand(world,records)[0];loaded.delete(wanted.id+':'+wanted.level);
 stream.update(1500);await stream.pending;assert.equal(scans,1);assert.deepEqual(requests[0],wanted);
 const oldAsset=records[0].placement.asset;records[0].placement={...records[0].placement,asset:'new-editor-asset'};
 stream.demand.get=()=>{scans++;return [{id:'new-editor-asset',level:0}];};
 stream.update(1750);await stream.pending;assert.equal(requests.at(-1).id,'new-editor-asset');
 records[0].placement={...records[0].placement,asset:oldAsset};
});

test('idle views reuse the exact LOD demand; every camera, projection and policy change invalidates it',t=>{
 const {world,records}=fixture(t,true),stats={},cache=new VillageDemandCache(world,records,stats);
 const plan=cache.get();for(let i=0;i<300;i++)assert.equal(cache.get(),plan);
 assert.equal(stats.demandEvaluations,1);assert.equal(stats.demandCacheHits,300);
 for(const mutate of [
  ()=>world.camera.alpha+=.0001,()=>world.camera.beta+=.1,()=>world.camera.radius-=2,
  ()=>world.camera.setTarget(new Vector3(15,1.1,20)),()=>world.camera.fov=.72,
  ()=>world.camera.minZ=.08,()=>world.touchDevice=false,()=>world.villageOverview=true,
 ]){
  const old=cache.get();mutate();const current=cache.get();assert.notEqual(current,old);
  assert.deepEqual(current,villageDemand(world,records));
 }
 const old=cache.get();cache.invalidate();assert.notEqual(cache.get(),old);
});

test('identical prefab LOD files prepare one container across tier changes; distinct models still load',async t=>{
 const {world}=fixture(t),config=JSON.parse(readFileSync(new URL('great-plains.json',base))).assets['village-approach'];
 assert.equal(new Set(config.lods.map(l=>l.model)).size,1);
 for(const order of [[2,1,0],[0,1,2],[1,0,2]]){
  const asset={levels:villageLodSources(config,true),tiers:new Map(),baseLevel:Infinity};let loads=0;
  const stream=new VillageGeometryStreaming(world,[],async r=>{
   loads++;const c=new AssetContainer(world.scene),m=MeshBuilder.CreateBox('shared-prefab',{size:1},world.scene);
   m.material=new StandardMaterial('prefab-material',world.scene);c.meshes.push(m);c.materials.push(m.material);c.removeAllFromScene();
   installVillageGeometry(asset,c,r.level,world);
  },r=>hasVillageGeometry(asset,r.level),{});
  try{
   for(let cycle=0;cycle<8;cycle++)await stream.initial(order.map(level=>({id:'village-approach',level})));
   assert.equal(loads,1);assert.equal(asset.tiers.size,1);assert.equal(asset.nearSource,asset.source);
   assert.ok(order.every(level=>hasVillageGeometry(asset,level)));
   const changed=order.find(level=>!asset.tiers.has(level));
   asset.levels=asset.levels.map(l=>l.level===changed?{...l,model:'./content/different-texture.gltf'}:l);
   assert.equal(hasVillageGeometry(asset,changed),false,'different material/texture variant must not be skipped');
  }finally{
   stream.dispose();for(const tier of asset.tiers.values())for(const mesh of tier.meshes)if(!mesh.isDisposed())mesh.dispose();asset.source.dispose();
  }
 }
});

test('real plains village exterior stays inside streaming bounds and follows the actual camera and plains distance policy',async t=>{
 const {world}=fixture(t,true),config=JSON.parse(readFileSync(new URL('great-plains.json',base))).assets['village-approach'];
 Object.assign(world,{plains:true,mapId:'great-plains',plainsViewDistance:2.4,terrain:createGreatPlainsTerrain()});world.camera.maxZ=PLAINS_VISTA_FAR;
 const placement=PLAINS_PLACEMENTS.find(p=>p.id==='village-exterior'),record=createVillageTransform(world,placement,config),bounds=placementBounds(world,placement,config);
 const originalBounds=placementBounds(world,placement,{...config,approvedVillageExterior:undefined});
 const {gltf,files}=await readRuntimeGltf(new URL(config.lods[0].model,base));
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;
 const container=await loader.loadAssetContainerAsync(world.scene,{json:gltf},'');
 t.after(()=>{record.root.dispose();container.dispose();loader.dispose();});
 const copies=container.instantiateModelsToScene(n=>n+'-plains-bounds',false,{doNotInstantiate:false});for(const n of copies.rootNodes)n.parent=record.facing;
 let triangles=0;
 for(const m of record.root.getChildMeshes().filter(m=>m.getTotalVertices()>0)){
  m.computeWorldMatrix(true);triangles+=m.getTotalIndices()/3;const box=m.getBoundingInfo().boundingBox;
  for(const axis of ['x','y','z'])assert.ok(box.minimumWorld[axis]>=bounds.min[axis]&&box.maximumWorld[axis]<=bounds.max[axis],'prefab '+axis+' bounds');
 }
 if(config.approvedVillageExterior){
  const raw=readFileSync(new URL(config.lods[0].model,base)),contentHash=createHash('sha256').update(raw).digest('hex');
  assert.equal(approvedVillageExteriorVersion('village-approach',config,{contentHash,triangles}),config.approvedVillageExterior.catalogAssetVersion);
  assert.equal(triangles,44828);assert.ok(bounds.max.y>originalBounds.max.y,'authored high triangle must expand actual demand bounds');
  t.diagnostic(JSON.stringify({scope:'approved exterior bounds; not device performance',previousMaxY:originalBounds.max.y,actualMaxY:bounds.max.y,previousRadius:originalBounds.radius,conservativeRadius:bounds.radius,thresholdsUnchanged:true}));
  for(let mask=0;mask<8;mask++){const point=new Vector3(...['x','y','z'].map((key,i)=>mask&(1<<i)?bounds.max[key]:bounds.min[key]));assert.ok(Vector3.Distance(point,bounds.center)<=bounds.radius,'demand sphere must enclose every actual bounding-box corner');}
  const forged=structuredClone(config);forged.approvedVillageExterior.appliedModelSha256='0'.repeat(64);const rejected=placementBounds(world,placement,forged);
  assert.deepEqual(rejected.min.asArray(),originalBounds.min.asArray());assert.deepEqual(rejected.max.asArray(),originalBounds.max.asArray());assert.equal(rejected.radius,originalBounds.radius);
  for(const variant of [{yaw:0,scale:.75,x:-30,z:10},{yaw:Math.PI/2,scale:1.2,x:20,z:-40},{yaw:1.27,scale:.9,length:60,depth:70,elevation:undefined,topElevation:7}]){
   const altered={...placement,...variant},frame=createVillageTransform(world,altered,config),box=placementBounds(world,altered,config);
   const instance=container.instantiateModelsToScene(n=>n+'-variant-bounds',false,{doNotInstantiate:false});for(const node of instance.rootNodes)node.parent=frame.facing;
   for(const mesh of frame.root.getChildMeshes().filter(m=>m.getTotalVertices()>0)){mesh.computeWorldMatrix(true);const actual=mesh.getBoundingInfo().boundingBox;for(const axis of ['x','y','z'])assert.ok(actual.minimumWorld[axis]>=box.min[axis]-1e-5&&actual.maximumWorld[axis]<=box.max[axis]+1e-5,'approved exterior variant '+axis+' enclosed');}
   frame.root.dispose();
  }
 }else assert.equal(triangles,187522);
 const records=[{placement,bounds}],pitch=new CameraPitch(world.camera,{warrior:true});
 const moveCamera=(x,z,towardTown,beta=.88)=>{
  world.camera.alpha=Math.atan2(placement.z-z,placement.x-x)+(towardTown?Math.PI:0);world.camera.beta=beta;
  // Production follow carries the orbit to the new actor. setTarget(target)
  // alone keeps the old eye position and changes alpha/beta/radius instead.
  pitch.follow(new Vector3(x,world.terrain.heightAt(x,z)+1.28,z),0,{snap:true});world.camera.getViewMatrix(true);world.camera.getProjectionMatrix(true);
  assert.ok(Vector3.Distance(world.camera.globalPosition,world.camera.target)<=13.001,'camera must be beside the tested actor');
 };
 moveCamera(-87,-32,true);assert.ok(villageDemand(world,records).some(r=>r.id===placement.asset),'arrival view must prepare the real exterior');
 moveCamera(65,-72,true,1.35);world.plainsViewDistance=1;assert.equal(villageDemand(world,records).length,0,'forest-side facade stays deferred at the original 100% range');
 world.plainsViewDistance=2.4;assert.ok(villageDemand(world,records).some(r=>r.id===placement.asset),'240% prepares the distant facade when looking toward town');
 moveCamera(65,-72,false,1.35);assert.equal(villageDemand(world,records).length,0,'off-camera forest-side facade stays deferred even at 240%');
});

test('S23-size rotation and movement demand matches the uncached plan, including near trees and LOD boundaries',t=>{
 const {world,records}=fixture(t,true),cache=new VillageDemandCache(world,records);
 for(let i=0;i<96;i++){
  world.camera.alpha=i*Math.PI/24;world.camera.radius=7+(i%16);
  world.camera.setTarget(new Vector3(Math.sin(i*.2)*22,1.1,VILLAGE_SPAWN.z+Math.cos(i*.17)*12));
  const cached=cache.get();assert.deepEqual(cached,villageDemand(world,records));assert.equal(cache.get(),cached);
 }
 assert.equal(cache.stats.demandEvaluations,96);assert.equal(cache.stats.demandCacheHits,96);
});
test('indexed and direct camera demand agree with the approved exterior and 1,000-plus records',t=>{
 const {world,records}=fixture(t,true),config=JSON.parse(readFileSync(new URL('great-plains.json',base))).assets['village-approach'];
 if(!config.approvedVillageExterior)return t.skip('approved exterior not yet applied');
 Object.assign(world,{plains:true,mapId:'great-plains',plainsViewDistance:2.4,terrain:createGreatPlainsTerrain()});world.camera.maxZ=PLAINS_VISTA_FAR;
 const placement=PLAINS_PLACEMENTS.find(p=>p.id==='village-exterior');records.push({placement,bounds:placementBounds(world,placement,config)});
 while(records.length<1024){const sample=records[records.length%VILLAGE_PLACEMENTS.length];records.push({placement:sample.placement,bounds:sample.bounds});}
 const index=createVillageDemandIndex(records);assert.ok(index);
 for(let i=0;i<32;i++){world.camera.alpha=i*Math.PI/16;world.camera.beta=.65+(i%8)*.09;world.camera.radius=8+(i%7);world.camera.setTarget(new Vector3(-87+(i%8)*20,1.2,-72+Math.floor(i/8)*22));assert.deepEqual(villageDemand(world,records,index),villageDemand(world,records),`view ${i}`);}
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
