import {KhronosTextureContainer2} from '@babylonjs/core/Misc/khronosTextureContainer2.js';

let initialized;
// Pin every decoder module to our own content-addressed cache. Transcoding is
// off the render thread; one worker bounds CPU and transient WASM memory.
export function initializeVillageKtx2(){
  return initialized??=(async()=>{
    const url=new URL(`${import.meta.env.BASE_URL}assets/ktx2-decoder.json`,location.href);
    const response=await fetch(url,{cache:'no-cache'});
    if(!response.ok)throw new Error('KTX2 디코더 목록을 불러오지 못했습니다.');
    const config=await response.json();
    for(const [key,path]of Object.entries(config.urls))KhronosTextureContainer2.URLConfig[key]=new URL(path,url).href;
    KhronosTextureContainer2.DefaultNumWorkers=1;
    // Do not silently expand UASTC to RGBA on devices with BC1/3 support.
    KhronosTextureContainer2.DefaultDecoderOptions.useRGBAIfOnlyBC1BC3AvailableWhenUASTC=false;
    KhronosTextureContainer2.DefaultDecoderOptions.useRGBAIfASTCBC7NotAvailableWhenUASTC=false;
  })();
}
