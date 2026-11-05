import {Effect,Mesh} from '@babylonjs/core';

const nativeProcess=Mesh.prototype._processInstancedBuffers;
const nativeAttributeNames=Effect.prototype.getAttributesNames;
const prepared=new WeakMap();

// Owned static scenery only. Babylon packs every registered custom attribute
// for every draw, including attributes absent from the bound shader. Keep its
// native matrix/batch/per-pass processing and omit only those unused streams.
export function prepareVillageInstanceAttributes(mesh){
 if(prepared.has(mesh)||mesh.isDisposed()||mesh._processInstancedBuffers!==nativeProcess||mesh.skeleton||mesh.morphTargetManager||mesh.animations?.length||mesh.hasThinInstances)return;
 const descriptor=Object.getOwnPropertyDescriptor(mesh,'_processInstancedBuffers');
 if(descriptor&&(!descriptor.configurable||!Object.hasOwn(descriptor,'value')))return;
 const buffers=mesh.instancedBuffers,engine=mesh.getEngine(),userStorage=mesh._userInstancedBuffersStorage,instanceStorage=mesh._instanceDataStorage;
 if(!buffers||Object.getPrototypeOf(buffers)!==Object.prototype)return;
 let views=new WeakMap(),disposed=false,inFlight=false;
 function process(visibleInstances,renderSelf){
  const current=Mesh.prototype._processInstancedBuffers,fallback=current===process?nativeProcess:current;
  if(this!==mesh)return fallback.call(this,visibleInstances,renderSelf);
  // Preserve a nested/native call's complete source state. No application
  // callback normally runs here; an external engine hook can still re-enter.
  if(inFlight){const current=mesh.instancedBuffers;mesh.instancedBuffers=buffers;try{return fallback.call(mesh,visibleInstances,renderSelf);}finally{if(mesh.instancedBuffers===buffers)mesh.instancedBuffers=current;}}
  const effect=engine._currentEffect;
  if(disposed||mesh._processInstancedBuffers!==process||current!==nativeProcess||mesh.getEngine()!==engine||
     mesh.instancedBuffers!==buffers||mesh.skeleton||mesh.morphTargetManager||mesh.animations?.length||mesh.hasThinInstances||
     mesh._userInstancedBuffersStorage!==userStorage||mesh._instanceDataStorage!==instanceStorage||instanceStorage.engine!==engine||
     !(effect instanceof Effect)||effect.getAttributesNames!==nativeAttributeNames||effect.isReady!==Effect.prototype.isReady||!effect.isReady())return fallback.call(mesh,visibleInstances,renderSelf);
  const names=effect.getAttributesNames();
  if(!Array.isArray(names)||!names.length)return fallback.call(mesh,visibleInstances,renderSelf);
  let unused=false;for(const kind in buffers)if(!names.includes(kind)){unused=true;break;}
  if(!unused)return fallback.call(mesh,visibleInstances,renderSelf);
  let view=views.get(effect);
  if(!view){view=Object.create(null);views.set(effect,view);}
  // Recheck the live schema and values, including late tint registration and
  // source mutations. Objects are retained per source/effect, never per draw.
  for(const kind in view)if(!Object.hasOwn(buffers,kind)||!names.includes(kind))delete view[kind];
  for(const kind in buffers)if(names.includes(kind))view[kind]=buffers[kind];
  inFlight=true;mesh.instancedBuffers=view;
  try{return nativeProcess.call(mesh,visibleInstances,renderSelf);}
  finally{if(mesh.instancedBuffers===view)mesh.instancedBuffers=buffers;inFlight=false;}
 }
 mesh._processInstancedBuffers=process;prepared.set(mesh,process);
 mesh.onDisposeObservable.addOnce(()=>{
  disposed=true;views=null;prepared.delete(mesh);
  if(mesh._processInstancedBuffers===process){if(descriptor)Object.defineProperty(mesh,'_processInstancedBuffers',descriptor);else delete mesh._processInstancedBuffers;}
 });
}
