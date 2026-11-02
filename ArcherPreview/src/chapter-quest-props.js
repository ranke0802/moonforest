import {SceneLoader,TransformNode,Vector3,MeshBuilder,StandardMaterial,Color3} from '@babylonjs/core';
import {applyVillageToon} from './village-toon.js';
import {prepareVillageInstancing} from './village-instancing.js';
import {VillageOutlines} from './village-outlines.js';
import {readMapManifest} from './map-manifests.js';
import {MapLoadLifetime} from './map-load-lifetime.js';
export function createQuestProps(world,{baseUrl,readManifest=readMapManifest,loadContainer=url=>SceneLoader.LoadAssetContainerAsync(new URL('.',url).href,url.pathname.split('/').pop(),world.scene,null,'.gltf'),timeoutMs,timers}={}){
 let version=0,owned=[],containers=[],outlines=null,records=[],disposed=false,pending=null;
 const release=()=>{version++;pending?.abort();pending?.close();pending=null;outlines?.dispose();outlines=null;for(const root of owned)root.dispose();for(const c of containers)c.dispose();owned=[];containers=[];records=[];};
 const markerMaterial=new StandardMaterial('quest-point-marker',world.scene);markerMaterial.diffuseColor=new Color3(.76,.65,.28);markerMaterial.emissiveColor=new Color3(.2,.16,.05);markerMaterial.specularColor=Color3.Black();
 return {release,async load(points){release();if(disposed)return false;const revision=version,base=baseUrl??new URL(`${import.meta.env?.BASE_URL??'./'}assets/quest-props.json`,location.href),lifetime=new MapLoadLifetime({timeoutMs,timers,stage:'quest-props'});pending=lifetime;
  const current=()=>!disposed&&revision===version&&!world.scene.isDisposed;
  try{const manifest=await lifetime.run(()=>readManifest(base));if(!current())return false;
  for(const point of points){const ring=MeshBuilder.CreateTorus('quest-marker-'+point.id,{diameter:.65,thickness:.025,tessellation:24},world.scene);ring.position.set(point.x,world.terrain.heightAt(point.x,point.z)+.05,point.z);ring.material=markerMaterial;ring.isPickable=false;ring.setEnabled(false);owned.push(ring);point.marker=ring;}
  for(const id of [...new Set(points.map(p=>p.model).filter(Boolean))]){
   const config=manifest.assets[id];if(!config)continue;const profile=config.lods[1],url=new URL(profile.model,base);
   // Use the live map's hash/pack plan so unchanged props are cached and their
   // downloads appear in the same diagnostics as streamed map assets.
   await lifetime.run(()=>world.prefetchResources?.(profile.resources??[]));if(!current())return false;
   const container=await lifetime.run(()=>loadContainer(url),{onLate:value=>value.dispose()});
   if(!current()){container.dispose();return false;}containers.push(container);
   const sources=container.meshes.filter(m=>m.getTotalVertices?.()>0);for(const m of sources)m.receiveShadows=true;prepareVillageInstancing(sources);applyVillageToon(sources,world.lighting);
   for(const point of points.filter(p=>p.model===id)){
    const root=new TransformNode('quest-prop-'+point.id,world.scene);root.position.set(point.x,world.terrain.heightAt(point.x,point.z),point.z);root.scaling.setAll(config.height/config.bounds[1]);root.setEnabled(false);owned.push(root);
    const instance=container.instantiateModelsToScene(n=>'quest-'+point.id+'-'+n,false,{doNotInstantiate:false});for(const n of instance.rootNodes)n.parent=root;
    const meshes=root.getChildMeshes();for(const m of meshes){m.isPickable=false;}point.visual=root;
    records.push({root,meshes,placement:{...point,kind:'ground-detail',scale:1},config,center:new Vector3(point.x,root.position.y+config.height*.5,point.z),radius:Math.max(...config.bounds)*root.scaling.x});
   }
  }
  if(current())outlines=new VillageOutlines(world,records,{});return current();
  }catch(error){if(!current())return false;throw error;}finally{lifetime.close();if(pending===lifetime)pending=null;}
 },update(points,position,visible){for(const p of points){const near=position&&Math.hypot(position.x-p.x,position.z-p.z)<30,show=visible(p)&&(!world.caveFog||world.caveFog.allowsPoint({x:p.x,y:world.terrain.heightAt(p.x,p.z),z:p.z}));p.marker?.setEnabled(!!near&&show);p.visual?.setEnabled(!!near&&show);}},dispose(){disposed=true;release();markerMaterial.dispose();}};
}
