import {CONTENT_NAME as CONTENT,validateResourceIndex,planResourceTransfers} from './resource-index.js';
import {canExtractResourceBundles,extractResourceBundle} from './resource-bundles.js';
import {MapLoadLifetime} from './map-load-lifetime.js';
import {ResourceLoadLedger} from './resource-load-ledger.js';
export function resourceUrl(path,base){
  const url=new URL(path,base);
  if(!CONTENT.test(url.pathname.split('/').at(-1)))throw new Error('Invalid content resource');
  url.search='';url.hash='';return url.href;
}
export function downloadText({loaded,total}){return `${(loaded/1e6).toFixed(1)} / ${(total/1e6).toFixed(1)} MB`;}

// A fixed plan counts only missing files. Stored bytes are never reported as a
// new download, and file count is never substituted for byte progress.
export class ResourceDownloads {
  constructor(sizes,base,{cacheStorage=globalThis.caches,fetcher=(...args)=>fetch(...args),now=()=>performance.now(),index=null,idleTimeoutMs=30000,timers,ledgerMaxEntries=4096,ledgerTiming=null}={}){
    this.sizes=sizes;this.base=base;this.storage=cacheStorage;this.fetcher=fetcher;this.now=now;this.tail=Promise.resolve();this.storageUnavailable=false;
    this.index=index?validateResourceIndex(index):null;
    this.stats={revision:index?.revision??null,bundleRequests:0,fileRequests:0,extractedFiles:0,cacheHits:0,downloadBytes:0};
    this.abort=new AbortController();
    this.idleTimeoutMs=idleTimeoutMs;this.timers=timers;
    this.ledger=new ResourceLoadLedger({base,sizes,now,maxEntries:ledgerMaxEntries,timing:ledgerTiming});
  }
  cancel(){this.ledger.close();this.abort.abort(new DOMException('Map resources released','AbortError'));}
  markReady(){this.ledger.markReady();}
  snapshot(){return this.ledger.snapshot();}
  noteReuse(paths,options){this.ledger.reuse(paths,options);}
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
    let cache;try{if(!this.storageUnavailable)cache=await step('resource-cache-open',()=>this.storage?.open('moonforest-resources-v1'));}catch(error){signal.throwIfAborted();}
    // Enumerate keys once instead of creating a Response/body handle for every
    // cached file. Refresh on every job so eviction/deletion remains visible.
    const cachedUrls=cache?.keys&&urls.length>=16?new Set((await step('resource-cache-keys',()=>cache.keys())).map(request=>request.url)):null;
    const missing=[];let cached=0;
    for(const url of urls){
      signal.throwIfAborted();
      const size=this.sizes[new URL(url).pathname.split('/').at(-1)];
      if(!Number.isSafeInteger(size)||size<0)throw new Error('리소스 용량 목록이 일치하지 않습니다. 새로고침해 주세요.');
      const row=this.ledger.request(url,phase);rows.set(url,row);
      if(cachedUrls?cachedUrls.has(url):await step('resource-cache-match',()=>cache?.match(url,{ignoreVary:true}))){cached+=size;this.ledger.cached(row,phase);continue;}
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
        if(['QuotaExceededError','NotAllowedError','SecurityError'].includes(error.name)){
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
      const response=await step('resource-response',()=>this.fetcher(url,{cache:'force-cache',headers:{'X-Moonforest-Cache-Writer':'page'},signal}),response=>{response.body?.cancel().catch(()=>{});});
      if(signal.aborted){await response.body?.cancel().catch(()=>{});signal.throwIfAborted();}
      if(!response.ok)throw new Error(`리소스 다운로드 실패 (${response.status})`);
      let received=0;const reader=response.body?.getReader();
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
          }catch(error){controller.error(error);await reader.cancel(error).catch(()=>{});}
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
        if(!signal.aborted)await step('resource-cache-delete',()=>cache.delete?.(url));
        if(['QuotaExceededError','NotAllowedError','SecurityError'].includes(error.name)){
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
