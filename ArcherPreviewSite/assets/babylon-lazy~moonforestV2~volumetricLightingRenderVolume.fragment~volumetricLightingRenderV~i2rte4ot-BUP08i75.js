import{$i as e,Ci as t,Ea as n,Si as r,Xi as i,Xn as a,Zi as o,_i as s,jd as c,kr as l,nd as u,no as d,rd as f,ri as p,to as m,ua as h}from"./babylon-game-D7DEFyT0.js";import{t as g}from"./babylon-tools~moonforestV2~npc-world~developer-editor~developer-actors~cinematic-game~autho~hip21b71-D-XQlhUT.js";var _=`volumetricLightingRenderVolumePixelShader`,v=`#include<__decl__sceneFragment>
uniform mat4 invViewProjection;uniform vec3 lightDir; 
uniform vec2 outputTextureSize;uniform vec4 extinctionPhaseG;uniform vec3 lightPower;uniform vec2 textureRatio;uniform sampler2D depthTexture;varying vec4 vWorldPos;float henyeyGreenstein(float g,float cosTheta) {float denom=1.0+g*g-2.0*g*cosTheta;return 1.0/(4.0*3.14159265)*(1.0-g*g)/(denom*sqrt(max(denom,0.0)));}
vec3 integrateDirectional(float eyeDist,vec3 viewDir,vec3 lightDir) {float phaseG=extinctionPhaseG.w;
#ifdef USE_EXTINCTION
vec3 extinction=extinctionPhaseG.xyz;return henyeyGreenstein(phaseG,dot(viewDir,lightDir))*(vec3(1.0)-exp(-extinction*eyeDist))/extinction;
#else
return vec3(henyeyGreenstein(phaseG,dot(viewDir,lightDir)))*vec3(eyeDist);
#endif
}
void main(void) {float depth=texelFetch(depthTexture,ivec2(gl_FragCoord.xy*textureRatio),0).r;vec4 worldPos=vWorldPos;if (gl_FragCoord.z>depth) {vec4 ndc=vec4((gl_FragCoord.xy/outputTextureSize)*2.0-1.0,depth*2.0-1.0,1.0);worldPos=invViewProjection*ndc;worldPos=worldPos/worldPos.w;}
vec3 viewDir=worldPos.xyz-vEyePosition.xyz;float eyeDist=length(viewDir);viewDir=viewDir/eyeDist;float fSign=gl_FrontFacing ? 1.0 : -1.0;vec3 integral=integrateDirectional(eyeDist,-viewDir,lightDir);gl_FragColor=vec4(lightPower*integral*fSign,1.0);}
`;g.ShadersStore[_]||(g.ShadersStore[_]=v);var y=[p,n];for(let e of y)g.IncludesShadersStore[e.name]||(g.IncludesShadersStore[e.name]=e.shader);var b={name:_,shader:v},x=`gaussianSplattingPixelShader`,S=`#include<clipPlaneFragmentDeclaration>
#include<logDepthDeclaration>
#include<fogFragmentDeclaration>
#define PREPASS_CUSTOM_VARYINGS
#include<prePassDeclaration>[SCENE_MRT_COUNT]
#ifdef GPUPICKER_PACK_DEPTH
#include<packingFunctions>
#endif
varying vColor: vec4f;varying vPosition: vec2f;
#ifdef PREPASS
uniform geometryZeroAlphaDiscard: f32;
#ifdef PREPASS_POSITION
varying vGeometryPositionW: vec3f;
#endif
#ifdef PREPASS_LOCAL_POSITION
varying vGeometryPositionL: vec3f;
#endif
#ifdef PREPASS_DEPTH
varying vGeometryViewDepth: f32;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
varying vGeometryNormalizedViewDepth: f32;
#endif
#ifdef PREPASS_NORMAL
varying vGeometryNormalV: vec3f;
#endif
#ifdef PREPASS_WORLD_NORMAL
varying vGeometryNormalW: vec3f;
#endif
#if defined(PREPASS_ALBEDO) || defined(PREPASS_ALBEDO_SQRT)
varying vGeometryAlbedo: vec3f;
#endif
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
varying vGeometryCurrentPosition: vec4f;varying vGeometryPreviousPosition: vec4f;
#endif
#endif
#define CUSTOM_FRAGMENT_DEFINITIONS
#include<gaussianSplattingFragmentDeclaration>
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
var finalColor: vec4f=gaussianColor(input.vColor,input.vPosition);
#define CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR
#ifdef PREPASS
if (finalColor.a<=0.0 && uniforms.geometryZeroAlphaDiscard>0.0) {discard;}
let geometryColor=finalColor;
#if defined(PREPASS_ALBEDO) || defined(PREPASS_ALBEDO_SQRT)
let geometryAlbedo=input.vGeometryAlbedo;
#endif
#ifdef PREPASS_POSITION
let geometryPositionW=input.vGeometryPositionW;
#endif
#ifdef PREPASS_LOCAL_POSITION
let geometryPositionL=input.vGeometryPositionL;
#endif
#ifdef PREPASS_DEPTH
let geometryViewDepth=input.vGeometryViewDepth;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
let geometryNormalizedViewDepth=input.vGeometryNormalizedViewDepth;
#endif
#ifdef PREPASS_NORMAL
let geometryNormalV=input.vGeometryNormalV;
#endif
#ifdef PREPASS_WORLD_NORMAL
let geometryNormalW=input.vGeometryNormalW;
#endif
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
let geometryCurrentPosition=input.vGeometryCurrentPosition;let geometryPreviousPosition=input.vGeometryPreviousPosition;
#endif
#include<geometryRenderingFragment>
#elif defined(GPUPICKER_DEPTH)
fragmentOutputs.fragData0=finalColor;
#ifdef GPUPICKER_PACK_DEPTH
fragmentOutputs.fragData1=pack(fragmentInputs.position.z);
#else
fragmentOutputs.fragData1=vec4f(fragmentInputs.position.z,0.0,0.0,1.0);
#endif
#else
fragmentOutputs.color=finalColor;
#endif
#define CUSTOM_FRAGMENT_MAIN_END
}
`;g.ShadersStoreWGSL[x]||(g.ShadersStoreWGSL[x]=S);var C=[d,h,e,t,r,c,o,i,l,m,s,a];for(let e of C)g.IncludesShadersStoreWGSL[e.name]||(g.IncludesShadersStoreWGSL[e.name]=e.shader);var w={name:x,shader:S},T=`volumetricLightingRenderVolumePixelShader`,E=`#include<sceneUboDeclaration>
#include<meshUboDeclaration>
uniform invViewProjection: mat4x4<f32>;uniform lightDir: vec3f; 
uniform outputTextureSize: vec2f;uniform extinctionPhaseG: vec4f;uniform lightPower: vec3f;uniform textureRatio: vec2f;var depthTexture: texture_2d<f32>;varying vWorldPos: vec4f;fn henyeyGreenstein(g: f32,cosTheta: f32)->f32 {let denom=1+g*g-2*g*cosTheta;return 1.0/(4.0*3.14159265)*(1.0-g*g)/(denom*sqrt(max(denom,0.0)));}
fn integrateDirectional(eyeDist: f32,viewDir: vec3f,lightDir: vec3f)->vec3f {let phaseG=uniforms.extinctionPhaseG.w;
#ifdef USE_EXTINCTION
let extinction=uniforms.extinctionPhaseG.xyz;return henyeyGreenstein(phaseG,dot(viewDir,lightDir))*(vec3f(1.0)-exp(-extinction*eyeDist))/extinction;
#else
return vec3f(henyeyGreenstein(phaseG,dot(viewDir,lightDir)))*vec3f(eyeDist);
#endif
}
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {let depth=textureLoad(depthTexture,vec2u(fragmentInputs.position.xy*uniforms.textureRatio),0).r;var worldPos=fragmentInputs.vWorldPos;if (fragmentInputs.position.z>depth) {let ndc=vec4f((fragmentInputs.position.xy/uniforms.outputTextureSize)*2.-1.,depth,1.0);worldPos=uniforms.invViewProjection*ndc;worldPos=worldPos/worldPos.w;}
var viewDir=worldPos.xyz-scene.vEyePosition.xyz;let eyeDist=length(viewDir);viewDir=viewDir/eyeDist;let fSign=select(-1.0,1.0,fragmentInputs.frontFacing);let integral=integrateDirectional(eyeDist,-viewDir,uniforms.lightDir);fragmentOutputs.color=vec4f(uniforms.lightPower*integral*fSign,1.0);}
`;g.ShadersStoreWGSL[T]||(g.ShadersStoreWGSL[T]=E);var D=[u,f];for(let e of D)g.IncludesShadersStoreWGSL[e.name]||(g.IncludesShadersStoreWGSL[e.name]=e.shader);var O={name:T,shader:E};export{w as n,b as r,O as t};