// Downloads the next map's files while the player walks up to its road
// (2026-11-28, user: region travel waited 11.7 s on a phone, 8.4 s of it download).
//
// Three steps:
//   1. files and manifests. They land in Cache Storage (disk);
//   1b. alongside, the destination's terrain is built a row at a time within the shared
//      preparation budget and left in the terrain cache (a first visit otherwise builds it
//      in one call inside the map change);
//   2. staging: the arrival models are read into AssetContainers, most wanted
//      first, up to a byte limit (STAGE_BYTES_*). A container is geometry and
//      textures on the GPU with nothing placed in the scene, so it costs memory
//      but no draw. The map loader takes a staged container instead of reading,
//      decoding and uploading that model behind the loading screen (S23 records
//      2026-11-25..27: 2-8 s of a 5-9 s region change with nothing to download).
// Rules:
//   - its own ResourceDownloads queue. The current map's streaming requests are
//     never queued behind a next-map transfer;
//   - one run per destination per visit, started only on approach, never with
//     the browser's data saver on. The road just arrived by stays quiet until
//     the player has walked away from it once: standing at the gate after
//     arriving is not an approach;
//   - travel stops the run. Containers staged for that destination stay for the
//     loader; whatever it has not taken a few seconds after arrival is disposed;
//   - staged containers are the next map's objects held by a scene-wide owner,
//     so every way out disposes them: another destination, a full reload, an
//     error, a lost context, STAGE_IDLE_MS away from the road, scene disposal.
// Lifetime: scene-wide. Besides those containers it keeps numbers and strings;
// the plan arrays live only inside one run.
import {mapPortals,mapForCharacter} from '../map-route.js';
import {readMapManifest} from '../map-manifests.js';
import {ResourceDownloads} from '../resource-downloads.js';
import {startupFileSizes} from '../startup-file-sizes.js';
import {sceneryPrefetchPaths} from '../texture-replacements.js';
import {villageLodSources} from '../village-lod.js';
import {plainsRenderRange} from '../plains-view-distance.js';
import {sceneryDistanceScale} from '../scenery-distance-state.js';
import {sceneryManifestFor} from '../village-streamed-environment.js';
import {mapScenePlacements} from '../world.js';
import {mapTerrainFactory} from '../map-terrain-factory.js';
import {warmMapTerrain,adoptMapTerrain,mapTerrainCached} from '../map-terrain-cache.js';
import {createBossPreparation,coverPreparation} from '../boss-preparation.js';
import {createHeldFrame,HELD_FRAME_FADE_MS} from './held-frame.js';
import {prepareFixedLayouts,fixedLayoutsForCharacter} from '../fixed-layouts.js';
import {stacklessError} from '../map-load-lifetime.js';
import {loadMapContainer} from '../map-container.js';
import {textureBytes} from '../texture-memory.js';
import {resourceUrl} from '../resource-downloads.js';
import {vistaRenderPlacements} from './scenery-diagnostics.js';
import {arrivalSceneryPlan,planResources} from './next-map-plan.js';

