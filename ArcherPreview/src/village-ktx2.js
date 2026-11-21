import {KhronosTextureContainer2} from '@babylonjs/core/Misc/khronosTextureContainer2.js';
import {_KTXTextureLoader} from '@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader.js';
import {registerTextureLoader} from '@babylonjs/core/Materials/Textures/Loaders/textureLoaderManager.js';
import {installKtxDecodeCache} from './map-decode-cache.js';
import {readMapManifest} from './map-manifests.js';
import {installMapTextureLifetimeGuard} from './map-texture-lifetime.js';
import {installKtxWorkerSupervisor,recoverKtxWorkerPool} from './ktx-worker-supervisor.js';

let initialized;
let loaderRegistered=false;
// Fetch the SDK loader with the application module graph. A tab left open
// across deployments must not discover a deleted lazy chunk on its first map.
export function registerVillageKtxTextureLoader(){
  if(loaderRegistered)return;
  loaderRegistered=true;
  for(const extension of ['.ktx','.ktx2'])registerTextureLoader(extension,async()=>new _KTXTextureLoader());
}
// Pin every decoder module to our own content-addressed cache. Transcoding is
// off the render thread; one worker bounds CPU and transient WASM memory.
export function initializeVillageKtx2(options){
  registerVillageKtxTextureLoader();
  if(initialized){recoverKtxWorkerPool();return initialized;}
  const pending=(async()=>{
    const url=new URL(`${import.meta.env?.BASE_URL??'/'}assets/ktx2-decoder.json`,location.href);
    const config=await readMapManifest(url,options);
    for(const [key,path]of Object.entries(config.urls))KhronosTextureContainer2.URLConfig[key]=new URL(path,url).href;
    KhronosTextureContainer2.DefaultNumWorkers=1;
    installKtxWorkerSupervisor(KhronosTextureContainer2,{urls:Object.fromEntries(Object.entries(KhronosTextureContainer2.URLConfig).filter(([,value])=>value))});
    installKtxDecodeCache(KhronosTextureContainer2);
    installMapTextureLifetimeGuard(KhronosTextureContainer2);
    // Do not silently expand UASTC to RGBA on devices with BC1/3 support.
    KhronosTextureContainer2.DefaultDecoderOptions.useRGBAIfOnlyBC1BC3AvailableWhenUASTC=false;
    KhronosTextureContainer2.DefaultDecoderOptions.useRGBAIfASTCBC7NotAvailableWhenUASTC=false;
  })();initialized=pending;pending.catch(()=>{if(initialized===pending)initialized=undefined;});return pending;
}
