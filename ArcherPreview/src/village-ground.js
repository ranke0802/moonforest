import {Texture,Color3,MaterialPluginBase} from '@babylonjs/core';
import {VillageGroundShade} from './village-toon.js';
import {readMapManifest} from './map-manifests.js';
import {MapLoadLifetime,mapLoadAbortError,mapLoadSnapshot,checkMapLoadSnapshot} from './map-load-lifetime.js';
import {releaseMapTexture} from './map-texture-lifetime.js';

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

export async function applyVillageGround(world,{signal,lifetime,timeoutMs,timers,createTexture=(scene,callbacks)=>new Texture(null,scene,{noMipmap:false,invertY:true,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,...callbacks})}={}){
  const ownLifetime=!lifetime;lifetime??=new MapLoadLifetime({signal,timeoutMs,timers,stage:'ground'});const snapshot=mapLoadSnapshot(world),scene=snapshot.scene,material=snapshot.floorMaterial,textures=new Set(),disposedTextures=new WeakSet();let released=false,installed=false;
  const disposeTexture=texture=>{if(disposedTextures.has(texture))return;disposedTextures.add(texture);releaseMapTexture(texture,scene);};
  const release=()=>{if(released)return;released=true;if(!installed)lifetime.abort(mapLoadAbortError());for(const texture of textures)disposeTexture(texture);textures.clear();scene.onDisposeObservable.remove(observer);if(world.releaseGround===release)world.releaseGround=null;};
  world.releaseGround?.();const observer=scene.onDisposeObservable.addOnce(release);world.releaseGround=release;
  const abort=()=>release();lifetime.signal.addEventListener('abort',abort,{once:true});
  const check=()=>{checkMapLoadSnapshot(world,snapshot,lifetime);if(released)throw mapLoadAbortError();};
  try{
  check();const url=new URL(`${import.meta.env?.BASE_URL??'/'}assets/${snapshot.groundManifest??'village-ground'}.json`,location.href);
  const config=await lifetime.run(()=>readMapManifest(url,{timeoutMs,timers}));check();
  if(config.span!==world.terrain.size||config.color.width!==2048||config.detail.width!==256||config.soilMaskAlphaRange?.join(',')!=='64,255')throw new Error('마을 바닥 재질 규격이 다릅니다.');
  const load=resource=>lifetime.run(()=>new Promise((resolve,reject)=>{
    let texture,settled=false;
    const finish=error=>{if(settled)return;settled=true;lifetime.signal.removeEventListener('abort',cancel);if(error)reject(error);else resolve(texture);};
    const cancel=()=>finish(lifetime.signal.reason??mapLoadAbortError());lifetime.signal.addEventListener('abort',cancel,{once:true});
    try{
    texture=createTexture(scene,{onLoad:()=>queueMicrotask(()=>{try{check();finish();}catch(error){finish(error);}}),onError:()=>queueMicrotask(()=>finish(new Error('마을 바닥 텍스처를 불러오지 못했습니다.')))});textures.add(texture);
    // KTX2 blocks cannot be flipped during GPU upload. The old bitmap loader
    // inverted Y for this world map; preserve those UVs explicitly.
    if(resource.codec){texture.vScale=-1;texture.vOffset=1;}
    texture.hasAlpha=false;texture.anisotropicFilteringLevel=4;
    check();texture.updateURL(new URL(resource.url,url).href);check();
    }catch(error){finish(error);}
  }));
  // Color alpha stores the soil mask; it never enables transparency/blending.
  const color=await load(config.color);check();const detail=await load(config.detail);check();
  color.wrapU=color.wrapV=Texture.CLAMP_ADDRESSMODE;
  detail.wrapU=detail.wrapV=Texture.WRAP_ADDRESSMODE;detail.gammaSpace=false;
  material.unfreeze();if(material.diffuseTexture?.getInternalTexture?.())material.diffuseTexture.dispose();
  material.diffuseTexture=color;material.diffuseColor=Color3.White();material.specularColor=Color3.Black();
  const existingDetail=material.pluginManager?.getPlugin('MoonforestGroundDetail');
  if(existingDetail)existingDetail.texture=detail;else new VillageGroundDetail(material,detail);
  const existingShade=material.pluginManager?.getPlugin('MoonforestVillageToon');
  if(existingShade)existingShade.lighting=world.lighting;else new VillageGroundShade(material,world.lighting);
  world.groundProfile={colorSize:2048,detailSize:256,gpuBytes:config.gpuBytesWithMips,extraDrawCalls:0};
  installed=true;
  }catch(error){lifetime.abort(error);release();error.stage??='ground';throw error;}finally{lifetime.signal.removeEventListener('abort',abort);if(ownLifetime)lifetime.close();}
}
