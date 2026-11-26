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
export async function prepareMapMaterials(meshes,{material:override,cancelled=()=>false,instances=true,now=()=>performance.now(),wait=()=>new Promise(r=>setTimeout(r,16)),preparation,signal}={}){
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
  // Failure record only: an owner deadline that fires while this loop still
  // polls gets a primitive snapshot of what was not ready (no live references).
  const onAbort=()=>{const reason=signal.reason;if(reason instanceof Error&&reason.name!=='AbortError'&&!reason.mapMaterialWait)try{reason.mapMaterialWait=describeMaterialWait(pending,scene);}catch{/* A frozen reason keeps its plain timeout. */}};
  signal?.addEventListener('abort',onAbort,{once:true});
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
  finally{signal?.removeEventListener('abort',onAbort);}
}

// Strings, numbers and booleans only: the record outlives the failed map in
// the error/diagnostic, so it must not reach meshes, materials, effects or textures.
const text=(value,limit)=>value==null?null:String(value).slice(0,limit);
const effectLabel=effect=>{const name=effect?.name;return text(typeof name==='string'?name:[name?.vertex??name?.vertexElement,name?.fragment??name?.fragmentElement].filter(Boolean).join('/')||'?',48);};
// Babylon's own PBR configuration plugins are always present; list the game's.
const BUILT_IN_PLUGINS=new Set(['PBRBRDF','PBRClearCoat','PBRIridescence','PBRAnisotropic','PBRSheen','Sheen','PBRSubSurface','SubSurface','DetailMap']);
let materialWaitDescriptions=0;
export const mapMaterialWaitStats=()=>({descriptions:materialWaitDescriptions});
// Mirrors readMaterialVariant's effect lookup for the same pass.
export function describeMaterialWait(pending,scene){
  materialWaitDescriptions++;
  const pass=cameraRenderPass(scene),subMeshes=[];
  for(const {mesh,material,subMesh} of pending.slice(0,6)){
    const row={mesh:text(mesh?.name,48),material:text(material?.name,48),class:text(material?.getClassName?.(),32)};
    try{
      row.plugins=(material?.pluginManager?._plugins??[]).filter(plugin=>!BUILT_IN_PLUGINS.has(plugin?.name)).slice(0,6).map(plugin=>text(plugin?.name,40));
      const color=material?.albedoTexture??material?.diffuseTexture;row.colorTexture=color?!!color.isReady?.():null;
      const stored=material?._storeEffectOnSubMeshes&&subMesh,effect=stored?(subMesh._getDrawWrapper?.(pass,false)?.effect??subMesh.effect):material?.getEffect?.();
      row.effect=!!effect;
      if(effect){const context=effect._pipelineContext;row.effectReady=!!effect.isReady?.();row.pipeline=!!context;row.pipelineReady=context?!!context.isReady:null;row.error=text(effect.getCompilationError?.()||null,160);}
    }catch(error){row.inspectError=text(error?.message??error,80);}
    subMeshes.push(row);
  }
  const engine=scene?.getEngine?.(),brdf=scene?.environmentBRDFTexture,effects=[];let effectsNotReady=0;
  try{for(const key in engine?._compiledEffects??{}){const effect=engine._compiledEffects[key];if(!effect||effect.isReady?.())continue;effectsNotReady++;if(effects.length<4)effects.push(effectLabel(effect));}}catch{/* Engine bookkeeping is optional evidence. */}
  return {
    pending:pending.length,subMeshes,
    brdf:brdf?{ready:!!brdf.isReady?.(),internalReady:!!brdf.getInternalTexture?.()?.isReady,rgbd:!!brdf.isRGBD}:null,
    effectsNotReady,effects,parallelCompile:!!engine?.getCaps?.().parallelShaderCompile,
  };
}
