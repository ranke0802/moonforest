import {VillageNavigation} from './village-navigation.js';
import {obstacleClearance} from './village-collision.js';

// Current approved scale, Rest/Alert/Walk CPU skin envelope plus15cm.
// This is scenery clearance, never a damage volume or player separation radius.
const radii=Object.freeze({fox:1.23,'gray-wolf':1.62,'stylized-wolf':1.66,'wolf-3':1.51,boar:.83,'alpha-wolf':3.61});
export const monsterSceneryRadius=id=>radii[id?.replace(/\.r(?:1|8)$/,'')]??0;
const spaces=new WeakMap();
const spaceMethods={
 get navigation(){return this.navigationRef?.deref();},
 free(p,radius){
  const navigation=this.navigation,visual=this.visual;
  // A zero-length indexed segment avoids free's full-scene radius>1.5 fallback.
  const physical=navigation?.segmentObstacles?navigation.free(p,0)&&navigation.segmentClear(p,p,radius):!navigation?.free||navigation.free(p,radius);
  return physical&&visual.segmentClear(p,p,radius);
 },
 segmentClear(a,b,radius){const navigation=this.navigation;return (!navigation?.segmentClear||navigation.segmentClear(a,b,radius))&&this.visual.segmentClear(a,b,radius);},
 penetration(p,radius){let total=0;for(const source of [this.navigation,this.visual])for(const obstacle of source?.segmentObstacles?.(p,p,radius)??source?.obstacles??[])total+=Math.max(0,radius+.002-obstacleClearance(p,obstacle));return total;},
 travelClear(a,b,radius){
  if(this.segmentClear(a,b,radius))return true;
  // Walk out of a preexisting combat-pose overlap; never teleport a live actor.
  const navigation=this.navigation,before=this.penetration(a,radius);return before>0&&this.penetration(b,radius)<before-1e-5&&(!navigation?.segmentClear||navigation.segmentClear(a,b,0));
 },
};

// One map-owned spatial index, rebuilt only when its navigator/placements change.
// The legacy small rock circles understate some rendered boulders. Conservatively
// include their existing transformed bounds without changing player collision.
export function monsterScenerySpace(world){
 const navigation=world.navigation,records=world.villageRenderRecords,authored=world.authoredPlacementRecords,revision=world.placementRevision??0;
 let cached=spaces.get(world);
 if(cached&&cached.navigation===navigation&&cached.recordsRef?.deref()===records&&cached.authoredRef?.deref()===authored&&cached.revision===revision&&cached.mapId===world.mapId)return cached;
 const obstacles=[];
 if(world.mapId==='great-plains')for(const record of [...records??[],...authored??[]]){
  if(record.authoredSuppressed||record.placement?.kind!=='rock'||record.instance?.collision==='none')continue;
  const min=record.min??record.bounds?.min,max=record.max??record.bounds?.max;
  if(!min||!max||![min.x,min.z,max.x,max.z].every(Number.isFinite))continue;
  const halfWidth=(max.x-min.x)/2,halfDepth=(max.z-min.z)/2;
  obstacles.push({id:'monster-visual-'+record.placement.id,shape:'box',x:(min.x+max.x)/2,z:(min.z+max.z)/2,halfWidth,halfDepth,yaw:0,radius:Math.hypot(halfWidth,halfDepth),height:Math.max(0,(max.y??0)-(min.y??0))});
 }
 const visual=new VillageNavigation(obstacles);
 // Weak identities do not retain disposed scenery roots or an old map's grids.
 cached=Object.assign(Object.create(spaceMethods),{navigationRef:navigation?new WeakRef(navigation):null,recordsRef:records?new WeakRef(records):null,authoredRef:authored?new WeakRef(authored):null,revision,mapId:world.mapId,visual});
 spaces.set(world,cached);return cached;
}

const detours=Object.freeze([0,Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3,Math.PI/2,-Math.PI/2,Math.PI*2/3,-Math.PI*2/3]);
export function monsterSceneryWaypoint(world,from,goal,radius,cache,dt){
 const space=monsterScenerySpace(world),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 if(space.travelClear(from,goal,radius)){cache.point=null;cache.wait=0;return goal;}
 cache.wait=Math.max(0,(cache.wait??0)-dt);
 if(cache.space===space&&cache.point&&distance(from,cache.point)>.2&&space.travelClear(from,cache.point,radius))return cache.point;
 cache.point=null;if(cache.space===space&&cache.wait>0)return from;
 cache.space=space;cache.wait=.5;const yaw=Math.atan2(goal.x-from.x,goal.z-from.z),before=space.penetration(from,radius);let score=Infinity;
 // Bounded local detours reuse the map's solid index. No new world grid/A*,
 // full-scene scan or background timer is built for a wider resting body.
 for(const length of [Math.min(4,radius*2+1),Math.max(.7,radius),.7])for(const turn of detours){
  const p={x:from.x+Math.sin(yaw+turn)*length,z:from.z+Math.cos(yaw+turn)*length};
  if(!space.travelClear(from,p,radius))continue;
  const cost=distance(p,goal)+Math.abs(turn)*.1+(before?space.penetration(p,radius)*100:0);
  if(cost<score){score=cost;cache.point=p;}
 }
 return cache.point??from;
}

// Initial reveal/respawn only. Never relocate a living actor to repair overlap.
export function safeMonsterSceneryHome(world,row,requested,accept=()=>true){
 const radius=monsterSceneryRadius(row.definitionId);
 if(!radius||!row.territory)return accept(requested)?requested:null;
 const space=monsterScenerySpace(world),zone=row.territory;
 const available=p=>Math.hypot(p.x-zone.x,p.z-zone.z)+radius<zone.radius&&space.free(p,radius)&&accept(p);
 if(available(requested))return requested;
 const maximum=Math.min(10,Math.max(0,zone.radius-radius));
 for(let ring=.5;ring<=maximum+1e-6;ring+=.5)for(let i=0;i<16;i++){
  const angle=i*Math.PI/8,p={x:requested.x+Math.cos(angle)*ring,z:requested.z+Math.sin(angle)*ring};
  if(world.navigation?.segmentClear&&!world.navigation.segmentClear(requested,p,0))continue;
  p.y=world.terrain?.heightAt?.(p.x,p.z)??requested.y;
  if(available(p))return p;
 }
 return null;
}
