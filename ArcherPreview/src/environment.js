import { SceneLoader, TransformNode, Texture, Color3, Quaternion, Vector3 } from '@babylonjs/core';
import { TREE_PLACEMENTS, GRASS_BEDS } from './forest-layout.js';
import { attachTreeLod, addDistanceCull } from './tree-lod.js';
import { prepareTreeOcclusion, TreeOcclusion } from './tree-occlusion.js';
import { createFarTreeMaterial } from './tree-material.js';
import { SCENERY_VIEW_DISTANCE } from './world-limits.js';

export async function loadTrainingGround(world,training){
  if(world.environmentPromise)return world.environmentPromise;
  world.environmentPromise=(async()=>{
    const url=new URL(`${import.meta.env.BASE_URL}assets/environment.json`,location.href),response=await fetch(url,{cache:'no-cache'});
    if(!response.ok)throw new Error('훈련장 에셋을 불러오지 못했습니다.');
    const manifest=await response.json();
    if(manifest.ground){
      const texture=await new Promise((resolve,reject)=>{const t=new Texture(new URL(manifest.ground,url).href,world.scene,false,false,Texture.TRILINEAR_SAMPLINGMODE,()=>resolve(t),reject);});
      texture.uScale=texture.vScale=54;texture.anisotropicFilteringLevel=4;
      world.floorMaterial.unfreeze();world.floorMaterial.diffuseTexture?.dispose();world.floorMaterial.diffuseTexture=texture;world.floorMaterial.diffuseColor=new Color3(.82,.85,.81);
    }
    const entries=await Promise.all(Object.entries(manifest.assets).map(async([key,config])=>{
      const model=new URL(config.model,url),asset=await SceneLoader.LoadAssetContainerAsync(new URL('.',model).href,model.pathname.split('/').pop(),world.scene,null,'.gltf');
      for(const material of asset.materials){material.backFaceCulling=false;material.freeze();}
      world.lighting.registerMeshes(asset.meshes);
      if(key.endsWith('-tree'))prepareTreeOcclusion(asset.meshes);
      const distantMaterials = new Map();
      const distantMaterialFor = (material,painted=null) => {
        const cacheKey=`${material.uniqueId}:${Boolean(painted)}`;
        if (!distantMaterials.has(cacheKey)) distantMaterials.set(cacheKey, createFarTreeMaterial(painted??material, world.lighting));
        return distantMaterials.get(cacheKey);
      };
      for(const lod of config.lods??[]){
        const lodUrl=new URL(lod.model,url),variant=await SceneLoader.LoadAssetContainerAsync(new URL('.',lodUrl).href,lodUrl.pathname.split('/').pop(),world.scene,null,'.gltf');
        const cheap = (lod.material??'').endsWith('vertex-lit'),painted=(lod.material??'').startsWith('painted-');
        const materialFor=painted?((original,baked)=>{
          baked.backFaceCulling=false;baked.freeze();
          return cheap?distantMaterialFor(original,baked):baked;
        }):cheap?(original=>distantMaterialFor(original)):null;
        const meshes=attachTreeLod(world.scene,asset,variant,lod.distance,materialFor);
        if(!cheap)world.lighting.registerMeshes(meshes);
        if(key.endsWith('-tree'))prepareTreeOcclusion(meshes);
      }
      if(key.endsWith('-tree'))addDistanceCull(asset,SCENERY_VIEW_DISTANCE);
      else if(key.startsWith('grass-'))addDistanceCull(asset);
      return [key,asset];
    }));
    const assets=Object.fromEntries(entries),plants=[];
    function plant(key,p,index,shadow){
      const root=new TransformNode(`forest-${key}-${index}`,world.scene);
      root.position.set(p.x,world.terrain?.heightAt(p.x,p.z)??0,p.z);root.rotation.y=p.yaw??0;root.scaling.setAll(p.scale??1);
      if(key.startsWith('grass-')&&world.terrain){
        const h=(x,z)=>world.terrain.heightAt(x,z),step=.15;
        const normal=new Vector3(-(h(p.x+step,p.z)-h(p.x-step,p.z))/(2*step),1,-(h(p.x,p.z+step)-h(p.x,p.z-step))/(2*step)).normalize();
        const axis=Vector3.Cross(Vector3.Up(),normal);
        if(axis.lengthSquared()>1e-10)root.rotationQuaternion=Quaternion.RotationAxis(axis.normalize(),Math.acos(normal.y)).multiply(Quaternion.RotationAxis(Vector3.Up(),p.yaw??0));
      }
      const instance=assets[key].instantiateModelsToScene(name=>`${root.name}-${name}`,false,{doNotInstantiate:false});
      for(const node of instance.rootNodes)node.parent=root;
      for(const node of root.getDescendants(false)){
        node.isPickable=false;
        if(node.getTotalVertices?.()>0){if(shadow)world.shadows.addShadowCaster(node,false);}
        node.computeWorldMatrix(true);node.freezeWorldMatrix?.();
      }
      root.freezeWorldMatrix();plants.push(root);return root;
    }
    world.treeOcclusion=new TreeOcclusion(TREE_PLACEMENTS.map((p,i)=>plant(p.key,p,i,Math.hypot(p.x,p.z)<7)));
    GRASS_BEDS.forEach((p,i)=>{
      plant('grass-cluster',{...p,scale:p.radius/.69,yaw:i*2.3},i,false);
      for(let j=0;j<3;j++){const a=j*2.1+i;plant('grass-tuft',{x:p.x+Math.sin(a)*p.radius*.52,z:p.z+Math.cos(a)*p.radius*.52,scale:.72+(j%2)*.18,yaw:a},i*3+j,false);}
    });
    training.applyModel(assets.scarecrow);
    world.environment={ready:true,trees:TREE_PLACEMENTS.length,grassBeds:GRASS_BEDS.length,scarecrows:training.targets.length,assets:Object.keys(assets)};
    return world.environment;
  })().catch(error=>{world.environmentPromise=null;throw error;});
  return world.environmentPromise;
}
