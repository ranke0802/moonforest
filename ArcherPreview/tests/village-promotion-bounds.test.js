import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {ArcRotateCamera,AssetContainer,Frustum,MeshBuilder,NullEngine,Scene,StandardMaterial,SubMesh,TransformNode,Vector2,Vector3} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {installVillageGeometry,refreshVillagePromotionBounds} from '../src/village-streamed-environment.js';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {FOREST_PLACEMENTS} from '../src/monster-forest-layout.js';
import {CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';

const cases=[['village','tree-01-round-oak',VILLAGE_PLACEMENTS],['great-plains','rock-01-mossy-boulder',PLAINS_PLACEMENTS],['monster-forest','tree-02-slender-pine',FOREST_PLACEMENTS],['witch-cave','cave-01-eroded-wall',CAVE_PLACEMENTS]];
const baseUrl=new URL('../public/assets/',import.meta.url),results=[];
async function containerFor(scene,config,level){
 const {gltf,files}=await readRuntimeGltf(new URL(config.lods[level].model,baseUrl));
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;
 const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 for(const mesh of container.meshes.filter(m=>m.getTotalVertices()>0))mesh.material=new StandardMaterial('test-'+level,scene);
 return {container,loader};
}
const xyz=v=>[v.x,v.y,v.z];
function snapshot(mesh,planes){
 const info=mesh.getBoundingInfo(),box=info.boundingBox,sphere=info.boundingSphere;
 return {minimum:xyz(info.minimum),maximum:xyz(info.maximum),minWorld:xyz(box.minimumWorld),maxWorld:xyz(box.maximumWorld),center:xyz(sphere.centerWorld),radius:sphere.radiusWorld,frustum:mesh.isInFrustum(planes),submeshes:mesh.subMeshes.map(s=>{const b=s.getBoundingInfo();return {range:[s.materialIndex,s.verticesStart,s.verticesCount,s.indexStart,s.indexCount],minimum:xyz(b.minimum),maximum:xyz(b.maximum),minWorld:xyz(b.boundingBox.minimumWorld),maxWorld:xyz(b.boundingBox.maximumWorld)};})};
}

test('four authored LOD promotions match Babylon per-instance bounds, frustum, draw ranges and geometry',async t=>{
 for(const [map,id,placements] of cases){
  const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine),camera=new ArcRotateCamera('view',.9,1,35,new Vector3(0,1,0),scene);scene.activeCamera=camera;camera.maxZ=350;camera.getViewMatrix();camera.getProjectionMatrix();
  const planes=Frustum.GetPlanes(camera.getTransformationMatrix()),config=JSON.parse(readFileSync(new URL(map+'.json',baseUrl))).assets[id];
  const far=await containerFor(scene,config,2),near=await containerFor(scene,config,0),asset={tiers:new Map(),baseLevel:Infinity,levels:config.lods};
  t.after(()=>{for(const m of asset.baseMeshes??[])for(const i of [...m.instances])i.dispose();for(const tier of asset.tiers.values())for(const mesh of tier.meshes)if(!mesh.isDisposed())mesh.dispose();far.container.dispose();near.container.dispose();far.loader.dispose();near.loader.dispose();scene.dispose();engine.dispose();});
  installVillageGeometry(asset,far.container,2,{scene});
  let calls=0;const mesh=asset.baseMeshes[0],oldGeometry=mesh.geometry,oldGet=oldGeometry.getVerticesData;
  oldGeometry.getVerticesData=function(...args){calls++;return oldGet.apply(this,args);};
  const count=Math.min(placements.filter(p=>p.asset===id).length,180),instances=[];
  for(let i=0;i<count;i++){
   const instance=mesh.createInstance('instance-'+i),parent=new TransformNode('parent-'+i,scene);parent.position.set((i%12)*4-24,i%3,Math.floor(i/12)*3-20);parent.rotation.y=i*.04;
   instance.parent=parent;instance.position.set(.2,i%2*.3,-.1);instance.scaling.set(.7+i%5*.1,1+i%4*.1,.8+i%3*.1);instance.rotation.y=i*.13;instance.computeWorldMatrix(true);instance.freezeWorldMatrix();instances.push(instance);
  }
  const initialDataReads=calls;calls=0;
  const nextGeometry=near.container.meshes.find(m=>m.getTotalVertices()>0).geometry,nextGet=nextGeometry.getVerticesData;
  nextGeometry.getVerticesData=function(...args){calls++;return nextGet.apply(this,args);};
  installVillageGeometry(asset,near.container,0,{scene});const optimizedDataReads=calls;
  const current=instances.map(m=>snapshot(m,planes)),oldBounds=instances.map(m=>m.getBoundingInfo());
  calls=0;for(const instance of instances)instance.refreshBoundingInfo();const oracleDataReads=calls;
  assert.deepEqual(instances.map(m=>snapshot(m,planes)),current,map+' exact bounds and visibility');
  assert.equal(new Set(oldBounds).size,count,'each placement owns its bounds');
  assert.equal(new Set(instances.map(m=>m.getBoundingInfo())).size,count);
  assert.ok(instances.every(i=>i.sourceMesh===mesh&&i.isWorldMatrixFrozen));
  assert.ok(mesh.subMeshes.length===1&&mesh.subMeshes[0].IsGlobal,map+' real model uses safe path');
  assert.equal(initialDataReads,0,map+' initial instance creation already reuses source bounds');
  assert.ok(optimizedDataReads<count/2,map+' promotion avoids repeated vertex reads');assert.equal(oracleDataReads,count);
  const durations={optimized:[],original:[]};
  for(let round=0;round<7;round++)for(const name of round%2?['optimized','original']:['original','optimized']){
   const start=performance.now();if(name==='optimized')refreshVillagePromotionBounds(mesh);else for(const instance of instances)instance.refreshBoundingInfo();
   if(round>0)durations[name].push(performance.now()-start);
  }
  const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
  results.push({map,id,instances:count,vertices:mesh.getTotalVertices(),initialDataReads,optimizedDataReads,oracleDataReads,medianMs:{original:median(durations.original),optimized:median(durations.optimized)},exactBoundsAndFrustum:true});
 }
 if(process.env.VILLAGE_PROMOTION_AUDIT){mkdirSync(process.env.VILLAGE_PROMOTION_AUDIT,{recursive:true});writeFileSync(process.env.VILLAGE_PROMOTION_AUDIT+'/promotion-bounds.json',JSON.stringify({scope:'Real 4-map decoded LOD geometry, frozen native instances, NullEngine; CPU timing excludes GPU upload and is not FPS/device timing.',results},null,2));}
});

