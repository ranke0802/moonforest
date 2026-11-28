// Babylon 9.31 uses one shared instance store for WebGL by default. A shadow
// pass can replace the main camera's LOD instance list while it is still needed,
// dropping an entire tree batch during rotation. Use Babylon's existing native
// per-pass storage (also used by WebGPU) for village sources and their LODs.
// Only small transform/attribute buffers are separated; geometry and textures
// remain shared. Call before registering custom instance attributes or drawing.
import {prepareShadowFade} from './village-shadow-fade.js';
import {prepareVillageInstanceAttributes} from './village-instance-attributes.js';

const contextSources=new WeakMap();
const contextRestoreErrors=new WeakMap();

export function villageContextRestoreError(scene){return contextRestoreErrors.get(scene)??null;}

const restoreFailureMessage=error=>String(error?.message??error).slice(0,160)||'Unable to rebuild village scenery';

function rebuildDetached(resource,engine,retryIndex=false){
  try{resource._rebuild();return null;}
  catch(error){
    const message=restoreFailureMessage(error);
    // A detached geometry creates its index buffer before its vertex buffers.
    // Retry only that first allocation; a later failure can leave partial GPU work.
    if(!retryIndex||message!=='Unable to create index buffer'||engine._gl?.isContextLost?.()!==false)return message;
    try{resource._rebuild();return null;}
    catch(retryError){return restoreFailureMessage(retryError);}
  }
}

function recoverVillageSourceOnRestore(mesh){
  const scene=mesh.getScene(),engine=scene.getEngine();
  if(!(engine.webGLVersion>0))return;
  let sources=contextSources.get(scene);
  if(!sources){
    sources=new Set();contextSources.set(scene,sources);
    const observer=engine.onContextRestoredObservable.add(()=>{
      contextRestoreErrors.delete(scene);
      const attachedMeshes=new Set(scene.meshes),visitedGeometry=new Set(scene.geometries);
      let firstFailure=null;
      for(const source of sources){
        const geometry=source.geometry;
        if(source.isDisposed()||!geometry)continue;
        // AssetContainer sources and their geometry can remain detached from
        // the scene even when their live instances or LODs draw every frame.
        // Never throw from this observer: Babylon clears its context-lost flag
        // only after all observers return. Report failures without retaining resources.
        if(!visitedGeometry.has(geometry)){
          visitedGeometry.add(geometry);
          const failure=rebuildDetached(geometry,engine,true);firstFailure??=failure;
        }
        if(!attachedMeshes.has(source)){
          const failure=rebuildDetached(source,engine);firstFailure??=failure;
        }
        // Babylon 9.31 rebuilds matrix buffers but leaves these custom VBOs
        // pointing at the dead context. The next native draw creates them
        // from the stored instance data. Old GL handles are already invalid.
        const custom=source._userInstancedBuffersStorage;
        if(custom?.renderPasses)custom.renderPasses={};
      }
      if(firstFailure!==null)contextRestoreErrors.set(scene,firstFailure);
    });
    scene.onDisposeObservable.addOnce(()=>{
      engine.onContextRestoredObservable.remove(observer);contextSources.delete(scene);contextRestoreErrors.delete(scene);sources.clear();
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
