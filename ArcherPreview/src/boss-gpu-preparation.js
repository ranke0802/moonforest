import {LoadAssetContainerAsync,MorphTargetManager} from '@babylonjs/core';
import {readMapContainer} from './map-container.js';
import {prepareMourningDeathDepth} from './mourning-death-depth.js';

const preparedCloneSources=new WeakSet();
export function prepareBossCloneSource(container){
  if(preparedCloneSources.has(container))return;
  // This existing immutable death-target correction is actor-independent.
  // Correct it once before cloning; target objects/weights remain independent,
  // while Babylon shares their immutable data arrays. No live actor is adopted.
  for(const manager of new Set(container.meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean))){
    manager.areUpdatesFrozen=true;
    try{prepareMourningDeathDepth(manager,container.meshes);}finally{manager.areUpdatesFrozen=false;}
  }
  preparedCloneSources.add(container);
}
export function cloneBossMorphManager(source,scene){
  const copy=new MorphTargetManager(scene,source.meshName);copy.areUpdatesFrozen=true;
  try{
    copy.useTextureToStoreTargets=source.useTextureToStoreTargets;
    for(const field of ['enablePositionMorphing','enableNormalMorphing','enableTangentMorphing','enableUVMorphing','enableUV2Morphing','enableColorMorphing','optimizeInfluencers'])copy[field]=source[field];
    copy.numMaxInfluencers=source.numMaxInfluencers;
    for(let i=0;i<source.numTargets;i++)copy.addTarget(source.getTarget(i).clone());
    copy.metadata=source.metadata;
    copy.areUpdatesFrozen=false;return copy;
  }catch(error){copy.dispose();throw error;}
}

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