// Start inside NEAR whatever the heading, or inside APPROACH while the distance
// to the road shrinks by CLOSING metres between two checks.
export const PREFETCH_NEAR=25,PREFETCH_APPROACH=60,PREFETCH_CLOSING=.5,PREFETCH_CHECK_SECONDS=.5;
// A failed run (network) may try once more after this long; a cancelled one may not.
export const PREFETCH_RETRY_MS=15000;
// GPU texture bytes staged ahead, on top of the map being played. A phone holds
// about 190 MB of textures in the village (iPhone 2026-11-28) and an S23 has run
// at 328 MB (2026-11-25); 32 MB more is a sixth of the first figure. Not measured
// on a device yet: `?stage=<MB>` sets it for a test, `?stage=0` turns staging off.
export const STAGE_BYTES_TOUCH=32*2**20,STAGE_BYTES_DESKTOP=192*2**20;
export function stageBudget(search,touch){
  const raw=new URLSearchParams(search??'').get('stage'),megabytes=raw===null||raw===''?NaN:Number(raw);
  return Number.isFinite(megabytes)&&megabytes>=0?Math.min(megabytes,512)*2**20:touch?STAGE_BYTES_TOUCH:STAGE_BYTES_DESKTOP;
}
// Unused containers go this long after arriving, or this long after the player
// was last near the road without travelling.
export const STAGE_LINGER_MS=12000,STAGE_IDLE_MS=45000;
// A road crossed with its map staged shows no loading screen for this long; a change that
// takes longer shows it from then on. `?quiet=<ms>` sets it for a test, `?quiet=0` turns it off.
// A travel goes quiet only when the last change to that map, this session, took at most
// this share of the limit: a quiet travel that runs long holds a still picture and then
// brings the loading screen on anyway, which is worse than the screen at once.
export const QUIET_EXPECTED_SHARE=.85;
export const QUIET_TRAVEL_MS=1200;
export function quietBudget(search){
  const raw=new URLSearchParams(search??'').get('quiet'),ms=raw===null||raw===''?NaN:Number(raw);
  return Number.isFinite(ms)&&ms>=0?Math.min(ms,5000):QUIET_TRAVEL_MS;
}
// Leftovers are let go during play, so only a few at each check (twice a second).
export const STAGE_DROP_PER_CHECK=2;
const CAMERA_REACH_LIMIT=24,HISTORY=4,TERRAIN_WARM_TIMEOUT_MS=120000,TERRAIN_WORKER_TIMEOUT_MS=20000;

const released=()=>stacklessError(()=>new DOMException('Next map prefetch released','AbortError'));
const nextTask=()=>new Promise(resolve=>setTimeout(resolve,0));

const terrainWorker=()=>new Worker(new URL('./terrain-worker.js',import.meta.url),{type:'module'});
const terrainStopped=()=>stacklessError(()=>Object.assign(new Error('Terrain preparation stopped'),{name:'AbortError'}));
// One request to a worker that is ended as soon as it answers, fails, is stopped or runs late.
function terrainFromWorker(mapId,gameplayV03,{signal,createWorker,timeoutMs=TERRAIN_WORKER_TIMEOUT_MS}){
  return new Promise((resolve,reject)=>{
    let worker=null,timer=null;
    const end=(settle,value)=>{signal?.removeEventListener('abort',stop);clearTimeout(timer);if(worker){worker.onmessage=worker.onerror=null;try{worker.terminate();}catch{}worker=null;}settle(value);};
    const stop=()=>end(reject,terrainStopped());
    if(signal?.aborted){reject(terrainStopped());return;}
    try{worker=createWorker();}catch(error){reject(error);return;}
    signal?.addEventListener('abort',stop,{once:true});
    timer=setTimeout(()=>end(reject,new Error('terrain worker did not answer')),timeoutMs);
    worker.onmessage=({data})=>data?.error||data?.mapId!==mapId?end(reject,new Error(data?.error??'terrain worker answered for another map')):end(resolve,data);
    worker.onerror=event=>{event?.preventDefault?.();end(reject,new Error('terrain worker failed'));};
    worker.postMessage({mapId,gameplayV03});
  });
}
// The destination's terrain, built before the map change needs it and left in the terrain
// cache. A worker builds it beside the game (no main-thread time); where a worker cannot be
// started or fails, the same field is built a row at a time on the shared preparation budget.
// Resolves true once it is cached; a stop rejects.
export async function warmNextMapTerrain(world,mapId,{signal,createWorker=terrainWorker,timeoutMs}={}){
  const scene=world.scene,engine=scene.getEngine(),gameplayV03=!!world.gameplayV03,factory=mapTerrainFactory(mapId,gameplayV03);
  if(mapTerrainCached(engine,factory))return true;
  try{return adoptMapTerrain(engine,factory,await terrainFromWorker(mapId,gameplayV03,{signal,createWorker,timeoutMs}));}
  catch(error){if(signal?.aborted)throw error;}
  const job=createBossPreparation({scene,isCurrent:()=>!signal?.aborted&&!scene.isDisposed,timeoutMs:TERRAIN_WARM_TIMEOUT_MS});
  return warmMapTerrain(engine,factory,work=>job.run(work));
}

