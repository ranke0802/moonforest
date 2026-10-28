import {Texture,Color3,MaterialPluginBase} from '@babylonjs/core';
import {VillageGroundShade} from './village-toon.js';
import {readMapManifest} from './map-manifests.js';

// One small packed texture, two differently rotated scales, zero new draw calls.
// Macro colors and the road mask are unique across the entire terrain.
export class VillageGroundDetail extends MaterialPluginBase {
  constructor(material,texture){super(material,'MoonforestGroundDetail',305,{},true,true);this.texture=texture;}
  getSamplers(samplers){samplers.push('villageSurfaceSampler');}
  getActiveTextures(textures){textures.push(this.texture);}
  hasTexture(texture){return texture===this.texture;}
  isReadyForSubMesh(){return this.texture?.isReady()??false;}
  bindForSubMesh(buffer){buffer.setTexture('villageSurfaceSampler',this.texture);}
  getCustomCode(type){
    if(type!=='fragment')return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:'uniform sampler2D villageSurfaceSampler;',
      CUSTOM_FRAGMENT_BEFORE_FOG:`
        vec2 villageDetailA = texture2D(villageSurfaceSampler, vPositionW.xz * 0.18).rg;
        vec2 villageDetailB = texture2D(villageSurfaceSampler, mat2(0.8,0.6,-0.6,0.8) * vPositionW.xz * 0.311 + vec2(0.271,0.639)).rg;
        vec2 villageDetail = villageDetailA * 0.68 + villageDetailB * 0.32;
        float villageSoilMask = clamp((baseColor.a * 255.0 - 64.0) / 191.0, 0.0, 1.0);
        float villageSurface = mix(villageDetail.r, villageDetail.g, villageSoilMask);
        float villageDetailFade = 1.0 - smoothstep(30.0,65.0,length(vEyePosition.xyz-vPositionW));
        color.rgb *= 1.0 + (villageSurface - 0.5) * 0.95 * villageDetailFade;
      `,
    };
  }
}

export async function applyVillageGround(world){
  const url=new URL(`${import.meta.env.BASE_URL}assets/${world.groundManifest??'village-ground'}.json`,location.href);
  const config=await readMapManifest(url);
  if(config.span!==world.terrain.size||config.color.width!==2048||config.detail.width!==256||config.soilMaskAlphaRange?.join(',')!=='64,255')throw new Error('마을 바닥 재질 규격이 다릅니다.');
  const load=resource=>new Promise((resolve,reject)=>{
    const texture=new Texture(new URL(resource.url,url).href,world.scene,false,true,Texture.TRILINEAR_SAMPLINGMODE,()=>resolve(texture),()=>reject(new Error('마을 바닥 텍스처를 불러오지 못했습니다.')));
    // KTX2 blocks cannot be flipped during GPU upload. The old bitmap loader
    // inverted Y for this world map; preserve those UVs explicitly.
    if(resource.codec){texture.vScale=-1;texture.vOffset=1;}
    texture.hasAlpha=false;texture.anisotropicFilteringLevel=4;
  });
  // Color alpha stores the soil mask; it never enables transparency/blending.
  const color=await load(config.color),detail=await load(config.detail);
  const release=()=>{color.dispose();detail.dispose();world.scene.onDisposeObservable.remove(observer);if(world.releaseGround===release)world.releaseGround=null;};
  const observer=world.scene.onDisposeObservable.addOnce(release);world.releaseGround=release;
  color.wrapU=color.wrapV=Texture.CLAMP_ADDRESSMODE;
  detail.wrapU=detail.wrapV=Texture.WRAP_ADDRESSMODE;detail.gammaSpace=false;
  const material=world.floorMaterial;material.unfreeze();material.diffuseTexture?.dispose();
  material.diffuseTexture=color;material.diffuseColor=Color3.White();material.specularColor=Color3.Black();
  new VillageGroundDetail(material,detail);new VillageGroundShade(material,world.lighting);
  world.groundProfile={colorSize:2048,detailSize:256,gpuBytes:config.gpuBytesWithMips,extraDrawCalls:0};
}
