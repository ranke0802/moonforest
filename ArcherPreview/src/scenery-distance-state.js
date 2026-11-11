import {villageRenderRange} from './village-policy.js';

// Lightweight runtime bridge. Ordinary gameplay only reads an optional owner
// and registers installed sources. Cutscene acquisition, mutation and cleanup
// stay in the lazily loaded cinematic module; this module never imports it.
export const sceneryDistanceState={owner:Symbol('scenery-distance'),sources:new WeakMap()};
export const sceneryEnvironmentSnapshot=world=>({scene:world.scene,mapId:world.mapId,ground:world.ground,generation:world.toolGeneration??0});
export const sameSceneryGeneration=(world,value)=>world.scene===value.scene&&world.mapId===value.mapId&&world.ground===value.ground&&(world.toolGeneration??0)===value.generation&&value.scene?.isDisposed!==true;
// Character reloads retain physical scenery while advancing the tool lease.
export const sameSceneryEnvironment=(a,b)=>a&&b&&a.scene===b.scene&&a.mapId===b.mapId&&a.ground===b.ground;
export const sameScenerySource=(world,value)=>sameSceneryEnvironment(sceneryEnvironmentSnapshot(world),value)&&value.scene?.isDisposed!==true;
function active(world){const owner=world?.[sceneryDistanceState.owner];return owner&&!owner.closed&&owner.percent!==undefined&&sameSceneryGeneration(world,owner.saved)&&owner.isCurrent()!==false?owner:null;}
export function sceneryDistanceScale(world){return (active(world)?.percent??100)/100;}
export function sceneryDistanceRange(world,touch=world?.touchDevice){
 const owner=active(world);if(!owner)return null;const base=villageRenderRange(touch),scale=owner.percent/100;
 return {...base,fogStart:owner.saved.fogBaseStart*scale,fogEnd:owner.saved.fogBaseEnd*scale,cellCull:base.cellCull*scale,meshCull:base.meshCull*scale};
}
// No source scan or native LOD mutation here. An active tool owns the callback
// for late arrivals, and the installed mesh owns its registry disposal entry.
export function registerSceneryDistanceSource(world,mesh){
 if(!world||!mesh?.getLODLevels)return;
 const {sources}=sceneryDistanceState;let registered=sources.get(world);if(!registered){registered=new Map();sources.set(world,registered);}
 let saved=registered.get(mesh);
 if(!sameScenerySource(world,saved)){
  if(saved?.disposeObserver)mesh.onDisposeObservable?.remove(saved.disposeObserver);
  saved=sceneryEnvironmentSnapshot(world);registered.set(mesh,saved);
  saved.disposeObserver=mesh.onDisposeObservable?.addOnce(()=>{if(registered.get(mesh)===saved)registered.delete(mesh);});
 }
 const owner=active(world);if(owner)owner.applyMesh(mesh);
}
