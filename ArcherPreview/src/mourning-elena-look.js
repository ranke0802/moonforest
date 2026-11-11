import {Color3,Matrix,ShaderMaterial,VertexBuffer} from '@babylonjs/core';
import {BindBonesParameters,BindFogParameters} from '@babylonjs/core/Materials/materialHelper.functions.js';
import {canInlineHitFlash} from './hit-feedback.js';
import {characterStyleFor} from './character-style.js';
import {configureCharacterExteriorStencil} from './character-ink-stencil.js';
import {registerNpcInteriorInk} from './character-interior-ink.js';
import {CAVE_FOG_GLSL} from './cave-fog-cover.js';
import {bindCaveFogMaterial,caveFogFallback,readyShaderEffect} from './cave-fog-binding.js';
import '@babylonjs/core/Shaders/ShadersInclude/fogVertexDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/fogVertex.js';
import '@babylonjs/core/Shaders/ShadersInclude/fogFragmentDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/fogFragment.js';

export const MOURNING_REFERENCE_LOOK=Object.freeze({outline:true,outlineWidth:.5,internal:true,internalStrength:.2,brightness:1.35,pbr:false});
const vertexSource=`precision highp float;
attribute vec3 position;attribute vec3 normal;
#ifdef HASPAINTMAP
attribute vec2 uv;
#endif
uniform mat4 world,view,viewProjection,paintMatrix;
varying vec3 paintNormal;varying vec2 paintUV;varying vec3 paintPosition;
#ifdef VERTEXCOLOR
attribute vec4 color;varying vec4 paintColor;
#endif
#include<fogVertexDeclaration>
#include<bonesDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
void main(){
 vec3 positionUpdated=position;vec3 normalUpdated=normal;
 #include<morphTargetsVertexGlobal>
 #include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
 mat4 finalWorld=world;
 #include<bonesVertex>
 vec4 worldPos=finalWorld*vec4(positionUpdated,1.);
 paintPosition=worldPos.xyz;paintNormal=normalize(mat3(finalWorld)*normalUpdated);
 #ifdef HASPAINTMAP
 paintUV=(paintMatrix*vec4(uv,1.,0.)).xy;
 #else
 paintUV=vec2(0.);
 #endif
 #ifdef VERTEXCOLOR
 paintColor=color;
 #endif
 #include<fogVertex>
 gl_Position=viewProjection*worldPos;
}`;
const fragmentSource=`precision highp float;
varying vec3 paintNormal;varying vec2 paintUV;varying vec3 paintPosition;
#ifdef VERTEXCOLOR
varying vec4 paintColor;
#endif
uniform sampler2D paintSampler;uniform vec3 paintBase;
uniform float paintHasMap,paintHardwareSRGB,paintExposure,paintOpacity,paintHitFlash;
#include<fogFragmentDeclaration>
${CAVE_FOG_GLSL}
vec3 paintToLinear(vec3 x){return mix(x/12.92,pow((x+.055)/1.055,vec3(2.4)),step(vec3(.04045),x));}
vec3 paintToSRGB(vec3 x){return mix(x*12.92,1.055*pow(max(x,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),x));}
void main(){
 vec4 texel=vec4(1.);if(paintHasMap>.5)texel=texture2D(paintSampler,paintUV);
 vec3 base=paintHasMap>.5&&paintHardwareSRGB<.5?paintToLinear(texel.rgb):texel.rgb;
 base*=paintBase;float alpha=texel.a*paintOpacity;
 #ifdef VERTEXCOLOR
 base*=paintColor.rgb;alpha*=paintColor.a;
 #endif
 vec3 n=normalize(paintNormal)*(gl_FrontFacing?1.:-1.);
 float facing=dot(n,normalize(vec3(-.35,.65,.75)));
 float band=.78+.14*smoothstep(-.10,-.02,facing)+.12*smoothstep(.48,.56,facing);
 // Match the approved standalone: exposure in linear colour, then exact sRGB.
 vec4 color=vec4(paintToSRGB(clamp(base*band*paintExposure,0.,1.)),alpha);
 #include<fogFragment>
 color.rgb=mix(color.rgb,vec3(1.),paintHitFlash);
 color.rgb=caveFogShadeSurface(color.rgb,paintPosition,0.);
 gl_FragColor=color;
}`;

