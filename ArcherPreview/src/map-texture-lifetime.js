import {mapLoadAbortError} from './map-load-lifetime.js';

// Weak ownership marks only: no texture/scene/worker is retained by this set.
const abandoned=new WeakSet(),installed=new WeakSet(),releaseListeners=new WeakMap();
export const isAbandonedMapTexture=internal=>!!internal&&abandoned.has(internal);
export function watchMapTextureRelease(internal,callback){
  if(!internal)return ()=>{};if(abandoned.has(internal)){callback();return ()=>{};}
  let listeners=releaseListeners.get(internal);if(!listeners){listeners=new Set();releaseListeners.set(internal,listeners);}listeners.add(callback);
  return ()=>{listeners.delete(callback);if(!listeners.size)releaseListeners.delete(internal);};
}
export function releaseMapTexture(texture,scene){
  if(!texture)return;scene??=texture.getScene?.();const internal=texture.getInternalTexture?.();
  if(internal?._references===1){
    abandoned.add(internal);
    const listeners=releaseListeners.get(internal);releaseListeners.delete(internal);for(const callback of listeners??[])callback();
    // Prevent a new caller reusing this exact cancelled allocation. Normal
    // ThinEngine disposal does this too; make the ownership boundary explicit.
    const cache=internal.getEngine?.().getLoadedTexturesCache?.()??scene?.getEngine?.().getLoadedTexturesCache?.(),index=cache?.indexOf(internal)??-1;
    if(index>=0)cache.splice(index,1);
    scene?.removePendingData(internal);
  }
  texture.dispose();
}
export function installMapTextureLifetimeGuard(Ktx){
  if(installed.has(Ktx))return;installed.add(Ktx);const create=Ktx.prototype._createTexture;
  // Pinned Babylon 9.31 awaits a worker, then uploads even after its texture
  // was disposed. Stop only our abandoned final-owner allocation at that exact
  // boundary; normal and still-shared InternalTextures follow the native path.
  Ktx.prototype._createTexture=function(data,internal,...args){if(abandoned.has(internal))throw mapLoadAbortError();return create.call(this,data,internal,...args);};
}
