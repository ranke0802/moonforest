// Fixed plains layout data that never needs the placement generator: radius,
// lookout, clearings, routes, stream and treasure anchors, plus the distance
// and collision helpers. The generated placements are built ahead of time
// (scripts/build-fixed-layouts.mjs from great-plains-layout.js) and loaded
// only for the plains through fixed-layouts.js.
import {sampleGroundCurve} from './village-ground-layout.js';
import {isSoftVegetation} from './scenery-collision-policy.js';
import {VILLAGE_PLAINS_BOUNDARY as boundary,villageToPlains} from './village-plains-boundary.js';
import {FOREST_EDGE_ROAD,FOREST_EDGE_CLEARINGS} from './plains-forest-edge.js';
import {forestToPlains} from './plains-forest-boundary.js';

// Authored against plains-exterior.png; all landmarks have deliberate locations.
export const PLAINS_RADIUS=106;
export const PLAINS_SPAN=288;
export const PLAINS_SPAWN=Object.freeze({x:-87,z:-32});
export const PLAINS_LOOKOUT=Object.freeze({x:-28,z:-20,height:8,capRadius:9,cliffWidth:3,stretchX:1.1,rampStartX:-61,rampTopX:-37,rampHalfWidth:3,rampShoulder:6});
export const PLAINS_CLEARINGS=[{x:-5,z:25,r:7,y:.3},{x:-26,z:-19,r:6,y:8.1},{x:16,z:72,r:8,y:.25},{x:51,z:-51,r:7,y:.35},{x:-55,z:37,r:9,y:.4},...FOREST_EDGE_CLEARINGS];
const villageGatewaySamples=boundary.villageSamples.map(([x,z])=>{const p=villageToPlains({x,z});return [p.x,p.z];}),villageRoadExtension=[villageGatewaySamples.at(-1),[-79,-30],[-61,-20],[-41,-8],[-23,6],[-5,25]];
const forestApproach=[[-5,25],[10,13],[28,-4],[43,-22],[55,-41],...[[7,78],[11,70],[0,58]].map(([x,z])=>{const p=forestToPlains({x,z});return [p.x,p.z];}),FOREST_EDGE_ROAD[0]];
export const PLAINS_ROUTES=[
 {id:'village-road',width:boundary.roadWidth,gateway:true,points:[...boundary.villageRoad.filter(p=>p[1]>=40).map(([x,z])=>{const p=villageToPlains({x,z});return [p.x,p.z];}),...villageRoadExtension.slice(1)],samples:[...villageGatewaySamples,...sampleGroundCurve(villageRoadExtension,{step:.8}).slice(1)]},
 {id:'forest-road',width:4.8,gateway:true,points:[...forestApproach,...FOREST_EDGE_ROAD.slice(1)],samples:[...sampleGroundCurve(forestApproach,{step:.65}).slice(0,-1),...FOREST_EDGE_ROAD]},
 {id:'royal-road',width:5.1,points:[[-5,25],[1,40],[2,57],[1,77],[-3,107]]},
 {id:'lookout-loop',width:2.8,points:[[-61,-20],[-57,-37],[-41,-43],[-24,-42],[-9,-34],[2,-20],[-1,-7],[-5,25]]},
 {id:'lookout-top',width:2.8,points:[[-61,-20],[-52,-20],[-43,-20],[-35,-20],[-26,-19]]},
 {id:'meadow-loop',width:2.8,points:[[-61,-20],[-64,-2],[-64,18],[-55,37],[-35,42],[-18,35],[-5,25]]},
 {id:'caravan-spur',width:3.5,points:[[2,57],[13,62],[16,72],[8,82],[1,84]]},
 {id:'forest-rest',width:2.5,points:[[49,-32],[48,-44],[51,-51],[59,-50]]},
].map(r=>({...r,samples:r.samples??sampleGroundCurve(r.points,{step:.8})}));
export const PLAINS_STREAM=sampleGroundCurve([[95,-97],[89,-82],[85,-67],[79,-51],[85,-33],[78,-15],[83,3],[75,22],[84,39],[77,57],[66,79],[62,106]],{step:1.4});
// The common quest-prop system owns chest rendering and opening. Keep these
// stable anchors out of scenery instances to avoid drawing each chest twice.
export const PLAINS_TREASURE_ANCHORS=[
 {id:'supply-chest',asset:'chest-common',x:18,z:81,kind:'prop',scale:1,colliderRadius:.6,yaw:Math.PI,lootTier:1},
 {id:'meadow-chest',asset:'chest-common',x:-61.5,z:58.5,kind:'prop',scale:1,colliderRadius:.6,yaw:.7,lootTier:1},
 {id:'lookout-chest',asset:'chest-common',x:-30.2,z:-23.7,kind:'prop',scale:1,colliderRadius:.6,yaw:Math.PI*.6,lootTier:2},
];
export function plainsRoadDistance(x,z){let best=Infinity;for(const r of PLAINS_ROUTES)for(const [px,pz]of r.samples)best=Math.min(best,Math.hypot(x-px,z-pz)-r.width*.5);for(const c of PLAINS_CLEARINGS)best=Math.min(best,Math.hypot(x-c.x,z-c.z)-c.r);return best;}
export function plainsStreamDistance(x,z){let best=Infinity;for(const [px,pz]of PLAINS_STREAM)best=Math.min(best,Math.hypot(x-px,z-pz));return best;}
export function plainsObstacles(placements){
 const out=placements.filter(p=>!isSoftVegetation(p)&&(p.colliderRadius||p.colliderFootprint)).map(p=>{
  // Boundary offsets are physical metres after the original source's refined
  // trunk normalization. Rotate them with the same rigid scene transform.
  const [dx,dz]=p.villageBoundary?p.colliderOffset??[0,0]:[0,0],c=Math.cos(p.yaw),s=Math.sin(p.yaw),x=p.x+c*dx+s*dz,z=p.z-s*dx+c*dz;
  return p.colliderFootprint?{id:p.id,x,z,shape:'box',halfWidth:p.colliderFootprint[0]/2,halfDepth:p.colliderFootprint[1]/2,yaw:p.yaw,radius:Math.hypot(...p.colliderFootprint)/2,height:1.1}:{id:p.id,x,z,radius:p.colliderRadius,height:p.kind==='tree'?8:p.kind==='rock'?2:1.5};
 });
 for(const [i,[x,z]]of PLAINS_STREAM.entries())out.push({id:'river-'+i,x,z,radius:2,height:.1});
 return out;
}
