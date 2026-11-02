import {Frustum,Vector3} from '@babylonjs/core';
import {projectedCoverage,villageLodTier,VILLAGE_LOD_COVERAGE} from './village-lod.js';
import {plainsRenderRange} from './plains-view-distance.js';

// The 1000-record cutoff is empirical: local paired tests found no consistent
// benefit for the current village, forest and cave. Overview uses a direct scan.
const DEMAND_INDEX_MIN_RECORDS=1000;

// Enclose the exact demand spheres, not just placement centres. A cell that is
// wholly outside the range/frustum cannot contain an eligible record. Records
// inside candidate cells still go through the original individual checks.
export function createVillageDemandIndex(records){
  const cells=new Map();
  for(let i=0;i<records.length;i++){
    const record=records[i],sphere=record.bounds,c=sphere?.center,r=sphere?.radius;
    if(!c||![c.x,c.y,c.z,r].every(Number.isFinite)||r<0)return null;
    const x=record.placement?.x??c.x,z=record.placement?.z??c.z;
    if(!Number.isFinite(x)||!Number.isFinite(z))return null;
    const key=`${Math.floor(x/16)}:${Math.floor(z/16)}`;
    if(!cells.has(key))cells.set(key,{indices:[],min:new Vector3(Infinity,Infinity,Infinity),max:new Vector3(-Infinity,-Infinity,-Infinity)});
    const cell=cells.get(key);cell.indices.push(i);
    cell.min.minimizeInPlaceFromFloats(c.x-r,c.y-r,c.z-r);
    cell.max.maximizeInPlaceFromFloats(c.x+r,c.y+r,c.z+r);
  }
  for(const cell of cells.values()){
    cell.center=cell.min.add(cell.max).scale(.5);
    const radius=Vector3.Distance(cell.min,cell.max)*.5;
    if(![cell.center.x,cell.center.y,cell.center.z,radius].every(Number.isFinite))return null;
    // Expand slightly for floating-point roundoff at exact culling boundaries.
    cell.radius=radius+1e-6*Math.max(1,radius);
  }
  return {cells:[...cells.values()],length:records.length,flags:new Uint8Array(records.length)};
}
export function villageDemandCandidates(index,camera,target,planes,range){
  const flags=index.flags;flags.fill(0);let count=0;
  if(![camera.x,camera.y,camera.z,target.x,target.y,target.z,range].every(Number.isFinite)||
     planes.some(p=>![p.normal.x,p.normal.y,p.normal.z,p.d].every(Number.isFinite))){flags.fill(1);return {flags,count:index.length};}
  for(const cell of index.cells){
    const {center,radius}=cell;
    if(Vector3.Distance(camera,center)-radius>range+12)continue;
    const close=Vector3.Distance(target,center)-radius<18;
    if(!close&&!planes.every(p=>p.dotCoordinate(center)>=-radius-10))continue;
    for(const i of cell.indices)flags[i]=1;count+=cell.indices.length;
  }
  return {flags,count};
}

export function placementBounds(world,p,config){
  const scale=config.height/config.bounds[1]*p.scale;
  const width=p.length??config.bounds[0]*scale,depth=config.bounds[2]*scale,height=config.height*p.scale;
  const c=Math.abs(Math.cos(p.yaw)),s=Math.abs(Math.sin(p.yaw));
  // Conservative bounds cover irregular Meshy silhouettes and terrain offsets.
  const half=new Vector3((width*c+depth*s)*.55+.35,height*.55+.25,(width*s+depth*c)*.55+.35);
  let foundation=world.terrain.heightAt(p.x,p.z);
  if(['wall','fence'].includes(p.kind)){
    const halfLength=(p.length??p.footprint?.[0]??2)*.5,dx=Math.cos(p.yaw)*halfLength,dz=-Math.sin(p.yaw)*halfLength;
    foundation=Math.min(foundation,world.terrain.heightAt(p.x+dx,p.z+dz),world.terrain.heightAt(p.x-dx,p.z-dz));
  }
  foundation=p.elevation??(p.topElevation!==undefined?p.topElevation-height:foundation);
  const center=new Vector3(p.x,foundation-.025+(p.yOffset??0)+height*.5,p.z);
  return {center,radius:half.length(),min:center.subtract(half),max:center.add(half)};
}

