import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ArcRotateCamera,Mesh,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {VillageTextureStreaming} from '../src/village-texture-streaming.js';
import {placementBounds} from '../src/village-demand.js';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {FOREST_PLACEMENTS} from '../src/monster-forest-layout.js';
import {CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';
import {sceneryDistanceState,sceneryEnvironmentSnapshot} from '../src/scenery-distance-state.js';

const cases=[['village',VILLAGE_PLACEMENTS],['great-plains',PLAINS_PLACEMENTS],['monster-forest',FOREST_PLACEMENTS],['witch-cave',CAVE_PLACEMENTS]];
function fixture(t,mapId,placements){
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);engine.getCaps().maxTextureSize=8192;
 const camera=new ArcRotateCamera('texture-demand',.3,1,13,Vector3.Zero(),scene);camera.minZ=.05;camera.getViewMatrix(true);camera.getProjectionMatrix(true);
 const world={scene,camera,mapId,terrain:{heightAt:()=>0},plains:mapId==='great-plains',touchDevice:true,villageStreaming:{active:true,pending:Promise.resolve()}};
 const configs=JSON.parse(readFileSync(new URL('../public/assets/'+mapId+'.json',import.meta.url))).assets;
 const assets=new Map(Object.entries(configs).map(([id,config])=>[id,{config,baseLevel:0,source:{materials:[]}}]));
 const records=placements.map(placement=>{
  const bounds=placementBounds(world,placement,assets.get(placement.asset).config),root=new TransformNode(placement.id,scene),mesh=new Mesh(placement.id+'-bounds',scene);
  mesh.parent=root;mesh.buildBoundingInfo(bounds.min,bounds.max);mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();root.computeWorldMatrix(true);root.freezeWorldMatrix();
  return {placement,root,meshes:[mesh]};
 });
 const direct=new VillageTextureStreaming(world,assets,records,new URL('https://cache.test/assets/'),{}),cached=new VillageTextureStreaming(world,assets,records,new URL('https://cache.test/assets/'),{},{cacheCandidates:true});
 t.after(()=>{direct.dispose();cached.dispose();scene.dispose();engine.dispose();});
 let now=0;const compare=()=>{now+=250;direct.update(now);cached.update(now);assert.deepEqual([...cached.wanted],[...direct.wanted],mapId+' exact candidate order/coverage');};
 return {world,assets,records,direct,cached,compare,scene,camera};
}
test('four-map stationary screening avoids full placement walks without changing candidates; all live invalidation paths retain the direct oracle',t=>{
 for(const [mapId,placements]of cases){
  const f=fixture(t,mapId,placements);for(let i=0;i<50;i++)f.compare();
  assert.equal(f.direct.stats.highTextureScreenEvaluations,50);assert.equal(f.cached.stats.highTextureScreenEvaluations,1);
  assert.equal(f.cached.stats.highTextureScreenCacheHits,49);assert.equal(f.cached.stats.highTextureScreenRecordsChecked,0);
  f.records[0].root.setEnabled(false);f.compare();f.records[0].root.setEnabled(true);f.compare();
  f.camera.alpha+=.2;f.camera.getViewMatrix(true);f.compare();
  const [id,asset]=f.assets.entries().next().value;asset.baseLevel=2;f.compare();asset.baseLevel=0;f.compare();
  f.cached.failed.add(id);f.direct.failed.add(id);f.compare();f.cached.failed.clear();f.direct.failed.clear();f.compare();
  const temporary=new Mesh('late-source',f.scene);f.compare();temporary.dispose();f.compare();
  const owner={saved:sceneryEnvironmentSnapshot(f.world),percent:240,isCurrent:()=>true};f.world[sceneryDistanceState.owner]=owner;f.compare();owner.closed=true;f.compare();
  const evaluations=f.cached.stats.highTextureScreenEvaluations;f.compare();assert.equal(f.cached.stats.highTextureScreenEvaluations,evaluations);
  t.diagnostic(JSON.stringify({mapId,placements:placements.length,stationaryChecks:50,directRecordVisits:placements.length*50,cachedRecordVisits:placements.length,identicalSelection:true}));
 }
});
test('editor/default streams and opted-in custom roots preserve direct mutable checks; observers are released',t=>{
 const f=fixture(t,'village',VILLAGE_PLACEMENTS.slice(0,2)),record=f.records[0];f.compare();
 assert.equal(f.direct.candidateCache,null);
 const native=record.root.isEnabled;record.root.isEnabled=()=>false;
 const stream=new VillageTextureStreaming(f.world,f.assets,f.records,new URL('https://cache.test/assets/'),{},{cacheCandidates:true});
 t.after(()=>stream.dispose());
 stream.update(0);stream.update(250);assert.equal(stream.stats.highTextureScreenEvaluations,2);
 record.root.isEnabled=native;
 const before=record.root.onEffectiveEnabledStateChangedObservable.observers.length;stream.dispose();assert.equal(record.root.onEffectiveEnabledStateChangedObservable.observers.length,before);
 const cache=f.cached.candidateCache;f.cached.dispose();assert.equal(cache.roots.length,0);assert.equal(cache.assets.size,0);
});
