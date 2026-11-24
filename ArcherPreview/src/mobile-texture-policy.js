const housesAndChapel=new Set(['house-01-cottage','house-02-tall-home','house-03-workshop','house-04-forest-hut','chapel']);
export const usesBuildingTextureSetting=id=>housesAndChapel.has(id);
const standardProfiles=new WeakMap();

// Mobile starts near with the 1K base. Reuse the opaque ETC1S color map already
// shipped in the desktop near model without loading that model a second time.
function standardBuildingProfile(config){
  if(!config)return null;
  if(!standardProfiles.has(config)){
    const near=config.lods?.find(level=>level.level===0);
    const textures=near?.resources?.filter(path=>path.endsWith('.ktx2'))??[];
    const profile=near?.textureSize===2048&&textures.length===1&&config.highTextures?.shading==='toon-color'
      ?{shading:'toon-color',textures:{albedo:{url:textures[0],width:2048,height:2048,codec:'etc1s',alpha:false}},resources:textures}:null;
    standardProfiles.set(config,profile);
  }
  return standardProfiles.get(config);
}

// This changes color residency only; geometry LOD/coverage policies are shared.
export function protectedSceneryTexture(id,config){
  return config?.category==='building'||id==='village-approach'||id==='chapel'||String(id).startsWith('house');
}
export function sceneryHighTextureProfile(id,config,touchDevice,buildingQuality,sourceId=id){
  if(buildingQuality==='standard'&&usesBuildingTextureSetting(sourceId)){
    // Desktop already draws the 2K near material and needs no promotion.
    return touchDevice?standardBuildingProfile(config):null;
  }
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
