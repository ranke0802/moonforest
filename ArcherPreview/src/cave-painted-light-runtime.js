import {Constants,MaterialPluginBase,RawTexture,Texture,Vector4} from '@babylonjs/core';
import {getCavePaintLight,CAVE_PAINT_LIGHT_CONFIG as CONFIG} from './cave-painted-light.js';
import {caveFogFallback,readyShaderEffect} from './cave-fog-binding.js';

export const CAVE_PAINT_UNIFORMS=['cavePaintRect','cavePaintActive'];
export const CAVE_PAINT_SAMPLERS=['cavePaintLightMap'];
export const CAVE_PAINT_LIGHT_GLSL=`
#ifndef CAVE_PAINT_LIGHT_DEFINED
#define CAVE_PAINT_LIGHT_DEFINED
uniform sampler2D cavePaintLightMap;
uniform vec4 cavePaintRect;
uniform float cavePaintActive;
vec3 cavePaintFactor(vec3 p){
 if(cavePaintActive<.5)return vec3(1.);
 vec2 uv=clamp((p.xz-cavePaintRect.xy)/cavePaintRect.zw,vec2(0.),vec2(1.));
 vec4 light=texture2D(cavePaintLightMap,uv);
 float floorHeight=${CONFIG.floorMin.toFixed(1)}+light.a*${(CONFIG.floorMax-CONFIG.floorMin).toFixed(1)};
 float heightFactor=1.-${(1-CONFIG.heightMinimum).toFixed(4)}*smoothstep(${CONFIG.heightStart.toFixed(2)},${CONFIG.heightEnd.toFixed(1)},max(0.,p.y-floorHeight));
 return light.rgb*heightFactor;
}
#endif
`;
const functions=CAVE_PAINT_LIGHT_GLSL.replace('uniform vec4 cavePaintRect;','').replace('uniform float cavePaintActive;','');

export class CavePaintLightRuntime{
 constructor(world){
  this.world=world;this.disposed=false;this.map=getCavePaintLight(world.terrain);this.rect=new Vector4(...this.map.rect);
  this.texture=new RawTexture(this.map.data,this.map.width,this.map.height,Constants.TEXTUREFORMAT_RGBA,world.scene,false,false,Texture.BILINEAR_SAMPLINGMODE,Constants.TEXTURETYPE_UNSIGNED_BYTE);
  this.texture.name='cave-static-painted-light';this.texture.gammaSpace=false;this.texture.wrapU=this.texture.wrapV=Texture.CLAMP_ADDRESSMODE;
  this.texture.anisotropicFilteringLevel=1;
  world.scene.metadata={...world.scene.metadata,cavePaintLighting:this};
  this.sceneDispose=world.scene.onDisposeObservable.addOnce(()=>this.dispose());
 }
 bind(material,effect=null){
  if(this.disposed)return;
  material.setTexture('cavePaintLightMap',this.texture);material.setVector4('cavePaintRect',this.rect);material.setFloat('cavePaintActive',1);
  effect=readyShaderEffect(effect);if(!effect)return;
  effect.setTexture('cavePaintLightMap',this.texture);effect.setVector4('cavePaintRect',this.rect);effect.setFloat('cavePaintActive',1);
 }
 inspect(){return {bytes:this.map.data.byteLength,width:this.map.width,height:this.map.height,emitters:this.map.emitters.length,additionalLights:0,additionalShadowPasses:0,frameUploads:0,disposed:this.disposed};}
 dispose(){
  if(this.disposed)return;this.disposed=true;this.world.scene.onDisposeObservable.remove(this.sceneDispose);this.texture.dispose();
  if(this.world.scene.metadata?.cavePaintLighting===this)this.world.scene.metadata.cavePaintLighting=null;
 }
}

export class CavePaintLightShade extends MaterialPluginBase{
 constructor(material,{ground=false}={}){super(material,'CavePaintLight',400,{},true,false);this.ground=ground;this.active=true;this.registerForExtraEvents=true;this._enable(true);}
 getSamplers(samplers){samplers.push('cavePaintLightMap');}
 getUniforms(){return {ubo:[{name:'cavePaintRect',size:4,type:'vec4'},{name:'cavePaintActive',size:1,type:'float'}],fragment:'uniform vec4 cavePaintRect;uniform float cavePaintActive;'};}
 hardBindForSubMesh(buffer){
  const scene=this._material.getScene(),runtime=scene.metadata?.cavePaintLighting,active=this.active&&runtime&&!runtime.disposed;
  buffer.setTexture('cavePaintLightMap',active?runtime.texture:caveFogFallback(scene));buffer.updateFloat('cavePaintActive',active?1:0);
  if(active)buffer.updateFloat4('cavePaintRect',runtime.rect.x,runtime.rect.y,runtime.rect.z,runtime.rect.w);
 }
 getCustomCode(type){
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_DEFINITIONS:functions,CUSTOM_FRAGMENT_BEFORE_FOG:this.ground?'color.rgb*=cavePaintFactor(vPositionW);':'',CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:this.ground?'':'finalDiffuse*=cavePaintFactor(vPositionW);'};
 }
}

export function bindCavePaintLight(material,world,effect=null){
 const runtime=world.scene.metadata?.cavePaintLighting;
 if(runtime&&!runtime.disposed){runtime.bind(material,effect);return;}
 const fallback=caveFogFallback(world.scene);material.setTexture('cavePaintLightMap',fallback);material.setFloat('cavePaintActive',0);
 effect=readyShaderEffect(effect);if(effect){effect.setTexture('cavePaintLightMap',fallback);effect.setFloat('cavePaintActive',0);}
}
