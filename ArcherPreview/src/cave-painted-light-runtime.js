import {Constants,MaterialPluginBase,RawTexture,Texture,Vector4} from '@babylonjs/core';
import {getCavePaintLight,caveRockPaintReceiver,CAVE_PAINT_LIGHT_CONFIG as CONFIG} from './cave-painted-light.js';
import {caveFogFallback,readyShaderEffect} from './cave-fog-binding.js';
import {CAVE_PLAYER_FILL,CAVE_PLAYER_FILL_GLSL} from './cave-player-fill.js';

const INACTIVE_PAINT_PLAYER=new Vector4(0,0,0,0);

export const CAVE_PAINT_UNIFORMS=['cavePaintRect','cavePaintActive','cavePaintPlayer'];
export const CAVE_PAINT_SAMPLERS=['cavePaintLightMap'];
export const CAVE_PAINT_LIGHT_GLSL=`
#ifndef CAVE_PAINT_LIGHT_DEFINED
#define CAVE_PAINT_LIGHT_DEFINED
uniform sampler2D cavePaintLightMap;
uniform vec4 cavePaintRect;
uniform float cavePaintActive;
uniform vec4 cavePaintPlayer;
#ifndef CAVE_FOG_STATE_DEFINED
vec2 caveFogState(vec3 p);
#endif
${CAVE_PLAYER_FILL_GLSL}
vec4 cavePaintSample(vec3 p){
 vec2 uv=clamp((p.xz-cavePaintRect.xy)/cavePaintRect.zw,vec2(0.),vec2(1.));
 return texture2D(cavePaintLightMap,uv);
}
float cavePaintFloorHeight(vec4 light){return ${CONFIG.floorMin.toFixed(1)}+light.a*${(CONFIG.floorMax-CONFIG.floorMin).toFixed(1)};}
vec3 cavePaintFactorFromSample(vec3 p,vec4 light){
 if(cavePaintActive<.5)return vec3(1.);
 float floorHeight=cavePaintFloorHeight(light);
 float heightFactor=1.-${(1-CONFIG.heightMinimum).toFixed(4)}*smoothstep(${CONFIG.heightStart.toFixed(2)},${CONFIG.heightEnd.toFixed(1)},max(0.,p.y-floorHeight));
 vec3 staticFactor=light.rgb*heightFactor;
 vec3 toPlayer=p-cavePaintPlayer.xyz;
 // In particular, distant roofs need no moving-light visibility lookup at all.
 if(cavePaintPlayer.w<.5||dot(toPlayer,toPlayer)>=${(CAVE_PLAYER_FILL.radius**2).toFixed(2)})return staticFactor;
 // Both contributions are linear illumination factors. The lantern can only
 // lift the same currently visible surface; existing firelight is never dimmed
 // or overexposed, and explored/hidden rooms receive no moving contribution.
 return max(staticFactor,cavePlayerFillFactor(p,caveFogState(p).x));
}
vec3 cavePaintFactor(vec3 p){
 if(cavePaintActive<.5)return vec3(1.);
 return cavePaintFactorFromSample(p,cavePaintSample(p));
}
#endif
`;
const functions=CAVE_PAINT_LIGHT_GLSL.replace('uniform vec4 cavePaintRect;','').replace('uniform float cavePaintActive;','').replace('uniform vec4 cavePaintPlayer;','');

export class CavePaintLightRuntime{
 constructor(world){
  this.world=world;this.disposed=false;this.map=getCavePaintLight(world.terrain,{receiverAt:caveRockPaintReceiver});this.rect=new Vector4(...this.map.rect);this.inactivePlayer=new Vector4(0,0,0,0);
  this.texture=new RawTexture(this.map.data,this.map.width,this.map.height,Constants.TEXTUREFORMAT_RGBA,world.scene,false,false,Texture.BILINEAR_SAMPLINGMODE,Constants.TEXTURETYPE_UNSIGNED_BYTE);
  this.texture.name='cave-static-painted-light';this.texture.gammaSpace=false;this.texture.wrapU=this.texture.wrapV=Texture.CLAMP_ADDRESSMODE;
  this.texture.anisotropicFilteringLevel=1;
  world.scene.metadata={...world.scene.metadata,cavePaintLighting:this};
  this.sceneDispose=world.scene.onDisposeObservable.addOnce(()=>this.dispose());
 }
 bind(material,effect=null){
  if(this.disposed)return;
  material.setTexture('cavePaintLightMap',this.texture);material.setVector4('cavePaintRect',this.rect);material.setFloat('cavePaintActive',1);
  const player=this.world.caveFog?.playerView;material.setVector4('cavePaintPlayer',player??this.inactivePlayer);
  effect=readyShaderEffect(effect);if(!effect)return;
  effect.setTexture('cavePaintLightMap',this.texture);effect.setVector4('cavePaintRect',this.rect);effect.setFloat('cavePaintActive',1);
  effect.setVector4('cavePaintPlayer',player??this.inactivePlayer);
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
 getUniforms(){return {ubo:[{name:'cavePaintRect',size:4,type:'vec4'},{name:'cavePaintActive',size:1,type:'float'},{name:'cavePaintPlayer',size:4,type:'vec4'}],fragment:'uniform vec4 cavePaintRect;uniform float cavePaintActive;uniform vec4 cavePaintPlayer;'};}
 hardBindForSubMesh(buffer){
  const scene=this._material.getScene(),runtime=scene.metadata?.cavePaintLighting,active=this.active&&runtime&&!runtime.disposed;
  buffer.setTexture('cavePaintLightMap',active?runtime.texture:caveFogFallback(scene));buffer.updateFloat('cavePaintActive',active?1:0);
  if(active)buffer.updateFloat4('cavePaintRect',runtime.rect.x,runtime.rect.y,runtime.rect.z,runtime.rect.w);
  const player=active?scene.metadata?.caveFogRuntime?.playerView:null;
  buffer.updateFloat4('cavePaintPlayer',player?.x??0,player?.y??0,player?.z??0,player?.w??0);
 }
 getCustomCode(type){
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_DEFINITIONS:functions,CUSTOM_FRAGMENT_BEFORE_FOG:this.ground?'color.rgb*=cavePaintFactor(vPositionW);':'',CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:this.ground?'':'finalDiffuse*=cavePaintFactor(vPositionW);'};
 }
}

export function bindCavePaintLight(material,world,effect=null){
 const runtime=world.scene.metadata?.cavePaintLighting;
 if(runtime&&!runtime.disposed){runtime.bind(material,effect);return;}
 const fallback=caveFogFallback(world.scene);material.setTexture('cavePaintLightMap',fallback);material.setFloat('cavePaintActive',0);material.setVector4('cavePaintPlayer',INACTIVE_PAINT_PLAYER);
 effect=readyShaderEffect(effect);if(effect){effect.setTexture('cavePaintLightMap',fallback);effect.setFloat('cavePaintActive',0);effect.setFloat4('cavePaintPlayer',0,0,0,0);}
}
