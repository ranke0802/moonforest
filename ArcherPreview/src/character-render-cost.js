import {RenderingGroup,VertexBuffer} from '@babylonjs/core';

const orderedGroups=new WeakMap();

// Keep the usual material batching inside each bucket. Only the opaque ink
// bucket moves behind the opaque surfaces, so their depth is available before
// rasterizing a screen-filling inverted hull. No depth prepass or extra target.
export function opaqueSurfaceBeforeInk(previous=RenderingGroup.PainterSortCompare){
  return (a,b)=>Number(a.getMesh().metadata?.moonforestOutline===true)-Number(b.getMesh().metadata?.moonforestOutline===true)||previous(a,b);
}

export function orderCharacterInkAfterSurfaces(scene,groupId=0){
  let groups=orderedGroups.get(scene);
  if(!groups){groups=new Set();orderedGroups.set(scene,groups);}
  if(groups.has(groupId))return;
  // Babylon exposes a setter but no getter for these callbacks. Preserve any
  // installed alpha-test/transparent ordering; only replace the opaque callback.
  const manager=scene._renderingManager;
  const previous=manager?._customOpaqueSortCompareFn[groupId]??RenderingGroup.PainterSortCompare;
  scene.setRenderingOrder(groupId,opaqueSurfaceBeforeInk(previous),manager?._customAlphaTestSortCompareFn[groupId]??null,manager?._customTransparentSortCompareFn[groupId]??null);
  groups.add(groupId);
}

// A mesh may export four/eight weight slots even when its last slots are zero
// on every vertex. Babylon still reads those bone matrices in every body, ink
// and shadow vertex shader. Removing only exact-zero trailing slots preserves
// the original sum, vertex streams, bones and all animated/morphed positions.
// This runs once while preparing the asset, before shader warmup and cloning ink.
export function trimEmptyBoneSlots(mesh){
  const declared=mesh.numBoneInfluencers;
  if(!mesh.skeleton||!mesh.computeBonesUsingShaders||!Number.isInteger(declared)||declared<2||declared>8)return declared;
  const count=mesh.getTotalVertices(),weights=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
  const extra=declared>4?mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind):null;
  if(!count||!weights||weights.length!==count*4||(declared>4&&(!extra||extra.length!==count*4)))return declared;
  let needed=1;
  for(let vertex=0;vertex<count;vertex++){
    for(let slot=declared-1;slot>=needed;slot--){
      const value=(slot<4?weights:extra)[vertex*4+slot%4];
      // Never treat invalid data or a tiny nonzero influence as a zero slot.
      if(!Number.isFinite(value))return declared;
      if(value!==0){needed=slot+1;break;}
    }
    if(needed===declared)return declared;
  }
  if(needed<declared)mesh.numBoneInfluencers=needed;
  return needed;
}
