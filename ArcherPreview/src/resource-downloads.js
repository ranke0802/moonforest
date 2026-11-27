import {CONTENT_NAME as CONTENT,validateResourceIndex,planResourceTransfers,getResourceCacheStorage} from './resource-index.js';
import {canExtractResourceBundles,extractResourceBundle} from './resource-bundles.js';
import {MapLoadLifetime,stacklessError} from './map-load-lifetime.js';
import {ResourceLoadLedger} from './resource-load-ledger.js';
import {runtimeTimers} from './runtime-timers.js';
export function resourceUrl(path,base){
  const url=new URL(path,base);
  if(!CONTENT.test(url.pathname.split('/').at(-1)))throw new Error('Invalid content resource');
  url.search='';url.hash='';return url.href;
}
export function downloadText({loaded,total}){return `${(loaded/1e6).toFixed(1)} / ${(total/1e6).toFixed(1)} MB`;}

// A fixed plan counts only missing files. Stored bytes are never reported as a
// new download, and file count is never substituted for byte progress.
// The last few visits' counters (plain numbers; no map objects), for records.
const storageDenied=error=>['QuotaExceededError','NotAllowedError','SecurityError'].includes(error?.name);
const recentStats=[];
// Only retain scan costs and plan sizes in this document.
// Presence of any content hash must still be checked on the live cache.
const lastKeyScan=new WeakMap();
async function boundedKeyProbe(read,timers,delay){
  let timer;
  try{return await Promise.race([read,new Promise(resolve=>{timer=timers.setTimeout(()=>resolve(null),delay);})]);}
  finally{timers.clearTimeout(timer);}
}
export const recentResourceDownloadStats=()=>recentStats.map(stats=>({...stats}));
export class ResourceDownloads {
  constructor(sizes,base,{cacheStorage=getResourceCacheStorage(),fetcher=(...args)=>fetch(...args),now=()=>performance.now(),index=null,idleTimeoutMs=30000,timers,ledgerMaxEntries=4096,ledgerTiming=null,probeCacheKeys=false,adaptiveCacheKeys=false}={}){
    this.sizes=sizes;this.base=base;this.storage=cacheStorage;this.fetcher=fetcher;this.now=now;this.tail=Promise.resolve();this.storageUnavailable=false;
    this.probeCacheKeys=probeCacheKeys;this.adaptiveCacheKeys=adaptiveCacheKeys;
    this.index=index?validateResourceIndex(index):null;
    // Cache Storage reads are counted apart from transfers (2026-11-24): how many
    // times a visit listed the cache's keys or matched one file, and how long.
    this.stats={revision:index?.revision??null,bundleRequests:0,fileRequests:0,extractedFiles:0,cacheHits:0,downloadBytes:0,jobs:0,cacheKeyLists:0,cacheKeyListMs:0,cacheKeyListMaxMs:0,cacheEntries:null,cacheMatches:0,cacheMatchMs:0,cacheProbeMode:probeCacheKeys,cacheAdaptiveMode:adaptiveCacheKeys,cacheAdaptiveFallbacks:0,cacheProbeUrls:0,cacheProbeBatches:0,cacheProbeMs:0};
    recentStats.push(this.stats);if(recentStats.length>8)recentStats.shift();
    this.abort=new AbortController();
    this.idleTimeoutMs=idleTimeoutMs;this.timers=timers;
    this.ledger=new ResourceLoadLedger({base,sizes,now,maxEntries:ledgerMaxEntries,timing:ledgerTiming});
  }
  cancel(){this.ledger.close();this.abort.abort(stacklessError(()=>new DOMException('Map resources released','AbortError')));}
  markReady(){this.ledger.markReady();}
  snapshot(){return this.ledger.snapshot();}
  noteReuse(paths,options){this.ledger.reuse(paths,options);}
  async timedRead(kind,task){
    const started=this.now();
    try{return await task();}
    finally{
      const ms=Math.max(0,this.now()-started),stats=this.stats;
      if(kind==='list'){stats.cacheKeyLists++;stats.cacheKeyListMs=Math.round((stats.cacheKeyListMs+ms)*10)/10;stats.cacheKeyListMaxMs=Math.round(Math.max(stats.cacheKeyListMaxMs,ms)*10)/10;}
      else if(kind==='probe'){stats.cacheProbeBatches++;stats.cacheProbeMs=Math.round((stats.cacheProbeMs+ms)*10)/10;}
      else{stats.cacheMatches++;stats.cacheMatchMs=Math.round((stats.cacheMatchMs+ms)*10)/10;}
    }
  }
  prepare(paths,onProgress=()=>{}){
    const job=this.tail.then(()=>this.run(paths,onProgress));this.tail=job.catch(()=>{});return job;
  }
  async run(paths,onProgress){
    const lifetime=new MapLoadLifetime({signal:this.abort.signal,timeoutMs:this.idleTimeoutMs,timers:this.timers,stage:'resource-cache'});
    const job={phase:this.ledger.phase(),activeRow:null,failureRecorded:false};
    try{return await lifetime.run(()=>this.runPlan(paths,state=>{lifetime.check();onProgress(state);},lifetime,job));}
    catch(error){if(!job.failureRecorded)this.ledger.fail(job.activeRow,job.phase,error);lifetime.abort(error);this.stats.lastFailure={stage:lifetime.stage,message:String(error.message??error).slice(0,240),code:error.code??null};throw error;}
    finally{lifetime.close();this.stats.waitStage=null;}
  }
  async runPlan(paths,onProgress,lifetime,job){
    const signal=lifetime.signal;signal.throwIfAborted();
    const step=async(stage,task,onLate)=>{lifetime.check();lifetime.stage=stage;this.stats.waitStage=stage;const value=await lifetime.run(task,{onLate});lifetime.renew(stage);return value;};
    const urls=[...new Set(paths.map(p=>resourceUrl(p,this.base)))];
    const phase=job.phase,rows=new Map();
    let cache;try{if(!this.storageUnavailable)cache=await step('resource-cache-open',()=>this.storage?.open('moonforest-resources-v1'));}catch(error){signal.throwIfAborted();if(storageDenied(error))this.storageUnavailable=true;}
    const readCache=async(kind,stage,read)=>{
      try{return await this.timedRead(kind,()=>step(stage,read));}
      catch(error){
        signal.throwIfAborted();
        if(!storageDenied(error))throw error;
        this.storageUnavailable=true;cache=null;
      }
    };
    // A region may need only a fraction of the hashes stored for the release.
    // Compare metadata read costs, without using an old list as proof of a hit.
    this.stats.jobs++;
    let cachedUrls=null;
    const largePlan=urls.length>=16;
    const history=this.adaptiveCacheKeys&&largePlan?lastKeyScan.get(this.storage):null;
    const priorScan=history?.revision===this.stats.revision?history:null;
    let slowPlanSize=priorScan?.slowPlanSize??Infinity;
    const adaptive=priorScan?.entries>urls.length&&priorScan.ms>0&&urls.length<slowPlanSize&&!this.probeCacheKeys;
    if(cache?.keys&&(this.probeCacheKeys||adaptive)){
      const started=this.now(),timers=runtimeTimers(this.timers);
      cachedUrls=new Set();
      for(let start=0;start<urls.length&&cache;start+=4){
        const batch=urls.slice(start,start+4);
        this.stats.cacheProbeUrls+=batch.length;
        const hits=await readCache('probe','resource-cache-probe',()=>{
          const read=Promise.all(batch.map(url=>cache.keys(url,{ignoreVary:true}).then(keys=>keys.some(key=>key.url===url))));
          // Native key reads cannot be cancelled. Late results are metadata
          // only. Start the full scan promptly if this batch is still waiting.
          return adaptive?boundedKeyProbe(read,timers,Math.min(100,priorScan.ms/8)):read;
        });
        if(hits)batch.forEach((url,i)=>{if(hits[i])cachedUrls.add(url);});
        const checked=start+batch.length;
        if(adaptive&&cache&&(hits===null||(this.now()-started)*(urls.length-checked)/checked>priorScan.ms)){
          slowPlanSize=urls.length;
          cachedUrls=null;this.stats.cacheAdaptiveFallbacks++;break;
        }
      }
    }
    if(!cachedUrls&&cache?.keys&&largePlan){
      const started=this.now();
      const listed=await readCache('list','resource-cache-keys',()=>cache.keys());
      if(listed){
        cachedUrls=new Set(listed.map(request=>request.url));this.stats.cacheEntries=cachedUrls.size;
        if(this.adaptiveCacheKeys)lastKeyScan.set(this.storage,{revision:this.stats.revision,entries:cachedUrls.size,ms:this.now()-started,slowPlanSize});
      }
    }
    const missing=[];let cached=0;
    for(const url of urls){
      signal.throwIfAborted();
      const size=this.sizes[new URL(url).pathname.split('/').at(-1)];
      if(!Number.isSafeInteger(size)||size<0)throw new Error('리소스 용량 목록이 일치하지 않습니다. 새로고침해 주세요.');
      const row=this.ledger.request(url,phase);rows.set(url,row);
      if(cachedUrls?cachedUrls.has(url):cache&&await readCache('match','resource-cache-match',()=>cache.match(url,{ignoreVary:true}))){cached+=size;this.ledger.cached(row,phase);continue;}
      missing.push({url,size});
    }
    const plan=planResourceTransfers(missing,canExtractResourceBundles()?this.index:null);
    this.stats.cacheHits+=urls.length-missing.length;
    const state={loaded:0,total:plan.bytes,cached,complete:false,storageAvailable:!!cache};
    let lastProgress=-Infinity;
    const emit=()=>onProgress({...state,ratio:state.total?state.loaded/state.total:1});emit();
    const count=bytes=>{lifetime.check();if(bytes>0)lifetime.renew('resource-transfer');state.loaded+=bytes;this.stats.downloadBytes+=bytes;this.ledger.body(job.activeRow,phase,bytes);const time=this.now();if(time-lastProgress>=100){lastProgress=time;emit();}};
    // Without persistent storage, let the actual loader fetch once via normal
    // HTTP caching; prefetching would otherwise risk a second download.
    if(!cache){for(const {url}of missing)this.ledger.deferred(rows.get(url));onProgress({...state,ratio:0,unavailable:true});return state;}
    for(const pack of plan.packs){
      const startedAtMs=this.now(),url=new URL(pack.url,this.base).href,bundle=job.activeRow=this.ledger.fetchBundle(pack,phase);
      try{
        this.stats.bundleRequests++;
        await step('resource-bundle',()=>extractResourceBundle({pack,index:this.index,base:this.base,fetcher:this.fetcher,cache,signal,count,onFile:name=>{lifetime.renew('resource-bundle-cache');this.stats.extractedFiles++;this.ledger.extracted(rows.get(new URL('content/'+name,this.base).href),phase,bundle);}}));
        this.ledger.finishBundle(bundle,phase,url,startedAtMs);
      }catch(error){
        if(storageDenied(error)){
          this.ledger.fail(bundle,phase,error);job.failureRecorded=true;
          this.storageUnavailable=true;state.storageAvailable=false;onProgress({...state,ratio:0,unavailable:true});return state;
        }
        throw error;
      }
      emit();
    }
    for(const {url,size}of plan.files){
      signal.throwIfAborted();
      const row=job.activeRow=rows.get(url),startedAtMs=this.now();this.ledger.fetchFile(row,phase);
      // This page writes the stream to CacheStorage. Tell the worker not to tee
      // and write a second copy of large player textures at the same time.
      this.stats.fileRequests++;
      // A server busy for a moment (GitHub Pages answered 503 right after a
      // deploy, 2026-11-20) gets two more tries before the error card.
      let response=null;
      for(let attempt=0;;attempt++){
        response=await step('resource-response',()=>this.fetcher(url,{cache:'force-cache',headers:{'X-Moonforest-Cache-Writer':'page'},signal}),response=>{response.body?.cancel().catch(()=>{});});
        if(response.ok||attempt>=2||!(response.status>=500||response.status===429)||signal.aborted)break;
        await response.body?.cancel().catch(()=>{});
        await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));
      }
      if(signal.aborted){await response.body?.cancel().catch(()=>{});signal.throwIfAborted();}
      if(!response.ok)throw new Error(`리소스 다운로드 실패 (${response.status})`);
      let received=0,bodyFailure=null;const reader=response.body?.getReader();
      const abortRead=()=>{reader?.cancel(signal.reason).catch(()=>{});};
      signal.addEventListener('abort',abortRead,{once:true});
      const incomplete=()=>new Error('리소스가 불완전하게 다운로드되었습니다. 다시 시도해 주세요.');
      // One body consumer, with backpressure from CacheStorage. Response.clone()
      // tees the entire file and can retain a second large buffer when one reader
      // runs faster. Validate before closing so partial files cannot be committed.
      const body=reader?new ReadableStream({
        async pull(controller){
          try{
            signal.throwIfAborted();
            const {done,value}=await reader.read();
            signal.throwIfAborted();
            if(done){if(received!==size)throw incomplete();controller.close();return;}
            received+=value.byteLength;if(received>size)throw incomplete();
            count(value.byteLength);controller.enqueue(value);
          }catch(error){bodyFailure=error;controller.error(error);await reader.cancel(error).catch(()=>{});}
        },cancel:reason=>reader.cancel(reason),
      },{highWaterMark:0}):null;
      try{
        const headers=new Headers(response.headers);
        // fetch has already decoded any HTTP transport compression.
        headers.delete('Content-Encoding');headers.set('Content-Length',String(size));
        let data=body;
        if(!reader){data=await response.arrayBuffer();received=data.byteLength;if(received!==size)throw incomplete();count(received);}
        await step('resource-cache-write',()=>cache.put(url,new Response(data,{status:response.status,statusText:response.statusText,headers})));
        this.ledger.complete(row,phase,url,startedAtMs);
      }catch(error){
        reader?.cancel(error).catch(()=>{});
        // A late failed write must not delete a successful same-hash retry.
        // CacheStorage commits complete bodies atomically; aborted writes need
        // no global cleanup or cache deletion while a new owner may be active.
        signal.throwIfAborted();
        // Chromium can wrap either a failed body or its own CacheStorage
        // stream write in NetworkError. Only the latter permits HTTP fallback.
        if(bodyFailure)throw bodyFailure;
        if(storageDenied(error)||reader&&error?.name==='NetworkError'){
          this.ledger.fail(row,phase,error);job.failureRecorded=true;
          this.storageUnavailable=true;state.storageAvailable=false;
          onProgress({...state,ratio:0,unavailable:true});return state;
        }
        throw error;
      }finally{signal.removeEventListener('abort',abortRead);}
      emit();
    }
    state.complete=true;emit();return state;
  }
}
