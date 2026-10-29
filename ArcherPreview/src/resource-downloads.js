import {CONTENT_NAME as CONTENT,validateResourceIndex,planResourceTransfers} from './resource-index.js';
import {canExtractResourceBundles,extractResourceBundle} from './resource-bundles.js';
export function resourceUrl(path,base){
  const url=new URL(path,base);
  if(!CONTENT.test(url.pathname.split('/').at(-1)))throw new Error('Invalid content resource');
  url.search='';url.hash='';return url.href;
}
export function downloadText({loaded,total}){return `${(loaded/1e6).toFixed(1)} / ${(total/1e6).toFixed(1)} MB`;}

// A fixed plan counts only missing files. Stored bytes are never reported as a
// new download, and file count is never substituted for byte progress.
export class ResourceDownloads {
  constructor(sizes,base,{cacheStorage=globalThis.caches,fetcher=(...args)=>fetch(...args),now=()=>performance.now(),index=null}={}){
    this.sizes=sizes;this.base=base;this.storage=cacheStorage;this.fetcher=fetcher;this.now=now;this.tail=Promise.resolve();this.storageUnavailable=false;
    this.index=index?validateResourceIndex(index):null;
    this.stats={revision:index?.revision??null,bundleRequests:0,fileRequests:0,extractedFiles:0,cacheHits:0,downloadBytes:0};
    this.abort=new AbortController();
  }
  cancel(){this.abort.abort(new DOMException('Map resources released','AbortError'));}
  prepare(paths,onProgress=()=>{}){
    const job=this.tail.then(()=>this.run(paths,onProgress));this.tail=job.catch(()=>{});return job;
  }
  async run(paths,onProgress){
    const signal=this.abort.signal;signal.throwIfAborted();
    const urls=[...new Set(paths.map(p=>resourceUrl(p,this.base)))];
    let cache;try{if(!this.storageUnavailable)cache=await this.storage?.open('moonforest-resources-v1');}catch{}
    // Enumerate keys once instead of creating a Response/body handle for every
    // cached file. Refresh on every job so eviction/deletion remains visible.
    const cachedUrls=cache?.keys&&urls.length>=16?new Set((await cache.keys()).map(request=>request.url)):null;
    const missing=[];let cached=0;
    for(const url of urls){
      signal.throwIfAborted();
      const size=this.sizes[new URL(url).pathname.split('/').at(-1)];
      if(!Number.isSafeInteger(size)||size<0)throw new Error('리소스 용량 목록이 일치하지 않습니다. 새로고침해 주세요.');
      if(cachedUrls?cachedUrls.has(url):await cache?.match(url,{ignoreVary:true})){cached+=size;continue;}
      missing.push({url,size});
    }
    const plan=planResourceTransfers(missing,canExtractResourceBundles()?this.index:null);
    this.stats.cacheHits+=urls.length-missing.length;
    const state={loaded:0,total:plan.bytes,cached,complete:false,storageAvailable:!!cache};
    let lastProgress=-Infinity;
    const emit=()=>onProgress({...state,ratio:state.total?state.loaded/state.total:1});emit();
    const count=bytes=>{state.loaded+=bytes;this.stats.downloadBytes+=bytes;const time=this.now();if(time-lastProgress>=100){lastProgress=time;emit();}};
    // Without persistent storage, let the actual loader fetch once via normal
    // HTTP caching; prefetching would otherwise risk a second download.
    if(!cache){onProgress({...state,ratio:0,unavailable:true});return state;}
    for(const pack of plan.packs){
      try{
        this.stats.bundleRequests++;
        await extractResourceBundle({pack,index:this.index,base:this.base,fetcher:this.fetcher,cache,signal,count,onFile:()=>this.stats.extractedFiles++});
      }catch(error){
        if(['QuotaExceededError','NotAllowedError','SecurityError'].includes(error.name)){
          this.storageUnavailable=true;state.storageAvailable=false;onProgress({...state,ratio:0,unavailable:true});return state;
        }
        throw error;
      }
      emit();
    }
    for(const {url,size}of plan.files){
      signal.throwIfAborted();
      // This page writes the stream to CacheStorage. Tell the worker not to tee
      // and write a second copy of large player textures at the same time.
      this.stats.fileRequests++;
      const response=await this.fetcher(url,{cache:'force-cache',headers:{'X-Moonforest-Cache-Writer':'page'},signal});
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
        await cache.put(url,new Response(data,{status:response.status,statusText:response.statusText,headers}));
      }catch(error){
        await reader?.cancel(error).catch(()=>{});await cache.delete?.(url);
        if(['QuotaExceededError','NotAllowedError','SecurityError'].includes(error.name)){
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
