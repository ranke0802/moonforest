import {InstancedMesh,Mesh,Node} from '@babylonjs/core';

// Only native frozen map instances are registered. Dynamic actors, quest
// props, source meshes and any custom candidate provider retain their order.
export class VillageActiveCandidates {
 constructor(scene){
  this.scene=scene;this.previous=scene.getActiveMeshCandidates;this.tracked=new WeakMap();this.disposed=false;
  this.records=new Set();this.disabled=[];this.dirty=true;this.meshes=null;this.meshCount=-1;
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
    let omit=false;
    if(mesh.isEnabled===Node.prototype.isEnabled&&!mesh.isEnabled()){
     if(record.kind===1)omit=mesh.isReady===InstancedMesh.prototype.isReady;
     else omit=mesh.isReady===Mesh.prototype.isReady&&mesh.getTotalVertices===Mesh.prototype.getTotalVertices&&
      !mesh.geometry&&!mesh.material&&!mesh.subMeshes?.length&&!mesh.skeleton&&!mesh.morphTargetManager&&!mesh.hasThinInstances&&!mesh.actionManager;
    }
    if(record.omit!==omit){record.omit=omit;this.dirty=true;}
   }
   if(this.meshes!==list.data||this.meshCount!==list.length)this.dirty=true;
   if(this.dirty){
    const data=this.result.data;let count=0;
    for(let i=0;i<list.length;i++)if(!this.tracked.get(list.data[i])?.omit)data[count++]=list.data[i];
    data.length=count;this.result.length=count;this.meshes=list.data;this.meshCount=list.length;this.dirty=false;this.stats.sceneScans=list.length;
   }else this.stats.cacheHits++;
   this.stats.scanned=list.length;this.stats.submitted=this.result.length;this.stats.skipped=list.length-this.result.length;return this.result;
  };
  scene.getActiveMeshCandidates=this.provider;
 }
 add(mesh){
  if(this.disposed||!(mesh instanceof InstancedMesh)||!mesh.isWorldMatrixFrozen||this.tracked.has(mesh))return;
  this.register(mesh,1);
 }
 addEmptyRoot(mesh){
  if(this.disposed||Object.getPrototypeOf(mesh)!==Mesh.prototype||this.tracked.has(mesh)||mesh.geometry||mesh.material||mesh.subMeshes?.length)return;
  this.register(mesh,2);
 }
 register(mesh,kind){
  const record={mesh,kind,omit:false,disabledIndex:-1};this.tracked.set(mesh,record);this.records.add(record);this.stats.owned++;
  const changed=()=>{
   if(Node.prototype.isEnabled.call(mesh)){
    this.unwatch(record);
    if(record.omit){record.omit=false;this.invalidate();}
   }else if(record.disabledIndex<0){record.disabledIndex=this.disabled.length;this.disabled.push(record);}
  };
  record.enabledObserver=mesh.onEffectiveEnabledStateChangedObservable.add(changed);
  record.disposeObserver=mesh.onDisposeObservable.add(()=>this.unregister(record));
  changed();this.invalidate();
 }
 unregister(record){
  const {mesh}=record;
  mesh.onEffectiveEnabledStateChangedObservable.remove(record.enabledObserver);mesh.onDisposeObservable.remove(record.disposeObserver);
  this.records.delete(record);this.unwatch(record);this.tracked.delete(mesh);this.invalidate();
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
  this.result.data.length=0;this.result.length=0;this.tracked=new WeakMap();this.meshes=null;
 }
}
