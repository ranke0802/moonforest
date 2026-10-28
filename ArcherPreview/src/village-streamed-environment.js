import {SceneLoader} from '@babylonjs/core';
import {VILLAGE_PLACEMENTS} from './village-layout.js';
import {createVillageTransform} from './village-environment.js';
import {placementBounds,villageDemand,VillageGeometryStreaming} from './village-demand.js';
import {villageLodSources,VILLAGE_LOD_COVERAGE} from './village-lod.js';
import {VillageVisibility} from './village-visibility.js';
import {TreeOcclusion,prepareTreeOcclusion} from './tree-occlusion.js';
import {VillageOutlines} from './village-outlines.js';
import {VillageTextureStreaming} from './village-texture-streaming.js';
import {applyVillageToon} from './village-toon.js';
import {initializeVillageKtx2} from './village-ktx2.js';
import {initializeVillageMeshopt} from './village-meshopt.js';
import {applyVillageGround} from './village-ground.js';
import {prepareVillageInstancing} from './village-instancing.js';
import {VillageWorkBudget} from './village-work-budget.js';

const geometry=c=>c.meshes.filter(m=>m.getTotalVertices?.()>0);
const tallProps=new Set(['watchtower','well','market-stall','covered-wagon','wood-03-plank-gate']);

export async function prepareVillageStart(world){
  if(world.villagePrepared)return world.villagePrepared;
  const url=new URL(`${import.meta.env?.BASE_URL??'/'}assets/${world.environmentManifest??'village'}.json`,location.href);
  const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw new Error('마을 목록을 불러오지 못했습니다.');
  const manifest=await response.json();if(!manifest.complete||manifest.developmentFixture)throw new Error('완성된 마을 에셋이 필요합니다.');
  const assets=new Map(Object.entries(manifest.assets).map(([id,config])=>[id,{config,levels:villageLodSources(config,world.touchDevice),tiers:new Map(),baseLevel:Infinity,cover:['building','tree','rock'].includes(config.category)||tallProps.has(id)}]));
  const records=(world.placements??VILLAGE_PLACEMENTS).map(placement=>{
    const asset=assets.get(placement.asset);if(!asset)throw new Error('Missing village asset '+placement.asset);
    const {root,facing}=createVillageTransform(world,placement,asset.config),bounds=placementBounds(world,placement,asset.config);
    return {root,facing,placement,bounds,min:bounds.min,max:bounds.max,meshes:[],blocksPlayerView:asset.cover};
  });
  const plan=villageDemand(world,records),resources=[...new Set(plan.flatMap(r=>assets.get(r.id).levels.find(l=>l.level===r.level).resources))];
  return world.villagePrepared={url,manifest,assets,records,plan,resources};
}

// Promote only the routing mesh. Its existing instances keep their transforms,
// shadow/occlusion identity and native screen-coverage LOD selection. Coarser
// geometry stays in separate LOD sources before a finer geometry is installed.
export function installVillageGeometry(asset,container,level,world){
  const incoming=geometry(container);
  if(!asset.source){
    asset.source=container;asset.baseMeshes=incoming;
    const archive=level===0?incoming:incoming.map(mesh=>{
      const copy=mesh.clone(mesh.name+'-stream-lod-'+level,null,true);
      // Babylon treats a null clone parent as "inherit source parent". Detach
      // explicitly so glTF root instantiation cannot duplicate the LOD archive.
      copy.parent=null;copy.metadata={...mesh.metadata};prepareVillageInstancing([copy]);prepareTreeOcclusion([copy]);return copy;
    });
    asset.tiers.set(level,{container,meshes:archive});
  }else{
    if(incoming.length!==asset.baseMeshes.length)throw new Error('LOD mesh layout differs');
    asset.tiers.set(level,{container,meshes:incoming});
  }
  if(level<asset.baseLevel){
    for(let i=0;i<incoming.length;i++){
      const base=asset.baseMeshes[i],next=incoming[i];
      if(base!==next){
        next.geometry.applyToMesh(base);
        // applyToMesh retains old submeshes when their smaller ranges still fit
        // the new buffers. A coarse-to-fine promotion then draws only fragments
        // of the new topology. Copy the authored primitive ranges as well.
        base.releaseSubMeshes();
        for(const subMesh of next.subMeshes)subMesh.clone(base,base);
        base.synchronizeInstances();
      }
      base.material=next.material;base.metadata={...next.metadata,villageLodLevel:level};base.refreshBoundingInfo();
      for(const instance of base.instances)instance.refreshBoundingInfo();
    }
    asset.baseLevel=level;
  }
  if(level===0)asset.nearSource=container;
  for(let i=0;i<asset.baseMeshes.length;i++){
    const base=asset.baseMeshes[i];base.useLODScreenCoverage=true;base.isPickable=false;
    for(const tier of [1,2]){
      const low=asset.tiers.get(tier)?.meshes[i];if(!low||base.getLODLevels().some(l=>l.mesh===low))continue;
      base.addLODLevel(tier===1?VILLAGE_LOD_COVERAGE.mid:VILLAGE_LOD_COVERAGE.far,low);if(!world.scene.meshes.includes(low))world.scene.addMesh(low);
    }
  }
}

