import {instantiateStaticMap} from './static-map-instances.js';
import {loadMapContainer} from './map-container.js';
import {readMapManifest} from './map-manifests.js';
import {VILLAGE_PLACEMENTS} from './village-layout.js';
import {createVillageTransform} from './village-environment.js';
import {placementBounds,villageDemand,VillageGeometryStreaming} from './village-demand.js';
import {villageLodSources,hasVillageGeometry,VILLAGE_LOD_COVERAGE} from './village-lod.js';
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
import {prepareMapMaterials,retainMapEffect} from './map-shader-cache.js';
import {laboratoryLegacySource} from './cave-laboratory-geometry.js';
import {MapLoadLifetime,mapLoadAbortError,MAP_MODEL_TIMEOUT_MS,mapLoadSnapshot,checkMapLoadSnapshot} from './map-load-lifetime.js';
import {InstancedMesh,Mesh,SubMesh} from '@babylonjs/core';

const geometry=c=>c.meshes.filter(m=>m.getTotalVertices?.()>0);
const tallProps=new Set(['watchtower','well','market-stall','covered-wagon','wood-03-plank-gate']);
// These authored two-sided surfaces have real open edges in every packed LOD.
// Keep the source's coloured back faces instead of leaving only the ink hull.
// Solid walls, foundations and the closed canopy retain the ordinary policy.
export const CAVE_OPEN_SURFACE_ASSETS=Object.freeze(['cave-04-natural-arch','cave-13-votive-lantern','cave-15-resurrection-altar','cave-16-soul-collector-arm','cave-17-faded-sacred-emblem','cave-s03-dry-spillway-rock','forest-06-witch-cave-mouth']);
const openCaveSurfaces=new Set(CAVE_OPEN_SURFACE_ASSETS);
export function configureVillageSurfaceCulling(mesh,{cave=false,assetId,category}={}){
  const material=mesh.material;if(!material)return;
  material.metadata??={};
  if(!Object.hasOwn(material.metadata,'villageAuthoredBackFaceCulling'))material.metadata.villageAuthoredBackFaceCulling=material.backFaceCulling;
  const authoredTwoSided=material.metadata.villageAuthoredBackFaceCulling===false;
  material.backFaceCulling=!(['tree','plant'].includes(category)||(cave&&authoredTwoSided&&openCaveSurfaces.has(assetId)));
}
export function caveStructuralRecord(record,asset){return record.placement.kind==='rock'||asset?.config?.category==='rock';}

export async function prepareVillageStart(world,{signal,lifetime,timeoutMs,timers}={}){
  if(world.villagePrepared)return world.villagePrepared;
  const ownLifetime=!lifetime;lifetime??=new MapLoadLifetime({signal,timeoutMs,timers,stage:'map-plan'});const snapshot=mapLoadSnapshot(world);
  const observer=world.scene.onDisposeObservable.addOnce(()=>lifetime.abort(mapLoadAbortError()));
  try{
  checkMapLoadSnapshot(world,snapshot,lifetime);
  const url=new URL(`${import.meta.env?.BASE_URL??'/'}assets/${world.environmentManifest??'village'}.json`,location.href);
  const manifest=await lifetime.run(()=>readMapManifest(url,{timeoutMs,timers}));checkMapLoadSnapshot(world,snapshot,lifetime);
  if(world.villagePrepared)return world.villagePrepared;
  if(!manifest.complete||manifest.developmentFixture)throw new Error('완성된 마을 에셋이 필요합니다.');
  const assets=new Map(Object.entries(manifest.assets).map(([id,config])=>[id,{config,levels:villageLodSources(config,world.touchDevice),tiers:new Map(),baseLevel:Infinity,cover:['building','tree','rock'].includes(config.category)||tallProps.has(id)}]));
  const records=(world.placements??VILLAGE_PLACEMENTS).map(placement=>{
    const asset=assets.get(placement.asset);if(!asset)throw new Error('Missing village asset '+placement.asset);
    const {root,facing}=createVillageTransform(world,placement,asset.config),bounds=placementBounds(world,placement,asset.config);
    const essentialStructural=world.cave&&asset.config.essentialStructural===true;
    return {root,facing,placement,bounds,min:bounds.min,max:bounds.max,meshes:[],blocksPlayerView:asset.cover,essentialStructural,structuralReady:!essentialStructural};
  });
  world.caveFog?.updateRecords(records);
  const plan=villageDemand(world,records);
  // Structural far geometry replaces a previously always-closed room surface.
  // It must finish before the loading veil lifts, even outside current FoW.
  for(const id of new Set(records.filter(r=>r.essentialStructural).map(r=>r.placement.asset))){
    if(!assets.get(id).levels.some(l=>l.level===2))throw Error('Essential cave structure requires a far LOD');
    const previous=plan.findIndex(r=>r.id===id&&r.level===2);if(previous>=0)plan.splice(previous,1);
    plan.unshift({id,level:2,priority:Infinity});
  }
  const resources=[...new Set(plan.flatMap(r=>assets.get(r.id).levels.find(l=>l.level===r.level).resources))];
  return world.villagePrepared={url,manifest,assets,records,plan,resources};
  }finally{snapshot.scene.onDisposeObservable.remove(observer);if(ownLifetime)lifetime.close();}
}