test('locked, multi-submesh and custom instance paths retain Babylon refresh semantics',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>{scene.dispose();engine.dispose();});
 const base=MeshBuilder.CreateBox('base',{size:4},scene),instance=base.createInstance('custom');let calls=0,original=instance.refreshBoundingInfo.bind(instance);
 instance.refreshBoundingInfo=(...args)=>{calls++;return original(...args);};base.refreshBoundingInfo();refreshVillagePromotionBounds(base);assert.equal(calls,1,'custom hook executes');
 delete instance.refreshBoundingInfo;const locked=instance.getBoundingInfo();locked.isLocked=true;const before=xyz(locked.minimum);base.scaling.setAll(2);refreshVillagePromotionBounds(base);assert.deepEqual(xyz(locked.minimum),before);locked.isLocked=false;
 base.releaseSubMeshes();const n=base.getTotalIndices(),v=base.getTotalVertices();new SubMesh(0,0,v,0,n/2,base);new SubMesh(0,0,v,n/2,n/2,base);base.synchronizeInstances();
 calls=0;instance.refreshBoundingInfo=(...args)=>{calls++;return original(...args);};refreshVillagePromotionBounds(base);assert.equal(calls,1,'multiple submeshes use the SDK path');
});

test('same-scene shared geometry changes refresh independent frozen bounds without touching geometry',t=>{
 const engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('view',.5,1,20,new Vector3(0,0,0),scene);
 t.after(()=>{scene.dispose();engine.dispose();});camera.getViewMatrix();camera.getProjectionMatrix();const planes=Frustum.GetPlanes(camera.getTransformationMatrix());
 const base=MeshBuilder.CreateBox('shared',{width:2,height:3,depth:4,updatable:true},scene),instances=[];
 for(let i=0;i<12;i++){const mesh=base.createInstance('shared-'+i),root=new TransformNode('root-'+i,scene);root.position.set(i-6,.1*i,1-i);root.rotation.y=i*.17;mesh.parent=root;mesh.scaling.set(1+i*.02,.8+i*.03,1.1);mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();instances.push(mesh);}
 const vertices=base.getVerticesData('position').slice();for(let i=0;i<vertices.length;i+=3){vertices[i]=vertices[i]*1.7+.3;vertices[i+1]*=.6;}
 base.updateVerticesData('position',vertices,true);base.refreshBoundingInfo();
 const geometry=base.geometry,indices=base.getIndices().slice();refreshVillagePromotionBounds(base);
 const optimized=instances.map(m=>snapshot(m,planes));assert.equal(new Set(instances.map(m=>m.getBoundingInfo())).size,instances.length);
 instances[0].getBoundingInfo().minimum.x=999;assert.notEqual(instances[1].getBoundingInfo().minimum.x,999);assert.notEqual(base.getBoundingInfo().minimum.x,999);
 refreshVillagePromotionBounds(base);for(const m of instances)m.refreshBoundingInfo();
 assert.deepEqual(instances.map(m=>snapshot(m,planes)),optimized);
 assert.equal(base.geometry,geometry);assert.deepEqual(base.getIndices(),indices);assert.deepEqual(base.getVerticesData('position'),vertices);
});

