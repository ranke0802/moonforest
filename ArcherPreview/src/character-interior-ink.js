import {Color3,Color4,Constants,Effect,PostProcess,RenderTargetTexture,ShaderMaterial,ThinTexture} from '@babylonjs/core';
import {BindBonesParameters} from '@babylonjs/core/Materials/materialHelper.functions.js';
import {buildNpcInkFragment} from './character-ink-shaders.js';
import {bindCaveFogMaterial,readyShaderEffect} from './cave-fog-binding.js';
import {CAVE_FOG_GLSL} from './cave-fog-cover.js';
import {actorIntersectsCamera} from './mourning-camera-culling.js';
import '@babylonjs/core/Shaders/ShadersInclude/bonesDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/bonesVertex.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexGlobalDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexGlobal.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertex.js';

const scenes=new WeakMap(),managers=new Set();
const linearInk=new Color3(.052,.040,.054);
const srgbChannel=value=>value<=.0031308?12.92*value:1.055*Math.pow(value,1/2.4)-.055;
const displayInk=new Color3(srgbChannel(linearInk.r),srgbChannel(linearInk.g),srgbChannel(linearInk.b));
const normalVertex=`precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 view;
uniform mat4 viewProjection;
varying vec3 npcViewNormal;varying vec3 npcInkPosition;
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
 npcInkPosition=(finalWorld*vec4(positionUpdated,1.0)).xyz;
 npcViewNormal=normalize(mat3(view*finalWorld)*normalUpdated);
 gl_Position=viewProjection*finalWorld*vec4(positionUpdated,1.0);
}`;
const normalFragment=`precision highp float;
varying vec3 npcViewNormal;varying vec3 npcInkPosition;
uniform float npcProfileId;
${CAVE_FOG_GLSL}
void main(void){
 if(caveFogHidesInk(npcInkPosition))discard;
 vec3 n=normalize(npcViewNormal)*(gl_FrontFacing?1.0:-1.0);
 gl_FragColor=vec4(n*.5+.5,.5+npcProfileId/128.0);
}`;

