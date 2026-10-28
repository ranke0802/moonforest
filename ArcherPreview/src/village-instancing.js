// Babylon 9.31 uses one shared instance store for WebGL by default. A shadow
// pass can replace the main camera's LOD instance list while it is still needed,
// dropping an entire tree batch during rotation. Use Babylon's existing native
// per-pass storage (also used by WebGPU) for village sources and their LODs.
// Only small transform/attribute buffers are separated; geometry and textures
// remain shared. Call before registering custom instance attributes or drawing.
export function prepareVillageInstancing(meshes){
  for(const mesh of meshes)if(mesh.getTotalVertices?.()>0)mesh._instanceDataStorage.useMonoDataStorageRenderPass=false;
}
