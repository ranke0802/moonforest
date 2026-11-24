// Fixed village layout data that never needs the placement generator: assets,
// homes, roads, the core placements (with every terrain pad) and collision
// shapes. The generated placements are built ahead of time (scripts/
// build-fixed-layouts.mjs from village-layout.js) and loaded per region
// through fixed-layouts.js, so the game does not regenerate them on start.
import {isSoftVegetation} from './scenery-collision-policy.js';
export const VILLAGE_ASSET_IDS = [
  'house-01-cottage','house-02-tall-home','house-03-workshop','house-04-forest-hut',
  'wall-01-straight','wall-02-corner','wall-03-breached','wood-01-palisade',
  'wood-02-cross-barricade','wood-03-plank-gate','tree-01-round-oak','tree-02-slender-pine',
  'rock-01-mossy-boulder','rock-02-jagged-outcrop','chapel','well','watchtower','rail-fence',
  'bush','market-stall','covered-wagon','handcart','garden-bed','firewood','crate-barrel-cluster',
];
export const VILLAGE_SPAWN = Object.freeze({x:0,z:6});
export const VILLAGE_RADIUS = 48;
export const isVillageRoute = (search=globalThis.location?.search??'') => new URLSearchParams(search).get('character')==='warrior-v3';
export const facingCenter=(x,z)=>Math.atan2(-x,-z);
// Measured at player-height sections of the approved models, after target-height
// scaling. Foundations retain their original larger pads; collisions use bodies.
export const COLLIDER_SHAPES={
  'house-01-cottage':{colliderFootprint:[4.62,5.55],colliderOffset:[-.01,.01]},
  'house-02-tall-home':{colliderFootprint:[4.76,3.96],colliderOffset:[-.42,-.06]},
  'house-03-workshop':{colliderFootprint:[5.82,3.21],colliderOffset:[0,-.56]},
  'house-04-forest-hut':{colliderFootprint:[3.69,3.69],colliderOffset:[-.04,.06]},
  chapel:{colliderFootprint:[6.42,7.86],colliderOffset:[0,-.12]},
  well:{colliderRadius:1.35,colliderFootprint:[2.7,2.7],colliderOffset:[.2,0]},
  watchtower:{colliderFootprint:[3,3.8]},
  'rail-fence':{colliderFootprint:[3.8,.38]},
  'market-stall':{colliderFootprint:[3.6,2.7]},
  'covered-wagon':{colliderFootprint:[2.7,5.48],colliderParts:[
    {x:0,z:-.69,footprint:[2.7,4.1]},
    {x:-.01,z:2.03,footprint:[.22,1.4],height:.6},
  ]},
  handcart:{colliderFootprint:[2,3.12],colliderParts:[
    {x:0,z:-.58,footprint:[2,1.95]},
    {x:-.48,z:.95,footprint:[.2,1.2],height:.6},
    {x:.48,z:.95,footprint:[.2,1.2],height:.6},
  ]},
  firewood:{colliderFootprint:[2.22,1.08],colliderHeight:1.2},
  'crate-barrel-cluster':{colliderFootprint:[1.8,1.83],colliderHeight:1.6},
  'wall-01-straight':{colliderFootprint:[4.15,.96]},
  'wall-02-corner':{colliderFootprint:[4.46,4.05],colliderParts:[
    {x:0,z:-1.48,footprint:[4.3,1.05]},
    {x:-1.65,z:0,footprint:[1,3.9]},
  ]},
  'wood-02-cross-barricade':{colliderFootprint:[2.5,.45]},
  'wood-03-plank-gate':{colliderFootprint:[4.29,.62]},
  'tree-01-round-oak':{colliderRadius:1.2,colliderOffset:[.36,-.12]},
  'rock-01-mossy-boulder':{colliderFootprint:[3.4,3.4],colliderRadius:1.7,colliderOffset:[0,.01]},
  'rock-02-jagged-outcrop':{colliderFootprint:[4.4,3.2],colliderOffset:[-.01,.01]},
};
const homes=[
  [-22,-29,0],[-9,-29,1],[4,-29,0],[17,-29,0],
  [-27,-17,2],[-27,-4,0],[-27,9,3],[-27,21,0],
  [28,-23,3],[28,-9,0],[28,5,2],[28,19,0],
  [-19,31,0],[-6,31,3],[7,31,0],[20,31,2],
  [-12,-15,0],[-13,13,2],[13,17,1],[7,-16,3],
];
const homeKeys=VILLAGE_ASSET_IDS.slice(0,4);
export const VILLAGE_HOMES=homes.map(([x,z,type],i)=>({
  id:`home-${String(i+1).padStart(2,'0')}`,asset:homeKeys[type],x,z,yaw:facingCenter(x,z),
  scale:1+(i%3-1)*.035,kind:'building',pad:true,
  footprint:type===1?[5.8,6.6]:type===2?[7.5,6]:[6,6.9],
  ...COLLIDER_SHAPES[homeKeys[type]],
}));
export const VILLAGE_RING_ROAD=[[-20,-23],[20,-23],[20,23],[-20,23],[-20,-23]];
export function homeRoadEnd(p){
  const candidates=[[0,p.z],[p.x,0]];
  for(let i=1;i<VILLAGE_RING_ROAD.length;i++){
    const a=VILLAGE_RING_ROAD[i-1],b=VILLAGE_RING_ROAD[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz)));
    candidates.push([a[0]+dx*t,a[1]+dz*t]);
  }
  return candidates.sort((a,b)=>Math.hypot(p.x-a[0],p.z-a[1])-Math.hypot(p.x-b[0],p.z-b[1]))[0];
}
const HOME_ROAD_SEGMENTS=VILLAGE_HOMES.map(p=>[[p.x,p.z],homeRoadEnd(p)]);

