import {Matrix,Mesh,VertexData} from '@babylonjs/core';

// The player model arrives as ~35 meshes (shield rivets and pads, per-part
// baked outlines). Every one is a separate draw in the main pass and again in
// the shadow pass. Meshes that share a material, a parent and (for skinned
// parts) a skeleton and pose are drawn identically when merged, so they are
// joined into one mesh at load. Measured on the plains (PC, 2026-11-19): the
// player was 35 of 143 active meshes.
// Kept apart: named equipment (palette swaps look them up by name), morph
// targets, animated meshes, and anything with thin instances or LODs.
const sameMatrix=(a,b)=>{const x=a.m,y=b.m;for(let i=0;i<16;i++)if(Math.abs(x[i]-y[i])>1e-6)return false;return true;};
const KINDS=['position','normal','tangent','uv','uv2','color','matricesIndices','matricesWeights','matricesIndicesExtra','matricesWeightsExtra'];
const signature=mesh=>KINDS.filter(kind=>mesh.isVerticesDataPresent(kind)).join(',');

export function mergePlayerMeshes(container,{keep=[],enabled=true}={}){
 const stats={before:container.meshes.length,merged:0,groups:0,after:container.meshes.length};
 if(!enabled)return stats;
 const animated=new Set();for(const group of container.animationGroups??[])for(const target of group.targetedAnimations)animated.add(target.target);
 const keepNames=new Set(keep);const groups=new Map();
 for(const mesh of container.meshes){
  if(Object.getPrototypeOf(mesh)!==Mesh.prototype||!mesh.getTotalVertices()||!mesh.material||keepNames.has(mesh.name)||animated.has(mesh))continue;
  if(mesh.morphTargetManager||mesh.hasThinInstances||mesh.instances?.length||mesh.hasLODLevels||mesh.subMeshes?.length!==1||mesh.getChildren().length)continue;
  mesh.computeWorldMatrix(true);
  const key=[mesh.material.uniqueId,mesh.parent?.uniqueId??'root',mesh.skeleton?.uniqueId??'rigid',signature(mesh),mesh.numBoneInfluencers,mesh.isVisible,mesh.visibility,mesh.receiveShadows,mesh.renderingGroupId,mesh.layerMask].join('|');
  let list=groups.get(key);if(!list)groups.set(key,list=[]);list.push(mesh);
 }
 for(const list of groups.values()){
  if(list.length<2)continue;
  const first=list[0],skinned=!!first.skeleton;
  // A skinned part is deformed in its own space: only parts with the same
  // local transform can share a vertex buffer without a visible change.
  const parts=skinned?list.filter(mesh=>sameMatrix(mesh.getWorldMatrix(),first.getWorldMatrix())):list;
  if(parts.length<2)continue;
  const datas=parts.map(mesh=>{
   const data=VertexData.ExtractFromMesh(mesh,true,true);
   // Rigid parts are baked into their parent's space (row vectors:
   // world = local · parentWorld, so local = world · parentWorld⁻¹).
   if(!skinned){const parentWorld=first.parent?first.parent.getWorldMatrix():Matrix.IdentityReadOnly;data.transform(mesh.getWorldMatrix().multiply(Matrix.Invert(parentWorld)));}
   return data;
  });
  const vertexData=datas[0];vertexData.merge(datas.slice(1),true);
  const merged=new Mesh(`${first.name} + ${parts.length-1}`,first.getScene());
  vertexData.applyToMesh(merged,false);
  merged.parent=first.parent;
  if(skinned){merged.position.copyFrom(first.position);if(first.rotationQuaternion)merged.rotationQuaternion=first.rotationQuaternion.clone();else merged.rotation.copyFrom(first.rotation);merged.scaling.copyFrom(first.scaling);merged.skeleton=first.skeleton;merged.numBoneInfluencers=first.numBoneInfluencers;}
  merged.material=first.material;
  for(const key of ['isVisible','visibility','receiveShadows','renderingGroupId','layerMask','isPickable','alwaysSelectAsActiveMesh','computeBonesUsingShaders'])merged[key]=first[key];
  merged.metadata={...first.metadata,moonforestMergedFrom:parts.map(mesh=>mesh.name)};
  merged.setEnabled(first.isEnabled(false));
  const at=container.meshes.indexOf(first);container.meshes.splice(at,0,merged);
  for(const mesh of parts){const index=container.meshes.indexOf(mesh);if(index>=0)container.meshes.splice(index,1);mesh.dispose(false,false);}
  stats.groups++;stats.merged+=parts.length;
 }
 stats.after=container.meshes.length;return stats;
}
