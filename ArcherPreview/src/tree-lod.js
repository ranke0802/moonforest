// Native mesh LOD also works with instanced trees: choose geometry per instance
// without a second copy of the forest or a per-frame JavaScript traversal.
import { VIEW_DISTANCE } from './world-limits.js';

export function addDistanceCull(asset,distance=VIEW_DISTANCE){
  for(const mesh of asset.meshes)if(mesh.getTotalVertices()>0)mesh.addLODLevel(distance,null);
}

export function attachTreeLod(scene,source,variant,distance,materialFor=null){
  const full=source.meshes.filter(m=>m.getTotalVertices()>0),low=variant.meshes.filter(m=>m.getTotalVertices()>0);
  if(full.length!==low.length)throw new Error('Tree LOD mesh count mismatch');
  for(let i=0;i<full.length;i++){
    if(full[i].name!==low[i].name)throw new Error('Tree LOD mesh identity mismatch');
    low[i].material=materialFor?materialFor(full[i].material):full[i].material;
    low[i].isPickable=false;
    low[i].receiveShadows=materialFor?false:full[i].receiveShadows;
    scene.addMesh(low[i]);
    full[i].addLODLevel(distance,low[i]);
  }
  return low;
}
