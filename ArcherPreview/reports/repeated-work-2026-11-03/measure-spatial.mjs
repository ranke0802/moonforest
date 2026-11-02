// Reproducible local CPU comparison only. This does not render or measure GPU/FPS.
import {writeFileSync,readFileSync} from 'node:fs';
import {ArcRotateCamera,Frustum,NullEngine,Scene,Vector3} from '@babylonjs/core';
import {VILLAGE_PLACEMENTS} from '../../src/village-layout.js';
import {PLAINS_PLACEMENTS} from '../../src/great-plains-layout.js';
import {FOREST_PLACEMENTS} from '../../src/monster-forest-layout.js';
import {CAVE_PLACEMENTS} from '../../src/witch-cave-layout.js';
import {placementBounds,villageDemand,createVillageDemandIndex} from '../../src/village-demand.js';
import {VillageVisibility} from '../../src/village-visibility.js';
import {selectVillageShadowCasters} from '../../src/village-shadow-policy.js';
import {projectedCoverage,villageLodTier,VILLAGE_LOD_COVERAGE} from '../../src/village-lod.js';
import {plainsRenderRange} from '../../src/plains-view-distance.js';

// Frozen unindexed 9ca3561 demand loop for CPU comparison.
function originalDemand(world,records){
 const camera=world.camera;camera.getViewMatrix();camera.getProjectionMatrix();const planes=Frustum.GetPlanes(camera.getTransformationMatrix()),wanted=new Map();
 const range=world.villageOverview?(world.plains?420:260):plainsRenderRange(world).cellCull,target=camera.target??camera.getTarget();
 for(const record of records){
  if(world.caveFog?.fog.ready&&!world.caveFog.fog.boundsVisible(record.min??record.bounds.min,record.max??record.bounds.max,2))continue;
  const {center,radius}=record.bounds,distance=Vector3.Distance(camera.globalPosition,center)-radius,close=Vector3.Distance(target,center)-radius<18;
  if(distance>range+12||(!close&&!planes.every(p=>p.dotCoordinate(center)>=-radius-10)))continue;
  const coverage=projectedCoverage(camera,{centerWorld:center,radiusWorld:radius}),level=villageLodTier(coverage);
  const request=tier=>{const key=record.placement.asset+':'+tier,priority=(close?1000:0)+coverage*100-distance;if(!wanted.has(key)||wanted.get(key).priority<priority)wanted.set(key,{id:record.placement.asset,level:tier,priority});};
  request(level);if(level===1&&coverage>VILLAGE_LOD_COVERAGE.mid*.72)request(0);if(level===2&&coverage>VILLAGE_LOD_COVERAGE.far*.72)request(1);
 }
 return [...wanted.values()].sort((a,b)=>b.priority-a.priority||a.level-b.level);
}

const scenarios=[
 ['village',VILLAGE_PLACEMENTS,[[0,6],[20,25],[-25,-20]]],
 ['great-plains',PLAINS_PLACEMENTS,[[-87,-32],[-5,25],[-26,-19],[61,-58]]],
 ['monster-forest',FOREST_PLACEMENTS,[[0,45],[0,0],[-29,16],[27,-34]]],
 ['witch-cave',CAVE_PLACEMENTS,[[-42,43],[-35,10],[-25,-24],[29,-30]]],
];
const results=[];
for(const [map,placements,stops] of scenarios)for(const touch of [true,false])for(const scale of map==='great-plains'?[1,2]:[1])for(const overview of map==='great-plains'?[false,true]:[false]){
 const engine=new NullEngine({renderWidth:touch?900:1280,renderHeight:touch?450:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const camera=new ArcRotateCamera('view',.2,1.05,12,new Vector3(0,1,0),scene);camera.minZ=.05;camera.maxZ=350;camera.fov=.65;
 const manifest=JSON.parse(readFileSync(new URL(`../../public/assets/${map}.json`,import.meta.url)));
 const world={scene,camera,mapId:map,plains:map==='great-plains',plainsViewDistance:scale,touchDevice:touch,villageOverview:overview,terrain:{heightAt:()=>0},shadows:{removeShadowCaster(){}}};
 const records=placements.map((placement,i)=>{const bounds=placementBounds(world,placement,manifest.assets[placement.asset]);return {placement,bounds,min:bounds.min,max:bounds.max,meshes:i%19?[{}]:[],fogVisible:i%23!==0,cellActive:i%7!==0,root:{isEnabled:()=>i%11!==0,isDisposed:()=>false}};});
 const index=records.length>=1000&&!overview?createVillageDemandIndex(records):null,visibility=new VillageVisibility(world,records,{touch}),rounds=[];
 for(let round=0;round<3;round++){
  const times={demandBefore:0,demandAfter:0,shadowBefore:0,shadowAfter:0};
  for(let i=0;i<384;i++){
   const [x,z]=stops[Math.floor(i/12)%stops.length],player=new Vector3(x+Math.sin(i)*2,0,z+Math.cos(i)*2);
   camera.alpha=i*Math.PI/6;camera.beta=.65+(i%4)*.16;camera.radius=6+(i%5)*3;camera.setTarget(new Vector3(player.x,1.1,player.z));
   const tasks=[['demandBefore',()=>originalDemand(world,records)],['demandAfter',()=>villageDemand(world,records,index)],['shadowBefore',()=>selectVillageShadowCasters(records.filter(r=>r.meshes.length&&r.fogVisible!==false),player,touch)],['shadowAfter',()=>selectVillageShadowCasters(visibility.shadowCandidates(player),player,touch)]];
   if(i%2)tasks.reverse();
   for(const [key,run] of tasks){const start=performance.now();run();if(i>=64)times[key]+=performance.now()-start;}
  }
  rounds.push(Object.fromEntries(Object.entries(times).map(([key,value])=>[key,+value.toFixed(2)])));
 }
 const median=key=>rounds.map(r=>r[key]).sort((a,b)=>a-b)[1];
 results.push({map,touch,scale,overview,demandPolicy:index?'indexed':'direct',samplesPerRound:320,rounds,medianMs:Object.fromEntries(Object.keys(rounds[0]).map(key=>[key,median(key)]))});
 visibility.dispose();scene.dispose();engine.dispose();
}
writeFileSync(new URL('./four-map-cpu.json',import.meta.url),JSON.stringify({method:'Three 320-sample paired, alternating-order rounds after warmup. Milliseconds are totals per round. Node NullEngine, flat terrain surrogate and synthetic visibility; includes cell, candidate, sorting and policy work. No browser, GPU or FPS measurement; host load/JIT noise applies.',results},null,2));
console.log(JSON.stringify(results.map(({map,touch,scale,overview,demandPolicy,medianMs})=>({map,touch,scale,overview,demandPolicy,...medianMs}))));
