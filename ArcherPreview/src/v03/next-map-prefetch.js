// Downloads the next map's files while the player walks up to its road
// (2026-11-28, user: region travel waited 11.7 s on a phone, 8.4 s of it download).
//
// Scope, on purpose:
//   - files and manifests only. They land in Cache Storage (disk); nothing is
//     decoded, no model is built, no GPU texture is created, so the map being
//     played keeps its whole memory and frame budget;
//   - its own ResourceDownloads queue. The current map's streaming requests are
//     never queued behind a next-map transfer;
//   - one run per destination per visit, started only on approach, never with
//     the browser's data saver on. The road just arrived by stays quiet until
//     the player has walked away from it once: standing at the gate after
//     arriving is not an approach;
//   - cancelled the moment travel starts: the foreground load then lists the
//     cache once and downloads only what is still missing, exactly as before.
// Lifetime: scene-wide. It keeps numbers and strings; the plan arrays live only
// inside one run.
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
import {prepareFixedLayouts,fixedLayoutsForCharacter} from '../fixed-layouts.js';
import {stacklessError} from '../map-load-lifetime.js';
import {vistaRenderPlacements} from './scenery-diagnostics.js';
import {arrivalSceneryPlan,planResources} from './next-map-plan.js';

// Start inside NEAR whatever the heading, or inside APPROACH while the distance
// to the road shrinks by CLOSING metres between two checks.
export const PREFETCH_NEAR=25,PREFETCH_APPROACH=60,PREFETCH_CLOSING=.5,PREFETCH_CHECK_SECONDS=.5;
// A failed run (network) may try once more after this long; a cancelled one may not.
export const PREFETCH_RETRY_MS=15000;
const CAMERA_REACH_LIMIT=24,HISTORY=4;

const released=()=>stacklessError(()=>new DOMException('Next map prefetch released','AbortError'));
const nextTask=()=>new Promise(resolve=>setTimeout(resolve,0));

export function prefetchAllowed(){
  const connection=globalThis.navigator?.connection;
  if(connection?.saveData===true)return 'save-data';
  if(globalThis.navigator?.onLine===false)return 'offline';
  return true;
}

// Everything the destination's foreground load would ask Cache Storage for at
// this portal's arrival point: {paths,sizes,index}. Reads shared manifests only.
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
  const paths=new Set();
  if(manifest.complete&&!manifest.developmentFixture){
    const assets=new Map();
    for(const id in manifest.assets){const config=manifest.assets[id];assets.set(id,{config,levels:villageLodSources(config,touch,edition)});}
    const camera=world.camera,placements=vistaRenderPlacements(there,mapScenePlacements(mapId,edition));
    const work=arrivalSceneryPlan({assets,placements,arrival:portal.arrival,cave:there.cave,range:plainsRenderRange(there).cellCull,
      view:{minZ:camera.minZ,screenArea:camera.screenArea,reach:Math.min(Math.max(camera.radius??0,0),CAMERA_REACH_LIMIT),scale:sceneryDistanceScale(there)}});
    let step=work.next();
    while(!step.done){await pause();check();step=work.next();}
    for(const path of planResources(step.value))paths.add(path);
  }
  for(const path of ground.resources??[])paths.add(path);
  for(const path of resident?.resources??[])paths.add(path);
  const list=[...paths];
  return {paths:edition?sceneryPrefetchPaths(list):list,sizes:startupFileSizes(index.files,{edition,mobile:touch,usesPlayer2k:false}),index};
}

export function createNextMapPrefetch({world,base,now=()=>performance.now(),resources=nextMapResources,allowed=prefetchAllowed,
  downloads=(sizes,root,index)=>new ResourceDownloads(sizes,root,{index,adaptiveCacheKeys:true})}={}){
  const done=new Set(),retried=new Set(),last=[],away=[],history=[],stats={runs:0,skipped:0,cancelled:0,failed:0,completed:0};
  let visit=null,portals=[],elapsed=PREFETCH_CHECK_SECONDS,job=null,retryAt=-Infinity,disposed=false;
  function cancel(){
    if(!job)return;
    const current=job;job=null;current.controller.abort(released());current.downloads?.cancel();
  }
  function enter(mapId){
    const previous=visit;cancel();done.clear();retried.clear();visit=mapId;portals=mapPortals(mapId);last.length=away.length=portals.length;
    for(let i=0;i<portals.length;i++){
      last[i]=NaN;
      // The road back: its map's files were in use until a moment ago.
      away[i]=!(previous&&mapForCharacter(portals[i].destination)===previous);
    }
  }
  async function run(current,portal){
    const {record,controller}=current,signal=controller.signal,check=()=>{if(signal.aborted)throw signal.reason;};
    const list=await resources(world,portal,base,{signal});check();
    record.files=list.paths.length;if(!list.paths.length)return;
    const queue=current.downloads=downloads(list.sizes,base,list.index);record.state='downloading';
    const read=state=>{record.bytes=state.total;record.cachedBytes=state.cached;record.loadedBytes=state.loaded;};
    const state=await queue.prepare(list.paths,read);check();read(state);record.stored=state.storageAvailable!==false;
  }
  function start(portal){
    const destination=portal.destination;done.add(destination);
    const reason=allowed();
    const record={destination,state:'planning',startedAtMs:Math.round(now()),ms:null,files:0,bytes:0,cachedBytes:0,loadedBytes:0,stored:null,error:null};
    history.push(record);if(history.length>HISTORY)history.shift();
    if(reason!==true){record.state='skipped';record.error=String(reason);stats.skipped++;return;}
    stats.runs++;
    const current=job={controller:new AbortController(),downloads:null,record,visit};
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
      if(!position)return;
      for(let i=0;i<portals.length;i++){
        const portal=portals[i],distance=Math.hypot(position.x-portal.x,position.z-portal.z),closing=last[i]-distance;last[i]=distance;
        if(distance>PREFETCH_APPROACH)away[i]=true;
        if(busy||job||!away[i]||done.has(portal.destination)||globalThis.document?.hidden||now()<retryAt)continue;
        if(distance<PREFETCH_NEAR||(distance<PREFETCH_APPROACH&&closing>=PREFETCH_CLOSING))start(portal);
      }
    },
    cancel,
    dispose(){if(disposed)return;disposed=true;cancel();done.clear();retried.clear();portals=[];world.scene?.onDisposeObservable?.remove(observer);},
    inspect(){return {...stats,active:job?job.record.destination:null,recent:history.map(record=>({...record}))};},
  };
  const observer=world.scene?.onDisposeObservable?.addOnce(()=>api.dispose());
  return api;
}
