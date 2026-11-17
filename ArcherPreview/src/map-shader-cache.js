import {readMaterialVariant,subMeshMaterial,cameraRenderPass} from './render-variant-state.js';
import {createBossPreparation} from './boss-preparation.js';
// Hold only a bounded set of linked programs across map disposal. No scene,
// material, geometry or texture is retained. Babylon 9.31's createEffect and
// Effect.dispose use this same reference counter for shared shader ownership.
const caches=new WeakMap();
export function retainMapEffect(effect){
  if(!effect?.isReady()||effect._isDisposed||!Number.isFinite(effect._refCount))return;
  const engine=effect.getEngine();let cache=caches.get(engine);
  if(!cache){cache=new Set();caches.set(engine,cache);engine.onDisposeObservable.addOnce(()=>{for(const e of cache)e.dispose();cache.clear();caches.delete(engine);});}
  if(cache.delete(effect)){cache.add(effect);return;}
  while(cache.size>=12){const oldest=cache.values().next().value;cache.delete(oldest);oldest.dispose();}
  effect._refCount++;cache.add(effect);
}
export function mapShaderCacheSize(engine){return caches.get(engine)?.size??0;}

// Warm the actual instanced submesh variant. Material.forceCompilationAsync
// creates temporary PBR submeshes, and warms ShaderMaterial without INSTANCES;
// neither guarantees the first real draw is ready.
export async function prepareMapMaterials(meshes,{material:override,cancelled=()=>false,instances=true,now=()=>performance.now(),wait=()=>new Promise(r=>setTimeout(r,16)),preparation}={}){
  const pending=[],seen=new Map();
  for(const mesh of meshes){
    let subs=seen.get(mesh);if(!subs){subs=new Set();seen.set(mesh,subs);}
    for(const subMesh of mesh.subMeshes?.length?mesh.subMeshes:[null]){
      if(subs.has(subMesh))continue;subs.add(subMesh);
      const material=subMeshMaterial(mesh,subMesh,override);if(material)pending.push({mesh,material,subMesh});
    }
  }
  if(!pending.length||cancelled())return;
  // Cached readiness checks are often much cheaper than actor construction.
  // Keep the CPU/shared limits, but do not turn 1,000 hot checks into 250 frames.
  const scene=pending[0].mesh.getScene?.(),job=preparation??createBossPreparation({scene,now,frame:wait,maxBlocks:256,isCurrent:()=>!cancelled()&&!scene?.isDisposed});
  try{
    while(pending.length&&!cancelled()){
      for(let i=pending.length-1;i>=0;i--){const {mesh,material,subMesh}=pending[i];
        // Previously every pending submesh was forced ready in one task. The
        // actual SDK check remains atomic, but subsequent checks share the same
        // bounded preparation slices as actors/NPCs/cutscenes, even with logging off.
        await job.pause();if(cancelled())return;
        const {ready,effect}=readMaterialVariant(mesh,subMesh,{material,instances,pass:cameraRenderPass(mesh.getScene?.())});
        job.checkpoint?.();
        if(ready){retainMapEffect(effect);pending.splice(i,1);}
        else if(effect?.getCompilationError?.()&&effect.allFallbacksProcessed?.())throw new Error('화면 셰이더를 준비하지 못했습니다. 새로고침해 주세요.');
      }
      if(pending.length)await job.nextFrame();
    }
    job.check();
  }catch(error){if(error.name!=='AbortError'||!cancelled())throw error;}
}
