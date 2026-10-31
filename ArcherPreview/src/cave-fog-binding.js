import {Constants,RawTexture,Texture} from '@babylonjs/core';

const fallbacks=new WeakMap();
// Keep a complete sampler even when the fog branch is inactive. Pooled body
// and outline materials survive map changes; they must not retain the disposed
// previous map's texture. One four-byte texel is shared for the scene lifetime.
export function caveFogFallback(scene){
  let texture=fallbacks.get(scene);if(texture)return texture;
  texture=new RawTexture(new Uint8Array([255,255,255,255]),1,1,Constants.TEXTUREFORMAT_RGBA,scene,false,false,Texture.NEAREST_SAMPLINGMODE,Constants.TEXTURETYPE_UNSIGNED_BYTE);
  texture.name='cave-fog-inactive-sampler';texture.gammaSpace=false;texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;fallbacks.set(scene,texture);
  scene.onDisposeObservable.addOnce(()=>{fallbacks.delete(scene);texture.dispose();});return texture;
}
export function readyShaderEffect(effect){return effect&&!effect._isDisposed&&effect.isReady?.()===true?effect:null;}

// Updating a material before rendering must only queue values. ShaderMaterial
// exposes a pending Effect while an INSTANCES/LOD variant compiles in parallel;
// that Effect's WebGL uniform table does not exist yet. Only the actual bind
// callback may pass its current ready Effect for a live sampler refresh.
export function bindCaveFogMaterial(scene,material,effect=null){
  const runtime=scene.metadata?.caveFogRuntime;if(runtime&&!runtime.disposed){runtime.bind(material,effect);return;}
  const texture=caveFogFallback(scene);
  material.setTexture('caveFogMap',texture);material.setFloat('caveFogActive',0);
  effect=readyShaderEffect(effect);if(!effect)return;
  effect.setTexture('caveFogMap',texture);effect.setFloat('caveFogActive',0);
}
