import {Vector3,Matrix,Quaternion} from '@babylonjs/core';
import {villageLodTier,VILLAGE_LOD_COVERAGE} from './village-lod.js';
import {groupVillageRecords,sceneryProjection,projectedSceneryCoverage,sceneryCoverageAt} from './village-scenery-cache.js';
import {plainsRenderRange} from './plains-view-distance.js';
import {sceneryDistanceRange as cinematicSceneryRange,sceneryDistanceScale as cinematicSceneryScale} from './scenery-distance-state.js';

// The 1000-record cutoff is empirical: local paired tests found no consistent
// benefit for the current village, forest and cave. Overview uses a direct scan.
const DEMAND_INDEX_MIN_RECORDS=1000;

// The accepted shell has one authored triangle above the original native
// frame. Bounds are from its immutable glTF POSITION accessor; the normal
// native frame continues to control placement scale and collisions.
const APPROVED_EXTERIOR_MODEL='bc70ff9e9c809de821a746d2d364643ff29043ebbe236a20d5e520c81af94aa6';
const APPROVED_EXTERIOR_MIN=[-38.47310256958008,-0.12774726748466492,-42.48561477661133];
const APPROVED_EXTERIOR_MAX=[39.35612106323242,23.00206184387207,44.41767883300781];

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
  const min=center.subtract(half),max=center.add(half),marker=config.approvedVillageExterior;
  const approved=marker?.revision==='approved-village-exterior-2026-11-09'&&marker.assetId==='village-approach'&&marker.appliedModelSha256===APPROVED_EXTERIOR_MODEL&&p.asset==='village-approach'&&config.lods?.length===3&&config.lods.every(t=>t.model===`./content/${APPROVED_EXTERIOR_MODEL}.gltf`)&&config.mobileNear?.model===`./content/${APPROVED_EXTERIOR_MODEL}.gltf`;
  if(!approved)return {center,radius:half.length(),min,max};
  // Match createVillageTransform's root scale/anchor and facing rotation.
  // This runs once per exterior placement, before its first stream demand.
  const scaleX=p.length?p.length/config.bounds[0]:scale,scaleZ=p.depth?p.depth/config.bounds[2]:scale;
  const root=Matrix.Compose(new Vector3(scaleX,scale,scaleZ),Quaternion.RotationYawPitchRoll(p.yaw,0,0),new Vector3(p.x,foundation-.025+(p.yOffset??0),p.z));
  const matrix=Matrix.RotationY(config.frontYawOffset??0).multiply(root);
  for(let mask=0;mask<8;mask++){
    const local=new Vector3(...APPROVED_EXTERIOR_MIN.map((v,i)=>mask&(1<<i)?APPROVED_EXTERIOR_MAX[i]:v));
    const point=Vector3.TransformCoordinates(local,matrix);min.minimizeInPlace(point);max.maximizeInPlace(point);
  }
  const axis=['x','y','z'].map(key=>Math.max(Math.abs(min[key]-center[key]),Math.abs(max[key]-center[key])));
  return {center,radius:Math.hypot(...axis)+1e-6,min,max};
}

