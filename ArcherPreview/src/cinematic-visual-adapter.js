import {TransformNode,Vector3,VertexBuffer} from '@babylonjs/core';
import {loadMapContainer} from './map-container.js';
import {readMapManifest} from './map-manifests.js';
import {MapLoadLifetime,mapLoadAbortError} from './map-load-lifetime.js';
import {instantiateBossModel} from './boss-models.js';
import {applyMonsterToon} from './monster-toon.js';
import {applyVillageToon} from './village-toon.js';
import {attachCharacterOutlines,attachCharacterOutlinesAsync,isRuntimeOutline} from './character-outlines.js';
import {prepareBossShaders} from './boss-shader-warmup.js';
import {initializeVillageKtx2} from './village-ktx2.js';
import {initializeVillageMeshopt} from './village-meshopt.js';

// A visual-only, scoped container cache. Independent rigs/animation targets,
// shared original geometry/textures, no brain, collision, rewards or battle list.
export function createCinematicVisualFactory({world,catalog,baseUrl,readManifest=readMapManifest,loadContainer=loadMapContainer,initialize=async()=>{await initializeVillageKtx2();await initializeVillageMeshopt();},prepareShaders=prepareBossShaders}={}){
 const scene=world.scene,entries=new Map(),adapters=new Set();let disposed=false,initialized;
 const rootUrl=new URL(baseUrl??import.meta.env?.BASE_URL??'/',globalThis.location?.href??'http://localhost/');
 function release(entry){if(--entry.refs>0)return;entries.delete(entry.key);entry.controller.abort(mapLoadAbortError());const finish=()=>{entry.container?.dispose();for(const material of entry.derived)material.dispose(false,false);entry.derived.clear();};finish();entry.pending.finally(finish).catch(()=>{});}
 function sourceFor(definition){
  const key=definition.assetId+'@'+definition.assetVersion;let entry=entries.get(key);if(entry){entry.refs++;return entry;}
  const asset=catalog.entries.find(row=>row.assetId===definition.assetId&&row.version===definition.assetVersion);if(!asset)throw new Error('Unknown cinematic catalog asset/version');
  entry={key,asset,refs:1,controller:new AbortController(),container:null,derived:new Set()};entries.set(key,entry);
  entry.pending=(async()=>{const lifetime=new MapLoadLifetime({signal:entry.controller.signal,stage:'cinematic-visual-source'});let container;try{
   initialized??=initialize();await lifetime.wait(initialized);const url=new URL(asset.runtime.manifest,rootUrl),manifest=await lifetime.wait(readManifest(url)),config=manifest.assets?.[asset.runtime.assetKey]??manifest,model=new URL(config.model??config.lods?.find(row=>row.level===0)?.model??config.lods?.[0]?.model,url);
   if(model.href!==new URL(asset.runtime.model,rootUrl).href)throw new Error('Cinematic catalog/runtime model conflict');
   container=await lifetime.run(()=>loadContainer(model,scene,{lifetime,signal:lifetime.signal}),{onLate:value=>value?.dispose()});lifetime.check();if(disposed||scene.isDisposed)throw mapLoadAbortError();
   for(const group of container.animationGroups)group.stop();const before=new Set(container.meshes.map(mesh=>mesh.material));
   if(asset.geometry.skinned||asset.geometry.clips||asset.geometry.morphTargets)applyMonsterToon(container);else applyVillageToon(container.meshes,world.lighting??{direction:new Vector3(0,1,0),shadowsActive:false});
   for(const mesh of container.meshes)if(mesh.material&&!before.has(mesh.material))entry.derived.add(mesh.material);
   entry.config=config;entry.container=container;container=null;return entry;
  }finally{container?.dispose();lifetime.close();}})();entry.pending.catch(()=>{});return entry;
 }
 function create(definition,context={}){
  if(disposed)throw mapLoadAbortError();const entry=sourceFor(definition);let retired=false,warming,asset,root;
  const encounter={config:{animations:{}},animator:null};
  const valid=()=>!retired&&!disposed&&!scene.isDisposed&&world.scene===scene&&context.isCurrent?.()!==false;
  const check=()=>{if(!valid())throw mapLoadAbortError();};
  const adapter={definition,encounter,
   async warm({preparation,isCurrent=()=>true}={}){
    check();if(asset)return asset;if(warming)return warming;
    warming=(async()=>{await (preparation?preparation.wait(entry.pending):entry.pending);check();if(!isCurrent())throw mapLoadAbortError();
     asset=instantiateBossModel(entry.container);root=new TransformNode('cinematic-visual-'+definition.actorDefinitionId,scene);root.setEnabled(false);const facing=new TransformNode(root.name+'-facing',scene);facing.parent=root;facing.rotation.y=entry.asset.forwardYaw??0;
     for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=facing;
     root.scaling.setAll(entry.asset.units?.metersPerSourceUnit??entry.config.scale??1);const pivot=entry.asset.pivot?.offset??[0,0,0];facing.position.copyFromFloats(-pivot[0],-pivot[1],-pivot[2]);
     const idle=asset.animationGroups.some(group=>group.name===entry.config.animations?.idle)?entry.config.animations.idle:asset.animationGroups[0]?.name;
     encounter.actor=root;encounter.asset=asset;encounter.config={...entry.config,animations:{...entry.config.animations,idle}};
     for(const mesh of asset.meshes){mesh.isPickable=true;mesh.checkCollisions=false;mesh.alwaysSelectAsActiveMesh=true;mesh.metadata={...mesh.metadata,moonforestWarmMaterial:true,cinematicVisual:true};if(mesh.skeleton){mesh.skeleton.useTextureToStoreBoneMatrices=true;if(mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind))mesh.numBoneInfluencers=8;}}
     world.lighting?.registerMeshes(asset.meshes);if(preparation?.incremental)await attachCharacterOutlinesAsync(asset,'scarecrow',preparation);else attachCharacterOutlines(asset,'scarecrow');
     await prepareShaders(asset,{preparation,shadows:world.shadows});check();if(!isCurrent())throw mapLoadAbortError();return asset;
    })();return warming;
   },
   hide(){if(root&&!root.isDisposed()){root.setEnabled(false);encounter.setShadowCasting(false);}},
   estimate(){return {estimatedBytes:definition.population?.estimatedBytes??16*1024*1024};},
   dispose(){if(retired)return;retired=true;adapter.hide();adapters.delete(adapter);const cleanup=()=>{const managers=new Set(asset?.meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean));for(const group of asset?.animationGroups??[])group.dispose();root?.dispose(false,false);for(const skeleton of asset?.skeletons??[])skeleton.dispose();const sources=new Set(entry.container?.meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean));for(const manager of managers)if(!sources.has(manager))manager.dispose();};cleanup();release(entry);return warming?.then(cleanup,cleanup);},
  };
  encounter.setShadowCasting=enabled=>{for(const mesh of asset?.meshes??[])if(mesh.getTotalVertices()&&!isRuntimeOutline(mesh)){if(enabled)world.shadows?.addShadowCaster(mesh,false);else world.shadows?.removeShadowCaster(mesh,false);}};
  adapters.add(adapter);return adapter;
 }
 create.inspect=()=>({actors:adapters.size,sources:entries.size});create.dispose=async()=>{if(disposed)return;disposed=true;await Promise.allSettled([...adapters].map(adapter=>adapter.dispose()));};return create;
}
