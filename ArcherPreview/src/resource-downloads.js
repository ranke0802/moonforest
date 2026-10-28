const CONTENT=/^[a-f0-9]{64}\.(bin|gltf|png|jpg|jpeg|webp|ktx2|js|wasm|wav|mp3)$/;
export function resourceUrl(path,base){
  const url=new URL(path,base);
  if(!CONTENT.test(url.pathname.split('/').at(-1)))throw new Error('Invalid content resource');
  url.search='';url.hash='';return url.href;
}
export function downloadText({loaded,total}){return `${(loaded/1e6).toFixed(1)} / ${(total/1e6).toFixed(1)} MB`;}

// A fixed plan counts only missing files. Stored bytes are never reported as a
// new download, and file count is never substituted for byte progress.
export class ResourceDownloads {
  constructor(sizes,base,{cacheStorage=globalThis.caches,fetcher=(...args)=>fetch(...args)}={}){
    this.sizes=sizes;this.base=base;this.storage=cacheStorage;this.fetcher=fetcher;this.tail=Promise.resolve();
  }
  prepare(paths,onProgress=()=>{}){
    const job=this.tail.then(()=>this.run(paths,onProgress));this.tail=job.catch(()=>{});return job;
  }
  async run(paths,onProgress){
    const urls=[...new Set(paths.map(p=>resourceUrl(p,this.base)))];
    let cache;try{cache=await this.storage?.open('moonforest-resources-v1');}catch{}
    const missing=[];let cached=0;
    for(const url of urls){
      const size=this.sizes[new URL(url).pathname.split('/').at(-1)];
      if(!Number.isSafeInteger(size)||size<0)throw new Error('리소스 용량 목록이 일치하지 않습니다. 새로고침해 주세요.');
      if(await cache?.match(url,{ignoreVary:true})){cached+=size;continue;}
      missing.push({url,size});
    }
    const state={loaded:0,total:missing.reduce((n,r)=>n+r.size,0),cached,complete:false,storageAvailable:!!cache};
    const emit=()=>onProgress({...state,ratio:state.total?state.loaded/state.total:1});emit();
    // Without persistent storage, let the actual loader fetch once via normal
    // HTTP caching; prefetching would otherwise risk a second download.
    if(!cache){onProgress({...state,ratio:0,unavailable:true});return state;}
    for(const {url,size}of missing){
      // This page writes the stream to CacheStorage. Tell the worker not to tee
      // and write a second copy of large player textures at the same time.
      const response=await this.fetcher(url,{cache:'force-cache',headers:{'X-Moonforest-Cache-Writer':'page'}});
      if(!response.ok)throw new Error(`리소스 다운로드 실패 (${response.status})`);
      const saving=cache.put(url,response.clone()).catch(()=>{state.storageAvailable=false;});
      let received=0;
      if(response.body?.getReader){
        const reader=response.body.getReader();
        for(;;){const {done,value}=await reader.read();if(done)break;received+=value.byteLength;state.loaded+=value.byteLength;emit();}
      }else{received=(await response.arrayBuffer()).byteLength;state.loaded+=received;emit();}
      await saving;
      if(received!==size){await cache.delete?.(url);throw new Error('리소스가 불완전하게 다운로드되었습니다. 다시 시도해 주세요.');}
    }
    state.complete=true;emit();return state;
  }
}
