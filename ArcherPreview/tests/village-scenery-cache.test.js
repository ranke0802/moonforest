import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,ArcRotateCamera,Vector3,Frustum,Camera} from '@babylonjs/core';
import {groupVillageRecords,sceneryProjection,projectedSceneryCoverage} from '../src/village-scenery-cache.js';
import {projectedCoverage,hasVillageGeometry} from '../src/village-lod.js';
import {VillageGeometryStreaming} from '../src/village-demand.js';
import {sceneryDistanceState,sceneryEnvironmentSnapshot} from '../src/scenery-distance-state.js';

test('asset record index preserves placement order and identity without repeated full-array filtering',()=>{
 const records=Array.from({length:2048},(_,i)=>({placement:{asset:'asset-'+i%16,id:i}})),index=groupVillageRecords(records);
 for(const id of index.keys())assert.deepEqual(index.get(id),records.filter(record=>record.placement.asset===id));
 assert.equal(index.size,16);assert.strictEqual(index.get('asset-0')[1],records[16]);
});

test('shared exact camera projection and mutable sphere coverage match the original formula and frustum',()=>{
 const engine=new NullEngine({renderWidth:832,renderHeight:384}),scene=new Scene(engine),camera=new ArcRotateCamera('projection',.4,.9,13,new Vector3(0,1,0),scene);
 camera.minZ=.05;const world={scene,camera,plains:true,plainsViewDistance:2.4},sphere={centerWorld:new Vector3(2,3,9),radiusWorld:2};
 try{
  for(let i=0;i<24;i++){
   camera.alpha=i*.13;camera.beta=.4+(i%5)*.15;camera.radius=5+i;camera.fov=.5+(i%3)*.1;camera.mode=i%6===0?Camera.ORTHOGRAPHIC_CAMERA:Camera.PERSPECTIVE_CAMERA;
   camera.getViewMatrix(true);camera.getProjectionMatrix(true);
   const view=sceneryProjection(camera),built=view.frustumBuilds;
   assert.deepEqual(view.planes.map(p=>[...p.normal.asArray(),p.d]),Frustum.GetPlanes(camera.getTransformationMatrix()).map(p=>[...p.normal.asArray(),p.d]));
   const before=view.coverageCalculations,old=sphere.centerWorld.clone();
   for(const percent of [100,240,80]){
    world[sceneryDistanceState.owner]={saved:sceneryEnvironmentSnapshot(world),percent,isCurrent:()=>true};
    assert.equal(projectedSceneryCoverage(view,sphere,world),projectedCoverage(camera,sphere,world));
    assert.equal(projectedSceneryCoverage(view,sphere),projectedCoverage(camera,sphere));
    assert.strictEqual(sceneryProjection(camera),view);assert.equal(view.frustumBuilds,built);
   }
   assert.equal(view.coverageCalculations,before+1,'scaled demand/texture and unscaled ink share one base projection');
   sphere.centerWorld.x+=.25;sphere.radiusWorld+=.01;
   assert.equal(projectedSceneryCoverage(view,sphere,world),projectedCoverage(camera,sphere,world));
   sphere.centerWorld.copyFrom(old);
   assert.equal(projectedSceneryCoverage(view,{center:sphere.centerWorld,radius:sphere.radiusWorld},world),projectedCoverage(camera,sphere,world));
  }
 }finally{scene.dispose();engine.dispose();}
});

test('immutable base completion cache notices tier release, model alias edits, failure/retry and asset replacement',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),assets=new Map(),records=Array.from({length:512},(_,i)=>({placement:{asset:'asset-'+i%4}}));
 for(let i=0;i<4;i++)assets.set('asset-'+i,{levels:[0,1,2].map(level=>({level,model:`asset-${i}-${level}`})),tiers:new Map([0,1,2].map(level=>[level,{level}]))});
 let hasCalls=0;const stats={},stream=new VillageGeometryStreaming({scene},records,async()=>{},r=>{hasCalls++;return hasVillageGeometry(assets.get(r.id),r.level);},stats,{recordsByAsset:groupVillageRecords(records),assets});
 try{
  for(let i=0;i<50;i++)assert.equal(stream.allGeometrySettled(),true);
  assert.equal(hasCalls,12);assert.equal(stats.geometrySettledEvaluations,4);assert.equal(stats.geometrySettledCacheHits,196);
  const asset=assets.get('asset-0'),tier=asset.tiers.get(0);asset.tiers.delete(0);
  assert.equal(stream.allGeometrySettled(),false);
  stream.failed.add('asset-0:0');assert.equal(stream.allGeometrySettled(),true);
  stream.failed.clear();assert.equal(stream.allGeometrySettled(),false);
  asset.levels[0].model=asset.levels[1].model;assert.equal(stream.allGeometrySettled(),true,'same-file aliases retain original has() semantics');
  asset.levels[0].model='asset-0-0';assert.equal(stream.allGeometrySettled(),false);
  asset.tiers.set(0,tier);assert.equal(stream.allGeometrySettled(),true);
  assets.set('asset-0',{levels:asset.levels,tiers:new Map()});assert.equal(stream.allGeometrySettled(),false);
  assets.set('asset-0',asset);assert.equal(stream.allGeometrySettled(),true);
  assets.delete('asset-0');assert.equal(stream.allGeometrySettled(),false);assets.set('asset-0',asset);
  assets.set('editor-asset',{levels:[{level:0,model:'new'}],tiers:new Map([[0,{}]])});records.push({placement:{asset:'editor-asset'}});
  assert.equal(stream.allGeometrySettled(),false,'record membership change rebuilds the base index');
  records.pop();records[0].placement.asset='editor-asset';const index=stream.recordsByAsset;stream.demand.indexLength=records.length;stream.invalidateRecords();assert.strictEqual(stream.recordsByAsset,index,'install closure retains the same mutable index owner');assert.equal(stream.demand.indexLength,-1);assert.equal(stream.allGeometrySettled(),false,'explicit same-length edit invalidates the base index');
 }finally{stream.dispose();assert.equal(stream.settledAssets.size,0);scene.dispose();engine.dispose();}
});

test('generic/editor streams preserve immediate unannounced mutation checks',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),records=[{placement:{asset:'a'}}],loaded=new Set(['a:0','a:1','a:2']);
 const stream=new VillageGeometryStreaming({scene},records,async()=>{},r=>loaded.has(r.id+':'+r.level),{});
 try{
  assert.equal(stream.allGeometrySettled(),true);loaded.delete('a:0');assert.equal(stream.allGeometrySettled(),false);
  loaded.add('a:0');records[0].placement.asset='b';assert.equal(stream.allGeometrySettled(),false);
 }finally{stream.dispose();scene.dispose();engine.dispose();}
});
