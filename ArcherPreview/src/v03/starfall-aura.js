import {Constants, Matrix, Mesh, Quaternion, ShaderMaterial, Vector4, VertexBuffer, VertexData} from '@babylonjs/core';
import {BindBonesParameters} from '@babylonjs/core/Materials/materialHelper.functions.js';
import {prepareModelShaders} from '../boss-shader-warmup.js';
import {CAVE_FOG_GLSL} from '../cave-fog-cover.js';
import {bindCaveFogMaterial, readyShaderEffect} from '../cave-fog-binding.js';
import '@babylonjs/core/Shaders/ShadersInclude/bonesDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/bonesVertex.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexGlobalDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexGlobal.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertex.js';

// Starfall charge: the whole warrior glows the way the sword does.
// 1. One additive shell per visible part shares the part's GPU geometry and skeleton
//    (the pattern of the sword/shield silhouettes in character-outlines.js): a gold
//    fill that shimmers upward plus a wide soft rim, so the body takes the blade's colour.
// 2. One soft camera-facing ellipse behind the body (one draw, four vertices): the halo,
//    in the same language as the blade light. The body occludes its centre.
// Everything is disabled outside the glow: no draw, no material variant on the body.
// Programs are prepared when the skill is learned (prepareModelShaders).
export const AURA_FADE_IN=.12, AURA_RELEASE_PEAK=.12, AURA_RELEASE_END=.35, AURA_CANCEL_SECONDS=.2;
const RELEASE_RISE=.035, PULSE_HZ=2, PULSE_DEPTH=.12;
// Small parts (neck, ears, strap, eye patches, shield hardware) change nothing at game
// distance once the halo is behind them: skipped to save draws.
const MIN_VERTICES=1000;
const SKIPPED=/outline|Rivet|MountPad|Rear_Leather|^Cube|^Sphere/i;
export const AURA_NAME_PREFIX='v03-starfall-aura:';
export const AURA_HALO_NAME='v03-starfall-aura-halo';
// The blade light's palette (great-attack-fx.js: gold, ivory). Copied, not imported:
// that module does not export them.
const GOLD='vec3(1.0,0.66,0.22)', IVORY='vec3(1.0,0.98,0.84)';
// The halo: about 1.3 m by 2.1 m at full charge, centred on the spine, set back from the body.
export const HALO_WIDTH=1.3, HALO_HEIGHT=2.1, HALO_SETBACK=.3;

