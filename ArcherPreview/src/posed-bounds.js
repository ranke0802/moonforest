// Posed bounds of a cloned mesh, computed once per geometry and pose.
//
// Babylon's Mesh constructor ends a clone with refreshBoundingInfo(true,true): it copies the
// positions, indices and weights, skins every vertex on the CPU and keeps a Vector3 per vertex.
// Measured 2026-11-22 (deployed 0.3, plains): 7-11 ms per monster body and again per silhouette
// on a desktop, 30-40 ms on a phone, once for every monster that appears.
// Clones of one geometry in one pose get the same answer, so the first clone computes it the SDK
// way and the rest copy it while the bone matrices and morph weights are unchanged.
// The per-vertex point array is not built (these meshes are never picked or collided with);
// a later refreshBoundingInfo() call behaves exactly as the SDK's.
import {BoundingInfo,Mesh,VertexBuffer} from '@babylonjs/core';
const POSED=Object.freeze({applySkeleton:true,applyMorph:true,updatePositionsArray:false}),KEEP=3;
const entries=new WeakMap();   // Geometry -> newest-first list of {buffer,vertices,influencers,matrices,influences,ranges,minimum,maximum,subs}
export const posedBoundsStats={computed:0,reused:0};
// SubMesh.refreshBoundingInfo leaves a global sub-mesh (and one without geometry) alone.
const refreshes=sub=>!sub.IsGlobal&&!!sub._renderingMesh?.geometry;
function matches(entry,mesh,buffer,matrices){
 if(entry.buffer!==buffer||entry.vertices!==mesh.getTotalVertices()||entry.influencers!==mesh.numBoneInfluencers||entry.matrices.length!==(matrices?matrices.length:0))return false;
 const subs=mesh.subMeshes,ranges=entry.ranges;if(!subs||subs.length*2!==ranges.length)return false;
 for(let i=0;i<subs.length;i++)if(subs[i].indexStart!==ranges[i*2]||subs[i].indexCount!==ranges[i*2+1]||refreshes(subs[i])!==!!entry.subs[i])return false;
 for(let i=0;i<entry.matrices.length;i++)if(matrices[i]!==entry.matrices[i])return false;
 const manager=mesh.morphTargetManager,count=manager?manager.numTargets:0;if(count!==entry.influences.length)return false;
 for(let i=0;i<count;i++)if(manager.getTarget(i).influence!==entry.influences[i])return false;
 return true;
}
function replay(mesh,entry){
 if(mesh.hasBoundingInfo)mesh.getBoundingInfo().reConstruct(entry.minimum,entry.maximum);else mesh.setBoundingInfo(new BoundingInfo(entry.minimum,entry.maximum));
 const subs=mesh.subMeshes;
 for(let i=0;i<subs.length;i++){
  const sub=subs[i],own=entry.subs[i];sub._lastColliderWorldVertices=null;if(!own)continue;
  if(sub._boundingInfo)sub._boundingInfo.reConstruct(own.minimum,own.maximum);else sub._boundingInfo=new BoundingInfo(own.minimum,own.maximum);
 }
 mesh._updateBoundingInfo();
}
function capture(mesh,buffer,matrices){
 const info=mesh.getBoundingInfo(),manager=mesh.morphTargetManager,count=manager?manager.numTargets:0,influences=new Float32Array(count),subs=mesh.subMeshes,ranges=new Int32Array(subs.length*2);
 for(let i=0;i<count;i++)influences[i]=manager.getTarget(i).influence;
 for(let i=0;i<subs.length;i++){ranges[i*2]=subs[i].indexStart;ranges[i*2+1]=subs[i].indexCount;}
 return {buffer,vertices:mesh.getTotalVertices(),influencers:mesh.numBoneInfluencers,matrices:matrices?new Float32Array(matrices):new Float32Array(0),influences,ranges,
  minimum:info.minimum.clone(),maximum:info.maximum.clone(),subs:subs.map(sub=>{const own=refreshes(sub)?sub._boundingInfo:null;return own?{minimum:own.minimum.clone(),maximum:own.maximum.clone()}:null;})};
}
// compute(options): the SDK refresh for this mesh. Returns the mesh, as refreshBoundingInfo does.
export function refreshPosedCloneBounds(mesh,compute){
 const geometry=mesh.geometry,buffer=geometry?.getVertexBuffer(VertexBuffer.PositionKind)??null;
 if(!buffer||!mesh.subMeshes||mesh.hasBoundingInfo&&mesh.getBoundingInfo().isLocked||mesh.bakedVertexAnimationManager?.isEnabled){compute(POSED);return mesh;}
 const matrices=mesh.skeleton?mesh.skeleton.getTransformMatrices(mesh):null;
 let list=entries.get(geometry);
 if(list)for(let i=0;i<list.length;i++)if(matches(list[i],mesh,buffer,matrices)){replay(mesh,list[i]);posedBoundsStats.reused++;return mesh;}
 compute(POSED);posedBoundsStats.computed++;
 if(!list){list=[];entries.set(geometry,list);}
 list.unshift(capture(mesh,buffer,matrices));if(list.length>KEEP)list.length=KEEP;
 return mesh;
}
export class PosedCloneMesh extends Mesh{
 constructor(name,scene,parent,source,doNotCloneChildren){super(name,scene,parent,source,doNotCloneChildren);this._posedCloneComplete=true;}
 refreshBoundingInfo(applySkeletonOrOptions=false,applyMorph=false){
  if(!this._posedCloneComplete&&applySkeletonOrOptions===true&&applyMorph===true)return refreshPosedCloneBounds(this,options=>super.refreshBoundingInfo(options));
  return super.refreshBoundingInfo(applySkeletonOrOptions,applyMorph);
 }
}
// Custom mesh classes, clone observers and per-object hooks keep their own cloning untouched.
export function canPosedClone(source){
 const proto=source.constructor===Mesh?Mesh.prototype:source.constructor===PosedCloneMesh?PosedCloneMesh.prototype:null;
 return !!proto&&!source.onClonedObservable?.hasObservers()&&source.clone===proto.clone&&source._copySource===proto._copySource&&
  source.refreshBoundingInfo===proto.refreshBoundingInfo&&source._getData===proto._getData;
}
export const posedClone=(source,name,parent,doNotCloneChildren)=>new PosedCloneMesh(name,source.getScene(),parent,source,doNotCloneChildren);
