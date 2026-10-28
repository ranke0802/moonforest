// Select before preparing the download plan: never fetch both player profiles.
export function playerTextureManifest(character,caps,navigator=globalThis.navigator){
  if(character==='warrior-v4')character='warrior-v3';
  if(character!=='warrior-v3')return character==='archer'?'character':character;
  const ios=/iPad|iPhone|iPod/.test(navigator?.userAgent??'')||
    (navigator?.platform==='MacIntel'&&navigator?.maxTouchPoints>1);
  const mobile=ios||/Android/i.test(navigator?.userAgent??'');
  if(!mobile)return 'warrior-v3';
  // A large RGBA fallback can terminate WebKit before a JS error is delivered.
  // Fail visibly instead of retrying the uncompressed 8K profile on this device.
  if(!(caps?.astc||caps?.etc2||caps?.bptc||caps?.s3tc)||caps.maxTextureSize<8192)throw new Error('이 기기에서 8K GPU 압축 텍스처를 지원하지 않습니다. 브라우저와 기기 지원을 확인해 주세요.');
  // Keep the historical filename: both maps/platforms reuse the same cached
  // UASTC files. Galaxy S23 and iPhone both transcode these files to ASTC.
  return 'warrior-v3-ios';
}