export function prefetchAllowed(){
  const connection=globalThis.navigator?.connection;
  if(connection?.saveData===true)return 'save-data';
  if(globalThis.navigator?.onLine===false)return 'offline';
  return true;
}

// Everything the destination's foreground load would ask Cache Storage for at
// this portal's arrival point: {paths,sizes,index,models}. models are the
// arrival plan's model URLs, most wanted first. Reads shared manifests only.
export async function nextMapResources(world,portal,base,{signal,pause=nextTask}={}){
  const check=()=>{if(signal?.aborted)throw signal.reason;};
  const destination=portal.destination,mapId=mapForCharacter(destination),edition=!!world.gameplayV03,touch=!!world.touchDevice;
  const read=name=>readMapManifest(new URL(name+'.json',base));
  await prepareFixedLayouts(fixedLayoutsForCharacter(destination));check();
  const [original,index,ground,resident]=await Promise.all([read(mapId),read('resource-index'),read(mapId+'-ground'),mapId==='witch-cave'?read('elena'):null]);check();
  // The destination as the range and vista rules see it. Every other field
  // (view distance, feature switches, device) is this world's.
  const there=Object.create(world,{mapId:{value:mapId},plains:{value:mapId==='great-plains'},cave:{value:mapId==='witch-cave'},forest:{value:mapId==='monster-forest'}});
  const manifest=sceneryManifestFor(there,original);
  const paths=new Set(),models=[],manifestUrl=new URL(mapId+'.json',base);
  if(manifest.complete&&!manifest.developmentFixture){
    const assets=new Map();
    for(const id in manifest.assets){const config=manifest.assets[id];assets.set(id,{config,levels:villageLodSources(config,touch,edition)});}
    const camera=world.camera,placements=vistaRenderPlacements(there,mapScenePlacements(mapId,edition));
    // The way in: from the destination's road back to here towards the arrival point.
    const back=mapPortals(mapId).find(candidate=>mapForCharacter(candidate.destination)===world.mapId);let heading=null;
    if(back){const dx=portal.arrival.x-back.x,dz=portal.arrival.z-back.z,length=Math.hypot(dx,dz);if(length>.5)heading={x:dx/length,z:dz/length};}
    const work=arrivalSceneryPlan({assets,placements,arrival:portal.arrival,cave:there.cave,heading,range:plainsRenderRange(there).cellCull,
      view:{minZ:camera.minZ,screenArea:camera.screenArea,reach:Math.min(Math.max(camera.radius??0,0),CAMERA_REACH_LIMIT),scale:sceneryDistanceScale(there)}});
    let step=work.next();
    while(!step.done){await pause();check();step=work.next();}
    for(const path of planResources(step.value))paths.add(path);
    // Staging order: what the arrival view shows first, then the rest of the plan.
    const seen=new Set();
    for(const front of [true,false])for(const entry of step.value){if(!entry.model||!!entry.ahead!==front)continue;const key=new URL(entry.model,manifestUrl).href;if(!seen.has(key)){seen.add(key);models.push(key);}}
  }
  for(const path of ground.resources??[])paths.add(path);
  for(const path of resident?.resources??[])paths.add(path);
  const list=[...paths];
  return {paths:edition?sceneryPrefetchPaths(list):list,sizes:startupFileSizes(index.files,{edition,mobile:touch,usesPlayer2k:false}),index,models};
}