function makeManager(scene){
 const engine=scene.getEngine(),entries=new Map(),profiles=new Float32Array(128),profileIds=new Map(),rootScales=new Map();
 let normalMaterial=null,target=null,post=null,camera=null,cameraDispose=null,attached=false,normalDepthView=null,mainDepthView=null,disposed=false,rendering=false,normalFrames=0,resourceCycles=0;
 const active=[],keys=new Map();
 const maximumProfiles=Math.min(64,Math.max(2,(engine.getCaps().maxFragmentUniformVectors??128)-12));
 const size=()=>({width:Math.max(1,engine.getRenderWidth(true)),height:Math.max(1,engine.getRenderHeight(true))});
 const samplesFor=nextCamera=>Math.min(engine.getCaps().maxMSAASamples??1,Math.max(1,nextCamera?._postProcesses?.find(value=>value&&value!==post)?.samples??(engine.getCreationOptions?.().antialias?4:1)));
 function detach(){
  if(!attached)return;attached=false;camera?.detachPostProcess(post);
 }
 function attach(){
  if(attached)return;
  // Keep the owned input/depth while idle. Babylon invalidates the first pass
  // on attach and reuses that same correctly sized input on activation.
  camera.attachPostProcess(post,0);attached=true;
 }
 function releaseResources(disposeMaterial=false){
  detach();camera?.onDisposeObservable.remove(cameraDispose);cameraDispose=null;
  const previousPost=post;post=null;previousPost?.dispose(camera);
  target?.dispose();target=null;if(disposeMaterial){normalMaterial?.dispose();normalMaterial=null;}camera=null;normalDepthView=null;mainDepthView=null;profileIds.clear();rootScales.clear();
 }
 function ensureNormalMaterial(){
  if(normalMaterial)return normalMaterial;
  normalMaterial=new ShaderMaterial('npc-interior-normal',scene,{vertexSource:normalVertex,fragmentSource:normalFragment},{attributes:['position','normal'],defines:['#define NORMAL'],uniforms:['world','view','viewProjection','npcProfileId','caveFogRect','caveFogActive','caveFogOrigin'],samplers:['caveFogMap']});
  normalMaterial.backFaceCulling=false;normalMaterial.disableDepthWrite=false;
  bindCaveFogMaterial(scene,normalMaterial);
  normalMaterial.onBindObservable.add(mesh=>{const effect=readyShaderEffect(normalMaterial._activeEffect??normalMaterial.getEffect());if(!effect)return;BindBonesParameters(mesh,effect);bindCaveFogMaterial(scene,normalMaterial,effect);effect.setMatrix('view',scene.getViewMatrix());effect.setFloat('npcProfileId',profileIds.get(mesh)??1);});
  return normalMaterial;
 }
 function createResources(nextCamera){
  releaseResources();camera=nextCamera;cameraDispose=camera.onDisposeObservable.addOnce(()=>releaseResources());resourceCycles++;ensureNormalMaterial();
  target=new RenderTargetTexture('npc-interior-normal-depth',size(),scene,{generateMipMaps:false,samplingMode:Constants.TEXTURE_NEAREST_SAMPLINGMODE,generateDepthBuffer:true,generateStencilBuffer:false,type:Constants.TEXTURETYPE_UNSIGNED_BYTE,format:Constants.TEXTUREFORMAT_RGBA,samples:1});
  target.clearColor=new Color4(0,0,0,0);target.wrapU=target.wrapV=Constants.TEXTURE_CLAMP_ADDRESSMODE;target.renderParticles=false;target.renderSprites=false;target.useCameraPostProcesses=false;target.activeCamera=camera;
  target.createDepthStencilTexture(0,false,false,1,Constants.TEXTUREFORMAT_DEPTH32_FLOAT,'npc-interior-own-depth');
  const shaderName='moonforestNpcInterior'+maximumProfiles;
  Effect.ShadersStore[shaderName+'PixelShader']??=buildNpcInkFragment({maxProfiles:maximumProfiles});
  post=new PostProcess('npc-interior-ink',shaderName,['texel','nearFar','pixelWorldFactor','ink','npcProfiles','reverseDepth'],['tNormal','tDepth','tSceneDepth'],1,null,Constants.TEXTURE_NEAREST_SAMPLINGMODE,engine);
  // Become the first pass, so its own input stores the main world's existing
  // depth. No second world render, shared-depth mutation, or hidden wall ink.
  post.samples=samplesFor(camera);
  const ownedPost=post;
  post.onDisposeObservable.addOnce(()=>{if(post===ownedPost){post=null;attached=false;releaseResources();}});
  attach();
  post.onActivateObservable.add(()=>{
   const input=post.inputTexture;
   if(!input.depthStencilTexture){const stencil=!!engine.isStencilEnable;input.createDepthStencilTexture(0,false,stencil,input.samples,stencil?Constants.TEXTUREFORMAT_DEPTH24_STENCIL8:Constants.TEXTUREFORMAT_DEPTH32_FLOAT,'npc-main-render-depth');input.resolveMSAADepth=true;engine.bindFramebuffer(input);// A fresh depth attachment holds undefined data: without this clear the first
   // frame after every (re)creation (NPC in view, resize, map arrival) failed
   // the depth test everywhere and showed only the clear colour (sky flash).
   engine.clear(scene.clearColor,true,true,!!engine.isStencilEnable);}
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
  // Warm the new pass off-screen (input, MSAA and depth attachments) before
  // its first visible frame: allocating them mid-frame showed one frame of
  // bare clear colour each time the pass was rebuilt (resize, NPC in view).
  try{const wasAttached=attached;post.activate(camera,null,true);engine.clear(scene.clearColor,true,true,!!engine.isStencilEnable);engine.restoreDefaultFramebuffer();if(!wasAttached)detach();}catch(error){console.warn('[NPC ink] warm-up skipped',error);}
 }
 function collect(){
  if(disposed)return;active.length=0;
  for(const [mesh,value]of entries)if(!mesh.isDisposed()&&mesh.isEnabled()&&mesh.isVisible&&mesh.visibility>0&&value.look.interior&&value.look.interiorStrength>0&&(!scene.activeCamera||mesh.layerMask&scene.activeCamera.layerMask)&&actorIntersectsCamera(mesh,scene))active.push(mesh);
  const s=size(),old=target?.getSize();
  // Retain only one camera/size/sample set. Replacing a size also releases the
  // postprocess SDK texture cache, rather than retaining old-size inputs.
  if(post&&(camera!==scene.activeCamera||s.width!==old.width||s.height!==old.height||post.samples!==samplesFor(scene.activeCamera)))releaseResources();
  if(!scene.activeCamera||!engine.getCaps().depthTextureExtension){releaseResources();return;}
  if(!active.length||!scene.postProcessesEnabled||!interiorInkEnabled){detach();return;}
  if(!post)createResources(scene.activeCamera);else attach();
  profiles.fill(0);profileIds.clear();rootScales.clear();keys.clear();
  for(const mesh of active){const value=entries.get(mesh),root=value.root;
   // Several body/halo meshes share one actor. Reuse its ordinary dirty-aware
   // transform once, rather than force-refreshing the root for each part.
   if(!rootScales.has(root)){root?.computeWorldMatrix();rootScales.set(root,root?.absoluteScaling?.y??1);}
   const scale=(value.height??1.85)*rootScales.get(root)/(value.baseScale??1),key=scale+'|'+value.look.interiorStrength;let id=keys.get(key);if(!id){id=keys.size+1;if(id>=maximumProfiles)throw new Error('NPC interior-ink profile capacity exceeded');keys.set(key,id);profiles[id*2]=scale;profiles[id*2+1]=value.look.interiorStrength;}profileIds.set(mesh,id);}
  target.renderList=active;target.setMaterialForRendering(active,normalMaterial);
 }
 const before=scene.onBeforeRenderObservable.add(collect);
 const render=scene.postProcessManager.onBeforeRenderObservable.add(()=>{
  if(rendering||!attached||!post||!active.length||scene.activeCamera!==camera)return;
  const view=scene.getViewMatrix().clone(),projection=scene.getProjectionMatrix().clone();
  rendering=true;try{target.render(false,false);normalFrames++;}finally{rendering=false;scene.setTransformMatrix(view,projection);}
 });
 function dispose(){if(disposed)return;disposed=true;releaseResources(true);scene.onBeforeRenderObservable.remove(before);scene.postProcessManager.onBeforeRenderObservable.remove(render);scene.onDisposeObservable.remove(onDispose);for(const [mesh,value]of entries)mesh.onDisposeObservable.remove(value.observer);entries.clear();scenes.delete(scene);}
 const onDispose=scene.onDisposeObservable.addOnce(dispose);
 return {register(mesh,value){const existing=entries.get(mesh);if(existing){Object.assign(existing,value);return;}const observer=mesh.onDisposeObservable.addOnce(()=>{entries.delete(mesh);if(!entries.size)dispose();});entries.set(mesh,{...value,observer});},async prepare(meshes,preparation){
  if(disposed||!engine.getCaps().depthTextureExtension)return;
  const selected=meshes.filter(mesh=>entries.has(mesh));if(!selected.length)return;
  const material=ensureNormalMaterial();
  // Warm the real skin/morph variants under the existing summon deadline, with
  // no normal render, framebuffer allocation, per-actor pass or private timer.
  for(const mesh of selected){await preparation.pause();for(;;){preparation.check();if(material.isReady(mesh,false))break;const effect=material.getEffect();if(effect?.getCompilationError?.()&&effect.allFallbacksProcessed?.())throw new Error('내부선 셰이더를 준비하지 못했습니다.');await preparation.sleep(16);}}
 },releaseResources(){active.length=0;releaseResources();},inspect:()=>({registered:entries.size,visible:active.length,renderTargets:target?1:0,postProcesses:post?1:0,attachedPostProcesses:attached?1:0,idleRetained:!!post&&!attached,normalFrames,resourceCycles,worldDepthRenders:0,rafOwned:false,maximumProfiles,depthSupported:!!engine.getCaps().depthTextureExtension}),dispose};
}

export function registerNpcInteriorInk(mesh,{root,look,height=1.85,baseScale=1}={}){
 const scene=mesh.getScene();let manager=scenes.get(scene);if(!manager){manager=makeManager(scene);scenes.set(scene,manager);managers.add(manager);const owned=manager;scene.onDisposeObservable.addOnce(()=>managers.delete(owned));}manager.register(mesh,{root,look,height,baseScale});
}
// Settings: the whole interior-ink pass on/off (outer outlines are separate).
export const INTERIOR_INK_KEY='moonforest-interior-ink-v2';
// v2 (2026-11-18): one switch for all interior lines, off by default.
let interiorInkEnabled=false;
export function setInteriorInkEnabled(value){interiorInkEnabled=!!value;if(!interiorInkEnabled)for(const owner of managers)owner.releaseResources?.();}
export function setupInteriorInkSettings({host,storage,onChange=()=>{},onToggle=()=>{}}){
 const doc=host.ownerDocument,label=doc.createElement('label'),input=doc.createElement('input'),note=doc.createElement('small');
 input.type='checkbox';input.id='interior-ink-toggle';label.append(input,' 내부선 (전체)');note.textContent='모든 캐릭터 몸 안쪽에 그리는 선입니다. 끄면 가벼워집니다. 바깥 외곽선과 원본 그림의 선은 그대로예요.';host.append(label,note);
 let enabled=false;try{const value=storage?.getItem(INTERIOR_INK_KEY);if(value==='0'||value==='1')enabled=value==='1';}catch{}input.checked=enabled;setInteriorInkEnabled(enabled);onToggle(enabled);
 const change=()=>{enabled=input.checked;try{storage?.setItem(INTERIOR_INK_KEY,enabled?'1':'0');}catch{}setInteriorInkEnabled(enabled);onToggle(enabled);onChange(enabled);};input.addEventListener('change',change);
 return {get enabled(){return enabled;},dispose(){input.removeEventListener('change',change);label.remove();note.remove();}};
}
export function inspectNpcInteriorInk(scene){return scenes.get(scene)?.inspect()??{registered:0,visible:0,renderTargets:0,postProcesses:0,attachedPostProcesses:0,idleRetained:false,normalFrames:0,resourceCycles:0,worldDepthRenders:0,rafOwned:false};}
export function releaseNpcInteriorInkResources(scene){scenes.get(scene)?.releaseResources();}
export async function prepareNpcInteriorInk(asset,preparation){const scene=asset.meshes[0]?.getScene();await scenes.get(scene)?.prepare(asset.meshes,preparation);}
