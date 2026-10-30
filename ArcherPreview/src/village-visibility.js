import { Frustum, Vector3 } from '@babylonjs/core';
import { VillageOcclusion } from './village-occlusion.js';
import { villageRenderRange } from './village-policy.js';
import {selectVillageShadowCasters} from './village-shadow-policy.js';
import {ShadowFadeBudget,shadowFadeAttribute} from './village-shadow-fade.js';
import {caveFogAllowsRecord,caveFogRootEnabled} from './cave-fog-of-war.js';

export function cellKey(x,z,size=16){return `${Math.floor(x/size)}:${Math.floor(z/size)}`;}

// Coarse CPU rejection complements Babylon's per-instance frustum culling.
// Decisions include each cell's full bounds, never its center alone.
export class VillageVisibility {
  constructor(world,records,{touch=false}={}){
    this.world=world;this.records=records;this.touch=touch;this.cells=new Map();this.timer=0;
    this.camera=new Vector3(Infinity,Infinity,Infinity);this.view=null;
    world.camera.getViewMatrix();world.camera.getProjectionMatrix();
    this.planes=Frustum.GetPlanes(world.camera.getTransformationMatrix());
    this.cast=new Set();this.castRecords=new Set();this.shadowTimer=0;this.stats={cells:0,activeCells:0,activeInstances:0,shadowCasters:0};
    this.shadowFade=new ShadowFadeBudget(touch?28:44);
    this.shadowScratch=new Set();
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
    const runtime=this.world.caveFog;
    if(this.fogRuntime!==runtime||this.fogRevision!==runtime?.fog.revision){
      this.fogRuntime=runtime;this.fogRevision=runtime?.fog.revision;
      for(const r of this.records){if(r.fogOwner!==runtime||r.fogRevision!==runtime?.fog.revision){r.fogVisible=caveFogAllowsRecord(runtime?.fog,r);r.fogOwner=runtime;r.fogRevision=runtime?.fog.revision;}if(!r.fogVisible){this.shadowFade.active.delete(r);this.shadowFade.desired.delete(r);}r.root.setEnabled(caveFogRootEnabled(r));}
    }
    // getTransformationMatrix only multiplies Babylon's cached matrices. Refresh
    // them after input/follow changes, before making this frame's culling choice.
    this.world.camera.getViewMatrix();this.world.camera.getProjectionMatrix();
    this.occlusion.beforeRender();
    this.timer-=dt;this.shadowTimer-=dt;
    if(this.world.lighting?.shadowsActive===false)this.shadowFade.clear();
    else if(this.shadowTimer<=0){
      this.shadowTimer=.35;
      this.shadowFade.select(selectVillageShadowCasters(this.records.filter(r=>r.meshes.length&&r.fogVisible!==false),player,this.touch,this.castRecords));
    }
    this.updateShadows(dt);
    const moved=Vector3.DistanceSquared(this.camera,camera)>1;
    const transform=this.world.camera.getTransformationMatrix();
    const turned=!this.view||transform.m.some((n,i)=>Math.abs(n-this.view[i])>.0001);
    if(this.timer>0&&!moved&&!turned)return;
    this.timer=.16;this.camera.copyFrom(camera);
    this.view??=new Float32Array(16);this.view.set(transform.m);Frustum.GetPlanesToRef(transform,this.planes);
    let activeCells=0,activeInstances=0;
    for(const cell of this.cells.values()){
      const distance=Vector3.Distance(camera,cell.center)-cell.radius;
      // Generous frustum margin prevents camera motion from revealing empty cells.
      const inFrustum=this.planes.every(p=>p.dotCoordinate(cell.center)>=-cell.radius-5);
      const active=distance<(this.world.villageOverview?260:villageRenderRange(this.touch).cellCull)&&inFrustum;
      if(active!==cell.active){for(const r of cell.records){r.cellActive=active;r.root.setEnabled(caveFogRootEnabled(r));}cell.active=active;}
      if(active){activeCells++;for(const r of cell.records)if(r.meshes.length&&!r.occluded&&r.fogVisible!==false)activeInstances++;}
    }
    Object.assign(this.stats,{activeCells,activeInstances});
  }
  updateShadows(dt){
    const active=this.shadowFade.update(dt),next=this.shadowScratch;next.clear();let major=0,fading=0;
    for(const r of this.castRecords)if(!active.has(r)){
      r.shadowCaster=false;r.root.setEnabled(caveFogRootEnabled(r));this.castRecords.delete(r);
    }
    for(const [r,fade] of active){
      if(r.fogVisible===false)continue;
      if(!this.castRecords.has(r)){r.shadowCaster=true;r.root.setEnabled(caveFogRootEnabled(r));this.castRecords.add(r);}
      if(['building','tree','tower','landmark'].includes(r.placement.kind))major++;
      if(fade<1)fading++;
      for(const mesh of r.meshes){if(mesh.instancedBuffers)mesh.instancedBuffers[shadowFadeAttribute]=fade;next.add(mesh);}
    }
    for(const m of this.cast)if(!next.has(m))this.world.shadows.removeShadowCaster(m,false);
    for(const m of next)if(!this.cast.has(m))this.world.shadows.addShadowCaster(m,false);
    this.shadowScratch=this.cast;this.cast=next;Object.assign(this.stats,{shadowCasters:next.size,majorShadowCasters:major,fadingShadows:fading});
  }
  dispose(){this.occlusion.dispose();for(const m of this.cast)this.world.shadows.removeShadowCaster(m,false);this.cast.clear();for(const r of this.castRecords)r.shadowCaster=false;this.castRecords.clear();this.shadowFade.clear();}
}
