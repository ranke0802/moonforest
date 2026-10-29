// Keep CPU decode results, never meshes/materials/GPU textures. Two small LRU
// pools bound warm revisits to 32 MiB regardless of how many maps are visited.
export class DecodeCache {
  constructor(limit,maxEntries=256){this.limit=limit;this.maxEntries=maxEntries;this.entries=new Map();this.bytes=0;this.hits=0;this.misses=0;this.evictions=0;}
  get(key){const entry=this.entries.get(key);if(!entry){this.misses++;return null;}this.hits++;this.entries.delete(key);this.entries.set(key,entry);return entry.value;}
  put(key,value,bytes){if(!Number.isFinite(bytes)||bytes<=0||bytes>this.limit)return;const old=this.entries.get(key);if(old){this.bytes-=old.bytes;this.entries.delete(key);}
    while(this.entries.size&&(this.bytes+bytes>this.limit||this.entries.size>=this.maxEntries)){const first=this.entries.keys().next().value;this.bytes-=this.entries.get(first).bytes;this.entries.delete(first);this.evictions++;}
    this.entries.set(key,{value,bytes});this.bytes+=bytes;
  }
  clear(){this.entries.clear();this.bytes=0;}
  inspect(){return {bytes:this.bytes,limit:this.limit,entries:this.entries.size,hits:this.hits,misses:this.misses,evictions:this.evictions};}
}
const pools=new WeakMap();
export function mapDecodePools(engine){
  let pool=pools.get(engine);if(pool)return pool;
  pool={geometry:new DecodeCache(8*1048576),textures:new DecodeCache(24*1048576,96),disposed:false};pools.set(engine,pool);
  engine.onDisposeObservable.addOnce(()=>{pool.disposed=true;pool.geometry.clear();pool.textures.clear();pools.delete(engine);});return pool;
}
export function inspectMapDecodeCache(engine){const p=engine&&pools.get(engine);return p?{geometry:p.geometry.inspect(),textures:p.textures.inspect()}:null;}

// The URL's SHA-256 identifies immutable glTF and its external buffer links.
// Returning copies keeps Babylon's accessor/geometry mutations out of the cache.
export function cacheMapBufferViews(loader,scene,fileName){
  if(!/^[a-f0-9]{64}\.gltf$/.test(fileName))return;
  loader.onExtensionLoadedObservable.add(extension=>{
    if(extension.name!=='EXT_meshopt_compression')return;
    const original=extension.loadBufferViewAsync.bind(extension),pool=mapDecodePools(scene.getEngine());
    extension.loadBufferViewAsync=(context,view)=>{
      if(!view.extensions?.EXT_meshopt_compression)return original(context,view);
      const key=fileName+context,cached=pool.geometry.get(key);if(cached)return Promise.resolve(cached.slice());
      const result=original(context,view);
      return result?.then(data=>{if(!pool.disposed&&data.byteLength<=pool.geometry.limit)pool.geometry.put(key,data.slice(),data.byteLength);return data;});
    };
  });
}

export function cacheableKtx(data){
  if(!ArrayBuffer.isView(data)||data.byteLength<48)return false;
  const h=new DataView(data.buffer,data.byteOffset,data.byteLength),width=h.getUint32(20,true),height=h.getUint32(24,true);
  return width>0&&height>0&&width<=2048&&height<=2048&&h.getUint32(28,true)===0&&h.getUint32(32,true)<=1&&h.getUint32(36,true)===1;
}
const copyDecoded=data=>({...data,mipmaps:data.mipmaps.map(m=>({...m,data:m.data.slice()}))});
const resultKeys=new Set(['transcodedFormat','isInGammaSpace','hasAlpha','transcoderName']);
export async function decodeCachedKtx(container,data,options,decode,defaults){
  // Large 4K background and 8K player maps never enter the extra CPU pool.
  if(!cacheableKtx(data)||!globalThis.crypto?.subtle)return decode(data,options);
  const caps=container._engine.getCaps(),format=['astc','bptc','s3tc','pvrtc','etc2','etc1'].map(k=>!!caps[k]);
  const inputs=options?Object.fromEntries(Object.entries(options).filter(([key])=>!resultKeys.has(key))):null;
  const digest=await crypto.subtle.digest('SHA-256',data),hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  const key=hash+JSON.stringify([format,inputs,defaults]),pool=mapDecodePools(container._engine),cached=pool.textures.get(key);
  if(cached)return copyDecoded(cached);
  const result=await decode(data,options);
  // Cache only valid GPU-compressed blocks. RGBA fallback remains transient.
  if(!pool.disposed&&!result.errors&&!new Set([0x8058,0x8229,0x822b]).has(result.transcodedFormat)&&result.mipmaps?.every(m=>m.data)){
    const bytes=result.mipmaps.reduce((sum,m)=>sum+m.data.byteLength,0);
    if(bytes<=pool.textures.limit)pool.textures.put(key,copyDecoded(result),bytes);
  }
  return result;
}

const installed=new WeakSet();
export function installKtxDecodeCache(Ktx){
  if(installed.has(Ktx)||typeof Ktx.prototype._decodeAsync!=='function')return;
  installed.add(Ktx);const decode=Ktx.prototype._decodeAsync;
  // Pinned Babylon 9.31 separates worker decoding from GPU upload. Reuse only
  // this result; its normal _createTexture still uploads all authored mipmaps.
  Ktx.prototype._decodeAsync=function(data,options){
    // Read public options without clearing Babylon's dirty flag: its workerless
    // fallback still needs that flag to apply newly selected decoder defaults.
    const defaults=Object.fromEntries(['useRGBAIfASTCBC7NotAvailableWhenUASTC','useRGBAIfOnlyBC1BC3AvailableWhenUASTC','forceRGBA','forceR8','forceRG8','bypassTranscoders'].map(key=>[key,Ktx.DefaultDecoderOptions[key]]));
    return decodeCachedKtx(this,data,options,(d,o)=>decode.call(this,d,o),defaults);
  };
}
