import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {cacheMapBufferViews} from './map-decode-cache.js';

// Babylon 9.31's AssetContainer.dispose leaves its scene-disposal closure
// registered. Capture that constructor hook, then release it with this map.
// In the pinned loader, construction runs synchronously after onParsed and
// before its next microtask; the first newly added observer belongs to it.
export async function readMapContainer(scene,json,rootUrl,{skipMaterials=false,fileName=''}={}){
  const minimum=json?.asset?.minVersion;
  if(json?.asset?.version!=='2.0'||(minimum!==undefined&&(!/^\d+\.\d+$/.test(minimum)||Number(minimum)>2)))throw new Error('지원하지 않는 맵 모델 버전입니다.');
  const loader=new GLTFFileLoader();loader.skipMaterials=skipMaterials;
  cacheMapBufferViews(loader,scene,fileName);
  let observer;
  loader.onParsedObservable.addOnce(()=>{
    const before=new Set(scene.onDisposeObservable.observers);
    queueMicrotask(()=>{observer=scene.onDisposeObservable.observers.find(o=>!before.has(o));});
  });
  try{
    const container=await loader.loadAssetContainerAsync(scene,{json},rootUrl,undefined,fileName),dispose=container.dispose.bind(container);
    container.dispose=()=>{if(observer){scene.onDisposeObservable.remove(observer);observer=null;}dispose();};
    return container;
  }catch(error){
    if(observer){observer.callback();scene.onDisposeObservable.remove(observer);observer=null;}
    loader.dispose();throw error;
  }
}
export async function loadMapContainer(model,scene){
  const response=await fetch(model,{cache:'force-cache'});
  if(!response.ok)throw new Error(`맵 모델을 불러오지 못했습니다 (${response.status}).`);
  return readMapContainer(scene,await response.json(),new URL('.',model).href,{fileName:model.pathname.split('/').pop()});
}
