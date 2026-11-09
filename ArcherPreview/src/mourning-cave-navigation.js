import {CaveNavigation} from './witch-cave-navigation.js';
import {mourningCaveClearance} from './mourning-cave-clearance.js';
import {MOURNING_CAVE_CLEARANCE_DATA as data} from './mourning-cave-clearance-data.js';
import {ARENA_RADIUS} from './world-limits.js';
import {runPreparationSync} from './boss-preparation.js';

export const MOURNING_SPAWN_SEARCH_POLICY=Object.freeze({candidateBlock:64,maxBlockCandidates:1024,sliceBudgetMs:.75,cachedOrigins:24});
let candidates,bounds;const orders=new Map();
function spawnCandidates(){
  if(candidates)return candidates;
  const points=[];let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(let r=0;r<data.runs.length;r+=2)for(let i=data.runs[r];i<data.runs[r]+data.runs[r+1];i++){
    const x=data.minX+(i%data.width+.5)*data.step,z=data.minZ+(Math.floor(i/data.width)+.5)*data.step;
    points.push(Object.freeze({x,z}));minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
  }
  bounds=Object.freeze({minX,maxX,minZ,maxZ});return candidates=Object.freeze(points);
}
function nearestOrder(p){
  const points=spawnCandidates(),key=p.x+':'+p.z;let order=orders.get(key);
  if(order){orders.delete(key);orders.set(key,order);return order;}
  const distances=Float64Array.from(points,q=>(q.x-p.x)**2+(q.z-p.z)**2);
  // The original scan chooses the earliest source cell on equal distance.
  order=Uint32Array.from(points.map((_,i)=>i).sort((a,b)=>distances[a]-distances[b]||a-b));orders.set(key,order);
  while(orders.size>MOURNING_SPAWN_SEARCH_POLICY.cachedOrigins)orders.delete(orders.keys().next().value);
  return order;
}
export function inspectMourningSpawnSearch(){return {candidates:spawnCandidates().length,cachedOrigins:orders.size,cachedOriginLimit:MOURNING_SPAWN_SEARCH_POLICY.cachedOrigins,candidateBlock:MOURNING_SPAWN_SEARCH_POLICY.candidateBlock,maxBlockCandidates:MOURNING_SPAWN_SEARCH_POLICY.maxBlockCandidates,sliceBudgetMs:MOURNING_SPAWN_SEARCH_POLICY.sliceBudgetMs};}

// Full-pose environment clearance is independent of the 1.9 m combat core.
// The bake covers rotation, walking, casting, hit reactions and the halo orbit;
// no render geometry, skinning or morph processing runs in collision queries.
export class MourningCaveNavigation extends CaveNavigation {
  clearanceAt(x,z,radius=0){return Math.min(super.clearanceAt(x,z,radius),mourningCaveClearance(x,z)+radius);}
  segmentClear(a,b,radius=0,combat=false){
    if(!super.segmentClear(a,b,radius,combat))return false;
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    if(length<1e-7)return true;
    // Fixed 40 cm samples can jump across a narrow concave corner of the
    // full-pose region even though actual swept movement stops there. Advance
    // only inside each point's certified safe ball; reject costly edge grazes.
    let travelled=0;
    for(let steps=0;steps<160;steps++){
      const t=travelled/length,margin=mourningCaveClearance(a.x+dx*t,a.z+dz*t)-.08;
      if(margin<1e-7)return false;
      if(length-travelled<=margin)return true;
      travelled+=margin*.9;
    }
    return false;
  }
  *findFreeWork(p,radius,limit,occupied){
    const available=q=>this.free(q,radius,limit)&&occupied.every(o=>Math.hypot(q.x-o.x,q.z-o.z)>=radius+(o.radius??radius)+.12);
    if(available(p))return {x:p.x,z:p.z};
    if(!Number.isFinite(p.x)||!Number.isFinite(p.z))throw new Error('비탄의 마녀가 안전하게 등장할 거처 공간이 없습니다.');
    // A summon requested in a narrow cave passage still has a valid destination
    // in the dwelling. Search only baked safe cells, not expanding world rings.
    const points=spawnCandidates(),order=nearestOrder(p);let blockStarted=performance.now(),blockCandidates=0;
    for(let i=0;i<order.length;i++){
      const q=points[order[i]];if(available(q))return {x:q.x,z:q.z};
      // Cheap rejected cells share a slice. Yield only when their measured
      // budget or hard candidate ceiling requires it; do not add a frame for
      // every tiny block when the whole nearest search already fits the budget.
      blockCandidates++;
      if(blockCandidates%MOURNING_SPAWN_SEARCH_POLICY.candidateBlock===0&&(blockCandidates>=MOURNING_SPAWN_SEARCH_POLICY.maxBlockCandidates||performance.now()-blockStarted>=MOURNING_SPAWN_SEARCH_POLICY.sliceBudgetMs)){
        yield;blockStarted=performance.now();blockCandidates=0;
      }
    }
    throw new Error('비탄의 마녀가 안전하게 등장할 거처 공간이 없습니다.');
  }
  findFree(p,radius,limit=ARENA_RADIUS,occupied=[],preparation){
    const work=this.findFreeWork({x:p.x,z:p.z},radius,limit,occupied.map(o=>({x:o.x,z:o.z,radius:o.radius})));
    if(!preparation)return runPreparationSync(work);
    const stats=preparation.stats,startedBlocks=stats?.blocks??0;
    return (async()=>{
      try{return await preparation.run(work);}
      finally{if(stats)stats.placementBlocks=(stats.placementBlocks??0)+(stats.blocks-startedBlocks);}
    })();
  }
  spawnPackingOrigin(){
    spawnCandidates();
    // A deterministic west-to-east packing pass leaves the central player
    // reserve open. The point only orders existing certified candidate cells;
    // it never becomes a spawn, adds a cell or changes collision spacing.
    return {x:bounds.minX-2*(bounds.maxX-bounds.minX),z:bounds.minZ-(bounds.maxZ-bounds.minZ)};
  }
}
