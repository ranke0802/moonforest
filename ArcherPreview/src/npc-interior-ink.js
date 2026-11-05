import {Color3,Color4,Constants,Effect,PostProcess,RenderTargetTexture,ShaderMaterial,ThinTexture} from '@babylonjs/core';
import {BindBonesParameters} from '@babylonjs/core/Materials/materialHelper.functions.js';
import {buildNpcInkFragment} from './npc-ink-shaders.js';
import {readyShaderEffect} from './cave-fog-binding.js';
import '@babylonjs/core/Shaders/ShadersInclude/bonesDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/bonesVertex.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexGlobalDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexGlobal.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertex.js';

const scenes=new WeakMap();
const linearInk=new Color3(.052,.040,.054);
const srgbChannel=value=>value<=.0031308?12.92*value:1.055*Math.pow(value,1/2.4)-.055;
const displayInk=new Color3(srgbChannel(linearInk.r),srgbChannel(linearInk.g),srgbChannel(linearInk.b));
const normalVertex=`precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 view;
uniform mat4 viewProjection;
varying vec3 npcViewNormal;
#include<bonesDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
void main(void){
 vec3 positionUpdated=position;
 vec3 normalUpdated=normal;
 #include<morphTargetsVertexGlobal>
 #include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
 mat4 finalWorld=world;
 #include<bonesVertex>
 npcViewNormal=normalize(mat3(view*finalWorld)*normalUpdated);
 gl_Position=viewProjection*finalWorld*vec4(positionUpdated,1.0);
}`;
const normalFragment=`precision highp float;
varying vec3 npcViewNormal;
uniform float npcProfileId;
void main(void){
 vec3 n=normalize(npcViewNormal)*(gl_FrontFacing?1.0:-1.0);
 gl_FragColor=vec4(n*.5+.5,.5+npcProfileId/128.0);
}`;

