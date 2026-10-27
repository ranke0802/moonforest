import { SceneLoader } from '@babylonjs/core';

// Retain the existing finished practice target without loading legacy trees,
// grass, ground textures or submitting any new model-generation request.
export function loadVillageTrainingTarget(world,training){
  if(world.villageTrainingPromise)return world.villageTrainingPromise;
  let asset;
  world.villageTrainingPromise=(async()=>{
    const url=new URL(`${import.meta.env.BASE_URL}assets/environment.json`,location.href),response=await fetch(url,{cache:'no-cache'});
    if(!response.ok)throw new Error('기존 훈련 허수아비 목록을 불러오지 못했습니다.');
    const manifest=await response.json(),config=manifest.assets?.scarecrow;
    if(!config?.model)throw new Error('기존 훈련 허수아비 모델이 없습니다.');
    const model=new URL(config.model,url);
    asset=await SceneLoader.LoadAssetContainerAsync(new URL('.',model).href,model.pathname.split('/').pop(),world.scene,null,'.gltf');
    for(const material of asset.materials){material.backFaceCulling=false;material.freeze();}
    world.lighting.registerMeshes(asset.meshes);training.applyModel(asset);
    world.environment.legacyTrainingModel='scarecrow';
    world.scene.onDisposeObservable.addOnce(()=>asset.dispose());
    return asset;
  })().catch(error=>{asset?.dispose();world.villageTrainingPromise=null;throw error;});
  return world.villageTrainingPromise;
}
