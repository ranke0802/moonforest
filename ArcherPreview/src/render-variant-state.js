// Babylon 9.31 contract shared by actors, loading, maps and overlays.
export function cameraRenderPass(scene){return scene?.activeCamera?.outputRenderTarget?.renderPassId??scene?.activeCamera?.renderPassId??scene?.getEngine?.().currentRenderPassId;}
export function withRenderPass(scene,pass,read){const engine=scene?.getEngine?.();if(!engine||pass===undefined)return read();const previous=engine.currentRenderPassId;try{engine.currentRenderPassId=pass;return read();}finally{engine.currentRenderPassId=previous;}}
export function hardwareInstancesForSubMesh(mesh,sub,{replacement=false}={}){
 const rendering=sub?.getRenderingMesh?.()??mesh,owner=rendering?.sourceMesh??rendering;
 if(!owner?.getScene?.().getEngine().getCaps?.().instancedArrays)return false;
 const regular=replacement||mesh?._internalAbstractMeshDataInfo?._actAsRegularMesh===true,batch=owner._getInstancesRenderList?.(sub?._id??0,regular);
 return !!(batch?.hardwareInstancedRendering?.[sub?._id??0]||rendering?.hasThinInstances||owner.hasThinInstances||owner._userInstancedBuffersStorage&&!regular);
}
export function shaderInstanceModes(mesh,sub,{instances,includeInstanceVariants=false}={}){
 if(typeof instances==='boolean')return [instances];
 const actual=hardwareInstancesForSubMesh(mesh,sub),supported=mesh?.getScene?.().getEngine?.().getCaps?.().instancedArrays;
 // Keep the currently used mode last. Hidden actors can acquire a batch later.
 return includeInstanceVariants&&supported&&!mesh._internalAbstractMeshDataInfo?._actAsRegularMesh?[!actual,actual]:[actual];
}
export function subMeshMaterial(mesh,sub,override){return override??sub?.getMaterial?.()??mesh.material;}
export function readMaterialVariant(mesh,sub,{material:override,instances=false,pass=cameraRenderPass(mesh?.getScene?.())}={}){
 return withRenderPass(mesh?.getScene?.(),pass,()=>{
  const material=subMeshMaterial(mesh,sub,override);if(!material)return {ready:true,effect:null,material:null};
  const every=material.checkReadyOnEveryCall,hot=material.allowShaderHotSwapping,frozen=material.isFrozen;
  try{
   if(frozen)material.unfreeze();material.checkReadyOnEveryCall=true;material.allowShaderHotSwapping=false;
   const stored=material._storeEffectOnSubMeshes&&sub,ready=stored?material.isReadyForSubMesh(mesh,sub,instances):material.isReady(mesh,instances);
   const effect=stored?(sub._getDrawWrapper?.(pass,false)?.effect??sub.effect):material.getEffect?.();return {ready,effect,material};
  }finally{material.checkReadyOnEveryCall=every;material.allowShaderHotSwapping=hot;if(frozen)material.freeze();}
 });
}
export function shaderVariantError(effect){const error=effect?.getCompilationError?.();return error&&effect.allFallbacksProcessed?.()?String(error).slice(0,160):null;}
