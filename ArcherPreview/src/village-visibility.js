import { Frustum, Vector3 } from '@babylonjs/core';
import { VillageOcclusion } from './village-occlusion.js';
import { villageRenderRange } from './village-policy.js';

export function cellKey(x,z,size=16){return `${Math.floor(x/size)}:${Math.floor(z/size)}`;}

// Coarse CPU rejection complements Babylon's per-instance frustum culling.
// Decisions include each cell's full bounds, never its center alone.
export class VillageVisibility {
  constructor(world,records,{touch=false}={}){
    this.world=world;this.records=records;this.touch=touch;this.cells=new Map();this.timer=0;
    this.camera=new Vector3(Infinity,Infinity,Infinity);this.view=null;
    world.camera.getViewMatrix();world.camera.getProjectionMatrix();
    this.planes=Frustum.GetPlanes(world.camera.getTransformationMatrix());
    this.cast=new Set();this.shadowTimer=0;this.stats={cells:0,activeCells:0,activeInstances:0,shadowCasters:0};
    for(const record of records){
      const key=cellKey(record.placement.x,record.placement.z);
      if(!this.cells.has(key))this.cells.set(key,{records:[],min:new Vector3(Infinity,Infinity,Infinity),max:new Vector3(-Infinity,-Infinity,-Infinity),active:true});
      const cell=this.cells.get(key);cell.records.push(record);
      cell.min.minimizeInPlace(record.min);cell.max.maximizeInPlace(record.max);
    }
    for(const cell of this.cells.values()){
      cell.center=cell.min.add(cell.max).scale(.5);cell.radius=Vector3.Distance(cell.min,cell.max)*.5;
    }
    this.stats.cells=this.cells.size;
    this.occlusion=new VillageOcclusion(world,records,this.stats);
  }
  update(camera,player,dt){
    // getTransformationMatrix only multiplies Babylon's cached matrices. Refresh
    // them after input/follow changes, before making this frame's culling choice.
    this.world.camera.getViewMatrix();this.world.camera.getProjectionMatrix();
    this.occlusion.beforeRender();
    this.timer-=dt;this.shadowTimer-=dt;
    const moved=Vector3.DistanceSquared(this.camera,camera)>1;
    const transform=this.world.camera.getTransformationMatrix();
    const turned=!this.view||transform.m.some((n,i)=>Math.abs(n-this.view[i])>.0001);
    if(this.timer>0&&!moved&&!turned)return;
    this.timer=.16;this.camera.copyFrom(camera);
    this.view=Array.from(transform.m);Frustum.GetPlanesToRef(transform,this.planes);
    let activeCells=0,activeInstances=0;
    for(const cell of this.cells.values()){
      const distance=Vector3.Distance(camera,cell.center)-cell.radius;
      // Generous frustum margin prevents camera motion from revealing empty cells.
      const inFrustum=this.planes.every(p=>p.dotCoordinate(cell.center)>=-cell.radius-5);
      const active=distance<(this.world.villageOverview?260:villageRenderRange(this.touch).cellCull)&&inFrustum;
      if(active!==cell.active){for(const r of cell.records){r.cellActive=active;r.root.setEnabled(active&&!r.occluded);}cell.active=active;}
      if(active){activeCells++;activeInstances+=cell.records.filter(r=>!r.occluded).length;}
    }
    if(this.shadowTimer<=0){
      this.shadowTimer=.35;
      const candidates=this.records.filter(r=>r.root.isEnabled()&&r.placement.kind!=='shrub'&&r.placement.kind!=='garden')
        .map(r=>({r,d:Math.hypot(r.placement.x-player.x,r.placement.z-player.z)}))
        .filter(v=>v.d<(this.touch?13:20)).sort((a,b)=>a.d-b.d).slice(0,this.touch?12:22);
      const next=new Set(candidates.flatMap(({r})=>r.meshes));
      for(const m of this.cast)if(!next.has(m))this.world.shadows.removeShadowCaster(m,false);
      for(const m of next)if(!this.cast.has(m))this.world.shadows.addShadowCaster(m,false);
      this.cast=next;this.stats.shadowCasters=next.size;
    }
    Object.assign(this.stats,{activeCells,activeInstances});
  }
  dispose(){this.occlusion.dispose();for(const m of this.cast)this.world.shadows.removeShadowCaster(m,false);this.cast.clear();}
}
