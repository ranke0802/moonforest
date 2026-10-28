import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';

let initialized;
// The pinned local decoder is covered by the existing persistent resource cache.
// Babylon decodes on one worker, releasing it after a second of inactivity.
export function initializeVillageMeshopt(){
  return initialized??=(async()=>{
    const url=new URL(`${import.meta.env.BASE_URL}assets/meshopt-decoder.json`,location.href);
    const response=await fetch(url,{cache:'no-cache'});
    if(!response.ok)throw new Error('메시 압축 디코더 목록을 불러오지 못했습니다.');
    const config=await response.json();
    MeshoptCompression.Configuration={decoder:{url:new URL(config.url,url).href}};
  })();
}
