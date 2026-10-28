import {ResourceDownloads} from './resource-downloads.js';
import {prepareVillageStart} from './village-environment.js';

export async function prepareStartupResources(world,playerUrl,onProgress,onStream){
  const base=new URL('./',playerUrl),read=async name=>{
    const response=await fetch(new URL(name+'.json',base),{cache:'no-cache'});
    if(!response.ok)throw new Error('리소스 목록을 불러오지 못했습니다.');return response.json();
  };
  const player=await read(playerUrl.pathname.split('/').at(-1).replace('.json',''));
  const [village,sizes,ground,sky,environment,ktx,meshopt]=await Promise.all([
    prepareVillageStart(world),read('resource-sizes'),read('village-ground'),read('sky'),read('environment'),read('ktx2-decoder'),read('meshopt-decoder')]);
  const resources=[...player.resources,...village.resources,...ground.resources,sky.texture,...environment.assets.scarecrow.resources,...Object.values(ktx.urls),meshopt.url];
  const downloads=new ResourceDownloads(sizes.files,base);
  const state=await downloads.prepare(resources,onProgress);
  world.prefetchResources=paths=>downloads.prepare(paths,onStream).catch(error=>{onStream({complete:true,loaded:0,total:0,ratio:0});throw error;});
  world.startupResources={files:new Set(resources).size,downloadBytes:state.total,cachedBytes:state.cached,initialLodModels:village.plan.length};
  return player;
}
