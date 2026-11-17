import {createBossPreparation} from './boss-preparation.js';
import {canInlineHitFlash} from './hit-feedback.js';
import {overlaySubMeshReadiness} from './overlay-readiness.js';
import {cameraRenderPass,withRenderPass,shaderInstanceModes,subMeshMaterial,readMaterialVariant,shaderVariantError} from './render-variant-state.js';
import {createPreparedEffectLease} from './prepared-effect-lifetime.js';

// Common actor contract, independent of species or diagnostics. Keep the old
// export as an alias for callers while player/NPC/cutscenes use the same path.
export async function prepareModelShaders(asset,{preparation,frame,now,shadows,timeoutMs=45000,includeInstanceVariants=true}={}){
 const scene=asset.meshes[0]?.getScene?.(),job=preparation??createBossPreparation({frame,now,timeoutMs,scene,isCurrent:()=>!scene?.isDisposed&&!asset.meshes.some(mesh=>mesh.isDisposed?.())}),visibilityStates=new Map(),lease=createPreparedEffectLease();let committed=false;
 const waitReady=async(mesh,read)=>{for(;;){job.check();const result=read();job.checkpoint?.();if(result.ready){lease.retain(mesh,result.effect);return;}if(shaderVariantError(result.effect))throw new Error('화면 셰이더를 준비하지 못했습니다. 새로고침해 주세요.');await job.sleep(16);}};
 try{
  for(const mesh of asset.meshes){
   if(!mesh.getTotalVertices?.()||!mesh.material)continue;
   const visibility=mesh.visibility,scene=mesh.getScene?.(),pass=cameraRenderPass(scene);visibilityStates.set(mesh,visibility);
   const variants=mesh.metadata?.moonforestEnemyFade&&!mesh.metadata?.moonforestOutline?[.5,visibility]:[visibility];
   for(const value of variants){
    mesh.visibility=value;
    for(const sub of mesh.subMeshes?.length?mesh.subMeshes:[null]){
     const modes=withRenderPass(scene,pass,()=>shaderInstanceModes(mesh,sub,{includeInstanceVariants}));
     for(const instances of modes){
      await job.pause();await waitReady(mesh,()=>readMaterialVariant(mesh,sub,{instances,pass}));
      const overlay=(mesh.metadata?.moonforestEnemyFade&&!mesh.metadata?.moonforestOutline&&!canInlineHitFlash(mesh)||mesh.metadata?.moonforestPlayerFlash)&&scene?.getOutlineRenderer;
      if(overlay&&sub){await job.pause();await waitReady(mesh,()=>overlaySubMeshReadiness(scene,sub,{instances}));}
      const map=shadows?.getShadowMap?.();
      if(!mesh.metadata?.moonforestOutline&&map&&scene){
       const passes=map.renderPassIds?.length?map.renderPassIds:[map.renderPassId??pass];
       for(const shadowPass of passes){await job.pause();await waitReady(mesh,()=>withRenderPass(scene,shadowPass,()=>{
        const material=subMeshMaterial(mesh,sub);if(!sub||!material)return {ready:true};
        const ready=shadows.isReady(sub,instances,material.needAlphaBlendingForMesh(mesh));return {ready,effect:sub._getDrawWrapper?.()?.effect};
       }));}
      }
     }
    }
   }
  }
  job.check();lease.commit();committed=true;
 }finally{for(const [mesh,value]of visibilityStates)if(!mesh.isDisposed?.())mesh.visibility=value;if(!committed)lease.rollback();}
}
export const prepareBossShaders=prepareModelShaders;
