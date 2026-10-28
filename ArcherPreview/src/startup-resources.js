import {ResourceDownloads} from './resource-downloads.js';
import {prepareVillageStart} from './village-environment.js';
import {readMapManifest} from './map-manifests.js';

async function prepareDownloads(world,base,sizes,resources,plan,onProgress,onStream){
  world.releaseResourceDownloads?.();
  const downloads=new ResourceDownloads(sizes.files,base),cancel=()=>downloads.cancel();
  const observer=world.scene.onDisposeObservable.addOnce(cancel);
  world.cancelResourceDownloads=cancel;
  world.releaseResourceDownloads=()=>{cancel();world.scene.onDisposeObservable.remove(observer);world.prefetchResources=null;world.releaseResourceDownloads=null;};
  const state=await downloads.prepare(resources,onProgress);
  world.prefetchResources=paths=>downloads.prepare(paths,onStream).catch(error=>{onStream?.({complete:true,loaded:0,total:0,ratio:0});throw error;});
  world.startupResources={files:new Set(resources).size,downloadBytes:state.total,cachedBytes:state.cached,initialLodModels:plan.length};
}

export async function prepareMapResources(world,base,onProgress,onStream){
  const read=name=>readMapManifest(new URL(name+'.json',base));
  const [village,sizes,ground]=await Promise.all([prepareVillageStart(world),read('resource-sizes'),read(world.groundManifest)]);
  // The same live player, sky, decoder and training target already own their
  // resources. Only destination-map bytes belong in this download progress.
  await prepareDownloads(world,base,sizes,[...village.resources,...ground.resources],village.plan,onProgress,onStream);
}

export async function prepareStartupResources(world,playerUrl,onProgress,onStream){
  const base=new URL('./',playerUrl),read=name=>readMapManifest(new URL(name+'.json',base));
  const player=await read(playerUrl.pathname.split('/').at(-1).replace('.json',''));
  const [village,sizes,ground,sky,environment,ktx,meshopt]=await Promise.all([
    prepareVillageStart(world),read('resource-sizes'),read(world.groundManifest??'village-ground'),read('sky'),read('environment'),read('ktx2-decoder'),read('meshopt-decoder')]);
  const resources=[...player.resources,...village.resources,...ground.resources,...(world.cave?[]:[sky.texture]),...environment.assets.scarecrow.resources,...Object.values(ktx.urls),meshopt.url];
  await prepareDownloads(world,base,sizes,resources,village.plan,onProgress,onStream);
  return player;
}
