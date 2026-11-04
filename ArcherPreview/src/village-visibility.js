import { Frustum, Vector3 } from '@babylonjs/core';
import { VillageOcclusion } from './village-occlusion.js';
import { plainsRenderRange } from './plains-view-distance.js';
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
    this.shadowScratch=new Set();this.shadowCandidateFlags=new Uint8Array(records.length);
    this.shadowState=new Map();this.shadowStateReady=false;
    for(const [index,record] of records.entries()){
      const key=cellKey(record.placement.x,record.placement.z);
      if(!this.cells.has(key))this.cells.set(key,{records:[],indices:[],min:new Vector3(Infinity,Infinity,Infinity),max:new Vector3(-Infinity,-Infinity,-Infinity),active:true});
      const cell=this.cells.get(key);cell.records.push(record);cell.indices.push(index);
      cell.min.minimizeInPlace(record.min);cell.max.maximizeInPlace(record.max);
    }
    for(const cell of this.cells.values()){
      cell.center=cell.min.add(cell.max).scale(.5);cell.radius=Vector3.Distance(cell.min,cell.max)*.5;
    }
    this.stats.cells=this.cells.size;
    this.occlusion=new VillageOcclusion(world,records,this.stats);
  }
  shadowCandidates(player){
    const flags=this.shadowCandidateFlags,range=(this.touch?28:36)+3;flags.fill(0);let checked=0;
    for(const cell of this.cells.values()){
      const dx=Math.max(cell.min.x-player.x,0,player.x-cell.max.x),dz=Math.max(cell.min.z-player.z,0,player.z-cell.max.z);
      // Do not test the camera frustum: off-screen cells can cast visible shadows.
      const distance=Math.hypot(dx,dz);
      if(!Number.isFinite(distance)||distance<=range+1e-6){for(const i of cell.indices)flags[i]=1;checked+=cell.indices.length;}
    }
    this.stats.shadowRecordsTotal=this.records.length;this.stats.shadowRecordsChecked=checked;
    return this.records.filter((r,i)=>flags[i]&&r.meshes.length&&r.fogVisible!==false&&r.authoredSuppressed!==true);
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
      this.shadowFade.select(selectVillageShadowCasters(this.shadowCandidates(player),player,this.touch,this.castRecords));
    }
    this.updateShadows(dt);
    const moved=Vector3.DistanceSquared(this.camera,camera)>1;
    const transform=this.world.camera.getTransformationMatrix();
    const turned=!this.view||transform.m.some((n,i)=>Math.abs(n-this.view[i])>.0001);
    if(this.timer>0&&!moved&&!turned)return;
    this.timer=.16;this.camera.copyFrom(camera);
    this.view??=new Float32Array(16);this.view.set(transform.m);Frustum.GetPlanesToRef(transform,this.planes);
    let activeCells=0,activeInstances=0;
    const range=this.world.villageOverview?(this.world.plains?420:260):plainsRenderRange(this.world,this.touch).cellCull;
    for(const cell of this.cells.values()){
      const distance=Vector3.Distance(camera,cell.center)-cell.radius;
      // Generous frustum margin prevents camera motion from revealing empty cells.
      const inFrustum=this.planes.every(p=>p.dotCoordinate(cell.center)>=-cell.radius-5);
      const active=distance<range&&inFrustum;
      if(active!==cell.active){for(const r of cell.records){r.cellActive=active;r.root.setEnabled(caveFogRootEnabled(r));}cell.active=active;}
      if(active){activeCells++;for(const r of cell.records)if(r.meshes.length&&!r.occluded&&r.fogVisible!==false&&r.authoredSuppressed!==true)activeInstances++;}
    }
    Object.assign(this.stats,{activeCells,activeInstances});
  }
  updateShadows(dt){
    const active=this.shadowFade.update(dt);
    // The fade budget still advances every frame. Once it settles, retain the
    // identical caster set instead of rebuilding it and writing every static
    // instance attribute again. Inspect mutable mesh lists/attributes so live
    // placement edits and a late geometry installation are observed immediately.
    const states=this.shadowState;let changed=!this.shadowStateReady||states.size!==active.size;
    for(const [record,fade]of active){
      let state=states.get(record);
      if(!state){state={meshes:[],fade:NaN,fogVisible:null,kind:null};states.set(record,state);changed=true;}
      const visible=record.fogVisible!==false,meshes=record.meshes;
      if(state.fade!==fade||state.fogVisible!==visible||state.kind!==record.placement.kind||state.meshes.length!==meshes.length)changed=true;
      if(visible)for(let i=0;i<meshes.length;i++){
        const mesh=meshes[i];
        if(state.meshes[i]!==mesh||(mesh.instancedBuffers&&mesh.instancedBuffers[shadowFadeAttribute]!==fade))changed=true;
      }
      if(changed){state.meshes.length=meshes.length;for(let i=0;i<meshes.length;i++)state.meshes[i]=meshes[i];}
      state.fade=fade;state.fogVisible=visible;state.kind=record.placement.kind;
    }
    if(states.size!==active.size)for(const record of states.keys())if(!active.has(record))states.delete(record);
    this.shadowStateReady=true;
    if(!changed){this.stats.shadowUpdateSkips=(this.stats.shadowUpdateSkips??0)+1;return;}
    this.stats.shadowUpdates=(this.stats.shadowUpdates??0)+1;
    const next=this.shadowScratch;next.clear();let major=0,fading=0;
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
  dispose(){this.occlusion.dispose();for(const m of this.cast)this.world.shadows.removeShadowCaster(m,false);this.cast.clear();for(const r of this.castRecords)r.shadowCaster=false;this.castRecords.clear();this.shadowFade.clear();this.shadowState.clear();}
}
