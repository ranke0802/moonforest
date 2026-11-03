import {createBossPreparation} from './boss-preparation.js';
import {canInlineHitFlash} from './hit-feedback.js';
import {overlaySubMeshReadiness} from './overlay-readiness.js';
// Compile body and silhouette before showing the actor. Yield between shader
// variants, polling the REAL submesh/skin/morph variant ourselves. Babylon's
// forceCompilationAsync starts a private 16ms loop with no cancellation/timeout.
export async function prepareBossShaders(asset,{preparation,frame,now,shadows,timeoutMs=45000}={}){
  const job=preparation??createBossPreparation({frame,now,timeoutMs}),states=new Map(),visibilityStates=new Map();
  try{
    for(const mesh of asset.meshes){
      if(!mesh.getTotalVertices()||!(mesh.metadata?.moonforestOutline||mesh.metadata?.moonforestWarmMaterial||mesh.material?.metadata?.moonforestMonsterToon))continue;
      const material=mesh.material,visibility=mesh.visibility;
      visibilityStates.set(mesh,visibility);
      if(!states.has(material)){states.set(material,material.allowShaderHotSwapping);material.allowShaderHotSwapping=false;}
      // Compile the body's translucent death variant while still hidden. Living
      // rendering is restored last; shared textures/materials are not cloned.
      const variants=mesh.metadata?.moonforestEnemyFade&&!mesh.metadata?.moonforestOutline?[.5,visibility]:[visibility];
      for(const value of variants){
        mesh.visibility=value;await job.nextFrame();
        for(;;){
          job.check();let ready=true;
          const subMeshes=material._storeEffectOnSubMeshes?mesh.subMeshes:null;
          // A scheduling frame need not render the scene (pause/FPS cap).
          // PBR otherwise accepts the previous visibility variant solely from
          // its matching renderId, even after visibility dirtied the defines.
          const everyCall=material.checkReadyOnEveryCall;
          try{
            material.checkReadyOnEveryCall=true;
            for(const subMesh of subMeshes?.length?subMeshes:[null]){
              const done=subMesh?material.isReadyForSubMesh(mesh,subMesh,false):material.isReady(mesh,false),effect=subMesh?.effect??material.getEffect?.();
              if(!done){ready=false;if(effect?.getCompilationError?.()&&effect.allFallbacksProcessed?.())throw new Error('화면 셰이더를 준비하지 못했습니다. 새로고침해 주세요.');}
            }
          }finally{material.checkReadyOnEveryCall=everyCall;}
          if(ready)break;await job.sleep(16);
        }
        // A hit can remain white as death begins. At that opacity Elena also
        // uses Babylon's existing overlay pass rather than its opaque inline
        // flash. Prepare that exact pass/skin/morph/batch without drawing it.
        const scene=mesh.getScene?.(),overlay=mesh.metadata?.moonforestEnemyFade&&!mesh.metadata?.moonforestOutline&&!canInlineHitFlash(mesh)&&scene?.getOutlineRenderer;
        if(overlay){
          await job.nextFrame();
          for(;;){
            job.check();let ready=true;
            for(const sub of mesh.subMeshes??[]){
              const result=overlaySubMeshReadiness(scene,sub);
              if(!result.ready){
                ready=false;const effect=result.effect;
                if(effect?.getCompilationError?.()&&effect.allFallbacksProcessed?.())throw new Error('화면 셰이더를 준비하지 못했습니다. 새로고침해 주세요.');
              }
            }
            if(ready)break;await job.sleep(16);
          }
        }
      }
      // Shadow effects have their own render-pass cache. Warm the exact caster
      // variant without registering a hidden actor or drawing an extra shadow.
      const shadowMap=shadows?.getShadowMap?.(),scene=mesh.getScene?.(),engine=scene?.getEngine();
      if(!mesh.metadata?.moonforestOutline&&shadowMap&&engine){
        await job.nextFrame();
        for(;;){
          job.check();let ready=true;const previous=engine.currentRenderPassId;
          try{
            engine.currentRenderPassId=shadowMap.renderPassId;
            for(const sub of mesh.subMeshes??[])if(!shadows.isReady(sub,false,material.needAlphaBlendingForMesh(mesh)))ready=false;
          }finally{engine.currentRenderPassId=previous;}
          if(ready)break;await job.sleep(16);
        }
      }
    }
  }finally{for(const [mesh,value]of visibilityStates)mesh.visibility=value;for(const [material,value]of states)material.allowShaderHotSwapping=value;}
}