function makeManager(scene){
 const engine=scene.getEngine(),entries=new Map(),profiles=new Float32Array(128),profileIds=new Map();
 let normalMaterial=null,target=null,post=null,camera=null,normalDepthView=null,mainDepthView=null,disposed=false,rendering=false,active=[],normalFrames=0,resourceCycles=0;
 const maximumProfiles=Math.min(64,Math.max(2,(engine.getCaps().maxFragmentUniformVectors??128)-12));
 const size=()=>({width:Math.max(1,engine.getRenderWidth(true)),height:Math.max(1,engine.getRenderHeight(true))});
 function releaseResources(){
  if(post){camera?.detachPostProcess(post);post.dispose(camera);camera?._postProcesses?.find(Boolean)?.markTextureDirty();post=null;}
  target?.dispose();target=null;normalMaterial?.dispose();normalMaterial=null;camera=null;normalDepthView=null;mainDepthView=null;profileIds.clear();
 }
 function createResources(nextCamera){
  releaseResources();camera=nextCamera;resourceCycles++;
  normalMaterial=new ShaderMaterial('npc-interior-normal',scene,{vertexSource:normalVertex,fragmentSource:normalFragment},{attributes:['position','normal'],defines:['#define NORMAL'],uniforms:['world','view','viewProjection','npcProfileId']});
  normalMaterial.backFaceCulling=false;normalMaterial.disableDepthWrite=false;
  normalMaterial.onBindObservable.add(mesh=>{const effect=readyShaderEffect(normalMaterial._activeEffect??normalMaterial.getEffect());if(!effect)return;BindBonesParameters(mesh,effect);effect.setMatrix('view',scene.getViewMatrix());effect.setFloat('npcProfileId',profileIds.get(mesh)??1);});
  target=new RenderTargetTexture('npc-interior-normal-depth',size(),scene,{generateMipMaps:false,samplingMode:Constants.TEXTURE_NEAREST_SAMPLINGMODE,generateDepthBuffer:true,generateStencilBuffer:false,type:Constants.TEXTURETYPE_UNSIGNED_BYTE,format:Constants.TEXTUREFORMAT_RGBA,samples:1});
  target.clearColor=new Color4(0,0,0,0);target.wrapU=target.wrapV=Constants.TEXTURE_CLAMP_ADDRESSMODE;target.renderParticles=false;target.renderSprites=false;target.useCameraPostProcesses=false;target.activeCamera=camera;
  target.createDepthStencilTexture(0,false,false,1,Constants.TEXTUREFORMAT_DEPTH32_FLOAT,'npc-interior-own-depth');
  const shaderName='moonforestNpcInterior'+maximumProfiles;
  Effect.ShadersStore[shaderName+'PixelShader']??=buildNpcInkFragment({maxProfiles:maximumProfiles});
  post=new PostProcess('npc-interior-ink',shaderName,['texel','nearFar','pixelWorldFactor','ink','npcProfiles','reverseDepth'],['tNormal','tDepth','tSceneDepth'],1,null,Constants.TEXTURE_NEAREST_SAMPLINGMODE,engine);
  // Become the first pass, so its own input stores the main world's existing
  // depth. No second world render, shared-depth mutation, or hidden wall ink.
  const previousFirst=camera._postProcesses?.find(Boolean);
  post.samples=Math.max(1,previousFirst?.samples??(engine.getCreationOptions?.().antialias?4:1));
  camera.attachPostProcess(post,0);
  post.onActivateObservable.add(()=>{
   const input=post.inputTexture;
   if(!input.depthStencilTexture){const stencil=!!engine.isStencilEnable;input.createDepthStencilTexture(0,false,stencil,input.samples,stencil?Constants.TEXTUREFORMAT_DEPTH24_STENCIL8:Constants.TEXTUREFORMAT_DEPTH32_FLOAT,'npc-main-render-depth');input.resolveMSAADepth=true;engine.bindFramebuffer(input);}
  });
  post.onApplyObservable.add(effect=>{
   const s=target.getSize(),canvas=engine.getRenderingCanvas(),cssHeight=canvas?.getBoundingClientRect?.().height||canvas?.clientHeight||s.height,pixelRatio=s.height/cssHeight;
   const depthView=(previous,texture)=>{if(previous?._texture===texture)return previous;const view=new ThinTexture(texture);view.wrapU=view.wrapV=Constants.TEXTURE_CLAMP_ADDRESSMODE;return view;};
   normalDepthView=depthView(normalDepthView,target.depthStencilTexture);mainDepthView=depthView(mainDepthView,post.inputTexture.depthStencilTexture);
   effect.setTexture('tNormal',target);
   effect.setTexture('tDepth',normalDepthView);
   effect.setTexture('tSceneDepth',mainDepthView);
   effect.setFloat2('texel',.8*pixelRatio/s.width,.8*pixelRatio/s.height);
   effect.setFloat2('nearFar',camera.minZ,camera.maxZ);
   effect.setFloat('pixelWorldFactor',2*Math.tan(camera.fov/2)/cssHeight);
   effect.setFloat('reverseDepth',engine.useReverseDepthBuffer?1:0);
   // Match the color already in the first pass input. The game's normal PBR
   // path encodes before this pass; deferred image processing remains linear.
   effect.setColor3('ink',scene.imageProcessingConfiguration.applyByPostProcess?linearInk:displayInk);effect.setArray2('npcProfiles',profiles.subarray(0,maximumProfiles*2));
  });
 }
 function collect(){
  if(disposed)return;active=[];
  for(const [mesh,value]of entries)if(!mesh.isDisposed()&&mesh.isEnabled()&&mesh.isVisible&&mesh.visibility>0&&value.look.interior&&value.look.interiorStrength>0&&(!scene.activeCamera||mesh.layerMask&scene.activeCamera.layerMask))active.push(mesh);
  if(!active.length||!scene.activeCamera||!scene.postProcessesEnabled||!engine.getCaps().depthTextureExtension){releaseResources();return;}
  if(!post||camera!==scene.activeCamera)createResources(scene.activeCamera);
  const s=size(),old=target.getSize();if(s.width!==old.width||s.height!==old.height){target.resize(s);target.createDepthStencilTexture(0,false,false,1,Constants.TEXTUREFORMAT_DEPTH32_FLOAT,'npc-interior-own-depth');}
  profiles.fill(0);profileIds.clear();const keys=new Map();
  for(const mesh of active){const value=entries.get(mesh),root=value.root;root?.computeWorldMatrix(true);const scale=(value.height??1.85)*(root?.absoluteScaling?.y??1)/(value.baseScale??1),key=scale+'|'+value.look.interiorStrength;let id=keys.get(key);if(!id){id=keys.size+1;if(id>=maximumProfiles)throw new Error('NPC interior-ink profile capacity exceeded');keys.set(key,id);profiles[id*2]=scale;profiles[id*2+1]=value.look.interiorStrength;}profileIds.set(mesh,id);}
  target.renderList=active;target.setMaterialForRendering(active,normalMaterial);
 }
 const before=scene.onBeforeRenderObservable.add(collect);
 const render=scene.postProcessManager.onBeforeRenderObservable.add(()=>{
  if(rendering||!post||!active.length||scene.activeCamera!==camera)return;
  const view=scene.getViewMatrix().clone(),projection=scene.getProjectionMatrix().clone();
  rendering=true;try{target.render(false,false);normalFrames++;}finally{rendering=false;scene.setTransformMatrix(view,projection);}
 });
 function dispose(){if(disposed)return;disposed=true;releaseResources();scene.onBeforeRenderObservable.remove(before);scene.postProcessManager.onBeforeRenderObservable.remove(render);scene.onDisposeObservable.remove(onDispose);for(const [mesh,value]of entries)mesh.onDisposeObservable.remove(value.observer);entries.clear();scenes.delete(scene);}
 const onDispose=scene.onDisposeObservable.addOnce(dispose);
 return {register(mesh,value){const existing=entries.get(mesh);if(existing){Object.assign(existing,value);return;}const observer=mesh.onDisposeObservable.addOnce(()=>{entries.delete(mesh);if(!entries.size)dispose();});entries.set(mesh,{...value,observer});},inspect:()=>({registered:entries.size,visible:active.length,renderTargets:target?1:0,postProcesses:post?1:0,normalFrames,resourceCycles,worldDepthRenders:0,rafOwned:false,maximumProfiles,depthSupported:!!engine.getCaps().depthTextureExtension}),dispose};
}

export function registerNpcInteriorInk(mesh,{root,look,height=1.85,baseScale=1}={}){
 const scene=mesh.getScene();let manager=scenes.get(scene);if(!manager){manager=makeManager(scene);scenes.set(scene,manager);}manager.register(mesh,{root,look,height,baseScale});
}
export function inspectNpcInteriorInk(scene){return scenes.get(scene)?.inspect()??{registered:0,visible:0,renderTargets:0,postProcesses:0,normalFrames:0,resourceCycles:0,worldDepthRenders:0,rafOwned:false};}
