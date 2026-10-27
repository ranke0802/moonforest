import { Color3, MeshBuilder, SceneLoader, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { VILLAGE_PLACEMENTS } from './village-layout.js';
import { VillageVisibility } from './village-visibility.js';
import { applyVillageGround } from './village-ground.js';
import { prepareTreeOcclusion, TreeOcclusion } from './tree-occlusion.js';

const geometry=container=>container.meshes.filter(m=>m.getTotalVertices?.()>0);
const tallProps=new Set(['watchtower','well','market-stall','covered-wagon','wood-03-plank-gate']);
export function createVillageTransform(world,placement,config){
  const root=new TransformNode(`village-${placement.id}`,world.scene);
  let groundY=world.terrain.heightAt(placement.x,placement.z);
  if(['wall','fence'].includes(placement.kind)){
    const half=(placement.length??placement.footprint?.[0]??2)*.5;
    const dx=Math.cos(placement.yaw)*half,dz=-Math.sin(placement.yaw)*half;
    groundY=Math.min(groundY,world.terrain.heightAt(placement.x+dx,placement.z+dz),world.terrain.heightAt(placement.x-dx,placement.z-dz));
  }
  root.position.set(placement.x,groundY-.025,placement.z);root.rotation.y=placement.yaw;
  root.scaling.setAll(config.height/config.bounds[1]*placement.scale);
  if(placement.length)root.scaling.x=placement.length/config.bounds[0];
  const facing=new TransformNode(`${root.name}-front`,world.scene);facing.parent=root;facing.rotation.y=config.frontYawOffset??0;
  return {root,facing};
}
export async function loadVillage(world,{onProgress=()=>{}}={}){
  if(world.villagePromise)return world.villagePromise;
  const containers=[],roots=[],records=[];let visibility,fixtureMaterial;
  world.villagePromise=(async()=>{
    const fixture=import.meta.env.DEV&&new URLSearchParams(location.search).get('villageFixture')==='1';
    const url=new URL(`${import.meta.env.BASE_URL}assets/${fixture?'village-fixture':'village'}.json`,location.href);
    const response=await fetch(url,{cache:'no-cache'});
    if(!response.ok)throw new Error('마을 에셋 목록을 불러오지 못했습니다.');
    const manifest=await response.json();
    if(!manifest.complete&&!fixture)throw new Error('마을 에셋 제작이 아직 완료되지 않았습니다.');
    if(!fixture&&manifest.developmentFixture)throw new Error('개발 검수용 에셋 목록은 배포에 사용할 수 없습니다.');
    applyVillageGround(world);
    const touch=world.touchDevice,assets=new Map(),loadedLods={0:0,1:0,2:0};let largestTexture=0;
    const load=async config=>{
      const model=new URL(config.model,url);
      const container=await SceneLoader.LoadAssetContainerAsync(new URL('.',model).href,model.pathname.split('/').pop(),world.scene,null,'.gltf');
      loadedLods[config.level]++;largestTexture=Math.max(largestTexture,config.textureSize);
      containers.push(container);return container;
    };
    let completed=0;
    for(const [id,config]of Object.entries(manifest.assets)){
      // Phones never fetch/decode the 2K tier; all meshes still share GPU buffers.
      const levels=config.lods.filter(l=>!touch||l.level>0);
      const source=await load(levels[0]),full=geometry(source);
      const cover=['building','tree','rock'].includes(config.category)||tallProps.has(id);
      if(cover)prepareTreeOcclusion(full);
      for(const mat of source.materials){mat.backFaceCulling=!['tree','plant'].includes(config.category);}
      world.lighting.registerMeshes(full);
      for(let index=1;index<levels.length;index++){
        const variant=await load(levels[index]),low=geometry(variant);
        if(cover)prepareTreeOcclusion(low);
        if(low.length!==full.length)throw new Error(`${id}: LOD의 메시 구성이 다릅니다.`);
        for(let part=0;part<full.length;part++){
          const mesh=low[part];mesh.isPickable=false;world.scene.addMesh(mesh);
          mesh.material.backFaceCulling=!['tree','plant'].includes(config.category);
          mesh.receiveShadows=false;mesh.material.freeze();
          full[part].addLODLevel(touch?34:levels[index].level===1?25:49,mesh);
        }
      }
      for(const mesh of full){mesh.addLODLevel(world.villageOverview?260:world.villagePolicy.meshCull,null);mesh.isPickable=false;mesh.material.freeze();}
      assets.set(id,{source,config,cover});onProgress(++completed,Object.keys(manifest.assets).length);
    }
    if(fixture){
      fixtureMaterial=new StandardMaterial('development-only-footprint',world.scene);
      fixtureMaterial.emissiveColor=new Color3(.75,.58,.25);fixtureMaterial.disableLighting=true;fixtureMaterial.wireframe=true;
      fixtureMaterial.freeze();
    }
    for(const placement of VILLAGE_PLACEMENTS){
      const asset=assets.get(placement.asset);
      if(!asset){
        if(!fixture)throw new Error(`마을에 필요한 에셋이 없습니다: ${placement.asset}`);
        const [w,d]=placement.footprint??[1.1,1.1];
        const box=MeshBuilder.CreateBox(`fixture-missing-${placement.id}`,{width:w,depth:d,height:.12},world.scene);
        box.position.set(placement.x,world.terrain.heightAt(placement.x,placement.z)+.06,placement.z);box.rotation.y=placement.yaw;
        box.material=fixtureMaterial;box.isPickable=false;box.freezeWorldMatrix();roots.push(box);continue;
      }
      const {source,config}=asset,{root,facing}=createVillageTransform(world,placement,config);
      roots.push(root);
      const instance=source.instantiateModelsToScene(name=>`${root.name}-${name}`,false,{doNotInstantiate:false});
      for(const node of instance.rootNodes)node.parent=facing;
      const meshes=root.getChildMeshes().filter(m=>m.getTotalVertices()>0);
      const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
      for(const mesh of meshes){
        mesh.isPickable=false;mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();
        const box=mesh.getBoundingInfo().boundingBox;min.minimizeInPlace(box.minimumWorld);max.maximizeInPlace(box.maximumWorld);
      }
      facing.freezeWorldMatrix();root.freezeWorldMatrix();records.push({root,meshes,placement,min,max,blocksPlayerView:asset.cover});
    }
    world.treeOcclusion=new TreeOcclusion(records.filter(r=>r.blocksPlayerView&&Math.hypot(r.placement.x,r.placement.z)<54).map(r=>r.root));
    visibility=new VillageVisibility(world,records,{touch});world.villageVisibility=visibility;
    world.environment={ready:true,mode:fixture?'village-fixture':'village',sourceAssets:assets.size,homes:20,instances:records.length,missing:manifest.missing,loadedLods,largestTexture,textureTier:touch?'1K / 512':'2K / 1K / 512',visibility:visibility.stats};
    world.scene.onDisposeObservable.addOnce(()=>{visibility.dispose();for(const c of containers)c.dispose();});
    return world.environment;
  })().catch(error=>{
    visibility?.dispose();for(const r of roots)r.dispose();for(const c of containers)c.dispose();fixtureMaterial?.dispose();
    world.villageVisibility=null;world.treeOcclusion=null;world.environment={ready:false,mode:'village',error:error.message};
    // Only a new explicit load action retries; no automatic network retry loop.
    world.villagePromise=null;throw error;
  });
  return world.villagePromise;
}
