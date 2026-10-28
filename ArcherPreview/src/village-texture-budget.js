export const VILLAGE_TEXTURE_BUDGET={mobile:128*1024*1024,desktop:256*1024*1024};

export function validVillageTextureProfile(config){
  const t=config?.textures;
  return [2048,4096].includes(t?.albedo?.width)&&t.albedo.height===t.albedo.width&&
    (config.shading==='toon-color'?Object.keys(t).length===1:
    ['normal','orm'].every(role=>t[role]?.width===t.albedo.width/4&&t[role].height===t[role].width));
}

// Conservative RGBA8 allocation, including every mip level. This is the extra
// streamed village texture budget, not a measurement of the whole GPU heap.
export function highTextureBytes(config){
  if(!validVillageTextureProfile(config))return Infinity;
  return Object.values(config.textures).reduce((sum,{width,height})=>{
    for(;;){sum+=width*height*4;if(width===1&&height===1)break;width=Math.max(1,width>>1);height=Math.max(1,height>>1);}
    return sum;
  },0);
}

export function selectHighTextures(candidates,assets,resident,budget,maxTextureSize){
  const ranked=[...candidates].sort((a,b)=>b[1]*(resident.has(b[0])?1.15:1)-a[1]*(resident.has(a[0])?1.15:1));
  const selected=new Map();let used=0;
  for(const [id,coverage]of ranked){
    const config=assets.get(id)?.config.highTextures,bytes=highTextureBytes(config);
    if(config?.textures?.albedo?.width>maxTextureSize||used+bytes>budget)continue;
    selected.set(id,coverage);used+=bytes;
  }
  return selected;
}