// Demand is spatial, while downloads are deduplicated by asset/tier. A rotated
// camera prefetches a generous rim; nearby 360-degree coverage protects turns.
export function villageDemand(world,records,index=null,stats=null){
  if(!index||index.length!==records.length||world.villageOverview){
    if(stats){stats.demandRecordsTotal=records.length;stats.demandRecordsChecked=records.length;}
    return villageDemandDirect(world,records);
  }
  const camera=world.camera;camera.getViewMatrix();camera.getProjectionMatrix();
  const projection=sceneryProjection(camera),planes=projection.planes,wanted=new Map();
  const range=cinematicSceneryRange(world)?.cellCull??(world.villageOverview?(world.plains?420:260):plainsRenderRange(world).cellCull);
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
    const coverage=projectedSceneryCoverage(projection,record.bounds,world),level=villageLodTier(coverage);
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
  const projection=sceneryProjection(camera),planes=projection.planes,wanted=new Map();
  const range=cinematicSceneryRange(world)?.cellCull??(world.villageOverview?(world.plains?420:260):plainsRenderRange(world).cellCull);
  const target=camera.target??camera.getTarget();
  for(const record of records){
    if(world.caveFog?.fog.ready&&!world.caveFog.fog.boundsVisible(record.min??record.bounds.min,record.max??record.bounds.max,2))continue;
    const {center,radius}=record.bounds,distance=Vector3.Distance(camera.globalPosition,center)-radius;
    const close=Vector3.Distance(target,center)-radius<18;
    if(distance>range+12||(!close&&!planes.every(p=>p.dotCoordinate(center)>=-radius-10)))continue;
    const coverage=projectedSceneryCoverage(projection,record.bounds,world),level=villageLodTier(coverage);
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

// Time-sliced demand (2026-11-19, S23 trace: sceneryDemandMs up to ~16 ms).
// A camera change used to evaluate every candidate record inside one
// after-render callback. A job freezes the camera inputs once (frustum planes,
// position, target, range, coverage view and distance scale), then walks the
// candidate cells and the records in the original order across frames with a
// unit cap and a time cap. Per-record tests, insertion order and the final sort
// are those of villageDemand(), so a finished job equals villageDemand() for
// the frozen camera. Non-candidate records are skipped by a flag read only.
export const DEMAND_SLICE_UNITS=256;
export const DEMAND_SLICE_MS=1.5;
const DEMAND_CLOCK_STRIDE=32;
export class VillageDemandJob {
  constructor(world,records,index,flags){
    const camera=world.camera;camera.getViewMatrix();camera.getProjectionMatrix();
    const view=sceneryProjection(camera),target=camera.target??camera.getTarget();
    this.world=world;this.records=records;this.length=records.length;this.camera=camera;
    this.view={mode:view.mode,minZ:view.minZ,screenArea:view.screenArea,x:view.x,y:view.y,z:view.z};
    this.planes=view.planes.map(p=>p.clone());this.position=camera.globalPosition.clone();this.target=target.clone();
    this.range=cinematicSceneryRange(world)?.cellCull??(world.villageOverview?(world.plains?420:260):plainsRenderRange(world).cellCull);
    this.scale=cinematicSceneryScale(world);this.wanted=new Map();this.result=null;
    this.index=index&&index.length===records.length&&!world.villageOverview?index:null;
    this.all=true;this.cell=0;this.i=0;this.count=records.length;this.phase=1;this.units=0;this.slices=0;
    if(this.index){
      const finite=[this.position.x,this.position.y,this.position.z,this.target.x,this.target.y,this.target.z,this.range].every(Number.isFinite)&&
        this.planes.every(p=>[p.normal.x,p.normal.y,p.normal.z,p.d].every(Number.isFinite));
      // Same fallback as villageDemandCandidates(): non-finite input checks all.
      if(finite){this.all=false;this.flags=flags;flags.fill(0);this.count=0;this.phase=0;}
    }
  }
  visible(center,radius){const planes=this.planes;for(let k=0;k<planes.length;k++)if(!(planes[k].dotCoordinate(center)>=-radius-10))return false;return true;}
  request(record,tier,close,coverage,distance){
    const wanted=this.wanted,key=record.placement.asset+':'+tier,priority=(close?1000:0)+coverage*100-distance;
    if(!wanted.has(key)||wanted.get(key).priority<priority)wanted.set(key,{id:record.placement.asset,level:tier,priority});
  }
  // Returns true when the plan is complete. Always makes progress (>=1 unit).
  step(maxUnits=DEMAND_SLICE_UNITS,milliseconds=DEMAND_SLICE_MS,now=null){
    const started=now?now():0,over=units=>units>=maxUnits||(now&&units>0&&units%DEMAND_CLOCK_STRIDE===0&&now()-started>=milliseconds);
    let units=0;this.slices++;
    if(this.phase===0){
      const cells=this.index.cells,flags=this.flags,range=this.range;
      while(this.cell<cells.length){
        if(over(units))break;
        const cell=cells[this.cell++],{center,radius}=cell;units++;
        if(Vector3.Distance(this.position,center)-radius>range+12)continue;
        const close=Vector3.Distance(this.target,center)-radius<18;
        if(!close&&!this.visible(center,radius))continue;
        for(const i of cell.indices)flags[i]=1;this.count+=cell.indices.length;
      }
      if(this.cell<cells.length){this.units=units;return false;}
      this.phase=1;
    }
    if(this.phase===1){
      const {world,records,flags,all,range,view,scale}=this,length=records.length;
      while(this.i<length){
        if(!all&&!flags[this.i]){this.i++;continue;}
        if(over(units))break;
        const record=records[this.i++];units++;
        if(world.caveFog?.fog.ready&&!world.caveFog.fog.boundsVisible(record.min??record.bounds.min,record.max??record.bounds.max,2))continue;
        const sphere=record.bounds,{center,radius}=sphere,distance=Vector3.Distance(this.position,center)-radius;
        const close=Vector3.Distance(this.target,center)-radius<18;
        if(distance>range+12||(!close&&!this.visible(center,radius)))continue;
        const raw=sceneryCoverageAt(view,sphere.centerWorld??center,sphere.radiusWorld??radius),coverage=scale===1?raw:raw*scale*scale,level=villageLodTier(coverage);
        this.request(record,level,close,coverage,distance);
        if(level===1&&coverage>VILLAGE_LOD_COVERAGE.mid*.72)this.request(record,0,close,coverage,distance);
        if(level===2&&coverage>VILLAGE_LOD_COVERAGE.far*.72)this.request(record,1,close,coverage,distance);
      }
      if(this.i<length){this.units=units;return false;}
      this.phase=2;
      if(over(units)){this.units=units;return false;}
    }
    this.result=[...this.wanted.values()].sort((a,b)=>b.priority-a.priority||a.level-b.level);
    this.wanted=null;this.flags=null;this.phase=3;this.units=units+1;return true;
  }
}

// Placement bounds are immutable for this village instance. A stationary view
// has the same demand even while downloads complete: filter the cached plan
// against the current loaded tiers, without rescanning all 698 placements.
export class VillageDemandCache {
  constructor(world,records,stats={}){
    Object.assign(this,{world,records,stats});this.previous=new Float64Array(30);this.previous.fill(NaN);this.plan=null;
    this.index=null;this.indexLength=-1;this.job=null;this.jobFlags=null;
    stats.demandEvaluations=0;stats.demandCacheHits=0;stats.demandSlices=0;stats.demandSliceMaxUnits=0;stats.demandJobSlicesMax=0;
  }
  invalidate(){this.plan=null;this.job=null;}
  // get() evaluates synchronously (original path). get(budget) with
  // {maxUnits,milliseconds,now} returns the plan, or null while a time-sliced
  // evaluation is still running; call again on a later frame to continue.
  get(budget=null){
    const {world,records}=this,camera=world.camera;
    if(this.job){
      const job=this.job,fogRevision=world.caveFog?.fog.revision??0,fogReady=!!world.caveFog?.fog.ready;
      if(!budget||job.camera!==camera||job.records!==records||job.length!==records.length||job.overview!==!!world.villageOverview||job.fogRevision!==fogRevision||job.fogReady!==fogReady)this.job=null;
      else return this.advance(budget);
    }
    camera.getViewMatrix();camera.getProjectionMatrix();
    const matrix=camera.getTransformationMatrix().m,position=camera.globalPosition,target=camera.target??camera.getTarget();
    const values=[position.x,position.y,position.z,target.x,target.y,target.z,camera.screenArea,camera.minZ,camera.mode,Number(!!world.touchDevice),Number(!!world.villageOverview),records.length,plainsRenderRange(world).cellCull,cinematicSceneryScale(world)];
    const fogRevision=world.caveFog?.fog.revision??0;
    let changed=!this.plan||this.camera!==camera||this.fogRevision!==fogRevision;this.fogRevision=fogRevision;
    for(let i=0;i<16;i++)if(this.previous[i]!==matrix[i])changed=true;
    for(let i=0;i<values.length;i++)if(this.previous[16+i]!==values[i])changed=true;
    if(!changed){this.stats.demandCacheHits++;return this.plan;}
    if(!world.villageOverview&&this.indexLength!==records.length){this.index=records.length>=DEMAND_INDEX_MIN_RECORDS?createVillageDemandIndex(records):null;this.indexLength=records.length;}
    this.stats.demandEvaluations++;
    if(budget){
      // Commit the camera key only when the job finishes. A camera that moved
      // meanwhile is seen as a change on the next call and starts a new job.
      if(this.index&&this.jobFlags?.length!==records.length)this.jobFlags=new Uint8Array(records.length);
      const job=this.job=new VillageDemandJob(world,records,this.index,this.jobFlags);
      job.key=new Float64Array(30);job.key.fill(NaN);job.key.set(matrix);job.key.set(values,16);
      job.fogRevision=fogRevision;job.fogReady=!!world.caveFog?.fog.ready;job.overview=!!world.villageOverview;
      if(this.stats){this.stats.demandRecordsTotal=records.length;}
      return this.advance(budget);
    }
    this.camera=camera;this.previous.set(matrix);this.previous.set(values,16);
    return this.plan=villageDemand(world,records,this.index,this.stats);
  }
  advance(budget){
    const job=this.job,done=job.step(budget.maxUnits??DEMAND_SLICE_UNITS,budget.milliseconds??DEMAND_SLICE_MS,budget.now??null),stats=this.stats;
    stats.demandSlices++;if(job.units>stats.demandSliceMaxUnits)stats.demandSliceMaxUnits=job.units;
    if(!done)return null;
    if(job.slices>stats.demandJobSlicesMax)stats.demandJobSlicesMax=job.slices;
    stats.demandRecordsTotal=job.length;stats.demandRecordsChecked=job.count;
    this.job=null;this.camera=job.camera;this.previous.set(job.key);
    return this.plan=job.result;
  }
}

export class VillageGeometryStreaming {
  constructor(world,records,load,has,stats,{recordsByAsset=null,assets=null}={}){
    Object.assign(this,{world,records,load,has,stats});this.failed=new Set();this.active=false;this.pending=null;this.next=0;this.disposed=false;
    this.recordsByAsset=recordsByAsset;this.assets=assets;this.indexedRecords=records;this.indexedLength=records.length;this.settledAssets=new Map();this.settledHas=has;
    stats.geometryCompleteSkips=0;this.demandBudget={maxUnits:DEMAND_SLICE_UNITS,milliseconds:DEMAND_SLICE_MS,now:()=>performance.now()};
    stats.geometrySettledEvaluations=0;stats.geometrySettledCacheHits=0;
    this.demand=new VillageDemandCache(world,records,stats);
    this.observer=world.scene.onAfterRenderObservable.add(()=>{
      const start=world.frameDiagnostics?.mark();
      try{this.update(performance.now());}finally{world.frameDiagnostics?.measure('sceneryGeometryMs',start??null);}
    });
  }
  async initial(plan){for(const request of plan)if(!this.has(request))await this.load(request);}
  invalidateRecords(){
    if(this.recordsByAsset){const grouped=groupVillageRecords(this.records);this.recordsByAsset.clear();for(const [id,records]of grouped)this.recordsByAsset.set(id,records);}
    this.indexedRecords=this.records;this.indexedLength=this.records.length;this.settledAssets.clear();this.demand.invalidate();this.demand.index=null;this.demand.indexLength=-1;
  }
  allGeometrySettled(){
    // Opt in only for the immutable base-placement index. Generic/editor
    // streams retain the original direct checks, including unannounced edits.
    if(this.recordsByAsset&&this.assets){
      if(this.indexedRecords!==this.records||this.indexedLength!==this.records.length)this.invalidateRecords();
      if(this.settledHas!==this.has){this.settledAssets.clear();this.settledHas=this.has;}
      if(!this.records.length)return false;
      for(const id of this.recordsByAsset.keys()){
        if(typeof id!=='string'||!id)return false;
        const asset=this.assets.get(id);if(!asset?.tiers||!asset.levels)return false;
        let model0,model1,model2;
        for(const row of asset.levels){if(row.level===0)model0=row.model;else if(row.level===1)model1=row.model;else if(row.level===2)model2=row.model;}
        const tier0=asset.tiers.get(0),tier1=asset.tiers.get(1),tier2=asset.tiers.get(2),failed=(this.failed.has(id+':0')?1:0)|(this.failed.has(id+':1')?2:0)|(this.failed.has(id+':2')?4:0);
        let cached=this.settledAssets.get(id);
        if(cached&&cached.asset===asset&&cached.tier0===tier0&&cached.tier1===tier1&&cached.tier2===tier2&&cached.model0===model0&&cached.model1===model1&&cached.model2===model2&&cached.failed===failed)this.stats.geometrySettledCacheHits++;
        else{
          let settled=true;
          for(let level=0;level<3;level++){if(failed&(1<<level))continue;try{if(!this.has({id,level})){settled=false;break;}}catch{settled=false;break;}}
          cached={asset,tier0,tier1,tier2,model0,model1,model2,failed,settled};this.settledAssets.set(id,cached);this.stats.geometrySettledEvaluations++;
        }
        if(!cached.settled)return false;
      }
      return this.recordsByAsset.size>0;
    }
    // Every demand request uses one of these three tiers. Only skip the camera
    // scan when *all* assets are already resident or explicitly failed. Check
    // again each time so editor changes, retries and resource release are seen.
    if(!this.records.length)return false;
    const seen=new Set();
    for(const record of this.records){
      const id=record.placement?.asset;if(typeof id!=='string'||!id)return false;
      if(seen.has(id))continue;seen.add(id);
      for(const level of [0,1,2]){
        const request={id,level};
        if(this.failed.has(id+':'+level))continue;
        try{if(!this.has(request))return false;}catch{return false;}
      }
    }
    return seen.size>0;
  }
  update(now){
    // A time-sliced demand job continues on the next frames, ahead of the
    // 200 ms cadence; a new evaluation still starts at most every 200 ms.
    const continuing=!!this.demand.job;
    if(this.disposed||!this.active||this.pending||this.stats.highTexturePending||(!continuing&&now<this.next))return;if(!continuing)this.next=now+200;
    const started=this.world.frameDiagnostics?.mark();let request;
    try{
      if(this.allGeometrySettled()){this.demand.job=null;this.stats.geometryCompleteSkips++;return;}
      const plan=this.demand.get(this.demandBudget);
      request=plan?.find(r=>!this.has(r)&&!this.failed.has(r.id+':'+r.level));
    }finally{this.world.frameDiagnostics?.measure('sceneryDemandMs',started??null);}
    if(!request)return;
    this.stats.geometryPending=1;
    const loadStarted=this.world.frameDiagnostics?.mark();let operation;
    try{operation=this.load(request);}finally{this.world.frameDiagnostics?.measure('sceneryLoadStartMs',loadStarted??null);}
    this.pending=operation.catch(error=>{
      if(this.disposed||error.name==='AbortError')return;
      this.failed.add(request.id+':'+request.level);this.stats.geometryError=String(error.message??error);
      console.warn('Village model stopped; no automatic retry.',request.id,request.level,error);
    }).finally(()=>{this.pending=null;this.stats.geometryPending=0;});
  }
  dispose(){this.disposed=true;this.settledAssets.clear();this.recordsByAsset=null;this.assets=null;this.world.scene.onAfterRenderObservable.remove(this.observer);}
}
