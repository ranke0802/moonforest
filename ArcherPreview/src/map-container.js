import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {cacheMapBufferViews} from './map-decode-cache.js';
import {MapLoadLifetime,mapLoadAbortError} from './map-load-lifetime.js';
import {releaseMapTexture} from './map-texture-lifetime.js';

// Babylon 9.31's AssetContainer.dispose leaves its scene-disposal closure
// registered. Its constructor runs synchronously between _getLoader and the
// importMeshAsync call; capture precisely that hook and release it with the map.
export async function readMapContainer(scene,json,rootUrl,{skipMaterials=false,fileName='',signal,lifetime,timeoutMs,timers}={}){
  const minimum=json?.asset?.minVersion;
  if(json?.asset?.version!=='2.0'||(minimum!==undefined&&(!/^\d+\.\d+$/.test(minimum)||Number(minimum)>2)))throw new Error('지원하지 않는 맵 모델 버전입니다.');
  const ownLifetime=!lifetime; lifetime??=new MapLoadLifetime({signal,timeoutMs,timers});
  if(scene.isDisposed)lifetime.abort(mapLoadAbortError());
  try{lifetime.check();}catch(error){if(ownLifetime)lifetime.close();throw error;}
  const loader=new GLTFFileLoader();loader.skipMaterials=skipMaterials;
  cacheMapBufferViews(loader,scene,fileName);
  let observer,partial,implementation,containerDisposed=false,abandoned=false;
  const attempt=fn=>{try{return fn();}catch(error){lifetime.noteCleanupError(error);}};
  const loaded={meshes:new Set(),materials:new Set(),textures:new Set(),cameras:new Set()};
  for(const [key,observable]of [['meshes','onMeshLoadedObservable'],['materials','onMaterialLoadedObservable'],['textures','onTextureLoadedObservable'],['cameras','onCameraLoadedObservable']])loader[observable].add(value=>loaded[key].add(value));
  const detach=()=>{if(observer){scene.onDisposeObservable.remove(observer);observer=null;}};
  const bindContainer=container=>{
    partial=container;const dispose=container.dispose.bind(container);
    container.dispose=()=>{if(containerDisposed)return;containerDisposed=true;detach();for(const texture of container.textures.splice(0))attempt(()=>releaseMapTexture(texture,scene));dispose();};
  };
  // This is deliberately scoped to the pinned 9.31 loader, never the scene or
  // engine. Its AssetContainer is not populated until importMeshAsync finishes.
  const getLoader=loader._getLoader.bind(loader);
  loader._getLoader=data=>{
    lifetime.check();const before=new Set(scene.onDisposeObservable.observers);implementation=getLoader(data);
    const importMesh=implementation.importMeshAsync.bind(implementation),bufferView=implementation.loadBufferViewAsync.bind(implementation),image=implementation.loadImageAsync.bind(implementation);
    implementation.importMeshAsync=(names,target,container,...args)=>{observer=target.onDisposeObservable.observers.find(o=>!before.has(o));bindContainer(container);lifetime.check();return importMesh(names,target,container,...args);};
    // A completed old worker may fill the bounded CPU decode cache, but cannot
    // continue from its buffer-view into new Babylon vertex/GPU construction.
    implementation.loadBufferViewAsync=(...args)=>Promise.resolve(bufferView(...args)).then(data=>{lifetime.check();return data;});
    implementation.loadImageAsync=(...args)=>Promise.resolve(image(...args)).then(data=>{lifetime.check();return data;});
    return implementation;
  };
  const disposePartial=()=>{
    if(abandoned)return;abandoned=true;
    try{if(partial&&!containerDisposed){
      const append=(key,items)=>{for(const item of items??[])if(item&&!partial[key].includes(item))partial[key].push(item);};
      for(const [key,items]of Object.entries(loaded))append(key,items);
      if(implementation?._gltf){
        for(const [key,method]of [['meshes','_getMeshes'],['geometries','_getGeometries'],['transformNodes','_getTransformNodes'],['skeletons','_getSkeletons'],['animationGroups','_getAnimationGroups']])append(key,implementation[method]());
        append('lights',implementation._babylonLights);
      }
      for(const mesh of partial.meshes)if(mesh.morphTargetManager)append('morphTargetManagers',[mesh.morphTargetManager]);
      // Texture(null) is registered as its owned InternalTexture pending token
      // in this Babylon version. Preserve shared tokens belonging to others.
      for(const texture of partial.textures.splice(0))attempt(()=>releaseMapTexture(texture,scene));
      attempt(()=>partial.dispose());
    }}catch(error){lifetime.noteCleanupError(error);}
    // Buffer objects can exist before their Geometry is attached to a mesh.
    // Release only accessor/view objects created by this import. No global
    // pending list, shared decode cache entry or unrelated scene asset changes.
    const disposeLater=promise=>promise?.then(value=>{if(value&&!value.isDisposed)attempt(()=>value.dispose());},()=>{});
    for(const accessor of json.accessors??[])for(const promise of Object.values(accessor._babylonVertexBuffer??{}))disposeLater(promise);
    for(const view of json.bufferViews??[])disposeLater(view._babylonBuffer);
    attempt(()=>loader.dispose());attempt(detach);for(const values of Object.values(loaded))values.clear();
  };
  const abort=()=>disposePartial();lifetime.signal.addEventListener('abort',abort,{once:true});
  const sceneObserver=scene.onDisposeObservable.addOnce(()=>lifetime.abort(mapLoadAbortError()));
  try{
    const container=await lifetime.run(()=>loader.loadAssetContainerAsync(scene,{json},rootUrl,undefined,fileName),{onLate:container=>container.dispose()});
    return container;
  }catch(error){
    lifetime.abort(error);disposePartial();throw error;
  }finally{lifetime.signal.removeEventListener('abort',abort);scene.onDisposeObservable.remove(sceneObserver);for(const values of Object.values(loaded))values.clear();if(ownLifetime)lifetime.close();}
}
export async function loadMapContainer(model,scene,{signal,lifetime,timeoutMs,timers}={}){
  const ownLifetime=!lifetime;lifetime??=new MapLoadLifetime({signal,timeoutMs,timers});
  if(scene.isDisposed)lifetime.abort(mapLoadAbortError());
  const observer=scene.onDisposeObservable.addOnce(()=>lifetime.abort(mapLoadAbortError()));
  try{
    const response=await lifetime.run(()=>fetch(model,{cache:'force-cache',signal:lifetime.signal}));
    if(!response.ok)throw new Error(`맵 모델을 불러오지 못했습니다 (${response.status}).`);
    const json=await lifetime.run(()=>response.json());
    return await readMapContainer(scene,json,new URL('.',model).href,{fileName:model.pathname.split('/').pop(),lifetime});
  }finally{scene.onDisposeObservable.remove(observer);if(ownLifetime)lifetime.close();}
}
