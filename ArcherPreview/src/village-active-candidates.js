import {InstancedMesh,Mesh,Node} from '@babylonjs/core';

const LOD_HOLD_FRAMES=8;
const emptyRoot=mesh=>mesh.isEnabled===Node.prototype.isEnabled&&mesh.isReady===Mesh.prototype.isReady&&mesh.getTotalVertices===Mesh.prototype.getTotalVertices&&
 !mesh.geometry&&!mesh.material&&!mesh.subMeshes?.length&&!mesh.skeleton&&!mesh.morphTargetManager&&!mesh.hasThinInstances&&!mesh.actionManager;

// Only native frozen map instances are registered. Dynamic actors, quest
// props, source meshes and any custom candidate provider retain their order.
export class VillageActiveCandidates {
 constructor(scene,{holdLod=false}={}){
  this.scene=scene;this.previous=scene.getActiveMeshCandidates;this.tracked=new WeakMap();this.disposed=false;
  this.records=new Set();this.disabled=[];this.roots=[];this.dirty=true;this.meshes=null;this.meshCount=-1;
  this.result={data:[],length:0};this.stats={scanned:0,submitted:0,skipped:0,owned:0,registryChecks:0,sceneScans:0,cacheHits:0};
  this.meshAdded=scene.onNewMeshAddedObservable.add(()=>this.invalidate());
  this.meshRemoved=scene.onMeshRemovedObservable.add(()=>this.invalidate());
  this.provider=()=>{
   const list=this.previous.call(scene);
   // An octree/custom filtered list owns its own selection; do not interfere.
   // Multi-camera/FrameGraph paths can revisit a camera within one frame and
   // have different LOD-cache lifetimes, so leave them to the original SDK.
   if(this.disposed)return list;
   this.stats.registryChecks=0;this.stats.sceneScans=0;
   if(list.data!==scene.meshes||list.length!==scene.meshes.length||scene.frameGraph||scene.activeCameras?.length>1){this.stats.scanned=list.length;this.stats.submitted=list.length;this.stats.skipped=0;return list;}
   // Effective-enabled events include ancestor changes and reparenting. Only
   // disabled registered nodes need mutable-behavior guards on a stable frame;
   // enabled nodes and every unregistered source/LOD are always submitted.
   const disabled=this.disabled;this.stats.registryChecks=disabled.length;
   for(let i=0;i<disabled.length;i++){
    const record=disabled[i],mesh=record.mesh;
    // Check native state even after an event: a temporarily overridden method
    // can suppress SDK notifications. Keep unsafe records watched so restoring
    // a native method or removing an attachment takes effect immediately.
    const omit=mesh.isEnabled===Node.prototype.isEnabled&&!mesh.isEnabled()&&mesh.isReady===InstancedMesh.prototype.isReady;
    if(record.omit!==omit){record.omit=omit;this.dirty=true;}
   }
   // An empty map root draws nothing, enabled or not (measured on the plains:
   // 550 of 1,252 candidates and 45 % of the selection time). Every root is
   // checked on every query, so one that gains geometry, a material, a
   // skeleton or an overridden method is submitted again at once.
   const roots=this.roots;this.stats.registryChecks+=roots.length;
   for(let i=0;i<roots.length;i++){const record=roots[i],omit=emptyRoot(record.mesh);if(record.omit!==omit){record.omit=omit;this.dirty=true;}}
   if(this.meshes!==list.data||this.meshCount!==list.length)this.dirty=true;
   if(this.dirty){
    const data=this.result.data;let count=0;
    for(let i=0;i<list.length;i++)if(!this.tracked.get(list.data[i])?.omit)data[count++]=list.data[i];
    data.length=count;this.result.length=count;this.meshes=list.data;this.meshCount=list.length;this.dirty=false;this.stats.sceneScans=list.length;
   }else this.stats.cacheHits++;
   this.stats.scanned=list.length;this.stats.submitted=this.result.length;this.stats.skipped=list.length-this.result.length;return this.result;
  };
  scene.getActiveMeshCandidates=this.provider;
  // Babylon picks a LOD for every instance on every frame (screen coverage,
  // one temporary vector each). A static prop keeps its choice for a few
  // frames instead; the refresh is staggered by id so no frame pays for all.
  // Measured on the plains hill: selection −7 %. Any other selector wins.
  if(holdLod&&!scene.customLODSelector){
   this.lodSelector=(mesh,camera)=>{
    if(mesh._villageLodOwned===true&&mesh.isWorldMatrixFrozen){
     const frame=scene.getFrameId(),lod=mesh._villageLod;
     if(lod&&frame<mesh._villageLodUntil&&!lod.isDisposed()){mesh._currentLOD=lod;return lod;}
     const next=mesh.getLOD(camera);mesh._villageLod=next;mesh._villageLodUntil=frame+LOD_HOLD_FRAMES+(mesh.uniqueId&7);return next;
    }
    return mesh.getLOD(camera);
   };
   scene.customLODSelector=this.lodSelector;
  }
 }
 add(mesh){
  if(this.disposed||!(mesh instanceof InstancedMesh)||!mesh.isWorldMatrixFrozen||this.tracked.has(mesh))return;
  mesh._villageLodOwned=true;this.register(mesh,1);
 }
 addEmptyRoot(mesh){
  if(this.disposed||Object.getPrototypeOf(mesh)!==Mesh.prototype||this.tracked.has(mesh)||mesh.geometry||mesh.material||mesh.subMeshes?.length)return;
  this.register(mesh,2);
 }
 register(mesh,kind){
  const record={mesh,kind,omit:false,disabledIndex:-1};this.tracked.set(mesh,record);this.records.add(record);this.stats.owned++;
  // Roots (kind 2) are checked on every query; only instances need the
  // disabled watch list.
  const changed=()=>{
   if(kind===2)return;
   if(Node.prototype.isEnabled.call(mesh)){
    this.unwatch(record);
    if(record.omit){record.omit=false;this.invalidate();}
   }else if(record.disabledIndex<0){record.disabledIndex=this.disabled.length;this.disabled.push(record);}
  };
  record.enabledObserver=mesh.onEffectiveEnabledStateChangedObservable.add(changed);
  record.disposeObserver=mesh.onDisposeObservable.add(()=>this.unregister(record));
  if(kind===2){record.omit=emptyRoot(mesh);this.roots.push(record);}
  changed();this.invalidate();
 }
 unregister(record){
  const {mesh}=record;
  mesh.onEffectiveEnabledStateChangedObservable.remove(record.enabledObserver);mesh.onDisposeObservable.remove(record.disposeObserver);
  this.records.delete(record);this.unwatch(record);this.tracked.delete(mesh);
  if(record.kind===1){mesh._villageLodOwned=false;mesh._villageLod=null;}
  if(record.kind===2){const at=this.roots.indexOf(record);if(at>=0){this.roots[at]=this.roots[this.roots.length-1];this.roots.pop();}}
  this.invalidate();
 }
 unwatch(record){
  const index=record.disabledIndex;
  if(index<0)return;
  const last=this.disabled.pop();
  if(last!==record){this.disabled[index]=last;last.disabledIndex=index;}
  record.disabledIndex=-1;
 }
 // Babylon add/remove APIs invalidate automatically. Foreign code that edits
 // scene.meshes directly must invalidate after changing its order/membership.
 invalidate(){this.dirty=true;}
 dispose(){
  if(this.disposed)return;this.disposed=true;
  this.scene.onNewMeshAddedObservable.remove(this.meshAdded);this.scene.onMeshRemovedObservable.remove(this.meshRemoved);
  for(const record of this.records)this.unregister(record);
  if(this.scene.getActiveMeshCandidates===this.provider)this.scene.getActiveMeshCandidates=this.previous;
  if(this.lodSelector&&this.scene.customLODSelector===this.lodSelector)this.scene.customLODSelector=undefined;
  this.result.data.length=0;this.result.length=0;this.tracked=new WeakMap();this.meshes=null;
 }
}