test('global-submesh collision cache, nonzero bounding bias and custom hooks match the SDK',t=>{
 const engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('view',.5,1,20,Vector3.Zero(),scene);
 t.after(()=>{scene.dispose();engine.dispose();});camera.getViewMatrix();camera.getProjectionMatrix();const planes=Frustum.GetPlanes(camera.getTransformationMatrix());
 const base=MeshBuilder.CreateBox('bias',{size:2},scene);base.geometry.boundingBias=new Vector2(.25,.5);base.refreshBoundingInfo();
 const instance=base.createInstance('instance');instance.position.set(3,1,2);instance.computeWorldMatrix(true);instance.freezeWorldMatrix();
 const sub=instance.subMeshes[0];assert.ok(sub.IsGlobal);sub._lastColliderWorldVertices=[new Vector3(1,2,3)];
 refreshVillagePromotionBounds(base);assert.equal(sub._lastColliderWorldVertices,null,'cached collision vertices must be invalidated');
 const optimized=snapshot(instance,planes);sub._lastColliderWorldVertices=[new Vector3(1,2,3)];instance.refreshBoundingInfo();
 assert.equal(sub._lastColliderWorldVertices,null);assert.deepEqual(snapshot(instance,planes),optimized,'nonzero geometry bounding bias is unchanged');
 let calls=0;const refresh=instance._refreshBoundingInfo;
 instance._refreshBoundingInfo=function(...args){calls++;return refresh.apply(this,args);};
 refreshVillagePromotionBounds(base);assert.equal(calls,1,'custom internal refresh uses the full SDK path');delete instance._refreshBoundingInfo;
 let subCalls=0;const subRefresh=sub.refreshBoundingInfo;
 sub.refreshBoundingInfo=function(...args){subCalls++;return subRefresh.apply(this,args);};
 refreshVillagePromotionBounds(base);assert.equal(subCalls,1,'custom submesh refresh uses the full SDK path');
});
