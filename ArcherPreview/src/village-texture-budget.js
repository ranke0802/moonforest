export const VILLAGE_TEXTURE_BUDGET={mobile:128*1024*1024,mobileCompressed:96*1024*1024,desktop:256*1024*1024};

export function validVillageTextureProfile(config){
  const t=config?.textures;
  return [512,1024,2048,4096].includes(t?.albedo?.width)&&t.albedo.height===t.albedo.width&&
    (config.shading==='toon-color'?Object.keys(t).length===1:
    ['normal','orm'].every(role=>t[role]?.width===t.albedo.width/4&&t[role].height===t[role].width));
}

export function textureCompressionAvailable(texture,capabilities=true){
  if(!texture.codec)return false;
  if(typeof capabilities==='boolean')return capabilities;
  if(!capabilities)return false;
  const caps=capabilities;
  // The pinned Basis decoder cannot convert ETC1S into ASTC. That sparse
  // capability set falls back to RGBA, even though ASTC itself is supported.
  if(texture.codec==='etc1s')return !!(caps.bptc||caps.s3tc||caps.etc2||caps.pvrtc||(!texture.alpha&&caps.etc1));
  if(texture.codec==='uastc')return !!(caps.astc||caps.bptc||caps.s3tc||caps.etc2);
  return false;
}

// Conservative RGBA8 allocation, including every mip level. This is the extra
// streamed village texture budget, not a measurement of the whole GPU heap.
export function highTextureBytes(config,compressedSupported=true){
  if(!validVillageTextureProfile(config))return Infinity;
  return Object.values(config.textures).reduce((sum,texture)=>{
    let {width,height}=texture;const compressed=textureCompressionAvailable(texture,compressedSupported);
    // Reserve the worst 8bpp compressed target (ASTC/BC7/ETC2 RGBA), including
    // tail blocks. Actual opaque ETC1S often uses only 4bpp. Unsupported GPUs
    // retain the full RGBA reservation instead of assuming compression worked.
    for(;;){sum+=compressed?Math.ceil(width/4)*Math.ceil(height/4)*16:width*height*4;if(width===1&&height===1)break;width=Math.max(1,width>>1);height=Math.max(1,height>>1);}
    return sum;
  },0);
}

export function selectHighTextures(candidates,assets,resident,budget,maxTextureSize,compressedSupported=true){
  const ranked=[...candidates].sort((a,b)=>b[1]*(resident.has(b[0])?1.15:1)-a[1]*(resident.has(a[0])?1.15:1));
  const selected=new Map();let used=0;
  for(const [id,coverage]of ranked){
    const config=assets.get(id)?.config.highTextures,bytes=highTextureBytes(config,compressedSupported);
    if(config?.textures?.albedo?.width>maxTextureSize||used+bytes>budget)continue;
    selected.set(id,coverage);used+=bytes;
  }
  return selected;
}
