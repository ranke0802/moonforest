const playerAliases=new Set(['warrior-v3','warrior-v4','warrior-v5','warrior-plains']);
const compressedFormats=['astc','bptc','s3tc','etc2'];
function mipBytes(size,compressed){
  let bytes=0;
  for(;;){bytes+=compressed?Math.ceil(size/4)**2*16:size**2*4;if(size===1)return bytes;size=Math.max(1,Math.floor(size/2));}
}
const estimates={
  compressed8k:{estimatedGpuBytes:2*mipBytes(8192,true)+3*mipBytes(2048,true)+mipBytes(4096,true),
    maxImageRgbaBytes:8192**2*4,maxImageUploadBytes:mipBytes(8192,true)},
  compressed4k:{estimatedGpuBytes:3*mipBytes(4096,true)+3*mipBytes(2048,true),
    maxImageRgbaBytes:4096**2*4,maxImageUploadBytes:mipBytes(4096,true)},
  compressed2k:{estimatedGpuBytes:6*mipBytes(2048,true),
    maxImageRgbaBytes:2048**2*4,maxImageUploadBytes:mipBytes(2048,true)},
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

export function isMobilePlayerTextureDevice(navigator=globalThis.navigator){
  const ios=/iPad|iPhone|iPod/.test(navigator?.userAgent??'')||
    (navigator?.platform==='MacIntel'&&navigator?.maxTouchPoints>1);
  return ios||/Android/i.test(navigator?.userAgent??'');
}

// desktopCompressedSize: 0.3 asks for the 4K KTX2 set on PC (2026-11-23, user: free texture memory
// without hurting the picture). At the player's on-screen size 4K holds every visible texel; the
// 8K set cost 57MB to download and about 218MB of GPU memory. 0.2 keeps 8K.
export function selectPlayerTextureProfile(character,caps,navigator=globalThis.navigator,{release,desktopPreference='compressed',desktopCompressedSize=8192}={}){
  const capabilities=playerTextureCapabilities(caps);
  if(!playerAliases.has(character))return {manifest:character==='archer'?'character':character,mobile:false,capabilities};
  const mobile=isMobilePlayerTextureDevice(navigator);
  if(!mobile){
    // Keep the frozen 0.1 / three-argument integration unchanged. 0.2 chooses
    // its complete graph before prefetch; no decode-time fallback/retry starts
    // a second original-image download behind the user's back.
    const enabled=release==='moonforest-0.2',requested=desktopPreference==='original'?'original':'compressed';
    const size=desktopCompressedSize===4096?4096:8192,available=capabilities.maxTextureSize>=size&&Object.values(capabilities.formats).some(Boolean);
    const compressed=enabled&&requested==='compressed'&&available,small=compressed&&size===4096;
    return {manifest:compressed?(small?'warrior-v3-mobile4k':'warrior-v3-ios'):'warrior-v3',mobile:false,maxSize:small?4096:8192,preserveSourceResolution:!small,
      encoding:compressed?'ktx2-uastc':'original',gpuCompressed:compressed,
      ...(compressed?(small?estimates.compressed4k:estimates.compressed8k):estimates.original),estimateScope,capabilities,
      desktopPreference:enabled?requested:'original',selectionReason:!enabled?'legacy-original':requested==='original'?'user-original':available?(small?'supported-4k-compression':'supported-8k-compression'):'compression-unavailable-original'};
  }
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
export function playerTextureManifest(character,caps,navigator=globalThis.navigator,options){
  return selectPlayerTextureProfile(character,caps,navigator,options).manifest;
}

// 0.3 defaults to 2K on mobile and PC. Devices with a supported GPU format
// use the KTX2 set and other devices use the 2K RGBA fallback. 4K requires
// support for 4096 textures and a compressed format. 0.2 uses its own selection.
export const PLAYER_2K_KTX2='warrior-v3-mobile2k';
// The detail used when nothing is stored or asked for.
export const defaultPlayerTextureDetail=(ktx2Manifest=PLAYER_2K_KTX2)=>ktx2Manifest?'2k':'4k';
export const PLAYER_TEXTURE_DETAILS=Object.freeze(['2k','4k']);
export function playerTexture4kSupported(caps){
  const {maxTextureSize,formats}=playerTextureCapabilities(caps);
  return maxTextureSize!==null&&maxTextureSize>=4096&&Object.values(formats).some(Boolean);
}
// detail: '2k' | '4k' as chosen (default: defaultPlayerTextureDetail()); source: where the choice came from (default, user, url, legacy-original).
export function selectEditionPlayerTextureProfile(character,caps,navigator=globalThis.navigator,{ktx2Manifest=PLAYER_2K_KTX2,detail=defaultPlayerTextureDetail(ktx2Manifest),source='default'}={}){
  const capabilities=playerTextureCapabilities(caps);
  if(!playerAliases.has(character))return {manifest:character==='archer'?'character':character,mobile:false,capabilities};
  const mobile=isMobilePlayerTextureDevice(navigator),requested=detail==='4k'?'4k':'2k',fourK=playerTexture4kSupported(caps);
  // Below 2048 nothing here fits: the existing rules decide (phones stop with their message).
  if(capabilities.maxTextureSize===null||capabilities.maxTextureSize<2048){
    const fallback=selectPlayerTextureProfile(character,caps,navigator,{release:'moonforest-0.2',desktopCompressedSize:4096});
    return {...fallback,textureDetail:{value:'original',requested,source,fourKAvailable:false}};
  }
  const use4k=requested==='4k'&&fourK,compressed2k=!use4k&&!!ktx2Manifest&&Object.values(capabilities.formats).some(Boolean);
  const plan=use4k?{manifest:'warrior-v3-mobile4k',maxSize:4096,encoding:'ktx2-uastc',gpuCompressed:true,...estimates.compressed4k}
    :compressed2k?{manifest:ktx2Manifest,maxSize:2048,encoding:'ktx2-uastc',gpuCompressed:true,...estimates.compressed2k}
    :{manifest:'warrior-v3-mobile2k-rgba',maxSize:2048,encoding:'rgba',gpuCompressed:false,...estimates.rgba2k};
  return {...plan,mobile,preserveSourceResolution:false,estimateScope,capabilities,
    selectionReason:use4k?(source==='default'?'default-4k':'chosen-4k'):requested==='4k'?'4k-unsupported-2k':source==='default'?'default-2k':'chosen-2k',
    textureDetail:{value:use4k?'4k':'2k',requested,source,fourKAvailable:fourK}};
}
