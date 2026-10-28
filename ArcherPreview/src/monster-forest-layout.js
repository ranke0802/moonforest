import {sampleGroundCurve} from './village-ground-layout.js';
export {FOREST_SPAWN,FOREST_RADIUS} from './map-route.js';

export const FOREST_CLEARINGS=[{x:0,z:42,r:7},{x:0,z:0,r:11},{x:-29,z:16,r:8},{x:29,z:12,r:8},{x:-20,z:-27,r:7},{x:27,z:-34,r:8}];
export const FOREST_CAVE={x:28,z:-43};
export const FOREST_ROUTES=[
  {width:4.8,points:[[0,55],[0,45],[5,32],[3,18],[0,0],[-8,-13],[-20,-27],[-7,-36],[12,-32],[27,-34],[28,-43]]},
  {width:4,points:[[3,30],[-14,28],[-29,16],[-24,5],[0,0],[15,1],[29,12],[36,27],[19,36],[5,32]]},
  {width:3.8,points:[[-29,16],[-39,0],[-32,-14],[-20,-27]]},
  {width:4.2,points:[[29,12],[34,-4],[25,-16],[27,-34]]},
].map(route=>({...route,samples:sampleGroundCurve(route.points,{step:.65})}));

export function forestRoadDistance(x,z){
  let best=Infinity;
  for(const route of FOREST_ROUTES)for(const [px,pz]of route.samples)best=Math.min(best,Math.hypot(x-px,z-pz)-route.width*.5);
  for(const c of FOREST_CLEARINGS)best=Math.min(best,Math.hypot(x-c.x,z-c.z)-c.r);
  return best;
}
const specs=[
  ['forest-01-sickly-oak',128,'tree',.62,3.3],['forest-02-dead-tree',32,'tree',.48,2.6],
  ['tree-02-slender-pine',208,'tree',.48,3.6],['forest-03-fallen-log',18,'prop',1.4,2.6],
  ['rock-01-mossy-boulder',84,'rock',1.3,2.4],['rock-02-jagged-outcrop',58,'rock',1.5,2.9],
  ['forest-05-thorn-bramble',140,'shrub',.85,1.4],['bush',160,'shrub',.7,1.2],
  ['forest-04-poison-fungi',56,'garden',.35,.65],
];
function makePlacements(){
  let seed=281004;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const out=[];
  // Asymmetric clumps leave continuous paths and separate fight-sized clearings.
  const clusters=[[-14,15],[15,21],[-34,-13],[-7,-25],[14,-14],[42,8],[-40,31],[33,39],[-13,49],[16,51],[-39,-38],[10,-49],[44,-29],[46,41],[-49,4]];
  for(const [asset,count,kind,colliderRadius,spacing]of specs){
    let placed=0;
    for(let attempt=0;attempt<20000&&placed<count;attempt++){
      const cluster=clusters[Math.floor(random()*clusters.length)],a=random()*Math.PI*2,r=Math.sqrt(random())*14;
      const outer=kind==='tree'&&placed>count*.7;
      const x=outer?Math.cos(a)*(59+random()*16):cluster[0]+Math.cos(a)*r;
      const z=outer?Math.sin(a)*(59+random()*16):cluster[1]+Math.sin(a)*r;
      const scale=(kind==='tree'?.82:.72)+random()*(kind==='tree'?.39:.5);
      const d=Math.hypot(x,z);if(d>77||d<11||Math.hypot(x-FOREST_CAVE.x,z-FOREST_CAVE.z)<8)continue;
      if(forestRoadDistance(x,z)<(kind==='tree'?2.1:colliderRadius*scale+.65))continue;
      if(out.some(p=>Math.hypot(x-p.x,z-p.z)<Math.max(spacing*.6,p.spacing*.6)+(kind===p.kind?.55:0)))continue;
      out.push({id:`forest-${asset}-${placed++}`,asset,x,z,yaw:random()*Math.PI*2,scale,kind,colliderRadius:colliderRadius*scale,spacing});
    }
    if(placed!==count)throw new Error('Forest placement budget not satisfied: '+asset);
  }
  out.push({id:'witch-cave',asset:'forest-06-witch-cave-mouth',...FOREST_CAVE,yaw:0,scale:1,kind:'landmark',spacing:8});
  for(const [i,[dx,dz,scale]]of [[-5,-1,1.1],[-4,-5,1.25],[0,-6,1.4],[4,-5,1.3],[5,-1,1.15],[0,-9,1.3]].entries())out.push({id:'cave-backdrop-'+i,asset:'rock-02-jagged-outcrop',x:FOREST_CAVE.x+dx,z:FOREST_CAVE.z+dz,yaw:i*.8,scale,kind:'rock',colliderRadius:1.5*scale,spacing:3});
  return out;
}
export const FOREST_PLACEMENTS=makePlacements();
export function forestObstacles(){
  const obstacles=FOREST_PLACEMENTS.filter(p=>p.colliderRadius&&p.kind!=='garden').map(p=>({id:p.id,x:p.x,z:p.z,radius:p.colliderRadius,height:p.kind==='tree'?6:p.kind==='rock'?2.2:1.2}));
  // The arch is open. Solid shoulders and a rear wall form an entrance alcove.
  for(const [dx,dz,w,d]of [[-3,0,2.3,5.5],[3,0,2.3,5.5],[0,-2.7,6,.5]])obstacles.push({id:'cave-rock-'+dx+':'+dz,x:FOREST_CAVE.x+dx,z:FOREST_CAVE.z+dz,shape:'box',halfWidth:w/2,halfDepth:d/2,yaw:0,radius:Math.hypot(w,d)/2,height:5.5});
  return obstacles;
}