// The fixed start of the layout, in placement order (IDs count from it):
// homes, chapel, well, stalls, wagon, cart and the two watchtowers. Every
// terrain pad is here, so village and plains terrain need no generated data.
export function villageCorePlacements(){
  const out=[...VILLAGE_HOMES];
  const add=(asset,x,z,yaw=0,extra={})=>out.push({id:`${asset}-${out.length}`,asset,x,z,yaw,scale:1,...extra,...COLLIDER_SHAPES[asset]});
  add('chapel',12,-6,-Math.PI/2,{kind:'building',pad:true,footprint:[8.8,10]});
  add('well',0,0,0,{kind:'landmark',footprint:[2.8,2.8],pad:true});
  add('market-stall',-6,-5,facingCenter(-6,-5),{kind:'prop',footprint:[3.6,2.5]});
  add('market-stall',-7,4,facingCenter(-7,4),{kind:'prop',footprint:[3.6,2.5]});
  add('covered-wagon',12,36,-Math.PI/2,{kind:'prop',footprint:[2.7,5]});
  add('handcart',-8,37,1.4,{kind:'prop',footprint:[1.6,2.7]});
  add('watchtower',31,31,facingCenter(31,31),{kind:'tower',footprint:[3.8,3.8],pad:true});
  add('watchtower',37,18,facingCenter(37,18),{kind:'tower',footprint:[3.8,3.8],pad:true});
  return out;
}
export const VILLAGE_PADS=villageCorePlacements().filter(p=>p.pad).map(p=>({...p,radius:Math.hypot(...p.footprint)*.56}));

export function villageObstacles(placements,{refinedTrees=true}={}){
  const obstacles=[];
  for(const p of placements){
    if(p.decorative||isSoftVegetation(p))continue;
    const scale=p.scale??1,cos=Math.cos(p.yaw),sin=Math.sin(p.yaw),offset=p.colliderOffset??[0,0];
    const center=(x,z)=>({x:p.x+(x*cos+z*sin)*scale,z:p.z+(-x*sin+z*cos)*scale});
    if(p.kind==='tree'||p.colliderRadius){
      if(p.kind==='tree'&&Math.hypot(p.x,p.z)>=50)continue;
      const treeScale=p.kind==='tree'&&refinedTrees?(p.asset==='tree-01-round-oak'?.55:.8):1;
      obstacles.push({id:p.id,...center(...offset.map(n=>n*treeScale)),radius:(p.colliderRadius??.4)*scale*treeScale,height:p.kind==='tree'?8:p.kind==='rock'?3:1.5});
      continue;
    }
    const footprint=p.colliderFootprint??p.footprint;
    if(!footprint)continue;
    if(!['building','landmark','tower','wall','fence','prop','rock'].includes(p.kind))continue;
    const parts=p.colliderParts??[{x:offset[0],z:offset[1],footprint}];
    for(const [i,part]of parts.entries()){
      const [width,depth]=part.footprint.map(n=>n*scale);
      obstacles.push({id:`${p.id}-${i}`,...center(part.x,part.z),shape:'box',halfWidth:width*.5,halfDepth:depth*.5,yaw:p.yaw+(part.yaw??0),radius:Math.hypot(width,depth)*.5,height:(part.height??p.colliderHeight??(p.kind==='building'?4:1.5))*scale});
    }
  }
  return obstacles;
}

export function pointSegmentDistance(x,z,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
export function villageRoadDistance(x,z){
  let distance=Math.min(Math.abs(x),Math.abs(z));
  for(let i=1;i<VILLAGE_RING_ROAD.length;i++)distance=Math.min(distance,pointSegmentDistance(x,z,VILLAGE_RING_ROAD[i-1],VILLAGE_RING_ROAD[i]));
  for(const [a,b]of HOME_ROAD_SEGMENTS)distance=Math.min(distance,pointSegmentDistance(x,z,a,b));
  return distance;
}