const vertexSource=`
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 view;
uniform mat4 viewProjection;
uniform vec4 auraShape;
varying highp vec3 auraPoint;
varying highp vec3 auraNormal;
varying highp vec3 auraToEye;
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
  vec4 worldPosition=finalWorld*vec4(positionUpdated,1.0);
  vec3 worldNormal=normalize(mat3(finalWorld)*normalUpdated);
  // A few millimetres only: enough to lie over the surface, not to open plate seams.
  worldPosition.xyz+=worldNormal*auraShape.x;
  // Camera position: transpose(R)*t written as a row-vector product (no ES 3.00 built-in).
  vec3 eye=-(view[3].xyz*mat3(view));
  auraPoint=worldPosition.xyz;
  auraNormal=worldNormal;
  auraToEye=eye-worldPosition.xyz;
  gl_Position=viewProjection*worldPosition;
}`;
// auraGlow: x strength, y whiteness, z clock, w fill.
const fragmentSource=cave=>`
precision highp float;
uniform vec4 auraGlow;
varying highp vec3 auraPoint;
varying highp vec3 auraNormal;
varying highp vec3 auraToEye;
${cave?CAVE_FOG_GLSL:''}
void main(void){
  ${cave?'if(caveFogHidesInk(auraPoint))discard;':''}
  float facing=abs(dot(normalize(auraNormal),normalize(auraToEye)));
  float edge=1.0-facing;
  float rim=edge*edge;
  // Energy gathering: bands climb the body, a fine shimmer runs through them.
  float climb=auraPoint.y*4.2-auraGlow.z*1.9+sin(auraPoint.x*7.0+auraPoint.z*5.0)*0.8;
  float band=pow(0.5+0.5*sin(climb*3.14159),3.0);
  float fine=0.5+0.5*sin(auraPoint.y*27.0-auraGlow.z*6.5+auraPoint.x*13.0-auraPoint.z*11.0);
  float flow=0.6+0.8*band*(0.7+0.3*fine);
  // A lit surface: gold fill everywhere, a wide soft rim on top, capped so that the
  // character's own colours stay recognisable even at the release peak.
  float alpha=min(auraGlow.w*flow+0.42*auraGlow.x*rim*(0.75+0.5*band),0.44);
  if(alpha<0.004)discard;
  vec3 tone=mix(${GOLD},${IVORY},auraGlow.y);
  gl_FragColor=vec4(tone,alpha);
}`;
const haloVertexSource=`
precision highp float;
attribute vec3 position;
uniform mat4 view;
uniform mat4 viewProjection;
uniform vec4 haloCenter;
uniform vec4 haloSize;
varying highp vec2 haloUv;
varying highp vec3 haloPoint;
void main(void){
  vec3 right=vec3(view[0][0],view[1][0],view[2][0]);
  // Camera position: transpose(R)*t written as a row-vector product (no ES 3.00 built-in).
  vec3 eye=-(view[3].xyz*mat3(view));
  // Behind the body as seen from the camera: the body covers the centre.
  vec3 away=haloCenter.xyz-eye;
  away=dot(away,away)>0.0001?normalize(away):vec3(0.0);
  vec3 p=haloCenter.xyz+away*haloSize.z+right*position.x*haloSize.x*0.5+vec3(0.0,1.0,0.0)*position.y*haloSize.y*0.5;
  haloUv=position.xy;
  haloPoint=p;
  gl_Position=viewProjection*vec4(p,1.0);
}`;
// haloGlow: x strength, y whiteness, z clock, w feet height.
const haloFragmentSource=cave=>`
precision highp float;
uniform vec4 haloGlow;
varying highp vec2 haloUv;
varying highp vec3 haloPoint;
${cave?CAVE_FOG_GLSL:''}
void main(void){
  ${cave?'if(caveFogHidesInk(haloPoint))discard;':''}
  float r=length(haloUv);
  if(r>=1.0)discard;
  float fall=(1.0-r)*(1.0-r)*0.55+(1.0-r)*0.45;
  // Upward-flowing streaks, bent slowly so they read as rising energy.
  float lane=pow(0.5+0.5*sin(haloUv.x*11.0+1.7*sin(haloUv.x*4.0+haloGlow.z*0.7)),4.0);
  float rise=0.5+0.5*sin(haloUv.y*6.0-haloGlow.z*3.2+haloUv.x*5.0);
  float glow=fall*(0.55+0.9*lane*rise);
  // Soft at the feet, never below the ground.
  glow*=smoothstep(haloGlow.w-0.02,haloGlow.w+0.35,haloPoint.y);
  float alpha=haloGlow.x*glow;
  if(alpha<0.004)discard;
  vec3 tone=mix(${GOLD},${IVORY},clamp(haloGlow.y*fall*1.6,0.0,1.0));
  gl_FragColor=vec4(tone,min(alpha,1.0));
}`;
export const STARFALL_AURA_SHADERS={vertexSource,fragmentSource,haloVertexSource,haloFragmentSource};

const clamp01=x=>x<0?0:x>1?1:x;
const smooth=(a,b,x)=>{const t=clamp01((x-a)/(b-a));return t*t*(3-2*t);};
const rank=level=>Math.min(5,Math.max(1,Math.trunc(level)||1));
// Level 1 → 5: slightly stronger and a little paler, still clearly gold.
export const auraLevelGain=level=>.86+.07*(rank(level)-1);
export const auraWhiteness=level=>.045*(rank(level)-1);
// Faint at the start, clearly visible by 30 %, strong at 100 %.
export const auraChargeStrength=(charge,level)=>(.14+.86*Math.pow(clamp01(charge),.72))*auraLevelGain(level);
// The gold fill over the body: about .10 at 30 %, .24 at 100 %, at most .45 (release peak).
export const auraFill=strength=>Math.min(.45,.28*strength);

