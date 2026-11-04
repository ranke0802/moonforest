const playerAliases=new Set(['warrior-v3','warrior-v4','warrior-v5','warrior-plains']);
const compressedFormats=['astc','bptc','s3tc','etc2'];
function mipBytes(size,compressed){
  let bytes=0;
  for(;;){bytes+=compressed?Math.ceil(size/4)**2*16:size**2*4;if(size===1)return bytes;size=Math.max(1,Math.floor(size/2));}
}
const estimates={
  compressed4k:{estimatedGpuBytes:3*mipBytes(4096,true)+3*mipBytes(2048,true),
    maxImageRgbaBytes:4096**2*4,maxImageUploadBytes:mipBytes(4096,true)},
  rgba2k:{estimatedGpuBytes:6*mipBytes(2048,false),
    maxImageRgbaBytes:2048**2*4,maxImageUploadBytes:mipBytes(2048,false)},
  original:{estimatedGpuBytes:2*mipBytes(8192,false)+3*mipBytes(2048,false)+mipBytes(4096,false),
    maxImageRgbaBytes:8192**2*4,maxImageUploadBytes:mipBytes(8192,false)},
};
const estimateScope='Unique images with full mip chains; compressed uses ASTC/BC7/ETC2 alpha worst case. Excludes driver/decoder workspace and other scene resources.';

// Expose the same capability snapshot used by selection for loading diagnostics.
// The KTX2 decoder chooses the final format; a supported format is not a promise
// that a GPU upload has succeeded.
export function playerTextureCapabilities(caps){
  const max=caps?.maxTextureSize;
  return {maxTextureSize:Number.isFinite(max)&&max>0?Math.floor(max):null,
    formats:Object.fromEntries(compressedFormats.map(name=>[name,!!caps?.[name]]))};
}

export function selectPlayerTextureProfile(character,caps,navigator=globalThis.navigator){
  const capabilities=playerTextureCapabilities(caps);
  if(!playerAliases.has(character))return {manifest:character==='archer'?'character':character,mobile:false,capabilities};
  const ios=/iPad|iPhone|iPod/.test(navigator?.userAgent??'')||
    (navigator?.platform==='MacIntel'&&navigator?.maxTouchPoints>1);
  const mobile=ios||/Android/i.test(navigator?.userAgent??'');
  if(!mobile)return {manifest:'warrior-v3',mobile:false,maxSize:8192,encoding:'original',gpuCompressed:false,...estimates.original,estimateScope,capabilities};
  const max=capabilities.maxTextureSize;
  if(max===null||max<2048){
    const formats=Object.entries(capabilities.formats).map(([name,supported])=>name.toUpperCase()+'='+(supported?'yes':'no')).join(', ');
    const error=new Error('플레이어 텍스처를 준비할 수 없습니다. 최소 2048 텍스처 지원이 필요합니다. MAX_TEXTURE_SIZE='+(max??'unknown')+'; '+formats);
    error.code='PLAYER_TEXTURE_CAPABILITY';error.capabilities=capabilities;throw error;
  }
  // Never ask a mobile loader/decoder to fall back from an 8K KTX2 to RGBA.
  // Select one complete, bounded resource plan before downloading any textures.
  const gpuCompressed=max>=4096&&Object.values(capabilities.formats).some(Boolean);
  // A 4K RGBA fallback would retain about 320 MiB for these six images. Use the
  // prebuilt 2K fallback (about 128 MiB) even when the device reports a 4K limit.
  const maxSize=gpuCompressed?4096:2048;
  return {manifest:gpuCompressed?'warrior-v3-mobile4k':'warrior-v3-mobile2k-rgba',
    mobile:true,maxSize,encoding:gpuCompressed?'ktx2-uastc':'rgba',gpuCompressed,
    ...estimates[gpuCompressed?'compressed4k':'rgba2k'],estimateScope,capabilities};
}

// Keep the existing integration API: main.js selects before its download plan.
export function playerTextureManifest(character,caps,navigator=globalThis.navigator){
  return selectPlayerTextureProfile(character,caps,navigator).manifest;
}