// Demand is spatial, while downloads are deduplicated by asset/tier. A rotated
// camera prefetches a generous rim; nearby 360-degree coverage protects turns.
export function villageDemand(world,records,index=null,stats=null){
  if(!index||index.length!==records.length||world.villageOverview){
    if(stats){stats.demandRecordsTotal=records.length;stats.demandRecordsChecked=records.length;}
    return villageDemandDirect(world,records);
  }
  const camera=world.camera;camera.getViewMatrix();camera.getProjectionMatrix();
  const planes=Frustum.GetPlanes(camera.getTransformationMatrix()),wanted=new Map();
  const range=world.villageOverview?(world.plains?420:260):plainsRenderRange(world).cellCull;
  const target=camera.target??camera.getTarget();
  const candidates=villageDemandCandidates(index,camera.globalPosition,target,planes,range);
  if(stats){stats.demandRecordsTotal=records.length;stats.demandRecordsChecked=candidates.count;}
  // Keep record iteration order for exactly the same priority tie behavior.
  for(let i=0;i<records.length;i++){
    if(!candidates.flags[i])continue;
    const record=records[i];
    if(world.caveFog?.fog.ready&&!world.caveFog.fog.boundsVisible(record.min??record.bounds.min,record.max??record.bounds.max,2))continue;
    const {center,radius}=record.bounds,distance=Vector3.Distance(camera.globalPosition,center)-radius;
    const close=Vector3.Distance(target,center)-radius<18;
    if(distance>range+12||(!close&&!planes.every(p=>p.dotCoordinate(center)>=-radius-10)))continue;
    const coverage=projectedCoverage(camera,{centerWorld:center,radiusWorld:radius}),level=villageLodTier(coverage);
    const request=tier=>{
      const key=record.placement.asset+':'+tier,priority=(close?1000:0)+coverage*100-distance;
      if(!wanted.has(key)||wanted.get(key).priority<priority)wanted.set(key,{id:record.placement.asset,level:tier,priority});
    };
    request(level);
    // Fetch the next finer level before crossing the existing LOD threshold.
    if(level===1&&coverage>VILLAGE_LOD_COVERAGE.mid*.72)request(0);
    if(level===2&&coverage>VILLAGE_LOD_COVERAGE.far*.72)request(1);
  }
  return [...wanted.values()].sort((a,b)=>b.priority-a.priority||a.level-b.level);
}

// The original direct loop remains the low-overhead path for small maps and
// overview cameras. Oracle tests keep it and the indexed loop in lockstep.
function villageDemandDirect(world,records){
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
    const request=tier=>{
      const key=record.placement.asset+':'+tier,priority=(close?1000:0)+coverage*100-distance;
      if(!wanted.has(key)||wanted.get(key).priority<priority)wanted.set(key,{id:record.placement.asset,level:tier,priority});
    };
    request(level);
    if(level===1&&coverage>VILLAGE_LOD_COVERAGE.mid*.72)request(0);
    if(level===2&&coverage>VILLAGE_LOD_COVERAGE.far*.72)request(1);
  }
  return [...wanted.values()].sort((a,b)=>b.priority-a.priority||a.level-b.level);
}

// Placement bounds are immutable for this village instance. A stationary view
// has the same demand even while downloads complete: filter the cached plan
// against the current loaded tiers, without rescanning all 698 placements.
export class VillageDemandCache {
  constructor(world,records,stats={}){
    Object.assign(this,{world,records,stats});this.previous=new Float64Array(29);this.previous.fill(NaN);this.plan=null;
    this.index=null;this.indexLength=-1;
    stats.demandEvaluations=0;stats.demandCacheHits=0;
  }
  invalidate(){this.plan=null;}
  get(){
    const {world,records}=this,camera=world.camera;
    camera.getViewMatrix();camera.getProjectionMatrix();
    const matrix=camera.getTransformationMatrix().m,position=camera.globalPosition,target=camera.target??camera.getTarget();
    const values=[position.x,position.y,position.z,target.x,target.y,target.z,camera.screenArea,camera.minZ,camera.mode,Number(!!world.touchDevice),Number(!!world.villageOverview),records.length,plainsRenderRange(world).cellCull];
    const fogRevision=world.caveFog?.fog.revision??0;
    let changed=!this.plan||this.camera!==camera||this.fogRevision!==fogRevision;this.fogRevision=fogRevision;
    for(let i=0;i<16;i++)if(this.previous[i]!==matrix[i])changed=true;
    for(let i=0;i<values.length;i++)if(this.previous[16+i]!==values[i])changed=true;
    if(!changed){this.stats.demandCacheHits++;return this.plan;}
    this.camera=camera;this.previous.set(matrix);this.previous.set(values,16);
    if(!world.villageOverview&&this.indexLength!==records.length){this.index=records.length>=DEMAND_INDEX_MIN_RECORDS?createVillageDemandIndex(records):null;this.indexLength=records.length;}
    this.stats.demandEvaluations++;return this.plan=villageDemand(world,records,this.index,this.stats);
  }
}

export class VillageGeometryStreaming {
  constructor(world,records,load,has,stats){
    Object.assign(this,{world,records,load,has,stats});this.failed=new Set();this.active=false;this.pending=null;this.next=0;this.disposed=false;
    this.demand=new VillageDemandCache(world,records,stats);
    this.observer=world.scene.onAfterRenderObservable.add(()=>this.update(performance.now()));
  }
  async initial(plan){for(const request of plan)if(!this.has(request))await this.load(request);}
  update(now){
    if(this.disposed||!this.active||this.pending||this.stats.highTexturePending||now<this.next)return;this.next=now+200;
    const request=this.demand.get().find(r=>!this.has(r)&&!this.failed.has(r.id+':'+r.level));
    if(!request)return;
    this.stats.geometryPending=1;
    this.pending=this.load(request).catch(error=>{
      if(this.disposed||error.name==='AbortError')return;
      this.failed.add(request.id+':'+request.level);this.stats.geometryError=String(error.message??error);
      console.warn('Village model stopped; no automatic retry.',request.id,request.level,error);
    }).finally(()=>{this.pending=null;this.stats.geometryPending=0;});
  }
  dispose(){this.disposed=true;this.world.scene.onAfterRenderObservable.remove(this.observer);}
}
