import {LoadAssetContainerAsync,MorphTargetManager} from '@babylonjs/core';
import {readMapContainer} from './map-container.js';

export function loadBossModelContainer(scene,model,{lifetime}={}){
  if(lifetime)return lifetime.run(async()=>{
    const response=await lifetime.run(()=>fetch(model,{cache:'force-cache',signal:lifetime.signal}));
    if(!response.ok)throw new Error(`배우 모델을 불러오지 못했습니다 (${response.status}).`);
    const json=await lifetime.run(()=>response.json());
    return readMapContainer(scene,json,new URL('.',model).href,{lifetime,fileName:model.pathname.split('/').pop(),onMeshLoaded:prepareBossMorphUpload});
  },{onLate:container=>container?.dispose()});
  return LoadAssetContainerAsync(model.pathname.split('/').pop(),scene,{
    rootUrl:new URL('.',model).href,pluginExtension:'.gltf',
    pluginOptions:{gltf:{onMeshLoaded:prepareBossMorphUpload}},
  });
}

// Babylon 9.31's default glTF loader pins these same morph slots immediately
// after unfreezing the manager. Pin them while it is still frozen instead, so
// the first synchronize packs/uploads the final texture only once. No target,
// geometry, texture format or final influence policy is changed.
// This hook belongs only to boss loads using the default max-influencer policy.
export function prepareBossMorphUpload(mesh){
  const scene=mesh?.getScene?.(),manager=mesh?.morphTargetManager;
  if(!scene||scene.isDisposed||mesh.isDisposed?.()||!manager?.areUpdatesFrozen||!manager.numTargets)return false;
  const count=manager.numTargets,caps=scene.getEngine().getCaps();
  // synchronize can fall back to attributes when the array layer limit is
  // exceeded. Match the loader's post-synchronize eligibility in that case.
  const textureMode=manager.isUsingTextureForTargets&&count<=caps.texture2DArrayMaxLayerCount;
  if(!textureMode&&count>MorphTargetManager.MaxActiveMorphTargetsInVertexAttributeMode)return false;
  manager.optimizeInfluencers=false;
  manager.numMaxInfluencers=count;
  return true;
}
