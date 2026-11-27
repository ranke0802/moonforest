
import {createBossPreparation} from './boss-preparation.js';
import {createPreparedEffectLease} from './prepared-effect-lifetime.js';
import {cameraRenderPass,readMaterialVariant,shaderVariantError,subMeshMaterial} from './render-variant-state.js';

const MAX_VARIANTS=12;
const RETRY_MS=2000;

function visibleShadowVariants(scene,state){
  const active=scene.getActiveMeshes(),camera=scene.activeCamera,pass=cameraRenderPass(scene);
  const seen=new Set(),pending=[],remaining=MAX_VARIANTS-state.count;
  for(let i=0;i<active.length&&pending.length<remaining;i++){
    const visible=active.data[i],mesh=visible._internalAbstractMeshDataInfo?._currentLOD?.get(camera)?.[0]??visible.sourceMesh??visible;
    if(!mesh.receiveShadows)continue;
    for(const sub of mesh.subMeshes??[]){
      if(pending.length>=remaining)break;
      const draw=sub._getDrawWrapper(pass,false),effect=draw?.effect,defines=draw?.defines;
      const material=subMeshMaterial(mesh,sub);
      if(defines?.SHADOWS!==true||!effect||!material?._storeEffectOnSubMeshes||state.ready.has(effect)||seen.has(effect))continue;
      // A matching visible shadowed program has the same no-shadow variant.
      seen.add(effect);
      pending.push({mesh,sub,material,effect,instances:defines.INSTANCES===true});
    }
  }
  return pending;
}

async function prepareNoShadowVariants(scene,state,job,ownsScene){
  await job.pause();
  const pending=visibleShadowVariants(scene,state);
  if(!pending.length)return;
  const engine=scene.getEngine(),temporaryPass=engine.createRenderPassId('adaptive-no-shadows');
  const lease=createPreparedEffectLease();
  try{
    for(let round=0;pending.length&&round<3&&state.count<MAX_VARIANTS;round++){
      for(let i=0;i<pending.length&&state.count<MAX_VARIANTS;){
        const {mesh,sub,material,effect,instances}=pending[i];
        await job.pause();
        let result;
        if(!mesh.isDisposed()&&subMeshMaterial(mesh,sub)===material){
          // Babylon 9.31 dirties every material when setting shadowsEnabled.
          // Change only the input read by this synchronous check on a separate
          // draw wrapper. No frame can see the temporary value or effect.
          const shadows=scene._shadowsEnabled;
          try{
            scene._shadowsEnabled=false;
            result=readMaterialVariant(mesh,sub,{material,instances,pass:temporaryPass});
          }finally{scene._shadowsEnabled=shadows;}
          job.checkpoint('adaptive-no-shadow:'+mesh.name);
        }
        if(result?.ready&&result.effect){
          if(!state.effects.has(result.effect)&&lease.retain(mesh,result.effect)){
            state.effects.add(result.effect);state.count++;
          }
          if(state.effects.has(result.effect))state.ready.add(effect);
        }else if(result&&!shaderVariantError(result.effect)){i++;continue;}
        pending.splice(i,1);
      }
      if(pending.length&&state.count<MAX_VARIANTS)await job.nextFrame();
    }
  }finally{
    if(ownsScene())lease.commit();
    else lease.rollback();
    engine.releaseRenderPassId(temporaryPass);
  }
}

// Called only by 0.3 touch play. The first emergency level has at least one
// severe-slowdown window before shadows switch off. Spread just the visible
// receiving variants across the existing cooperative preparation budget.
export function createAdaptiveShadowWarmup({now=()=>performance.now(),frame}={}){
  let state;
  return (world,eligible)=>{
    const scene=world.scene,generation=world.toolGeneration;
    if(state?.scene!==scene||state.generation!==generation){
      state?.job?.cancel();
      state={scene,generation,ready:new WeakSet(),effects:new WeakSet(),count:0,job:null,nextAt:0};
    }
    if(!eligible||!scene.shadowsEnabled){
      state.job?.cancel();
      return;
    }
    if(state.job||state.count>=MAX_VARIANTS||now()<state.nextAt)return;
    const batch=state,ownsScene=()=>state===batch&&world.scene===scene&&world.toolGeneration===generation&&!scene.isDisposed&&!scene.getEngine()._contextWasLost;
    const job=createBossPreparation({scene,now,frame,timeoutMs:1500,maxBlocks:4,isCurrent:ownsScene});
    state.job=job;
    return prepareNoShadowVariants(scene,batch,job,ownsScene).catch(()=>{
      // Optional preparation: ordinary material readiness still handles a
      // failed/timed-out variant when the guard actually changes level.
    }).finally(()=>{
      batch.job=null;batch.nextAt=now()+RETRY_MS;
    });
  };
}
