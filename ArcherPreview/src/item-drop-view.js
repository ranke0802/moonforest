import {TransformNode} from '@babylonjs/core';
import {readMapManifest} from './map-manifests.js';
import {loadMapContainer} from './map-container.js';
import {MapLoadLifetime} from './map-load-lifetime.js';
import {instantiateStaticMap} from './static-map-instances.js';
import {prepareVillageInstancing} from './village-instancing.js';
import {applyVillageToon} from './village-toon.js';
import {prepareMapMaterials} from './map-shader-cache.js';

// Drop visuals use existing map assets and the existing scene/frame loop.
export function createItemDropView(world,{baseUrl,readManifest=readMapManifest,loadContainer=loadMapContainer,onError=()=>{}}={}){
 const scene=world.scene;let disposed=false,version=0,scope=new AbortController(),manifest=null,manifestTask=null;const sources=new Map(),loading=new Map(),records=new Map(),failed=new Set();
 const base=baseUrl??new URL(`${import.meta.env?.BASE_URL??'./'}assets/quest-props.json`,globalThis.location?.href??'http://localhost/'),current=v=>!disposed&&v===version&&!scene.isDisposed&&!scope.signal.aborted;
 async function request(id){if(sources.has(id)||loading.has(id)||loading.size||failed.has(id)||disposed)return;const v=version,signal=scope.signal,lifetime=new MapLoadLifetime({signal,stage:'item-drop-model'});let container;
 const task=(async()=>{try{
  manifestTask??=lifetime.run(()=>readManifest(base));manifest=await manifestTask;lifetime.check();const config=manifest.assets?.[id],profile=config?.lods?.[1]??config?.lods?.[0];if(!profile)throw Error('드롭 소품 모델을 찾지 못했습니다: '+id);
  await lifetime.run(()=>world.prefetchResources?.(profile.resources??[]));container=await lifetime.run(()=>loadContainer(new URL(profile.model,base),scene,{signal:lifetime.signal,lifetime}),{onLate:value=>value?.dispose()});lifetime.check();
  const meshes=container.meshes.filter(m=>m.getTotalVertices?.()>0);prepareVillageInstancing(meshes);applyVillageToon(meshes,world.lighting);world.lighting?.registerMeshes?.(meshes);for(const mesh of meshes){mesh.isPickable=false;world.caveAtmosphere?.attachMaterial(mesh.material);world.caveFog?.attach(mesh.material);}await lifetime.run(()=>prepareMapMaterials(meshes,{cancelled:()=>!current(v)||lifetime.signal.aborted}));lifetime.check();if(!current(v))return;
  sources.set(id,{container,config});container=null;
 }catch(error){if(current(v)&&!signal.aborted){failed.add(id);onError(error);}}finally{container?.dispose();lifetime.close();if(loading.get(id)===task)loading.delete(id);}})();loading.set(id,task);return task;}
 function remove(id,record){record.root.dispose();records.delete(id);}
 function sync(drops,dt){if(disposed||scene.isDisposed)return;const present=new Set(drops.map(drop=>drop.id));for(const [id,record]of records)if(!present.has(id))remove(id,record);
  for(const drop of drops){let record=records.get(drop.id);if(!record){const source=sources.get(drop.model);if(!source){void request(drop.model);continue;}const root=new TransformNode('item-drop-'+drop.id,scene),asset=instantiateStaticMap(source.container,name=>'drop-'+drop.id+'-'+name);for(const child of asset.rootNodes)child.parent=root;root.scaling.setAll((source.config.height/source.config.bounds[1])*.45);root.rotation.y=(drop.id.length%8)*.6;record={root,age:0,settled:false};records.set(drop.id,record);}
   if(!record.settled){record.age+=Math.max(0,Math.min(.1,dt));const t=Math.min(1,record.age/.6),travel=1-(1-t)*(1-t),bounce=t<.72?Math.sin(Math.PI*t/.72)*.38:Math.sin(Math.PI*(t-.72)/.28)*.075;record.root.position.set(drop.origin.x+(drop.position.x-drop.origin.x)*travel,drop.origin.y+(drop.position.y-drop.origin.y)*travel+bounce,drop.origin.z+(drop.position.z-drop.origin.z)*travel);record.root.computeWorldMatrix(true);if(t===1){record.settled=true;record.root.freezeWorldMatrix();}}
   record.root.setEnabled(!world.caveFog||world.caveFog.allowsPoint(record.root.position));
  }
 }
 function clear(){version++;scope.abort();scope=new AbortController();for(const [id,record]of records)remove(id,record);for(const {container}of sources.values())container.dispose();sources.clear();loading.clear();failed.clear();manifest=null;manifestTask=null;}
 const api={sync,ready:id=>records.get(id)?.settled===true&&records.get(id)?.root.isEnabled()===true,clear,inspect:()=>({models:sources.size,loading:loading.size,visible:records.size,failed:[...failed]}),dispose(){if(disposed)return;clear();disposed=true;scope.abort();scene.onDisposeObservable.remove(observer);}};const observer=scene.onDisposeObservable.addOnce(()=>api.dispose());return api;
}
