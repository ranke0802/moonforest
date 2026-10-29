import {Frustum,Vector3} from '@babylonjs/core';
import {projectedCoverage,villageLodTier,VILLAGE_LOD_COVERAGE} from './village-lod.js';
import {villageRenderRange} from './village-policy.js';

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
export function villageDemand(world,records){
  const camera=world.camera;camera.getViewMatrix();camera.getProjectionMatrix();
  const planes=Frustum.GetPlanes(camera.getTransformationMatrix()),wanted=new Map();
  const range=world.villageOverview?260:villageRenderRange(world.touchDevice).cellCull;
  const target=camera.target??camera.getTarget();
  for(const record of records){
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

// Placement bounds are immutable for this village instance. A stationary view
// has the same demand even while downloads complete: filter the cached plan
// against the current loaded tiers, without rescanning all 698 placements.
export class VillageDemandCache {
  constructor(world,records,stats={}){
    Object.assign(this,{world,records,stats});this.previous=new Float64Array(28);this.previous.fill(NaN);this.plan=null;
    stats.demandEvaluations=0;stats.demandCacheHits=0;
  }
  invalidate(){this.plan=null;}
  get(){
    const {world,records}=this,camera=world.camera;
    camera.getViewMatrix();camera.getProjectionMatrix();
    const matrix=camera.getTransformationMatrix().m,position=camera.globalPosition,target=camera.target??camera.getTarget();
    const values=[position.x,position.y,position.z,target.x,target.y,target.z,camera.screenArea,camera.minZ,camera.mode,Number(!!world.touchDevice),Number(!!world.villageOverview),records.length];
    let changed=!this.plan||this.camera!==camera;
    for(let i=0;i<16;i++)if(this.previous[i]!==matrix[i])changed=true;
    for(let i=0;i<12;i++)if(this.previous[16+i]!==values[i])changed=true;
    if(!changed){this.stats.demandCacheHits++;return this.plan;}
    this.camera=camera;this.previous.set(matrix);this.previous.set(values,16);
    this.stats.demandEvaluations++;return this.plan=villageDemand(world,records);
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
