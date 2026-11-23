import {mapLoadAbortError} from './map-load-lifetime.js';
import {splitTextureUpload,splitTextureUploadDone} from './split-texture-upload.js';

// Weak ownership marks only: no texture/scene/worker is retained by this set.
const abandoned=new WeakSet(),installed=new WeakSet(),releaseListeners=new WeakMap(),uploadObservers=new WeakMap();
// Only diagnostic subscribers are retained, keyed by their engine. No texture,
// decoded pixels or scene is kept in these callbacks.
export function observeMapTextureUploads(engine,callback){
  let observers=uploadObservers.get(engine);if(!observers){observers=new Set();uploadObservers.set(engine,observers);}observers.add(callback);
  return ()=>{observers.delete(callback);if(!observers.size)uploadObservers.delete(engine);};
}
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
  if(installed.has(Ktx))return;installed.add(Ktx);const create=Ktx.prototype._createTexture,upload=Ktx.prototype._uploadAsync;
  // A texture sent in strips is not loaded until its last strip is up: Babylon's loader waits here.
  if(typeof upload==='function')Ktx.prototype._uploadAsync=function(data,internal,options){
    return upload.call(this,data,internal,options).then(value=>{
      const pending=splitTextureUploadDone(this._engine,internal);
      return pending?pending.then(complete=>{if(!complete)throw mapLoadAbortError();return value;}):value;
    });
  };
  // Pinned Babylon 9.31 awaits a worker, then uploads even after its texture
  // was disposed. Stop only our abandoned final-owner allocation at that exact
  // boundary; normal and still-shared InternalTextures follow the native path.
  Ktx.prototype._createTexture=function(data,internal,...args){
    if(abandoned.has(internal))throw mapLoadAbortError();
    // Large textures go up a strip at a time where that is enabled (split-texture-upload.js).
    let split=false;
    const run=()=>{
      split=splitTextureUpload(this._engine,data,internal,args[0]);
      if(!split)return create.call(this,data,internal,...args);
    };
    const observers=uploadObservers.get(this._engine);
    if(!observers?.size)return run();
    const start=performance.now();let success=false;
    try{const result=run();success=true;return result;}
    finally{
      const end=performance.now(),first=data?.mipmaps?.[0];
      // Babylon also uses synthetic data: URLs for external glTF images.
      // Keep only a content filename, never a URL or embedded payload.
      const tail=typeof internal?.url==='string'?internal.url.slice(-180):'';
      const assetFile=tail.match(/([a-f0-9]{64}(?:\.ktx2|\.(?:glb|gltf)#image\d+))(?:[?#].*)?$/i)?.[1]??null;
      const sample={startedAtMs:start,completedAtMs:end,cpuMs:Math.max(0,end-start),width:first?.width??null,height:first?.height??null,mipCount:data?.mipmaps?.length??0,format:data?.transcodedFormat??null,assetFile,split,success};
      for(const callback of observers)try{callback(sample);}catch{/* Diagnostic observers must never alter texture loading. */}
    }
  };
}
