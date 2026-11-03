import {Frustum} from '@babylonjs/core/Maths/math.frustum.js';

const label=value=>String(value?.name??value?.id??'unknown').slice(0,72);
const enabled=mesh=>{
  const fog=mesh.getScene?.().metadata?.caveFogRuntime;
  return !mesh.isDisposed?.()&&mesh.isEnabled?.()!==false&&mesh.isVisible!==false&&mesh.visibility!==0&&!(fog&&!fog.disposed&&mesh.metadata?.caveFogVisible===false);
};
const instances=(mesh,engine)=>!!(engine.getCaps?.().instancedArrays&&(mesh.isAnInstance||mesh.hasThinInstances||mesh.instances?.length));
const hardwareFor=(mesh,source,engine)=>!mesh._internalAbstractMeshDataInfo?._actAsRegularMesh&&(instances(mesh,engine)||instances(source,engine));
function failedEffect(effect){const error=effect?.getCompilationError?.();return error&&effect.allFallbacksProcessed?.()?String(error).slice(0,160):null;}

// Scene.isReady checks disabled retained bosses, archived LODs and every engine
// program. Check the current camera and live shadow passes, including unready
// visible objects absent from the previous active list. Never clear pending data.
export function currentFrameReadiness(scene){
  const engine=scene.getEngine(),camera=scene.activeCamera,blockers=[],meshes=[],shadows=[],outlines=[],states=new Map(),errors=[];
  // Count the existing readiness work, rather than running another inspection
  // for the loading UI. A unit is one visible mesh/pass or ancillary renderer.
  const progress={completed:0,total:0};
  const checked=ready=>{progress.total++;if(ready)progress.completed++;return ready;};
  const block=(kind,mesh,material,reason,effect)=>{const item={kind,mesh:label(mesh),material:material?label(material):null,reason};blockers.push(item);const error=failedEffect(effect);if(error)errors.push({...item,error});};
  if(scene.isDisposed||scene._isDisposed)return {ready:false,blockers:[{kind:'scene',mesh:'disposed',reason:'disposed'}],meshes,shadows,errors,progress:{completed:0,total:1}};
  if(!camera)return {ready:false,blockers:[{kind:'camera',mesh:'missing',reason:'missing'}],meshes,shadows,errors,progress:{completed:0,total:1}};
  camera.getViewMatrix?.();camera.getProjectionMatrix?.();const planes=Frustum.GetPlanes(camera.getTransformationMatrix?.()??scene.getTransformMatrix());
  const selected=mesh=>scene.customLODSelector?scene.customLODSelector(mesh,camera):typeof mesh.getLOD==='function'?mesh.getLOD(camera):mesh;
  const useMaterial=(mesh,subMesh,useInstances,kind,override)=>{
    const material=override??subMesh.getMaterial?.()??mesh.material??scene.defaultMaterial;if(!material)return;
    if(!states.has(material)){states.set(material,material.allowShaderHotSwapping);material.allowShaderHotSwapping=false;}
    const ready=material._storeEffectOnSubMeshes?material.isReadyForSubMesh(mesh,subMesh,useInstances):material.isReady(mesh,useInstances),effect=material._storeEffectOnSubMeshes?subMesh.effect:material.getEffect?.();
    if(!ready)block(kind,mesh,material,'material',effect);
  };
  const originalPass=engine.currentRenderPassId;engine.currentRenderPassId=camera.renderPassId??originalPass;
  try{
    for(const mesh of scene.meshes){
      if(mesh.isBlocked||!mesh.subMeshes?.length||!enabled(mesh)||mesh.scaling?.hasAZeroComponent)continue;
      if((mesh.layerMask&camera.layerMask)===0)continue;
      mesh.computeWorldMatrix?.();if(!scene._skipFrustumClipping&&!mesh.alwaysSelectAsActiveMesh&&!mesh.isInFrustum(planes))continue;
      const source=selected(mesh);if(!source)continue;meshes.push(label(mesh));
      const blockedBefore=blockers.length;
      if(!source.isReady(false)){block('view',mesh,null,'geometry');checked(false);continue;}
      const hardware=hardwareFor(mesh,source,engine);
      for(const sub of source.subMeshes??[]){if(!hardware&&source.subMeshes.length>1&&sub.isInFrustum&&!sub.isInFrustum(planes))continue;useMaterial(source,sub,hardware,'view');
        if(hardware&&mesh.instancedBuffers?.villageInk?.x>0&&!mesh._internalAbstractMeshDataInfo?._actAsRegularMesh)for(const material of scene.materials)if(material.metadata?.villageOutline&&(!material.metadata.villageOutlineUsesSource||material.metadata.villageOutlineUsesSource(source))){outlines.push(label(mesh));useMaterial(source,sub,true,'outline',material);}
      }
      checked(blockers.length===blockedBefore);
    }
    // Off-camera casters can still shade a visible surface. Check their exact
    // light-pass skin/morph/alpha variant without reviving disabled pools.
    const pass=engine.currentRenderPassId;
    try{for(const light of scene.lights??[]){
      if(light.isEnabled?.()===false||light.shadowEnabled===false)continue;
      for(const generator of light.getShadowGenerators?.()?.values()??[]){
        const map=generator.getShadowMap();if(!map)continue;
        for(const mesh of map.renderList??scene.meshes){
          if(!enabled(mesh))continue;const source=selected(mesh);if(!source)continue;shadows.push(label(mesh));
          const blockedBefore=blockers.length;
          if(!source.isReady(false)){block('shadow',mesh,null,'geometry');checked(false);continue;}
          const hardware=hardwareFor(mesh,source,engine);
          for(const id of map.renderPassIds??[map.renderPassId??pass]){engine.currentRenderPassId=id;
            for(const sub of source.subMeshes??[]){const material=sub.getMaterial?.()??source.material,transparent=material?.needAlphaBlendingForMesh(source)??false;
              if(!generator.isReady(sub,hardware,transparent))block('shadow',mesh,material,'shadow',sub._getDrawWrapper?.()?.effect);
            }
          }
          checked(blockers.length===blockedBefore);
        }
      }
    }}finally{engine.currentRenderPassId=pass;}
    if(!checked(camera.isReady?.(true)!==false))block('camera',camera,null,'postprocess');
    for(const target of scene.customRenderTargets??[])if(target.isEnabled!==false&&!checked(target.isReadyForRendering?.()!==false))block('target',target,null,'render-target');
    for(const system of scene.particleSystems??[])if(system.isStarted?.()&&system.emitter?.isEnabled?.()!==false&&!checked(system.isReady()))block('particles',system,null,'particles');
    for(const layer of scene.layers??[])if(layer.isEnabled!==false&&!checked(layer.isReady?.()!==false))block('layer',layer,null,'layer');
    for(const layer of scene.effectLayers??[])if(layer.isEnabled!==false&&!checked(layer.isLayerReady?.()!==false))block('layer',layer,null,'effect-layer');
  }finally{engine.currentRenderPassId=originalPass;for(const [material,value]of states)material.allowShaderHotSwapping=value;}
  return {ready:blockers.length===0,blockers,meshes,shadows,outlines,errors,progress};
}

