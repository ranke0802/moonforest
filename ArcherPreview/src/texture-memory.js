// How much texture memory the engine holds, worked out from the textures'
// own sizes and formats (2026-11-20). Phones report no memory figures (iOS)
// or frozen ones (Android Chrome), so the diagnostic record carries this
// instead. Called when a record is written, never per frame.
// GL compressed formats at 8 bits per pixel: BC7, BC3, ETC2 RGBA8, ASTC 4x4, BC6H.
const ONE=new Set([36492,36493,33779,33778,37496,37497,37808,37840,36494,36495]);
// At 4 bits per pixel: BC1, ETC1, ETC2 RGB8, PVRTC 4bpp.
const HALF=new Set([33776,33777,36196,37492,37493,35840,35842]);

export function textureBytes(texture){
 const width=texture?.width||0,height=texture?.height||0;if(!width||!height)return 0;
 const format=texture.format;
 // Uncompressed: 4 bytes a pixel, float 16, half float 8.
 const perPixel=ONE.has(format)?1:HALF.has(format)?.5:texture.type===1?16:texture.type===2?8:4;
 return width*height*perPixel*(texture.isCube?6:1)*(texture.depth>1?texture.depth:1)*(texture.generateMipMaps?4/3:1);
}

// Source data the engine keeps in JS memory beside the GPU copy (2026-11-24).
// With context-loss handling on (Babylon's default, used by context-recovery.js)
// a texture made from a buffer keeps that buffer (`_buffer`: the KTX2/PNG file
// bytes, or the decoded image) and a raw texture keeps its pixels
// (`_bufferView*`), so a lost context can be rebuilt in place. Views of one
// ArrayBuffer keep all of it alive, so each underlying buffer counts once.
function sourceParts(texture,visit){
 const own=texture?._buffer;if(own)visit(own);
 if(texture?._bufferView)visit(texture._bufferView);
 for(const view of texture?._bufferViewArray??[])if(view)visit(view);
 for(const faces of texture?._bufferViewArrayArray??[])for(const view of faces??[])if(view)visit(view);
}
function sourceBytes(part,seen){
 if(typeof part==='string')return part.length;
 const buffer=part.buffer instanceof ArrayBuffer||(typeof SharedArrayBuffer!=='undefined'&&part.buffer instanceof SharedArrayBuffer)?part.buffer:part instanceof ArrayBuffer?part:null;
 if(buffer){if(seen.has(buffer))return 0;seen.add(buffer);return buffer.byteLength;}
 if(typeof part.size==='number'&&typeof part.arrayBuffer==='function')return part.size; // Blob
 const width=part.naturalWidth||part.width||0,height=part.naturalHeight||part.height||0;
 return width*height*4; // a decoded image or bitmap
}
export function retainedSourceBytes(textures,seen=new Set()){
 let bytes=0,count=0;
 for(const texture of textures??[]){let held=false;sourceParts(texture,part=>{held=true;bytes+=sourceBytes(part,seen);});if(held)count++;}
 return {bytes,count};
}

// Per-second totals for the recorder: the same sum without the per-texture rows.
export function textureMemoryTotals(engine){
 const cache=engine?.getLoadedTexturesCache?.();if(!cache)return null;
 let bytes=0,plain=0,count=0;
 for(const texture of cache){const size=textureBytes(texture);if(!size)continue;count++;bytes+=size;if(!(ONE.has(texture.format)||HALF.has(texture.format)))plain+=size;}
 const retained=retainedSourceBytes(cache);
 return {count,megabytes:Math.round(bytes/1048576),uncompressedMegabytes:Math.round(plain/1048576),retainedSourceMegabytes:Math.round(retained.bytes/1048576),retainedSources:retained.count};
}

export function estimateTextureMemory(engine,{largest=8}={}){
 const cache=engine?.getLoadedTexturesCache?.();if(!cache)return null;
 let bytes=0,plain=0,retainedBytes=0;const rows=[],seen=new Set();
 for(const texture of cache){
  const size=textureBytes(texture);if(!size)continue;
  const compressed=ONE.has(texture.format)||HALF.has(texture.format);
  bytes+=size;if(!compressed)plain+=size;
  const kept=retainedSourceBytes([texture],seen).bytes;retainedBytes+=kept;
  rows.push({name:String(texture.url||texture.label||'').split('/').pop().slice(-48),width:texture.width,height:texture.height,megabytes:Math.round(size/104857.6)/10,compressed,retainedSourceMegabytes:Math.round(kept/104857.6)/10});
 }
 rows.sort((a,b)=>b.megabytes-a.megabytes);
 return {count:rows.length,megabytes:Math.round(bytes/1048576),uncompressedMegabytes:Math.round(plain/1048576),retainedSourceMegabytes:Math.round(retainedBytes/1048576),largest:rows.slice(0,largest)};
}
