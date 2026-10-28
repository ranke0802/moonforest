import {MaterialPluginBase,Texture} from '@babylonjs/core';
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// Mildly prefer the next finer mip at normal play distance, never disable mips
// or force 8K sampling in the distance. No extra draw or texture sample is added.
export const playerDetailBias=distance=>-.45*smooth(2.5,5,distance)*(1-smooth(28,45,distance))||0;
export class PlayerDetail extends MaterialPluginBase{
  constructor(material,camera){super(material,'MoonforestPlayerDetail',320,{},true,true);this.camera=camera;}
  getUniforms(){return {ubo:[{name:'playerDetailBias',size:1,type:'float'}],fragment:'uniform float playerDetailBias;'};}
  bindForSubMesh(buffer){buffer.updateFloat('playerDetailBias',playerDetailBias(this.camera.radius));}
  getCustomCode(type){if(type!=='fragment')return null;return {
    // Babylon appends a newline to injected code. Replace the complete sample
    // statement: splitting off a lone semicolon lets its processor discard it.
    '!vec4 albedoTexture=TEXRD\\(albedoSampler,([^)]*)\\);':'vec4 albedoTexture=texture2D(albedoSampler,$1,playerDetailBias);',
    '!vec3 emissiveColorTex=TEXRD\\(emissiveSampler,([^)]*)\\)\\.rgb;':'vec3 emissiveColorTex=texture2D(emissiveSampler,$1,playerDetailBias).rgb;',
  };}
}
export function applyPlayerDetail(container,camera){
  for(const material of new Set(container.meshes.map(m=>m.material))){
    if(material?.getClassName()!=='PBRMaterial'||material.metadata?.playerDetail)continue;
    const textures=[material.albedoTexture,material.emissiveTexture].filter(Boolean);if(!textures.length)continue;
    material.unfreeze();
    for(const texture of textures){texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);texture.anisotropicFilteringLevel=Math.min(8,camera.getScene().getEngine().getCaps().maxAnisotropy??8);}
    new PlayerDetail(material,camera);material.metadata={...material.metadata,playerDetail:true};
  }
}