// The public call shape and45s screen ceiling stay unchanged. Required visible
// failures reject with a short named blocker; unrelated hidden work is ignored.
export async function waitForSceneReady(scene,{timeoutMs=45000,now=()=>performance.now(),wait=()=>new Promise(r=>setTimeout(r,30)),inspect=currentFrameReadiness,onProgress}={}){
  const start=now();
  for(;;){
    // Real Babylon scenes always have meshes; legacy small test doubles retain
    // their earlier readiness interface without changing the browser contract.
    const state=Array.isArray(scene.meshes)?inspect(scene):{ready:scene.isReady(),blockers:[],errors:Object.values(scene.getEngine()._compiledEffects??{}).filter(failedEffect).map(effect=>({error:failedEffect(effect)}))};
    scene.metadata??={};scene.metadata.screenReady={meshes:state.meshes?.length??0,shadowMeshes:state.shadows?.length??0,blockers:state.blockers.slice(0,8),...(state.progress?{progress:{...state.progress}}:{})};
    if(state.progress)onProgress?.({...state.progress});
    if(state.ready)return;
    const blocker=state.errors[0]??state.blockers[0],detail=blocker?` [${blocker.kind??'shader'}:${blocker.mesh??'unknown'}${blocker.material?'/'+blocker.material:''}]`:'';
    if(state.errors.length){const error=new Error('화면 셰이더를 준비하지 못했습니다.'+detail);error.blocker=blocker;throw error;}
    if(now()-start>=timeoutMs){const error=new Error('화면 준비 시간이 초과되었습니다. 새로고침해 주세요.'+detail);error.name='TimeoutError';error.timeoutMs=timeoutMs;error.blocker=blocker;throw error;}
    await wait();
  }
}
