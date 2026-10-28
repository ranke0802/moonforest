// Select before preparing the download plan: never fetch both player profiles.
export function playerTextureManifest(character,caps,navigator=globalThis.navigator){
  if(character!=='warrior-v3')return character==='archer'?'character':character;
  const ios=/iPad|iPhone|iPod/.test(navigator?.userAgent??'')||
    (navigator?.platform==='MacIntel'&&navigator?.maxTouchPoints>1);
  if(!ios)return 'warrior-v3';
  // A large RGBA fallback can terminate WebKit before a JS error is delivered.
  // Fail visibly instead of retrying the uncompressed 8K profile on this device.
  if(!caps?.astc||caps.maxTextureSize<8192)throw new Error('이 기기에서 8K 압축 텍스처를 지원하지 않습니다. iOS 업데이트 후 다시 확인해 주세요.');
  return 'warrior-v3-ios';
}