// Promote only the routing mesh. Its existing instances keep their transforms,
// shadow/occlusion identity and native screen-coverage LOD selection. Coarser
// geometry stays in separate LOD sources before a finer geometry is installed.
export function refreshVillagePromotionBounds(base){
  const safe=!base.skeleton&&!base.morphTargetManager&&base.refreshBoundingInfo===Mesh.prototype.refreshBoundingInfo&&
    base._getData===Mesh.prototype._getData&&base._refreshBoundingInfo===Mesh.prototype._refreshBoundingInfo&&
    base.getVerticesData===Mesh.prototype.getVerticesData&&base.hasBoundingInfo&&!base.getBoundingInfo().isLocked&&base.subMeshes?.length===1&&base.subMeshes[0].IsGlobal;
  const bounds=safe?base.getBoundingInfo():null;
  for(const instance of base.instances){
    // Global submeshes use their parent bounds. Multi-submesh, deformed, locked
    // or custom instances retain Babylon's complete per-instance refresh.
    if(!safe||instance.sourceMesh!==base||instance.refreshBoundingInfo!==InstancedMesh.prototype.refreshBoundingInfo||
       instance._refreshBoundingInfo!==InstancedMesh.prototype._refreshBoundingInfo||instance.getTotalVertices!==InstancedMesh.prototype.getTotalVertices||
       instance._updateBoundingInfo!==InstancedMesh.prototype._updateBoundingInfo||!instance.hasBoundingInfo||
       instance.getBoundingInfo().isLocked||instance.subMeshes?.length!==1||!instance.subMeshes[0].IsGlobal||
       instance.subMeshes[0].refreshBoundingInfo!==SubMesh.prototype.refreshBoundingInfo){
      instance.refreshBoundingInfo();continue;
    }
    instance.getBoundingInfo().reConstruct(bounds.minimum,bounds.maximum);
    // Even a global submesh invalidates its cached collision vertices before
    // returning; this is a constant-time SDK call with no vertex scan.
    instance.subMeshes[0].refreshBoundingInfo();
    instance._updateBoundingInfo();
  }
}
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
      refreshVillagePromotionBounds(base);
    }
    asset.baseLevel=level;
  }
  if(level===0||asset.levels?.some(l=>l.level===0&&l.model===asset.levels.find(t=>t.level===level)?.model))asset.nearSource=container;
  for(let i=0;i<asset.baseMeshes.length;i++){
    const base=asset.baseMeshes[i];base.useLODScreenCoverage=true;base.isPickable=false;
    for(const tier of [1,2]){
      const low=asset.tiers.get(tier)?.meshes[i];if(!low||base.getLODLevels().some(l=>l.mesh===low))continue;
      base.addLODLevel(tier===1?VILLAGE_LOD_COVERAGE.mid:VILLAGE_LOD_COVERAGE.far,low);if(!world.scene.meshes.includes(low))world.scene.addMesh(low);
    }
  }
}