export function auraSourceMeshes(root){
  const list=[];
  if(!root||root.isDisposed?.())return list;
  for(const mesh of root.getChildMeshes(false)){
    if(mesh.name.startsWith(AURA_NAME_PREFIX)||mesh.metadata?.moonforestOutline||mesh.metadata?.moonforestStarfallAura)continue;
    if(!mesh.material||SKIPPED.test(mesh.name)||SKIPPED.test(mesh.material.name??''))continue;
    if((mesh.getTotalVertices?.()??0)<MIN_VERTICES||!mesh.isVerticesDataPresent(VertexBuffer.NormalKind))continue;
    list.push(mesh);
  }
  return list;
}
function spineOf(root){
  return root.getDescendants(false,node=>node.name==='mixamorig:Hips')[0]??null;
}

export function createStarfallAura({scene,cave=!!scene.metadata?.caveFogRuntime,now=()=>performance.now()}){
  const fog=cave?['caveFogRect','caveFogActive','caveFogOrigin']:[],fogSamplers=cave?['caveFogMap']:[];
  const material=new ShaderMaterial('v03-starfall-aura'+(cave?'-cave':''),scene,{vertexSource,fragmentSource:fragmentSource(cave)},{
    attributes:['position','normal'],defines:['#define NORMAL'],
    uniforms:['world','view','viewProjection','auraShape','auraGlow',...fog],samplers:fogSamplers,needAlphaBlending:true,
  });
  material.alphaMode=Constants.ALPHA_ADD;material.disableDepthWrite=true;material.backFaceCulling=true;
  const glow=new Vector4(0,0,0,0),shape=new Vector4(.004,0,0,0);
  material.setVector4('auraGlow',glow).setVector4('auraShape',shape);
  if(cave)bindCaveFogMaterial(scene,material);
  material.onBindObservable.add(mesh=>{
    const effect=readyShaderEffect(material._activeEffect??material.getEffect());if(!effect)return;
    if(cave)bindCaveFogMaterial(scene,material,effect);
    // The shared material caches one rig: every shell binds its own skeleton.
    BindBonesParameters(mesh,effect);
  });
  // The halo: one quad, positioned in the shader. Scene lifetime, like the blade light.
  const halo=new Mesh(AURA_HALO_NAME,scene),quad=new VertexData();
  quad.positions=[-1,-1,0,1,-1,0,1,1,0,-1,1,0];quad.indices=[0,1,2,0,2,3];quad.applyToMesh(halo);
  halo.isPickable=false;halo.checkCollisions=false;halo.receiveShadows=false;halo.renderOutline=false;
  halo.alwaysSelectAsActiveMesh=true;halo.metadata={moonforestStarfallAura:true};halo.setEnabled(false);
  const haloMaterial=new ShaderMaterial(AURA_HALO_NAME+(cave?'-cave':''),scene,{vertexSource:haloVertexSource,fragmentSource:haloFragmentSource(cave)},{
    attributes:['position'],uniforms:['view','viewProjection','haloCenter','haloSize','haloGlow',...fog],samplers:fogSamplers,needAlphaBlending:true,
  });
  haloMaterial.alphaMode=Constants.ALPHA_ADD;haloMaterial.disableDepthWrite=true;haloMaterial.backFaceCulling=false;
  const haloCenter=new Vector4(0,0,0,0),haloSize=new Vector4(HALO_WIDTH,HALO_HEIGHT,HALO_SETBACK,0),haloGlow=new Vector4(0,0,0,0);
  haloMaterial.setVector4('haloCenter',haloCenter).setVector4('haloSize',haloSize).setVector4('haloGlow',haloGlow);
  if(cave){bindCaveFogMaterial(scene,haloMaterial);haloMaterial.onBindObservable.add(()=>bindCaveFogMaterial(scene,haloMaterial,readyShaderEffect(haloMaterial._activeEffect)));}
  halo.material=haloMaterial;halo.alphaIndex=-1000;

  let root=null,spine=null,rootObserver=null,shells=[],sources=[],shown=false,disposed=false,preparing=null;
  let mode='idle',action=null,level=1,charge=0,chargeAt=0,fullAt=-1,eventAt=0,from=0,peak=0,strength=0,white=0;
  const haloReady=prepareModelShaders({meshes:[halo]},{includeInstanceVariants:false,keepPrograms:false})
    .catch(error=>{if(!disposed&&!scene.isDisposed)console.warn('[MoonForest] starfall halo preparation',error);});

  function unbind(){
    reset();
    if(root&&rootObserver)root.onDisposeObservable.remove(rootObserver);
    for(const shell of shells)if(!shell.isDisposed())shell.dispose(true,false);
    shells=[];sources=[];root=null;spine=null;rootObserver=null;preparing=null;
  }
  function makeShell(source){
    const shell=new Mesh(AURA_NAME_PREFIX+source.name,scene,source,source,true,false);
    shell.position.setAll(0);shell.rotation.setAll(0);
    shell.rotationQuaternion=Quaternion.Identity();shell.scaling.setAll(1);
    shell.setPivotMatrix(Matrix.Identity());shell.updatePoseMatrix(source.getPoseMatrix());
    shell.skeleton=source.skeleton;shell.morphTargetManager=source.morphTargetManager;
    shell.numBoneInfluencers=source.numBoneInfluencers;shell.computeBonesUsingShaders=source.computeBonesUsingShaders;
    shell.material=material;
    shell.metadata={moonforestStarfallAura:true};
    shell.isPickable=false;shell.checkCollisions=false;shell.receiveShadows=false;
    shell.renderOutline=false;shell.renderOverlay=false;
    shell.alwaysSelectAsActiveMesh=source.alwaysSelectAsActiveMesh;
    shell.renderingGroupId=source.renderingGroupId;shell.layerMask=source.layerMask;
    shell.isVisible=true;shell.visibility=1;
    shell.setEnabled(false);
    return shell;
  }
  // Called whenever the Starfall is prepared (load, map change, equipment, skill).
  // Only a different player root rebuilds; the same one costs one comparison.
  function bind(next){
    if(disposed||next===root&&shells.length)return preparing;
    unbind();
    const found=auraSourceMeshes(next);if(!found.length)return null;
    root=next;spine=spineOf(next);sources=found;shells=found.map(makeShell);
    rootObserver=next.onDisposeObservable.addOnce(()=>{rootObserver=null;unbind();});
    const owned=shells;
    preparing=Promise.all([haloReady,prepareModelShaders({meshes:owned},{includeInstanceVariants:false,keepPrograms:false})])
      .catch(error=>{if(!disposed&&!scene.isDisposed&&owned===shells)console.warn('[MoonForest] starfall aura preparation',error);});
    return preparing;
  }
  function show(){
    if(shown)return;shown=true;
    for(let i=0;i<shells.length;i++){
      const shell=shells[i],source=sources[i];
      // A sword model swap puts a new geometry on the blade (equipment.js wear()).
      if(source.geometry&&shell.geometry!==source.geometry){shell.releaseSubMeshes();source.geometry.applyToMesh(shell);}
      shell.isVisible=source.isVisible;shell.setEnabled(true);
    }
    halo.setEnabled(true);
  }
  function hide(){
    if(!shown)return;shown=false;
    for(const shell of shells)if(!shell.isDisposed())shell.setEnabled(false);
    halo.setEnabled(false);
  }
  function reset(){mode='idle';action=null;strength=0;fullAt=-1;hide();}
  function startRelease(releaseCharge,t){
    from=strength;
    peak=(.82+.5*clamp01(releaseCharge))*auraLevelGain(level);
    mode='release';eventAt=t;
  }
  function tick(){
    if(disposed||mode==='idle')return;
    const t=now()/1000,clock=t-chargeAt;
    white=auraWhiteness(level);
    let core=0;
    if(mode==='charge'){
      strength=auraChargeStrength(charge,level)*smooth(0,AURA_FADE_IN,clock);
      if(charge>=1){
        if(fullAt<0)fullAt=t;
        strength*=1+PULSE_DEPTH*Math.sin(2*Math.PI*PULSE_HZ*(t-fullAt));
      }else fullAt=-1;
    }else if(mode==='release'){
      const age=t-eventAt;
      if(age>=AURA_RELEASE_END){reset();return;}
      strength=age<AURA_RELEASE_PEAK?from+(peak-from)*smooth(0,RELEASE_RISE,age):peak*(1-smooth(AURA_RELEASE_PEAK,AURA_RELEASE_END,age));
      // White only in the core, at the release peak.
      core=1-smooth(AURA_RELEASE_PEAK*.5,AURA_RELEASE_END*.8,age);
    }else{
      const age=t-eventAt;
      if(age>=AURA_CANCEL_SECONDS){reset();return;}
      strength=from*(1-smooth(0,AURA_CANCEL_SECONDS,age));
    }
    if(!shells.length||root.isDisposed())return;
    glow.set(strength,white+.08*core,clock,auraFill(strength));
    material.setVector4('auraGlow',glow);
    // The halo grows with the charge and sits on the spine.
    const size=.62+.38*Math.min(1.15,strength/auraLevelGain(level));
    haloSize.x=HALO_WIDTH*size;haloSize.y=HALO_HEIGHT*size;
    const feet=root.getAbsolutePosition().y;
    if(spine){const at=spine.getAbsolutePosition();haloCenter.set(at.x,at.y+.1,at.z,0);}
    else{const at=root.getAbsolutePosition();haloCenter.set(at.x,at.y+.95,at.z,0);}
    haloGlow.set(1.3*strength,white+.7*core,clock,feet);
    haloMaterial.setVector4('haloCenter',haloCenter).setVector4('haloSize',haloSize).setVector4('haloGlow',haloGlow);
    show();
    // Hidden player (first person, story): the shells follow each part, the halo any part.
    let seen=false;
    for(let i=0;i<shells.length;i++){const visible=sources[i].isVisible&&sources[i].isEnabled();shells[i].isVisible=visible;seen||=visible;}
    halo.isVisible=seen;
  }
  // cast: the GreatAttackCast of this frame, or null when it was cleared.
  function update(cast){
    if(disposed)return;
    const t=now()/1000;
    if(!cast){if(mode==='charge'){from=strength;mode='cancel';eventAt=t;}tick();return;}
    if(cast.phase==='impact'||cast.phase==='recovery'){
      if(mode==='charge')startRelease(cast.releaseCharge??charge,t);
      tick();return;
    }
    level=cast.level??level;
    if(cast.actionId!==action){
      action=cast.actionId;chargeAt=t;fullAt=-1;strength=0;charge=0;
      if(cast.charging)mode='charge';else{charge=clamp01(cast.releaseCharge??0);startRelease(charge,t);}
    }
    if(mode==='charge'){
      if(cast.charging)charge=clamp01(Number.isFinite(cast.chargeProgress)?cast.chargeProgress:cast.progress);
      else startRelease(cast.releaseCharge??charge,t);
    }
    tick();
  }
  function dispose(){
    if(disposed)return;
    unbind();disposed=true;
    scene.onDisposeObservable.remove(sceneObserver);
    halo.dispose(true,false);haloMaterial.dispose(true,false);material.dispose(true,false);
  }
  const sceneObserver=scene.onDisposeObservable.addOnce(dispose);
  function inspect(){
    let vertices=0;for(const shell of shells)vertices+=shell.getTotalVertices();
    return {mode,strength:mode==='idle'?0:strength,shells:shells.length,draws:shown?shells.length+1:0,vertices,haloVertices:halo.getTotalVertices(),drawnVertices:shown?vertices+halo.getTotalVertices():0};
  }
  return {scene,cave,material,halo,bind,update,tick,reset,dispose,inspect,
    get active(){return mode!=='idle';},
    get strength(){return mode==='idle'?0:strength;},
    get root(){return root;},
    get shells(){return shells;},
    get draws(){return shown?shells.length+1:0;}};
}
