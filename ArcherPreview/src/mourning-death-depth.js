import {MOURNING_DEATH_DEPTH_VERTEX_COUNT,MOURNING_DEATH_DEPTH_DELTAS} from './mourning-death-depth-data.js';

const patchedTargets=new WeakMap(),patchedPositions=new WeakSet(),patchedNormals=new WeakSet();

// Run inside prepareAsset's existing manager freeze, before outline clones and
// shader preparation. The existing death influence animates these buffers;
// there is no new target, attribute, texture layer or per-frame geometry work.
export function prepareMourningDeathDepth(manager,meshes){
  const target=manager.getTargetByName('Death_Ground_Contact');
  if(!target||!meshes.some(mesh=>mesh.name==='Elina_Chimera_Skin'&&mesh.morphTargetManager===manager&&mesh.getTotalVertices()===MOURNING_DEATH_DEPTH_VERTEX_COUNT))return false;
  const positions=target.getPositions(),normals=target.getNormals(),known=patchedTargets.get(target);
  if(known?.positions===positions&&known.normals===normals)return false;
  // Babylon's MorphTarget.clone shares data arrays. A clone of an already
  // corrected target must retain those arrays without applying the delta twice.
  if(patchedPositions.has(positions)&&patchedNormals.has(normals)){patchedTargets.set(target,{positions,normals});return false;}
  if(!manager.areUpdatesFrozen)throw new Error('Mourning death correction requires the prepareAsset freeze');
  if(positions?.length!==MOURNING_DEATH_DEPTH_VERTEX_COUNT*3||normals?.length!==positions.length)throw new Error('Unexpected mourning death target geometry');
  const nextPositions=Float32Array.from(positions),nextNormals=Float32Array.from(normals),dirty=manager._mustSynchronize;
  for(let at=0;at<MOURNING_DEATH_DEPTH_DELTAS.length;at+=7){
    const offset=MOURNING_DEATH_DEPTH_DELTAS[at]*3;
    for(let axis=0;axis<3;axis++){
      nextPositions[offset+axis]+=MOURNING_DEATH_DEPTH_DELTAS[at+1+axis];
      nextNormals[offset+axis]+=MOURNING_DEATH_DEPTH_DELTAS[at+4+axis];
    }
  }
  try{target.setPositions(nextPositions);target.setNormals(nextNormals);}
  catch(error){
    // Same-layout replacement does not notify observers in Babylon 9.31.
    // Restore both original arrays even when an injected setter itself fails.
    target._positions=positions;target._normals=normals;manager._mustSynchronize=dirty;
    throw error;
  }
  patchedPositions.add(nextPositions);patchedNormals.add(nextNormals);
  patchedTargets.set(target,{positions:nextPositions,normals:nextNormals});
  // Same-layout setters do not invalidate the SDK's texture. Its existing final
  // thaw consumes this flag in _syncActiveTargets and uploads exactly once.
  manager._mustSynchronize=true;
  return true;
}
