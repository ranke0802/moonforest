// The original tiers remain the desktop and protected-house source of truth.
// This changes color residency only; geometry LOD/coverage policies are shared.
export function protectedSceneryTexture(id,config){
  return config?.category==='building'||id==='village-approach'||id==='chapel'||String(id).startsWith('house');
}
export function sceneryHighTextureProfile(id,config,touchDevice){
  const original=config?.highTextures,mobile=config?.mobileHighTextures;
  if(!touchDevice||protectedSceneryTexture(id,config)||!mobile)return original;
  const albedo=mobile.textures?.albedo,source=original?.textures?.albedo;
  // Invalid/unsupported derived metadata fails open to the reviewed original.
  if(mobile.shading!=='toon-color'||original?.shading!=='toon-color'||
     ![512,1024,2048].includes(albedo?.width)||albedo.height!==albedo.width||
     !source||albedo.width>source.width||!['etc1s','uastc'].includes(albedo.codec)||!albedo.url||
     mobile.resources?.length!==1||mobile.resources[0]!==albedo.url||Object.keys(mobile.textures).length!==1)return original;
  return mobile;
}