// Shared immutable paint/texture resources; independent rigs and fade uniforms.
// ShaderMaterial retains the reviewed colour pipeline without PBR reflections.
const paints=new WeakMap();
function paintMaterial(source,scene){
  let cache=paints.get(scene);if(!cache){cache=new Map();paints.set(scene,cache);scene.onDisposeObservable.addOnce(()=>paints.delete(scene));}
  if(cache.has(source))return cache.get(source);
  const texture=source.albedoTexture??source.diffuseTexture??null;
  const material=new ShaderMaterial('mourning-reference-'+source.name,scene,{vertexSource,fragmentSource},{attributes:texture?['position','normal','uv']:['position','normal'],defines:texture?['#define NORMAL','#define HASPAINTMAP']:['#define NORMAL'],uniforms:['world','view','viewProjection','paintMatrix','paintBase','paintHasMap','paintHardwareSRGB','paintExposure','paintOpacity','paintHitFlash','vFogInfos','vFogColor','caveFogRect','caveFogActive','caveFogOrigin'],samplers:['paintSampler','caveFogMap']});
  material.backFaceCulling=false;material.disableDepthWrite=false;material.alpha=source.alpha??1;
  material.setColor3('paintBase',(source.albedoColor??source.diffuseColor??Color3.White()).clone());
  material.setFloat('paintHasMap',texture?1:0);material.setFloat('paintOpacity',material.alpha);material.setFloat('paintExposure',1.35);material.setFloat('paintHitFlash',0);
  material.setMatrix('paintMatrix',texture?.getTextureMatrix?.()??Matrix.Identity());material.setTexture('paintSampler',texture??caveFogFallback(scene));
  material.metadata={moonforestMonsterToon:true,mourningReferenceLook:true,pbr:false,originalTexture:texture?.name??null};
  configureCharacterExteriorStencil(material);bindCaveFogMaterial(scene,material);
  material.onBindObservable.add(mesh=>{
    const effect=readyShaderEffect(material._activeEffect??material.getEffect());if(!effect)return;
    BindBonesParameters(mesh,effect);BindFogParameters(scene,mesh,effect);bindCaveFogMaterial(scene,material,effect);
    effect.setFloat('paintExposure',characterStyleFor(mesh).brightness);
    effect.setFloat('paintOpacity',material.alpha*mesh.visibility);
    effect.setFloat('paintHitFlash',canInlineHitFlash(mesh)?mesh.overlayAlpha??0:0);
    effect.setFloat('paintHardwareSRGB',texture?.getInternalTexture?.()?._useSRGBBuffer?1:0);
    if(texture){effect.setTexture('paintSampler',texture);effect.setMatrix('paintMatrix',texture.getTextureMatrix());}
  });
  cache.set(source,material);return material;
}

export function applyMourningElenaLook(asset,actor,config){
  for(const mesh of asset.meshes){
    if(!mesh.getTotalVertices?.()||mesh.metadata?.moonforestOutline||!mesh.material)continue;
    if(!mesh.material.metadata?.mourningReferenceLook)mesh.material=paintMaterial(mesh.material,mesh.getScene());
    mesh.metadata={...mesh.metadata,characterStyleGroup:'mourning',mourningReferenceLook:true,elenaInlineFlash:true};
    // One scene-wide normal/depth pass, shared with existing NPCs. Getters keep
    // settings live; fading corpses lose internal ink at the same eased rate.
    if(mesh.name!=='Lament_Mouth_Interior'&&mesh.isVerticesDataPresent(VertexBuffer.NormalKind))registerNpcInteriorInk(mesh,{root:actor,height:config.height??3.2,baseScale:config.scale,look:{get interior(){return characterStyleFor(mesh).internal;},get interiorStrength(){return characterStyleFor(mesh).internalStrength*mesh.visibility;}}});
  }
}
