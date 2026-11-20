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

export function estimateTextureMemory(engine,{largest=8}={}){
 const cache=engine?.getLoadedTexturesCache?.();if(!cache)return null;
 let bytes=0,plain=0;const rows=[];
 for(const texture of cache){
  const size=textureBytes(texture);if(!size)continue;
  const compressed=ONE.has(texture.format)||HALF.has(texture.format);
  bytes+=size;if(!compressed)plain+=size;
  rows.push({name:String(texture.url||texture.label||'').split('/').pop().slice(-48),width:texture.width,height:texture.height,megabytes:Math.round(size/104857.6)/10,compressed});
 }
 rows.sort((a,b)=>b.megabytes-a.megabytes);
 return {count:rows.length,megabytes:Math.round(bytes/1048576),uncompressedMegabytes:Math.round(plain/1048576),largest:rows.slice(0,largest)};
}
