import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {ArcRotateCamera,Frustum,NullEngine,Scene,Vector3} from '@babylonjs/core';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {FOREST_PLACEMENTS} from '../src/monster-forest-layout.js';
import {CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';
import {placementBounds,villageDemand,VillageDemandCache,createVillageDemandIndex,villageDemandCandidates} from '../src/village-demand.js';
import {VillageVisibility} from '../src/village-visibility.js';
import {selectVillageShadowCasters} from '../src/village-shadow-policy.js';
import {projectedCoverage,villageLodTier,VILLAGE_LOD_COVERAGE} from '../src/village-lod.js';
import {plainsRenderRange} from '../src/plains-view-distance.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';

const cases=[
 ['village',VILLAGE_PLACEMENTS,[[0,6],[20,25],[-25,-20]]],
 ['great-plains',PLAINS_PLACEMENTS,[[-87,-32],[-5,25],[-26,-19],[61,-58]]],
 ['monster-forest',FOREST_PLACEMENTS,[[0,45],[0,0],[-29,16],[27,-34]]],
 ['witch-cave',CAVE_PLACEMENTS,[[-42,43],[-35,10],[-25,-24],[29,-30]]],
];
// Frozen unindexed 9ca3561 implementation, independent of the new broad phase.
function originalDemand(world,records){
 const camera=world.camera;camera.getViewMatrix();camera.getProjectionMatrix();
 const planes=Frustum.GetPlanes(camera.getTransformationMatrix()),wanted=new Map();
 const range=world.villageOverview?(world.plains?420:260):plainsRenderRange(world).cellCull;
 const target=camera.target??camera.getTarget();
 for(const record of records){
  if(world.caveFog?.fog.ready&&!world.caveFog.fog.boundsVisible(record.min??record.bounds.min,record.max??record.bounds.max,2))continue;
  const {center,radius}=record.bounds,distance=Vector3.Distance(camera.globalPosition,center)-radius;
  const close=Vector3.Distance(target,center)-radius<18;
  if(distance>range+12||(!close&&!planes.every(p=>p.dotCoordinate(center)>=-radius-10)))continue;
  const coverage=projectedCoverage(camera,{centerWorld:center,radiusWorld:radius}),level=villageLodTier(coverage);
  const request=tier=>{const key=record.placement.asset+':'+tier,priority=(close?1000:0)+coverage*100-distance;if(!wanted.has(key)||wanted.get(key).priority<priority)wanted.set(key,{id:record.placement.asset,level:tier,priority});};
  request(level);if(level===1&&coverage>VILLAGE_LOD_COVERAGE.mid*.72)request(0);if(level===2&&coverage>VILLAGE_LOD_COVERAGE.far*.72)request(1);
 }
 return [...wanted.values()].sort((a,b)=>b.priority-a.priority||a.level-b.level);
}
function makeFixture(map,placements,touch,scale,terrain={heightAt:()=>0}){
 const engine=new NullEngine({renderWidth:touch?900:1280,renderHeight:touch?450:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const camera=new ArcRotateCamera('trajectory',.2,1.05,12,new Vector3(0,1,0),scene);camera.minZ=.05;camera.maxZ=350;camera.fov=.65;
 const manifest=JSON.parse(readFileSync(new URL(`../public/assets/${map}.json`,import.meta.url),'utf8'));
 const world={scene,camera,mapId:map,plains:map==='great-plains',touchDevice:touch,plainsViewDistance:scale,terrain,shadows:{removeShadowCaster(){}}};
 const records=placements.map((placement,i)=>{const bounds=placementBounds(world,placement,manifest.assets[placement.asset]);
  return {placement,bounds,min:bounds.min,max:bounds.max,meshes:i%19? [{}]:[],fogVisible:i%23!==0,cellActive:i%7!==0,root:{isEnabled:()=>i%11!==0,isDisposed:()=>false}};});
 const visibility=new VillageVisibility(world,records,{touch}),stats={},cache=new VillageDemandCache(world,records,stats);
 return {world,records,visibility,stats,cache,dispose(){visibility.dispose();scene.dispose();engine.dispose();}};
}

test('four authored maps preserve exact demand and off-screen shadow selection during movement and turns',t=>{
 const audit=[];
 for(const [map,placements,stops] of cases)for(const touch of [false,true])for(const scale of map==='great-plains'?[1,2]:[1]){
  const f=makeFixture(map,placements,touch,scale),{world,records,visibility,stats,cache}=f;t.after(()=>f.dispose());
  let total=0,demandChecked=0,shadowChecked=0,previous=new Set();
  if(map==='witch-cave')world.caveFog={fog:{ready:true,revision:0,boundsVisible:(min,max)=>max.x>-35&&min.z<38}};
  for(let step=0;step<stops.length*12;step++){
   const [x,z]=stops[Math.floor(step/12)],camera=world.camera,player=new Vector3(x+Math.sin(step)*2,0,z+Math.cos(step)*2);
   camera.alpha=step*Math.PI/6;camera.beta=.65+(step%4)*.16;camera.radius=6+(step%5)*3;camera.setTarget(new Vector3(player.x,1.1,player.z));
   if(world.caveFog){world.caveFog.fog.revision++;world.caveFog.fog.ready=step%3!==0;}
   const expected=originalDemand(world,records),actual=cache.get();assert.deepEqual(actual,expected,`${map} demand step ${step}`);
   const source=records.filter(r=>r.meshes.length&&r.fogVisible!==false);
   const shadowExpected=selectVillageShadowCasters(source,player,touch,previous);
   const shadowActual=selectVillageShadowCasters(visibility.shadowCandidates(player),player,touch,previous);
   assert.deepEqual(shadowActual,shadowExpected,`${map} shadows step ${step}`);previous=new Set(shadowActual);
   total+=records.length;demandChecked+=stats.demandRecordsChecked;shadowChecked+=visibility.stats.shadowRecordsChecked;
  }
  if(records.length>=1000)assert.ok(demandChecked<total,`${map} should reject some demand work`);
  else assert.equal(demandChecked,total,`${map} should use the cheaper direct scan`);
  assert.ok(shadowChecked<total,`${map} should reject some shadow work`);
  audit.push({map,touch,scale,steps:stops.length*12,records:records.length,baselineNarrowChecks:total,demandNarrowCandidates:demandChecked,shadowNarrowCandidates:shadowChecked,demandPolicy:records.length>=1000?'indexed':'direct'});
 }
 if(process.env.VILLAGE_SPATIAL_AUDIT){mkdirSync(process.env.VILLAGE_SPATIAL_AUDIT,{recursive:true});writeFileSync(process.env.VILLAGE_SPATIAL_AUDIT+'/four-map-candidates.json',JSON.stringify({comparison:'exact demand plan and shadow caster order against unindexed functions',scene:'NullEngine; authored placements and manifest bounds, flat terrain surrogate, synthetic cave fog; not real GPU/FPS',countMeaning:'Counts are candidate records passed into expensive narrow checks. A cheap ordered flag pass still visits all records; cell tests and array work are additional. Runtime demand uses direct scan below 1000 records and in overview.',cases:audit},null,2));}
});

test('authored terrain heights preserve demand and shadow selections on all four maps',t=>{
 const terrains=[createVillageTerrain,createGreatPlainsTerrain,createMonsterForestTerrain,createWitchCaveTerrain];
 for(const [index,[map,placements,stops]] of cases.entries()){
  const f=makeFixture(map,placements,true,2,terrains[index]());t.after(()=>f.dispose());
  let previous=new Set();
  for(let step=0;step<stops.length*4;step++){
   const [x,z]=stops[Math.floor(step/4)],player=new Vector3(x,f.world.terrain.heightAt(x,z),z),camera=f.world.camera;
   camera.alpha=step*Math.PI/2;camera.setTarget(player.add(new Vector3(0,1,0)));
   assert.deepEqual(f.cache.get(),originalDemand(f.world,f.records),`${map} terrain demand ${step}`);
   const expected=selectVillageShadowCasters(f.records.filter(r=>r.meshes.length&&r.fogVisible!==false),player,true,previous);
   const actual=selectVillageShadowCasters(f.visibility.shadowCandidates(player),player,true,previous);
   assert.deepEqual(actual,expected,`${map} terrain shadows ${step}`);previous=new Set(actual);
  }
 }
});

test('overview stays on direct scan and builds an index only after returning to normal view',t=>{
 const f=makeFixture('great-plains',PLAINS_PLACEMENTS,false,2);t.after(()=>f.dispose());
 f.world.villageOverview=true;assert.deepEqual(f.cache.get(),villageDemand(f.world,f.records));assert.equal(f.cache.index,null);
 assert.equal(f.stats.demandRecordsChecked,f.records.length);
 f.world.villageOverview=false;assert.deepEqual(f.cache.get(),villageDemand(f.world,f.records));assert.ok(f.cache.index);
 for(const scale of [1,2,1]){f.world.plainsViewDistance=scale;assert.deepEqual(f.cache.get(),villageDemand(f.world,f.records));}
 f.records.push(f.records[0]);assert.deepEqual(f.cache.get(),villageDemand(f.world,f.records));assert.equal(f.cache.index.length,f.records.length);
});

test('invalid spheres fail open and changed record counts rebuild the index',t=>{
 const f=makeFixture('village',VILLAGE_PLACEMENTS.slice(0,4),false,1);t.after(()=>f.dispose());
 const {world,records,cache}=f;assert.ok(createVillageDemandIndex(records));
 const bad={...records[0],bounds:{...records[0].bounds,radius:NaN}};
 assert.equal(createVillageDemandIndex([bad]),null);
 assert.deepEqual(villageDemand(world,[bad],null),villageDemand(world,[bad],createVillageDemandIndex([bad])));
 records.push(records[0]);assert.deepEqual(cache.get(),villageDemand(world,records));assert.equal(cache.index,null);assert.equal(cache.indexLength,records.length);
});

test('broad phase keeps exact range boundaries, large spheres and behind-camera close prefetch',()=>{
 const make=(x,z,r)=>({placement:{x,z},bounds:{center:new Vector3(x,0,z),radius:r}});
 const records=[make(0,95,1),make(0,-19,2),make(0,200,110),make(0,500,1)],index=createVillageDemandIndex(records);
 const forward={normal:new Vector3(0,0,1),d:0,dotCoordinate:p=>p.z};
 const candidates=villageDemandCandidates(index,Vector3.Zero(),Vector3.Zero(),[forward],82);
 assert.deepEqual([...candidates.flags],[1,1,1,0]);
 const invalid=villageDemandCandidates(index,new Vector3(NaN,0,0),Vector3.Zero(),[forward],82);
 assert.deepEqual([...invalid.flags],[1,1,1,1]);
});
