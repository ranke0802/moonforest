import {CONTENT_NAME} from './resource-index.js';
import {MapLoadLifetime} from './map-load-lifetime.js';

const repairs=new WeakMap();
const mimeTypes={bin:'application/octet-stream',gltf:'model/gltf+json',ktx2:'image/ktx2',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',js:'text/javascript',wasm:'application/wasm',mp3:'audio/mpeg',wav:'audio/wav'};
const repairError=(message,code,url)=>Object.assign(new Error(message),{code,resourceUrl:url,stage:'resource-repair'});

// Used only after a resource fails to load. Never scan or hash the full cache:
// keep healthy bytes, and replace only a proven bad entry with one verified fetch.
export async function repairCachedResource(input,{signal,expectedSize,check=()=>{},cacheStorage=globalThis.caches,fetcher=(...args)=>fetch(...args),timeoutMs=15000,timers,maxBytes=64*1048576}={}){
  const url=new URL(input);url.search='';url.hash='';const name=url.pathname.split('/').at(-1);
  if(!CONTENT_NAME.test(name))throw new Error('Invalid content resource');
  if(expectedSize!==undefined&&(!Number.isSafeInteger(expectedSize)||expectedSize<=0))throw new RangeError('Invalid repair resource size');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw new RangeError('Invalid repair read limit');
  const href=url.href,expectedHash=name.slice(0,64),result=status=>({status,repaired:status==='repaired',url:href,expectedHash});
  const lifetime=new MapLoadLifetime({signal,timeoutMs,timers,stage:'resource-repair'});
  const current=()=>{lifetime.check();try{check();}catch(error){lifetime.abort(error);throw error;}lifetime.check();};
  const run=async(task,options)=>{current();const value=await lifetime.run(task,options);try{current();}catch(error){options?.onLate?.(value);throw error;}return value;};
  const read=async response=>{
    const reader=response.body?.getReader();if(!reader){const bytes=new Uint8Array(await run(()=>response.arrayBuffer()));if(bytes.byteLength>maxBytes)throw repairError('리소스 확인 용량이 제한을 초과했습니다.','RESOURCE_REPAIR_LIMIT',href);return bytes;}
    const abort=()=>{reader.cancel(lifetime.signal.reason).catch(()=>{});};lifetime.signal.addEventListener('abort',abort,{once:true});
    const chunks=[];let length=0;
    try{
      for(;;){const {done,value}=await run(()=>reader.read());if(done)break;length+=value.byteLength;if(length>maxBytes)throw repairError('리소스 확인 용량이 제한을 초과했습니다.','RESOURCE_REPAIR_LIMIT',href);chunks.push(value);}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
    }catch(error){reader.cancel(error).catch(()=>{});throw error;}
    finally{lifetime.signal.removeEventListener('abort',abort);reader.releaseLock();}
  };
  const digest=async bytes=>[...new Uint8Array(await run(()=>crypto.subtle.digest('SHA-256',bytes)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const perform=async()=>{
    current();
    if(!cacheStorage?.open||!globalThis.crypto?.subtle)return result('unavailable');
    let cache,cached;
    try{cache=await run(()=>cacheStorage.open('moonforest-resources-v1'));cached=await run(()=>cache.match(href,{ignoreVary:true}));}
    catch(error){current();return {...result('unavailable'),message:String(error.message??error).slice(0,240)};}
    if(!cached)return result('missing');
    const oldBytes=await read(cached),actualHash=await digest(oldBytes);
    if(actualHash===expectedHash)return {...result('valid'),actualHash,bytes:oldBytes.byteLength};
    // The worker bypass makes deletion unnecessary. Keep the old entry until
    // a verified replacement is ready; an uncancellable late delete could
    // otherwise remove a newer map's successful repair.
    const response=await run(()=>fetcher(href,{cache:'no-store',headers:{'X-Moonforest-Cache-Repair':'1'},signal:lifetime.signal}),{onLate:response=>{response.body?.cancel().catch(()=>{});}});
    if(response.status!==200){response.body?.cancel().catch(()=>{});throw repairError(`리소스 복구 다운로드 실패 (${response.status})`,'RESOURCE_REPAIR_HTTP',href);}
    const bytes=await read(response),freshHash=await digest(bytes);
    if(freshHash!==expectedHash)throw repairError('복구한 리소스의 체크섬이 일치하지 않습니다.','RESOURCE_REPAIR_CHECKSUM',href);
    if(expectedSize!==undefined&&bytes.byteLength!==expectedSize)throw repairError('복구한 리소스 용량이 목록과 다릅니다.','RESOURCE_REPAIR_SIZE',href);
    // fetch has decoded HTTP compression. Store canonical content headers,
    // and check ownership immediately before the atomic CacheStorage write.
    // A started put can finish after cancellation, but its verified bytes are
    // identical for this immutable hash URL and safe for a subsequent owner.
    current();
    await run(()=>cache.put(href,new Response(bytes,{headers:{'Content-Type':mimeTypes[name.split('.').at(-1)],'Content-Length':String(bytes.byteLength)}})));
    return {...result('repaired'),actualHash,freshHash,bytes:bytes.byteLength};
  };
  try{
    current();
    if(!cacheStorage?.open)return result('unavailable');
    let queue=repairs.get(cacheStorage);if(!queue){queue=new Map();repairs.set(cacheStorage,queue);}
    const previous=queue.get(href)??Promise.resolve();
    const job=previous.catch(()=>{}).then(perform);queue.set(href,job);
    job.finally(()=>{if(queue.get(href)===job)queue.delete(href);}).catch(()=>{});
    return await lifetime.run(()=>job);
  }finally{lifetime.close();}
}