export function createNextMapPrefetch({world,base,now=()=>performance.now(),resources=nextMapResources,allowed=prefetchAllowed,loadContainer=loadMapContainer,pause=nextTask,warmTerrain=warmNextMapTerrain,
  heldFrame=createHeldFrame({canvas:world.scene?.getEngine?.()?.getRenderingCanvas?.()??null}),renderFrame=()=>world.scene.render(!world.caveCamera?.applied),cover=coverPreparation,
  stageBytes=stageBudget(globalThis.location?.search,world.touchDevice),quietMs=quietBudget(globalThis.location?.search),
  downloads=(sizes,root,index)=>new ResourceDownloads(sizes,root,{index,adaptiveCacheKeys:true})}={}){
  const done=new Set(),retried=new Set(),last=[],closing=[],away=[],history=[],stats={runs:0,skipped:0,cancelled:0,failed:0,completed:0,staged:0,taken:0,dropped:0,quietTravels:0,quietArrivals:0,quietCurtains:0};
  // key (model URL) -> {container,bytes}; all for one destination.
  const staged=new Map();
  // destination character -> how long the last change to it took (ms), this session.
  const travelMs=new Map();let travelStarted=null,travelTo=null;
  let visit=null,portals=[],elapsed=PREFETCH_CHECK_SECONDS,job=null,retryAt=-Infinity,disposed=false;
  let stagedFor=null,stagedBytes=0,dropAt=Infinity,verified=null,quiet=false;
  function stop(){
    if(!job)return;
    const current=job;job=null;current.controller.abort(released());current.downloads?.cancel();
  }
  function drop(){
    for(const entry of staged.values()){stats.dropped++;try{entry.container.dispose();}catch{/* a lost context already took it */}}
    staged.clear();stagedBytes=0;stagedFor=null;dropAt=Infinity;
  }
  function trim(){
    let count=0;
    for(const [key,entry] of staged){
      if(count++>=STAGE_DROP_PER_CHECK)return;
      staged.delete(key);stagedBytes-=entry.bytes;stats.dropped++;try{entry.container.dispose();}catch{/* a lost context already took it */}
    }
    stagedBytes=0;stagedFor=null;dropAt=Infinity;
  }
  // From travel() until the arrival is shown (or the change fails) no frame reaches the player:
  // every preparation in that stretch works without waiting on frames (boss-preparation.js).
  let uncover=null;
  function cancel(){stop();drop();verified=null;quiet=false;travelStarted=null;heldFrame.release(0);uncover?.();uncover=null;}
  const containerBytes=container=>{let bytes=0;for(const texture of container?.textures??[])bytes+=textureBytes(texture?.getInternalTexture?.()??texture);return bytes;};
  async function stage(current,models){
    const {record,controller}=current,signal=controller.signal;
    if(stagedFor!==record.destination)drop();
    stagedFor=record.destination;dropAt=now()+STAGE_IDLE_MS;
    for(const key of models){
      if(signal.aborted)throw signal.reason;
      if(stagedBytes>=stageBytes){record.stageFull=true;break;}
      if(staged.has(key))continue;
      const container=await loadContainer(new URL(key),world.scene,{signal});
      // Stopped while this one loaded: nobody will take it.
      if(signal.aborted||disposed||stagedFor!==record.destination){try{container?.dispose();}catch{/* released with the context */}throw signal.reason??released();}
      const bytes=containerBytes(container);
      // A model's size is only known once it is read. One that would pass the limit is
      // let go at once, so what is kept never exceeds it (Astra 2026-11-28: 35.83 of 32 MiB).
      if(stagedBytes+bytes>stageBytes){try{container?.dispose();}catch{/* released with the context */}record.stageFull=true;break;}
      staged.set(key,{container,bytes});stagedBytes+=bytes;stats.staged++;
      record.staged++;record.stagedBytes=stagedBytes;dropAt=now()+STAGE_IDLE_MS;
      await pause();
    }
  }
  function enter(mapId){
    const previous=visit;stop();verified=null;
    // Arriving where the staged containers belong keeps them for the loader's streaming.
    if(stagedFor&&mapForCharacter(stagedFor)!==mapId)drop();
    // arrived() shortens this; without it they still cannot outlive the idle limit.
    else if(staged.size)dropAt=Math.min(dropAt,now()+STAGE_IDLE_MS);
    done.clear();retried.clear();visit=mapId;portals=mapPortals(mapId);last.length=closing.length=away.length=portals.length;
    for(let i=0;i<portals.length;i++){
      last[i]=NaN;closing[i]=NaN;
      // The road back: its map's files were in use until a moment ago.
      away[i]=!(previous&&mapForCharacter(portals[i].destination)===previous);
    }
  }
  async function run(current,portal){
    const {record,controller}=current,signal=controller.signal,check=()=>{if(signal.aborted)throw signal.reason;};
    const list=await resources(world,portal,base,{signal});check();
    record.files=list.paths.length;if(!list.paths.length)return;
    // Beside the transfer and the staging. Its failure only means the map builds its terrain as before.
    const terrain=Promise.resolve().then(()=>warmTerrain(world,mapForCharacter(portal.destination),{signal})).then(value=>{record.terrain=value===true;},()=>{record.terrain=false;});
    const queue=current.downloads=downloads(list.sizes,base,list.index);record.state='downloading';
    const read=state=>{record.bytes=state.total;record.cachedBytes=state.cached;record.loadedBytes=state.loaded;};
    const state=await queue.prepare(list.paths,read);check();read(state);record.stored=state.storageAvailable!==false;
    // Files proved present in this document: the foreground load need not look again.
    if(state.complete!==false&&record.stored){const urls=new Set();for(const path of list.paths)urls.add(resourceUrl(path,base));verified={destination:record.destination,urls};}
    if(stageBytes>0&&list.models?.length){record.state='staging';await stage(current,list.models);check();}
    await terrain;check();
  }
  function start(portal,index){
    const destination=portal.destination;done.add(destination);
    const reason=allowed();
    const record={destination,state:'planning',startedAtMs:Math.round(now()),ms:null,files:0,bytes:0,cachedBytes:0,loadedBytes:0,stored:null,terrain:null,staged:0,stagedBytes:0,stageFull:false,error:null};
    history.push(record);if(history.length>HISTORY)history.shift();
    if(reason!==true){record.state='skipped';record.error=String(reason);stats.skipped++;return;}
    stats.runs++;
    const current=job={controller:new AbortController(),downloads:null,record,visit,index};
    run(current,portal).then(()=>{record.state='complete';stats.completed++;},error=>{
      if(current.controller.signal.aborted){record.state='cancelled';stats.cancelled++;return;}
      record.state='failed';record.error=String(error?.message??error).slice(0,160);stats.failed++;
      // A dropped connection may come back before the player reaches the road.
      // Once: a list the size index rejects would fail the same way every time.
      if(visit===current.visit&&!retried.has(destination)){retried.add(destination);done.delete(destination);retryAt=now()+PREFETCH_RETRY_MS;}
    }).finally(()=>{
      record.ms=Math.round(now()-record.startedAtMs);current.downloads?.cancel();current.downloads=null;
      if(job===current)job=null;
    });
  }
  const api={
    world,
    // position: the player's {x,z}. busy: loading, travelling, not in play, or the
    // current map's own downloads waiting.
    update(dt,position,busy){
      if(disposed)return;
      elapsed+=dt;if(elapsed<PREFETCH_CHECK_SECONDS)return;elapsed=0;
      if(world.mapId!==visit)enter(world.mapId);
      if(staged.size&&now()>=dropAt)trim();
      if(!position)return;
      // Every road is measured before any decision: the choice between two roads
      // must not read one of them a check late (Astra 2026-11-28).
      for(let i=0;i<portals.length;i++){
        const portal=portals[i],distance=Math.hypot(position.x-portal.x,position.z-portal.z);
        closing[i]=last[i]-distance;last[i]=distance;
        if(distance>PREFETCH_APPROACH)away[i]=true;
        // Still by the road the containers were staged for: keep them.
        else if(staged.size&&portal.destination===stagedFor)dropAt=now()+STAGE_IDLE_MS;
      }
      if(busy||globalThis.document?.hidden||now()<retryAt)return;
      for(let i=0;i<portals.length;i++){
        const portal=portals[i],distance=last[i];
        if(!away[i]||done.has(portal.destination))continue;
        if(!(distance<PREFETCH_NEAR||(distance<PREFETCH_APPROACH&&closing[i]>=PREFETCH_CLOSING)))continue;
        if(job){
          // Work for a road the player has since left must not hold up this one
          // (Astra 2026-11-28: a cave run kept the plains road from being staged).
          if(job.index===i||!(last[job.index]>PREFETCH_APPROACH))continue;
          done.delete(job.record.destination);stop();drop();
        }
        start(portal,i);
      }
    },
    // How long this travel may go without a loading screen; 0 = show it at once. Only a road
    // walked across in play (not the minimap, a menu or a story scene) with models staged for it.
    // The last change to that map must have fitted the limit (QUIET_EXPECTED_SHARE), and the
    // picture being left must be held (held-frame.js) - the destination is built under it.
    // Call before the map being left is taken apart: this draws it once more for the copy.
    quietFor(destination,context){
      const expected=travelMs.get(destination);
      quiet=quietMs>0&&!!world.v03?.playing&&!world.v03.story?.sceneActive&&context?.boundary?.to===destination&&stagedFor===destination&&staged.size>0&&
        expected!==undefined&&expected<=quietMs*QUIET_EXPECTED_SHARE&&heldFrame.hold(renderFrame)===true;
      if(quiet)stats.quietTravels++;
      return quiet?quietMs:0;
    },
    get quietActive(){return quiet;},
    // Travel to `destination` begins: stop working, keep what is staged for it.
    travel(destination){stop();if(stagedFor!==destination)drop();else dropAt=Infinity;if(verified&&verified.destination!==destination)verified=null;travelStarted=now();travelTo=destination;uncover?.();uncover=cover();},
    // The destination is up: the loader's streaming may still take a few more.
    // screenShown: whether the loading screen came on during a quiet travel after all.
    arrived(screenShown){
      if(travelStarted!==null){travelMs.set(travelTo,Math.round(now()-travelStarted));travelStarted=null;}
      if(quiet){quiet=false;if(screenShown===true)stats.quietCurtains++;else stats.quietArrivals++;}
      heldFrame.release(screenShown===true?0:HELD_FRAME_FADE_MS);uncover?.();uncover=null;
      verified=null;if(staged.size)dropAt=now()+STAGE_LINGER_MS;
    },
    // A staged container for this model URL, handed over for good; null if none.
    // Only the map they were staged for may take: the map being left also streams
    // models, some from the same URL, and must not empty the next map's stage
    // (Astra 2026-11-28: that also failed the run still filling it).
    take(model,mapId){
      if(!stagedFor||mapForCharacter(stagedFor)!==mapId)return null;
      const key=typeof model==='string'?model:model?.href,entry=key?staged.get(key):null;if(!entry)return null;
      staged.delete(key);stagedBytes-=entry.bytes;stats.taken++;if(!staged.size&&!job){stagedFor=null;dropAt=Infinity;}
      return entry.container;
    },
    // Content URLs a finished run stored for this map, or null.
    verifiedUrls(mapId){return verified&&mapForCharacter(verified.destination)===mapId?verified.urls:null;},
    cancel,
    dispose(){if(disposed)return;disposed=true;cancel();done.clear();retried.clear();portals=[];world.scene?.onDisposeObservable?.remove(observer);engine?.onContextLostObservable?.remove(lost);},
    inspect(){return {...stats,active:job?job.record.destination:null,quietLimitMs:quietMs,heldFrame:heldFrame.held,lastTravelMs:Object.fromEntries(travelMs),stageLimit:stageBytes,stagedFor,stagedModels:staged.size,stagedBytes,recent:history.map(record=>({...record}))};},
  };
  const observer=world.scene?.onDisposeObservable?.addOnce(()=>api.dispose());
  // A lost context takes the staged GPU objects with it; the map loads them the normal way.
  const engine=world.scene?.getEngine?.(),lost=engine?.onContextLostObservable?.add(()=>{stop();drop();});
  return api;
}
