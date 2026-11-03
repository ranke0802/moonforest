import {ResourceDownloads,resourceUrl} from './resource-downloads.js';
import {prepareVillageStart} from './village-environment.js';
import {readMapManifest} from './map-manifests.js';
import {registerResourceGraph} from './resource-cache.js';
import {MapLoadLifetime,mapLoadAbortError,mapLoadSnapshot,checkMapLoadSnapshot} from './map-load-lifetime.js';
import {loadingArtResources} from './loading-art.js';

async function prepareDownloads(world,base,sizes,resources,plan,onProgress,onStream,context){
  const {lifetime,check}=context;check();const scene=world.scene;
  world.releaseResourceDownloads?.();
  const downloads=new ResourceDownloads(sizes.files,base,{index:sizes});let released=false;const preparedUrls=new Set();
  const cancel=()=>{downloads.cancel();lifetime.abort(mapLoadAbortError());};
  const abort=()=>downloads.cancel();lifetime.signal.addEventListener('abort',abort,{once:true});
  const release=()=>{if(released)return;released=true;preparedUrls.clear();cancel();lifetime.signal.removeEventListener('abort',abort);scene.onDisposeObservable.remove(observer);if(world.releaseResourceDownloads===release)Object.assign(world,{prefetchResources:null,releaseResourceDownloads:null,cancelResourceDownloads:null});};
  world.resourceDownloadStats=downloads.stats;
  // Protect this document's complete graph (including the other map) before
  // asking the worker to collect obsolete versions from earlier deployments.
  registerResourceGraph(sizes);
  const observer=scene.onDisposeObservable.addOnce(release);
  world.cancelResourceDownloads=cancel;
  world.releaseResourceDownloads=release;
  const progress=callback=>state=>{try{check();if(!released)callback?.(state);}catch{/* Old traffic cannot report into a new foreground load. */}};
  let state;try{state=await lifetime.run(()=>downloads.prepare(resources,progress(onProgress)));check();}catch(error){release();throw error;}
  if(state.complete&&state.storageAvailable)for(const path of resources)preparedUrls.add(resourceUrl(path,base));
  downloads.stats.initialPrefetchReusedFiles=0;
  world.prefetchResources=(paths,{initial=false}={})=>lifetime.run(()=>{
    check();
    // The foreground plan was just checked/downloaded as one batch. Do not
    // reopen CacheStorage and match those same files once per model. This proof
    // is only for that initial plan; streaming/revisits still check eviction.
    // Actual model/texture reads always go through the normal cache/network path.
    if(!initial)preparedUrls.clear();
    const missing=initial?paths.filter(path=>!preparedUrls.has(resourceUrl(path,base))):paths;
    downloads.stats.initialPrefetchReusedFiles+=paths.length-missing.length;
    if(!missing.length)return {complete:true,loaded:0,total:0,ratio:1};
    return downloads.prepare(missing,progress(onStream));
  }).catch(error=>{try{check();onStream?.({complete:true,loaded:0,total:0,ratio:0});}catch{}throw error;});
  world.startupResources={files:new Set(resources).size,downloadBytes:state.total,cachedBytes:state.cached,initialLodModels:plan.length};
}

async function resourceSetup(world,task,{signal,timeoutMs,timers}={}){
  const owner={};world.resourcePrepareOwner=owner;const snapshot=mapLoadSnapshot(world,{loadOwner:false}),previous=world.villagePrepared,lifetime=new MapLoadLifetime({signal,timeoutMs,timers,stage:'resource-manifests'});
  const check=()=>{if(world.resourcePrepareOwner!==owner)lifetime.abort(mapLoadAbortError());checkMapLoadSnapshot(world,snapshot,lifetime);};
  const observer=snapshot.scene.onDisposeObservable.addOnce(()=>lifetime.abort(mapLoadAbortError()));
  const context={lifetime,check,timeoutMs,timers,prepared:null};
  try{return await task(context);}catch(error){lifetime.abort(error);if(world.resourcePrepareOwner===owner&&context.prepared&&world.villagePrepared===context.prepared&&context.prepared!==previous){for(const r of context.prepared.records??[])r.root.dispose();world.villagePrepared=null;}throw error;}finally{lifetime.close();snapshot.scene.onDisposeObservable.remove(observer);}
}

export async function prepareMapResources(world,base,onProgress,onStream,options){
  return resourceSetup(world,async context=>{
  const {lifetime,check,timeoutMs,timers}=context;
  const read=name=>readMapManifest(new URL(name+'.json',base),{timeoutMs,timers});
  const [village,sizes,ground,resident]=await lifetime.run(()=>Promise.all([prepareVillageStart(world,{lifetime,timeoutMs,timers}).then(value=>{context.prepared=value;return value;}),read('resource-index'),read(world.groundManifest),world.cave?read('elena'):null]));check();
  // The manifest/setup wait is bounded. Do not impose a total 45s ceiling on
  // a healthy large 8K download that continues making byte progress.
  lifetime.finishDeadline();
  // The same live player, sky, decoder and training target already own their
  // resources. Only destination-map bytes belong in this download progress.
  await prepareDownloads(world,base,sizes,[...village.resources,...ground.resources,...(resident?.resources??[])],village.plan,onProgress,onStream,context);
  },options);
}

export async function prepareStartupResources(world,playerUrl,onProgress,onStream,options){
  return resourceSetup(world,async context=>{
  const {lifetime,check,timeoutMs,timers}=context,base=new URL('./',playerUrl),read=name=>readMapManifest(new URL(name+'.json',base),{timeoutMs,timers});
  const player=await lifetime.run(()=>read(playerUrl.pathname.split('/').at(-1).replace('.json','')));check();
  const [village,sizes,ground,sky,environment,ktx,meshopt,resident]=await lifetime.run(()=>Promise.all([
    prepareVillageStart(world,{lifetime,timeoutMs,timers}).then(value=>{context.prepared=value;return value;}),read('resource-index'),read(world.groundManifest??'village-ground'),read('sky'),read('environment'),read('ktx2-decoder'),read('meshopt-decoder'),world.cave?read('elena'):null]));check();lifetime.finishDeadline();
  const resources=[...loadingArtResources,...player.resources,...village.resources,...ground.resources,...(resident?.resources??[]),...(world.cave?[]:[sky.texture]),...environment.assets.scarecrow.resources,...Object.values(ktx.urls),meshopt.url];
  await prepareDownloads(world,base,sizes,resources,village.plan,onProgress,onStream,context);
  return player;
  },options);
}
