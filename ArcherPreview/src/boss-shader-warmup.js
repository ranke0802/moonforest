import {createBossPreparation} from './boss-preparation.js';
// Compile body and silhouette before showing the actor. Yield between shader
// variants, polling the REAL submesh/skin/morph variant ourselves. Babylon's
// forceCompilationAsync starts a private 16ms loop with no cancellation/timeout.
export async function prepareBossShaders(asset,{preparation,frame,now,timeoutMs=45000}={}){
  const job=preparation??createBossPreparation({frame,now,timeoutMs}),states=new Map(),visibilityStates=new Map();
  try{
    for(const mesh of asset.meshes){
      if(!mesh.getTotalVertices()||!(mesh.metadata?.moonforestOutline||mesh.material?.metadata?.moonforestMonsterToon))continue;
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
          for(const subMesh of subMeshes?.length?subMeshes:[null]){
            const done=subMesh?material.isReadyForSubMesh(mesh,subMesh,false):material.isReady(mesh,false),effect=subMesh?.effect??material.getEffect?.();
            if(!done){ready=false;if(effect?.getCompilationError?.()&&effect.allFallbacksProcessed?.())throw new Error('화면 셰이더를 준비하지 못했습니다. 새로고침해 주세요.');}
          }
          if(ready)break;await job.sleep(16);
        }
      }
    }
  }finally{for(const [mesh,value]of visibilityStates)mesh.visibility=value;for(const [material,value]of states)material.allowShaderHotSwapping=value;}
}
