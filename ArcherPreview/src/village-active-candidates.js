import {InstancedMesh,Mesh,Node} from '@babylonjs/core';

// Only native frozen map instances are registered. Dynamic actors, quest
// props, source meshes and any custom candidate provider retain their order.
export class VillageActiveCandidates {
 constructor(scene){
  this.scene=scene;this.previous=scene.getActiveMeshCandidates;this.tracked=new WeakMap();this.disposed=false;
  this.result={data:[],length:0};this.stats={scanned:0,submitted:0,skipped:0,owned:0};
  this.provider=()=>{
   const list=this.previous.call(scene);
   // An octree/custom filtered list owns its own selection; do not interfere.
   // Multi-camera/FrameGraph paths can revisit a camera within one frame and
   // have different LOD-cache lifetimes, so leave them to the original SDK.
   if(this.disposed)return list;
   if(list.data!==scene.meshes||list.length!==scene.meshes.length||scene.frameGraph||scene.activeCameras?.length>1){this.stats.scanned=list.length;this.stats.submitted=list.length;this.stats.skipped=0;return list;}
   const data=this.result.data;let count=0,omitted=0;
   for(let i=0;i<list.length;i++){
    const mesh=list.data[i],kind=this.tracked.get(mesh);
    if(kind===1&&mesh.isEnabled===Node.prototype.isEnabled&&mesh.isReady===InstancedMesh.prototype.isReady&&!mesh.isEnabled()){omitted++;continue;}
    // Empty glTF clone roots have no rendering work, but enabled roots stay in
    // the SDK active list. A later geometry/material attachment or overridden
    // SDK method immediately returns the root to the original provider path.
    if(kind===2&&mesh.isEnabled===Node.prototype.isEnabled&&!mesh.isEnabled()&&mesh.isReady===Mesh.prototype.isReady&&
      mesh.getTotalVertices===Mesh.prototype.getTotalVertices&&!mesh.geometry&&!mesh.material&&!mesh.subMeshes?.length&&
      !mesh.skeleton&&!mesh.morphTargetManager&&!mesh.hasThinInstances&&!mesh.actionManager){omitted++;continue;}
    data[count++]=mesh;
   }
   data.length=count;this.result.length=count;this.stats.scanned=list.length;this.stats.submitted=count;this.stats.skipped=omitted;return this.result;
  };
  scene.getActiveMeshCandidates=this.provider;
 }
 add(mesh){
  if(this.disposed||!(mesh instanceof InstancedMesh)||!mesh.isWorldMatrixFrozen||this.tracked.has(mesh))return;
  this.tracked.set(mesh,1);this.stats.owned++;
 }
 addEmptyRoot(mesh){
  if(this.disposed||Object.getPrototypeOf(mesh)!==Mesh.prototype||this.tracked.has(mesh)||mesh.geometry||mesh.material||mesh.subMeshes?.length)return;
  this.tracked.set(mesh,2);this.stats.owned++;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;
  if(this.scene.getActiveMeshCandidates===this.provider)this.scene.getActiveMeshCandidates=this.previous;
  this.result.data.length=0;this.result.length=0;this.tracked=new WeakMap();
 }
}
