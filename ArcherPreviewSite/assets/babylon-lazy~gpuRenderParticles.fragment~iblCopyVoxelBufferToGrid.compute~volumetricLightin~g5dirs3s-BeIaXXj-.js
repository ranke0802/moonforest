import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{H as t,Ht as n,I as r,J as i,K as a,L as o,M as s,N as c,P as l,Q as u,U as d,V as f,X as p,Y as m,Z as h,a as g,at as _,bt as v,gn as y,gt as b,h as x,ht as S,i as C,it as w,tt as T,yt as E}from"./babylon-game-BceOPjJS.js";import{l as D}from"./babylon-tools~game~cinematic-interaction-Bk4IdV0B.js";var O=e({_HDRTextureLoader:()=>k}),k=class{constructor(){this.supportCascades=!1}loadCubeData(){throw`.hdr not supported in Cube.`}loadData(e,t,n){let r=new Uint8Array(e.buffer,e.byteOffset,e.byteLength),i=w(r),a=_(r,i),o=i.width*i.height,s=new Float32Array(o*4);for(let e=0;e<o;e+=1)s[e*4]=a[e*3],s[e*4+1]=a[e*3+1],s[e*4+2]=a[e*3+2],s[e*4+3]=1;n(i.width,i.height,t.generateMipMaps,!1,()=>{let e=t.getEngine();t.type=1,t.format=5,t._gammaSpace=!1,e._uploadDataToTextureDirectly(t,s)})}},A=e({gaussianSplattingPixelShader:()=>P}),j=`gaussianSplattingPixelShader`,M=`#include<clipPlaneFragmentDeclaration>
#include<logDepthDeclaration>
#include<fogFragmentDeclaration>
#define PREPASS_CUSTOM_VARYINGS
#include<prePassDeclaration>[SCENE_MRT_COUNT]
#if defined(GPUPICKER_DEPTH) && !defined(PREPASS)
layout(location=0) out highp vec4 glFragData[2];
#endif
#ifdef GPUPICKER_PACK_DEPTH
#include<packingFunctions>
#endif
varying vec4 vColor;varying vec2 vPosition;
#ifdef PREPASS
uniform float geometryZeroAlphaDiscard;
#ifdef PREPASS_POSITION
varying vec3 vGeometryPositionW;
#endif
#ifdef PREPASS_LOCAL_POSITION
varying vec3 vGeometryPositionL;
#endif
#ifdef PREPASS_DEPTH
varying float vGeometryViewDepth;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
varying float vGeometryNormalizedViewDepth;
#endif
#ifdef PREPASS_NORMAL
varying vec3 vGeometryNormalV;
#endif
#ifdef PREPASS_WORLD_NORMAL
varying vec3 vGeometryNormalW;
#endif
#if defined(PREPASS_ALBEDO) || defined(PREPASS_ALBEDO_SQRT)
varying vec3 vGeometryAlbedo;
#endif
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
varying vec4 vGeometryCurrentPosition;varying vec4 vGeometryPreviousPosition;
#endif
#endif
#define CUSTOM_FRAGMENT_DEFINITIONS
#include<gaussianSplattingFragmentDeclaration>
void main () {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
vec4 finalColor=gaussianColor(vColor);
#define CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR
#ifdef PREPASS
if (finalColor.a<=0.0 && geometryZeroAlphaDiscard>0.0) {discard;}
vec4 geometryColor=finalColor;
#if defined(PREPASS_ALBEDO) || defined(PREPASS_ALBEDO_SQRT)
vec3 geometryAlbedo=vGeometryAlbedo;
#endif
#ifdef PREPASS_POSITION
vec3 geometryPositionW=vGeometryPositionW;
#endif
#ifdef PREPASS_LOCAL_POSITION
vec3 geometryPositionL=vGeometryPositionL;
#endif
#ifdef PREPASS_DEPTH
float geometryViewDepth=vGeometryViewDepth;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
float geometryNormalizedViewDepth=vGeometryNormalizedViewDepth;
#endif
#ifdef PREPASS_NORMAL
vec3 geometryNormalV=vGeometryNormalV;
#endif
#ifdef PREPASS_WORLD_NORMAL
vec3 geometryNormalW=vGeometryNormalW;
#endif
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
vec4 geometryCurrentPosition=vGeometryCurrentPosition;vec4 geometryPreviousPosition=vGeometryPreviousPosition;
#endif
#include<geometryRenderingFragment>
#elif defined(GPUPICKER_DEPTH)
glFragData[0]=finalColor;
#ifdef GPUPICKER_PACK_DEPTH
glFragData[1]=pack(gl_FragCoord.z);
#else
glFragData[1]=vec4(gl_FragCoord.z,0.0,0.0,1.0);
#endif
#else
gl_FragColor=finalColor;
#endif
#define CUSTOM_FRAGMENT_MAIN_END
}
`;D.ShadersStore[j]||(D.ShadersStore[j]=M);var N=[v,a,d,c,s,y,t,f,x,E,g];for(let e of N)D.IncludesShadersStore[e.name]||(D.IncludesShadersStore[e.name]=e.shader);var P={name:j,shader:M},F=e({volumetricLightingBlendVolumePixelShader:()=>R}),I=`volumetricLightingBlendVolumePixelShader`,L=`varying vec2 vUV;uniform sampler2D textureSampler;uniform sampler2D depthSampler;uniform mat4 invProjection;uniform vec2 outputTextureSize;
#ifdef USE_EXTINCTION
uniform vec3 extinction;
#endif
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {gl_FragColor=texture2D(textureSampler,vUV);
#ifdef USE_EXTINCTION
float depth=texelFetch(depthSampler,ivec2(gl_FragCoord.xy),0).r;vec4 ndc=vec4((gl_FragCoord.xy/outputTextureSize)*2.-1.,depth*2.-1.,1.0);vec4 viewPos=invProjection*ndc;viewPos=viewPos/viewPos.w;float eyeDist=length(viewPos);gl_FragColor2=vec4(exp(-extinction*eyeDist),1.0);
#endif
}
`;D.ShadersStore[I]||(D.ShadersStore[I]=L);var R={name:I,shader:L},z=e({gpuRenderParticlesPixelShaderWGSL:()=>U}),B=`gpuRenderParticlesPixelShader`,V=`var diffuseSamplerSampler: sampler;var diffuseSampler: texture_2d<f32>;varying vUV: vec2f;varying vColor: vec4f;
#ifdef PREPASS
uniform geometryZeroAlphaDiscard: f32;
#ifdef PREPASS_POSITION
varying vGeometryPositionW: vec3f;
#endif
#ifdef PREPASS_WORLD_NORMAL
varying vGeometryNormalW: vec3f;
#endif
#ifdef PREPASS_NORMAL
varying vGeometryNormalV: vec3f;
#endif
#endif
#define PREPASS_VELOCITY_ZERO
#include<prePassDeclaration>[SCENE_MRT_COUNT]
#include<clipPlaneFragmentDeclaration>
#include<imageProcessingDeclaration>
#include<logDepthDeclaration>
#include<helperFunctions>
#include<imageProcessingFunctions>
#include<fogFragmentDeclaration>
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#include<clipPlaneFragment>
let textureColor: vec4f=textureSample(diffuseSampler,diffuseSamplerSampler,input.vUV);var baseColor: vec4f=textureColor*input.vColor;
#ifdef PREPASS
let geometryAlbedo: vec3f=toLinearSpaceVec3(baseColor.rgb);
#endif
#ifdef BLENDMULTIPLYMODE
let alpha: f32=input.vColor.a*textureColor.a;baseColor=vec4f(baseColor.rgb*alpha+vec3f(1.0)*(1.0-alpha),baseColor.a);
#endif
#include<logDepthFragment>
#include<fogFragment>(color,baseColor)
#ifdef IMAGEPROCESSINGPOSTPROCESS
baseColor=vec4f(toLinearSpaceVec3(baseColor.rgb),baseColor.a);
#else
#ifdef IMAGEPROCESSING
baseColor=vec4f(toLinearSpaceVec3(baseColor.rgb),baseColor.a);baseColor=applyImageProcessing(baseColor);
#endif
#endif
#ifdef PREPASS
let geometryColor: vec4f=baseColor;if (geometryColor.a<=0.0 && uniforms.geometryZeroAlphaDiscard>0.0) {discard;}
#ifdef PREPASS_POSITION
let geometryPositionW: vec3f=input.vGeometryPositionW;
#endif
#ifdef PREPASS_LOCAL_POSITION
let geometryPositionL: vec3f=input.vPosition;
#endif
#ifdef PREPASS_DEPTH
let geometryViewDepth: f32=input.vViewPos.z;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
let geometryNormalizedViewDepth: f32=input.vNormViewDepth;
#endif
#ifdef PREPASS_NORMAL
let geometryNormalV: vec3f=normalize(input.vGeometryNormalV);
#endif
#ifdef PREPASS_WORLD_NORMAL
let geometryNormalW: vec3f=normalize(input.vGeometryNormalW);
#endif
#include<geometryRenderingFragment>
#else
fragmentOutputs.color=baseColor;
#endif
}
`;D.ShadersStoreWGSL[B]||(D.ShadersStoreWGSL[B]=V);var H=[o,r,b,u,T,n,h,p,S,m,i,l,C];for(let e of H)D.IncludesShadersStoreWGSL[e.name]||(D.IncludesShadersStoreWGSL[e.name]=e.shader);var U={name:B,shader:V},W=e({iblCopyVoxelBufferToGridComputeShaderWGSL:()=>q}),G=`iblCopyVoxelBufferToGridComputeShader`,K=`@group(0) @binding(0) var<storage,read> voxelOpacityBuffer: array<u32>;@group(0) @binding(1) var voxelGridTarget: texture_storage_3d<r8unorm,write>;@compute @workgroup_size(4,4,4)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {let size: vec3<u32>=textureDimensions(voxelGridTarget);if (id.x>=size.x || id.y>=size.y || id.z>=size.z) {return;}
let res: u32=size.x;let vidx: u32=id.x+id.y*res+id.z*res*res;let word: u32=voxelOpacityBuffer[vidx>>2u];let byteVal: u32=(word>>((vidx & 3u)*8u)) & 0xFFu;let opacity: f32=f32(byteVal)/255.0;textureStore(voxelGridTarget,vec3<i32>(id),vec4f(opacity,0.0,0.0,1.0));}
`;D.ShadersStoreWGSL[G]||(D.ShadersStoreWGSL[G]=K);var q={name:G,shader:K},J=e({textureProcessorPixelShaderWGSL:()=>Z}),Y=`textureProcessorPixelShader`,X=`#ifdef OPERAND_A_TEXTURE
var textureASampler: sampler;var textureA: texture_2d<f32>;
#endif
#ifdef OPERAND_B_TEXTURE
var textureBSampler: sampler;var textureB: texture_2d<f32>;
#endif
#if defined(OP_LERP) && defined(LERP_T_TEXTURE)
var textureTSampler: sampler;var textureT: texture_2d<f32>;
#endif
#ifdef OPERAND_A_MATRIX
uniform textureAMatrix: mat4x4f;
#endif
#ifdef OPERAND_B_MATRIX
uniform textureBMatrix: mat4x4f;
#endif
#if defined(OP_LERP) && defined(LERP_T_MATRIX)
uniform textureTMatrix: mat4x4f;
#endif
#if !defined(OPERAND_A_TEXTURE) || defined(OPERAND_A_FACTOR)
uniform factorA: vec4f;
#endif
#if !defined(OPERAND_B_TEXTURE) || defined(OPERAND_B_FACTOR)
uniform factorB: vec4f;
#endif
#if defined(OP_LERP) && (!defined(LERP_T_TEXTURE) || defined(LERP_T_FACTOR))
uniform factorT: vec4f;
#endif
varying vUV: vec2f;@fragment
fn main(input: FragmentInputs)->FragmentOutputs {let uv: vec2f=input.vUV;
#ifdef OPERAND_A_TEXTURE
#ifdef OPERAND_A_MATRIX
var a: vec4f=textureSample(textureA,textureASampler,(uniforms.textureAMatrix*vec4f(uv,0.0,1.0)).xy);
#else
var a: vec4f=textureSample(textureA,textureASampler,uv);
#endif
#ifdef OPERAND_A_SRGB
a=vec4f(mix(a.rgb/vec3f(12.92),pow((a.rgb+vec3f(0.055))/vec3f(1.055),vec3f(2.4)),step(vec3f(0.04045),a.rgb)),a.a);
#endif
#ifdef OPERAND_A_CHANNEL_R
a=vec4f(a.rrr,a.a);
#elif defined(OPERAND_A_CHANNEL_G)
a=vec4f(a.ggg,a.a);
#elif defined(OPERAND_A_CHANNEL_B)
a=vec4f(a.bbb,a.a);
#elif defined(OPERAND_A_CHANNEL_A)
a=a.aaaa;
#endif
#ifdef OPERAND_A_FACTOR
a*=uniforms.factorA;
#endif
#else
let a: vec4f=uniforms.factorA;
#endif
#ifdef OPERAND_B_TEXTURE
#ifdef OPERAND_B_MATRIX
var b: vec4f=textureSample(textureB,textureBSampler,(uniforms.textureBMatrix*vec4f(uv,0.0,1.0)).xy);
#else
var b: vec4f=textureSample(textureB,textureBSampler,uv);
#endif
#ifdef OPERAND_B_SRGB
b=vec4f(mix(b.rgb/vec3f(12.92),pow((b.rgb+vec3f(0.055))/vec3f(1.055),vec3f(2.4)),step(vec3f(0.04045),b.rgb)),b.a);
#endif
#ifdef OPERAND_B_CHANNEL_R
b=vec4f(b.rrr,b.a);
#elif defined(OPERAND_B_CHANNEL_G)
b=vec4f(b.ggg,b.a);
#elif defined(OPERAND_B_CHANNEL_B)
b=vec4f(b.bbb,b.a);
#elif defined(OPERAND_B_CHANNEL_A)
b=b.aaaa;
#endif
#ifdef OPERAND_B_FACTOR
b*=uniforms.factorB;
#endif
#else
let b: vec4f=uniforms.factorB;
#endif
#ifdef OP_CHANNEL_MAX
var _cmax: f32=max(max(a.r,a.g),a.b);
#ifdef CHANNEL_MAX_INCLUDE_ALPHA
_cmax=max(_cmax,a.a);var result: vec4f=vec4f(_cmax,_cmax,_cmax,_cmax);
#else
var result: vec4f=vec4f(_cmax,_cmax,_cmax,a.a);
#endif
#elif defined(OP_INVERT)
var _ir: f32=a.r; var _ig: f32=a.g; var _ib: f32=a.b; var _ia: f32=a.a;
#ifdef INVERT_R
_ir=1.0-_ir;
#endif
#ifdef INVERT_G
_ig=1.0-_ig;
#endif
#ifdef INVERT_B
_ib=1.0-_ib;
#endif
#ifdef INVERT_A
_ia=1.0-_ia;
#endif
var result: vec4f=vec4f(_ir,_ig,_ib,_ia);
#elif defined(OP_LERP)
#ifdef LERP_T_TEXTURE
#ifdef LERP_T_MATRIX
var t: vec4f=textureSample(textureT,textureTSampler,(uniforms.textureTMatrix*vec4f(uv,0.0,1.0)).xy);
#else
var t: vec4f=textureSample(textureT,textureTSampler,uv);
#endif
#ifdef LERP_T_SRGB
t=vec4f(mix(t.rgb/vec3f(12.92),pow((t.rgb+vec3f(0.055))/vec3f(1.055),vec3f(2.4)),step(vec3f(0.04045),t.rgb)),t.a);
#endif
#ifdef LERP_T_CHANNEL_R
t=vec4f(t.rrr,t.a);
#elif defined(LERP_T_CHANNEL_G)
t=vec4f(t.ggg,t.a);
#elif defined(LERP_T_CHANNEL_B)
t=vec4f(t.bbb,t.a);
#elif defined(LERP_T_CHANNEL_A)
t=t.aaaa;
#endif
#ifdef LERP_T_FACTOR
t*=uniforms.factorT;
#endif
#else
let t: vec4f=uniforms.factorT;
#endif
var result: vec4f=mix(a,b,t);
#elif defined(OP_MAX)
var result: vec4f=max(a,b);
#else
var result: vec4f=a*b;
#endif
#if defined(OUTPUT_MASK_R_ZERO) || defined(OUTPUT_MASK_G_ZERO) || defined(OUTPUT_MASK_B_ZERO) || defined(OUTPUT_MASK_A_ONE)
var _omr: f32=result.r; var _omg: f32=result.g; var _omb: f32=result.b; var _oma: f32=result.a;
#ifdef OUTPUT_MASK_R_ZERO
_omr=0.0;
#endif
#ifdef OUTPUT_MASK_G_ZERO
_omg=0.0;
#endif
#ifdef OUTPUT_MASK_B_ZERO
_omb=0.0;
#endif
#ifdef OUTPUT_MASK_A_ONE
_oma=1.0;
#endif
result=vec4f(_omr,_omg,_omb,_oma);
#endif
#ifdef OUTPUT_SRGB
result=vec4f(mix(result.rgb*vec3f(12.92),pow(result.rgb,vec3f(1.0/2.4))*vec3f(1.055)-vec3f(0.055),step(vec3f(0.0031308),result.rgb)),result.a);
#endif
fragmentOutputs.color=result;}
`;D.ShadersStoreWGSL[Y]||(D.ShadersStoreWGSL[Y]=X);var Z={name:Y,shader:X};export{A as a,F as i,W as n,O as o,z as r,J as t};