// Babylon 9.31 uses one shared instance store for WebGL by default. A shadow
// pass can replace the main camera's LOD instance list while it is still needed,
// dropping an entire tree batch during rotation. Use Babylon's existing native
// per-pass storage (also used by WebGPU) for village sources and their LODs.
// Only small transform/attribute buffers are separated; geometry and textures
// remain shared. Call before registering custom instance attributes or drawing.
import {prepareShadowFade} from './village-shadow-fade.js';
import {prepareVillageInstanceAttributes} from './village-instance-attributes.js';

const contextSources=new WeakMap();

function recoverVillageSourceOnRestore(mesh){
  const scene=mesh.getScene(),engine=scene.getEngine();
  if(!(engine.webGLVersion>0))return;
  let sources=contextSources.get(scene);
  if(!sources){
    sources=new Set();contextSources.set(scene,sources);
    const observer=engine.onContextRestoredObservable.add(()=>{
      const attachedMeshes=new Set(scene.meshes),restoredGeometry=new Set(scene.geometries);
      for(const source of sources){
        const geometry=source.geometry;
        if(source.isDisposed()||!geometry)continue;
        // AssetContainer sources and their geometry can remain detached from
        // the scene even when their live instances or LODs draw every frame.
        if(!restoredGeometry.has(geometry)){geometry._rebuild();restoredGeometry.add(geometry);}
        if(!attachedMeshes.has(source))source._rebuild();
        // Babylon 9.31 rebuilds matrix buffers but leaves these custom VBOs
        // pointing at the dead context. The next native draw creates them
        // from the stored instance data. Old GL handles are already invalid.
        const custom=source._userInstancedBuffersStorage;
        if(custom?.renderPasses)custom.renderPasses={};
      }
    });
    scene.onDisposeObservable.addOnce(()=>{
      engine.onContextRestoredObservable.remove(observer);contextSources.delete(scene);sources.clear();
    });
  }
  if(sources.has(mesh))return;
  sources.add(mesh);mesh.onDisposeObservable.addOnce(()=>sources.delete(mesh));
}

export function prepareVillageInstancing(meshes,{recoverContext=false}={}){
  for(const mesh of meshes)if(mesh.getTotalVertices?.()>0){
    mesh._instanceDataStorage.useMonoDataStorageRenderPass=false;prepareShadowFade(mesh);prepareVillageInstanceAttributes(mesh,{repairPassCapacity:recoverContext});
    if(recoverContext)recoverVillageSourceOnRestore(mesh);
  }
}