export function loadStreamedVillage(world,{
  initialize=async options=>{await initializeVillageKtx2(options);await initializeVillageMeshopt(options);},
  ground=applyVillageGround,
  loadContainer=loadMapContainer,
  signal,modelTimeoutMs=MAP_MODEL_TIMEOUT_MS,modelTimers,setupTimeoutMs=modelTimeoutMs,setupTimers=modelTimers,
}={}){
  if(world.villagePromise)return world.villagePromise;
  const owner={},controller=new AbortController();world.villageLoadOwner=owner;let ownedPrepared=null;
  const forwardAbort=()=>controller.abort(signal.reason??mapLoadAbortError());
  if(signal?.aborted)forwardAbort();else signal?.addEventListener('abort',forwardAbort,{once:true});
  // Release is available even while a manifest/decoder config has not answered.
  // Only this owner can clear the fields; a retry may already own the same world.
  world.releaseEnvironment=async()=>{controller.abort(mapLoadAbortError());if(world.villageLoadOwner===owner){for(const r of ownedPrepared?.records??[])r.root.dispose();Object.assign(world,{villageLoadOwner:null,villagePrepared:null,villagePromise:null,releaseEnvironment:null});}};
  world.villagePromise=(async()=>{
    if(controller.signal.aborted)throw controller.signal.reason;
    const setup=new MapLoadLifetime({signal:controller.signal,timeoutMs:setupTimeoutMs,timers:setupTimers,stage:'map-plan'}),snapshot=mapLoadSnapshot(world),setupObserver=world.scene.onDisposeObservable.addOnce(()=>controller.abort(mapLoadAbortError()));let prepared;
    try{
      prepared=await setup.run(()=>prepareVillageStart(world,{lifetime:setup,timeoutMs:setupTimeoutMs,timers:setupTimers}));checkMapLoadSnapshot(world,snapshot,setup);ownedPrepared=prepared;
      setup.stage='decoder-init';await setup.run(()=>initialize({timeoutMs:setupTimeoutMs,timers:setupTimers}));checkMapLoadSnapshot(world,snapshot,setup);
      setup.stage='ground';await setup.run(()=>ground(world,{lifetime:setup}));checkMapLoadSnapshot(world,snapshot,setup);
    }catch(error){setup.abort(error);error.stage??=setup.stage;throw error;}finally{setup.close();snapshot.scene.onDisposeObservable.remove(setupObserver);}
    const {url,manifest,assets,records,plan}=prepared,containers=[];
    const stats=world.environment={ready:false,mode:world.mapId??'village',sourceAssets:assets.size,loadedAssets:0,homes:world.mapId==='village'?20:0,instances:0,missing:[],loadedLods:{0:0,1:0,2:0},largestTexture:0,geometryLod:true,textureTier:'근거리 최대 4K / 중거리 1K / 원거리 512·256',geometryPending:0,geometryError:null,modelFailure:null,initialLodModels:plan.length};
    const visibility=new VillageVisibility(world,records,{touch:world.touchDevice}),outlines=new VillageOutlines(world,[],stats);
    world.villageVisibility=visibility;stats.visibility=visibility.stats;world.treeOcclusion=new TreeOcclusion([]);
    let textures,disposed=false,initializing=true;const pendingLoads=new Set();
    const has=r=>hasVillageGeometry(assets.get(r.id),r.level);
    const load=async({id,level})=>{
      if(disposed)return;const asset=assets.get(id),config=asset.levels.find(l=>l.level===level);if(!config)throw new Error('Missing LOD '+id+':'+level);
      const lifetime=new MapLoadLifetime({signal:controller.signal,timeoutMs:modelTimeoutMs,timers:modelTimers}),cancelled=()=>disposed||lifetime.signal.aborted;
      const operation=lifetime.run(async()=>{
      const work=new VillageWorkBudget(()=>world.villageStreaming?.active,cancelled);
      await lifetime.run(()=>world.prefetchResources?.(config.resources,{initial:initializing}));lifetime.check();
      const model=new URL(config.model,url),container=await lifetime.run(()=>loadContainer(model,world.scene,{signal:lifetime.signal,lifetime}),{onLate:container=>container?.dispose()});
      lifetime.check();containers.push(container);
      const meshes=geometry(container);
      if(world.cave&&asset.config.category==='rock')for(const mesh of meshes)if(mesh.material)mesh.material.metadata={...mesh.material.metadata,caveRockTone:true,caveRockPaletteOnly:asset.config.surfaceStyle==='cave-palette',caveLegacyLaboratoryClip:laboratoryLegacySource(id)};
      prepareVillageInstancing(meshes);applyVillageToon(meshes,world.lighting);prepareTreeOcclusion(meshes);
      for(const mesh of meshes){world.caveAtmosphere?.attachMaterial(mesh.material);world.caveFog?.attach(mesh.material);}
      for(const mesh of meshes){mesh.isPickable=false;mesh.metadata={...mesh.metadata,villageLodLevel:level};configureVillageSurfaceCulling(mesh,{cave:world.cave,assetId:id,category:asset.config.category});}
      world.lighting.registerMeshes(meshes);
      await lifetime.run(()=>prepareMapMaterials(meshes,{cancelled}));lifetime.check();
      installVillageGeometry(asset,container,level,world);
      const instances=records.filter(r=>r.placement.asset===id);
      for(const record of instances)if(!record.meshes.length){
        if(work.due())await lifetime.run(()=>work.yield());lifetime.check();
        const instance=instantiateStaticMap(asset.source,name=>record.root.name+'-'+name);
        for(const node of instance.rootNodes)node.parent=record.facing;
        record.meshes=record.root.getChildMeshes().filter(m=>m.getTotalVertices()>0);
        for(const mesh of record.meshes){mesh.isPickable=false;mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();}
        record.facing.freezeWorldMatrix();record.root.freezeWorldMatrix();stats.instances++;
      }
      world.caveFog?.updateRecords(instances);
      const activeSources=[...new Set([...asset.baseMeshes,...[...asset.tiers.values()].flatMap(t=>t.meshes)])];
      world.lighting.registerMeshes(activeSources);
      for(const mesh of activeSources)outlines.sourceFor(mesh);
      outlines.addRecords(instances);await lifetime.run(()=>outlines.prepare(activeSources,{cancelled}));lifetime.check();
      if(level===2&&instances.some(r=>r.essentialStructural)){
        for(const record of instances)if(record.essentialStructural)record.structuralReady=true;
        world.caveFog?.updateRecords(instances);
        world.caveAtmosphere?.activateLaboratoryGeometry?.();
      }
      // Cave rock walls use a narrow eye-to-player cutaway; never fade an
      // entire room wall like a tree canopy and reveal rooms behind it.
      const covered=instances.filter(r=>r.blocksPlayerView&&!r.placement.background&&!(world.cave&&caveStructuralRecord(r,asset))&&(world.forest||world.plains||world.cave||Math.hypot(r.placement.x,r.placement.z)<54));
      for(const record of covered){
        if(work.due())await lifetime.run(()=>work.yield());lifetime.check();
        world.treeOcclusion.refreshRoots([record.root]);
      }
      stats.loadedLods[level]++;stats.loadedAssets=[...assets.values()].filter(a=>a.source).length;stats.largestTexture=Math.max(stats.largestTexture,config.textureSize);
      });pendingLoads.add(operation);
      try{return await operation;}catch(error){
        if(error.name!=='AbortError'){error.assetId??=id;error.level??=level;stats.modelFailure={name:error.name,code:error.code??null,timeoutMs:error.timeoutMs??null,assetId:id,level,message:String(error.message??error)};}
        throw error;
      }finally{pendingLoads.delete(operation);lifetime.close();}
    };
    const streaming=new VillageGeometryStreaming(world,records,load,has,stats);world.villageStreaming=streaming;
    let cleaned=false;
    const stop=()=>{if(disposed)return;disposed=true;controller.abort(mapLoadAbortError());streaming.dispose();textures?.dispose();};
    const cleanup=()=>{
      if(cleaned)return;cleaned=true;
      // Capture the variants that really drew (including active shadows), not
      // only the prewarm variants compiled before the first caster selection.
      if(!world.scene.isDisposed){
        retainMapEffect(outlines.material.getEffect());
        for(const c of containers)for(const mesh of c.meshes)for(const sub of mesh.subMeshes??[])retainMapEffect(sub.effect);
      }
      outlines.dispose();visibility.dispose();
      for(const r of records)r.root.dispose();
      for(const asset of assets.values())for(const tier of asset.tiers.values())for(const mesh of tier.meshes)if(!mesh.isDisposed())mesh.dispose();
      for(const c of containers)c.dispose();
      world.scene.onDisposeObservable.remove(disposeObserver);
      signal?.removeEventListener('abort',forwardAbort);
      if(world.villageLoadOwner===owner)Object.assign(world,{villageLoadOwner:null,villagePrepared:null,villagePromise:null,villageVisibility:null,treeOcclusion:null,villageStreaming:null,villageRenderRecords:null,releaseEnvironment:null});
    };
    const dispose=()=>{stop();cleanup();};
    const disposeObserver=world.scene.onDisposeObservable.addOnce(dispose);
    world.releaseEnvironment=async()=>{stop();await Promise.allSettled([...pendingLoads,streaming.pending,textures?.pendingTask].filter(Boolean));cleanup();};
    try{
      await streaming.initial(plan);
      initializing=false;
      if(disposed)throw Object.assign(new Error('Map load was released'),{name:'AbortError'});
      textures=new VillageTextureStreaming(world,assets,records,url,stats);
      world.villageRenderRecords=records;stats.ready=true;return stats;
    }catch(error){dispose();throw error;}
  })().catch(error=>{signal?.removeEventListener('abort',forwardAbort);if(world.villageLoadOwner===owner){for(const r of ownedPrepared?.records??[])r.root.dispose();Object.assign(world,{villageLoadOwner:null,villagePrepared:null,villagePromise:null,villageVisibility:null,treeOcclusion:null,villageStreaming:null,releaseEnvironment:null});}throw error;});
  return world.villagePromise;
}