export function loadStreamedVillage(world,{
  initialize=async()=>{await initializeVillageKtx2();await initializeVillageMeshopt();},
  ground=applyVillageGround,
  loadContainer=(model,scene)=>SceneLoader.LoadAssetContainerAsync(new URL('.',model).href,model.pathname.split('/').pop(),scene,null,'.gltf'),
}={}){
  if(world.villagePromise)return world.villagePromise;
  world.villagePromise=(async()=>{
    const prepared=await prepareVillageStart(world),{url,manifest,assets,records,plan}=prepared,containers=[];
    await initialize();await ground(world);
    const stats=world.environment={ready:false,mode:world.mapId??'village',sourceAssets:assets.size,loadedAssets:0,homes:world.forest?0:20,instances:0,missing:[],loadedLods:{0:0,1:0,2:0},largestTexture:0,geometryLod:true,textureTier:'근거리 최대 4K / 중거리 1K / 원거리 512·256',geometryPending:0,geometryError:null,initialLodModels:plan.length};
    const visibility=new VillageVisibility(world,records,{touch:world.touchDevice}),outlines=new VillageOutlines(world,[],stats);
    world.villageVisibility=visibility;stats.visibility=visibility.stats;world.treeOcclusion=new TreeOcclusion([]);
    let textures,disposed=false;
    const has=r=>assets.get(r.id).tiers.has(r.level);
    const load=async({id,level})=>{
      if(disposed)return;const asset=assets.get(id),config=asset.levels.find(l=>l.level===level);if(!config)throw new Error('Missing LOD '+id+':'+level);
      const work=new VillageWorkBudget(()=>world.villageStreaming?.active,()=>disposed);
      await world.prefetchResources?.(config.resources);
      if(disposed)return;
      const model=new URL(config.model,url),container=await loadContainer(model,world.scene);
      if(disposed){container.dispose();return;}containers.push(container);
      const meshes=geometry(container);prepareVillageInstancing(meshes);applyVillageToon(meshes,world.lighting);prepareTreeOcclusion(meshes);
      for(const mesh of meshes){mesh.isPickable=false;mesh.metadata={...mesh.metadata,villageLodLevel:level};mesh.material.backFaceCulling=!['tree','plant'].includes(asset.config.category);}
      world.lighting.registerMeshes(meshes);
      for(const mesh of meshes)await mesh.material.forceCompilationAsync(mesh,{useInstances:true});
      if(disposed)return;
      installVillageGeometry(asset,container,level,world);
      const instances=records.filter(r=>r.placement.asset===id);
      for(const record of instances)if(!record.meshes.length){
        if(work.due())await work.yield();if(disposed)return;
        const instance=asset.source.instantiateModelsToScene(name=>record.root.name+'-'+name,false,{doNotInstantiate:false});
        for(const node of instance.rootNodes)node.parent=record.facing;
        record.meshes=record.root.getChildMeshes().filter(m=>m.getTotalVertices()>0);
        for(const mesh of record.meshes){mesh.isPickable=false;mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();}
        record.facing.freezeWorldMatrix();record.root.freezeWorldMatrix();stats.instances++;
      }
      const activeSources=[...new Set([...asset.baseMeshes,...[...asset.tiers.values()].flatMap(t=>t.meshes)])];
      world.lighting.registerMeshes(activeSources);
      for(const mesh of activeSources)outlines.sourceFor(mesh);
      outlines.addRecords(instances);await outlines.prepare(activeSources);
      if(disposed)return;
      const covered=instances.filter(r=>r.blocksPlayerView&&(world.forest||Math.hypot(r.placement.x,r.placement.z)<54));
      for(const record of covered){
        if(work.due())await work.yield();if(disposed)return;
        world.treeOcclusion.refreshRoots([record.root]);
      }
      stats.loadedLods[level]++;stats.loadedAssets=[...assets.values()].filter(a=>a.source).length;stats.largestTexture=Math.max(stats.largestTexture,config.textureSize);
    };
    const streaming=new VillageGeometryStreaming(world,records,load,has,stats);world.villageStreaming=streaming;
    let cleaned=false;
    const stop=()=>{if(disposed)return;disposed=true;streaming.dispose();textures?.dispose();};
    const cleanup=()=>{
      if(cleaned)return;cleaned=true;outlines.dispose();visibility.dispose();
      for(const r of records)r.root.dispose();
      for(const asset of assets.values())for(const tier of asset.tiers.values())for(const mesh of tier.meshes)if(!mesh.isDisposed())mesh.dispose();
      for(const c of containers)c.dispose();
      world.scene.onDisposeObservable.remove(disposeObserver);
      Object.assign(world,{villagePrepared:null,villagePromise:null,villageVisibility:null,treeOcclusion:null,villageStreaming:null,villageRenderRecords:null,releaseEnvironment:null});
    };
    const dispose=()=>{stop();cleanup();};
    const disposeObserver=world.scene.onDisposeObservable.addOnce(dispose);
    world.releaseEnvironment=async()=>{stop();await Promise.allSettled([streaming.pending,textures?.pendingTask].filter(Boolean));cleanup();};
    try{
      await streaming.initial(plan);
      textures=new VillageTextureStreaming(world,assets,records,url,stats);
      world.villageRenderRecords=records;stats.ready=true;return stats;
    }catch(error){dispose();throw error;}
  })().catch(error=>{for(const r of world.villagePrepared?.records??[])r.root.dispose();world.villagePrepared=null;world.villagePromise=null;world.villageVisibility=null;world.treeOcclusion=null;world.villageStreaming=null;throw error;});
  return world.villagePromise;
}
