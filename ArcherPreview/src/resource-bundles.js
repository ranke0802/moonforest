const types={bin:'application/octet-stream',gltf:'model/gltf+json',ktx2:'image/ktx2',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',js:'text/javascript',wasm:'application/wasm',mp3:'audio/mpeg',wav:'audio/wav'};
export const canExtractResourceBundles=()=>typeof DecompressionStream==='function'&&!!globalThis.crypto?.subtle;

// The archive itself never enters CacheStorage or the HTTP cache. Decompress
// with backpressure; keep only one <=1 MiB member plus stream chunks in JS.
export async function extractResourceBundle({pack,index,base,fetcher,cache,signal,count,onFile=()=>{}}){
  signal.throwIfAborted();
  const response=await fetcher(new URL(pack.url,base).href,{cache:'no-store',signal});
  if(response.status!==200)throw new Error(`묶음 리소스 다운로드 실패 (${response.status})`);
  const network=response.body?.getReader();if(!network)throw new Error('묶음 리소스 스트림이 없습니다.');
  let encoded=0,decoded=0,reader;
  const abort=()=>{network.cancel(signal.reason).catch(()=>{});reader?.cancel(signal.reason).catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  try{
    const counted=new ReadableStream({async pull(controller){
      try{
        signal.throwIfAborted();const next=await network.read();signal.throwIfAborted();
        if(next.done){if(encoded!==pack.bytes)throw new Error('묶음 리소스 다운로드 용량이 일치하지 않습니다.');controller.close();return;}
        encoded+=next.value.byteLength;if(encoded>pack.bytes)throw new Error('묶음 리소스 크기가 목록보다 큽니다.');
        count(next.value.byteLength);controller.enqueue(next.value);
      }catch(error){controller.error(error);await network.cancel(error).catch(()=>{});}
    },cancel:reason=>network.cancel(reason)},{highWaterMark:0});
    reader=counted.pipeThrough(new DecompressionStream('gzip')).getReader();let chunk=new Uint8Array(),offset=0;
    const readChunk=async()=>{
      signal.throwIfAborted();const next=await reader.read();signal.throwIfAborted();
      if(next.done)return false;chunk=next.value;offset=0;decoded+=chunk.byteLength;
      if(decoded>pack.unpackedBytes)throw new Error('묶음 리소스 압축 해제 용량이 일치하지 않습니다.');return true;
    };
    for(const name of pack.files){
      const size=index.files[name],bytes=new Uint8Array(size);let filled=0;
      while(filled<size){
        if(offset===chunk.length&&!await readChunk())throw new Error('묶음 리소스가 불완전합니다.');
        const n=Math.min(size-filled,chunk.length-offset);bytes.set(chunk.subarray(offset,offset+n),filled);filled+=n;offset+=n;
      }
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(digest!==name.slice(0,64))throw new Error('압축 해제한 리소스의 체크섬이 일치하지 않습니다.');
      signal.throwIfAborted();
      await cache.put(new URL('content/'+name,base).href,new Response(bytes,{headers:{'Content-Type':types[name.split('.').at(-1)]??'application/octet-stream','Content-Length':String(size)}}));
      onFile(name);
    }
    if(offset!==chunk.length||await readChunk()||decoded!==pack.unpackedBytes)throw new Error('묶음 리소스에 예상하지 않은 데이터가 있습니다.');
  }catch(error){await reader?.cancel(error).catch(()=>{});await network.cancel(error).catch(()=>{});throw error;}
  finally{signal.removeEventListener('abort',abort);}
}
