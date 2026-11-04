import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{$ as t,et as n,gt as r,ht as i,mt as a,nt as o,pt as s,tt as c}from"./babylon-game-CRNdG57U.js";import{l}from"./babylon-tools~game~cinematic-interaction-Bk4IdV0B.js";var u=e({textureProcessorPixelShader:()=>p}),d=`textureProcessorPixelShader`,f=`#ifdef OPERAND_A_TEXTURE
uniform sampler2D textureA;
#endif
#ifdef OPERAND_B_TEXTURE
uniform sampler2D textureB;
#endif
#if defined(OP_LERP) && defined(LERP_T_TEXTURE)
uniform sampler2D textureT;
#endif
#ifdef OPERAND_A_MATRIX
uniform mat4 textureAMatrix;
#endif
#ifdef OPERAND_B_MATRIX
uniform mat4 textureBMatrix;
#endif
#if defined(OP_LERP) && defined(LERP_T_MATRIX)
uniform mat4 textureTMatrix;
#endif
#if !defined(OPERAND_A_TEXTURE) || defined(OPERAND_A_FACTOR)
uniform vec4 factorA;
#endif
#if !defined(OPERAND_B_TEXTURE) || defined(OPERAND_B_FACTOR)
uniform vec4 factorB;
#endif
#if defined(OP_LERP) && (!defined(LERP_T_TEXTURE) || defined(LERP_T_FACTOR))
uniform vec4 factorT;
#endif
varying vec2 vUV;void main() {vec2 uv=vUV;
#ifdef OPERAND_A_TEXTURE
#ifdef OPERAND_A_MATRIX
vec4 a=texture2D(textureA,(textureAMatrix*vec4(uv,0.0,1.0)).xy);
#else
vec4 a=texture2D(textureA,uv);
#endif
#ifdef OPERAND_A_SRGB
a.rgb=mix(a.rgb/12.92,pow((a.rgb+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),a.rgb));
#endif
#ifdef OPERAND_A_CHANNEL_R
a=vec4(a.rrr,a.a);
#elif defined(OPERAND_A_CHANNEL_G)
a=vec4(a.ggg,a.a);
#elif defined(OPERAND_A_CHANNEL_B)
a=vec4(a.bbb,a.a);
#elif defined(OPERAND_A_CHANNEL_A)
a=a.aaaa;
#endif
#ifdef OPERAND_A_FACTOR
a*=factorA;
#endif
#else
vec4 a=factorA;
#endif
#ifdef OPERAND_B_TEXTURE
#ifdef OPERAND_B_MATRIX
vec4 b=texture2D(textureB,(textureBMatrix*vec4(uv,0.0,1.0)).xy);
#else
vec4 b=texture2D(textureB,uv);
#endif
#ifdef OPERAND_B_SRGB
b.rgb=mix(b.rgb/12.92,pow((b.rgb+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),b.rgb));
#endif
#ifdef OPERAND_B_CHANNEL_R
b=vec4(b.rrr,b.a);
#elif defined(OPERAND_B_CHANNEL_G)
b=vec4(b.ggg,b.a);
#elif defined(OPERAND_B_CHANNEL_B)
b=vec4(b.bbb,b.a);
#elif defined(OPERAND_B_CHANNEL_A)
b=b.aaaa;
#endif
#ifdef OPERAND_B_FACTOR
b*=factorB;
#endif
#else
vec4 b=factorB;
#endif
#ifdef OP_CHANNEL_MAX
float _cmax=max(max(a.r,a.g),a.b);
#ifdef CHANNEL_MAX_INCLUDE_ALPHA
_cmax=max(_cmax,a.a);vec4 result=vec4(_cmax,_cmax,_cmax,_cmax);
#else
vec4 result=vec4(_cmax,_cmax,_cmax,a.a);
#endif
#elif defined(OP_INVERT)
float _ir=a.r; float _ig=a.g; float _ib=a.b; float _ia=a.a;
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
vec4 result=vec4(_ir,_ig,_ib,_ia);
#elif defined(OP_LERP)
#ifdef LERP_T_TEXTURE
#ifdef LERP_T_MATRIX
vec4 t=texture2D(textureT,(textureTMatrix*vec4(uv,0.0,1.0)).xy);
#else
vec4 t=texture2D(textureT,uv);
#endif
#ifdef LERP_T_SRGB
t.rgb=mix(t.rgb/12.92,pow((t.rgb+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),t.rgb));
#endif
#ifdef LERP_T_CHANNEL_R
t=vec4(t.rrr,t.a);
#elif defined(LERP_T_CHANNEL_G)
t=vec4(t.ggg,t.a);
#elif defined(LERP_T_CHANNEL_B)
t=vec4(t.bbb,t.a);
#elif defined(LERP_T_CHANNEL_A)
t=t.aaaa;
#endif
#ifdef LERP_T_FACTOR
t*=factorT;
#endif
#else
vec4 t=factorT;
#endif
vec4 result=mix(a,b,t);
#elif defined(OP_MAX)
vec4 result=max(a,b);
#else
vec4 result=a*b;
#endif
#ifdef OUTPUT_MASK_R_ZERO
result.r=0.0;
#endif
#ifdef OUTPUT_MASK_G_ZERO
result.g=0.0;
#endif
#ifdef OUTPUT_MASK_B_ZERO
result.b=0.0;
#endif
#ifdef OUTPUT_MASK_A_ONE
result.a=1.0;
#endif
#ifdef OUTPUT_SRGB
result.rgb=mix(result.rgb*12.92,pow(result.rgb,vec3(1.0/2.4))*1.055-0.055,step(vec3(0.0031308),result.rgb));
#endif
gl_FragColor=result;}
`;l.ShadersStore[d]||(l.ShadersStore[d]=f);var p={name:d,shader:f},m=e({gpuRenderParticlesVertexShaderWGSL:()=>v}),h=`gpuRenderParticlesVertexShader`,g=`uniform view: mat4x4f;uniform projection: mat4x4f;uniform translationPivot: vec2f;uniform worldOffset: vec3f;
#ifdef LOCAL
uniform emitterWM: mat4x4f;
#endif
#ifdef PREPASS
uniform cameraInfo: vec2f;
#ifdef LOCAL
uniform inverseEmitterWM: mat4x4f;
#endif
#ifdef PREPASS_POSITION
varying vGeometryPositionW: vec3f;
#endif
#ifdef PREPASS_WORLD_NORMAL
varying vGeometryNormalW: vec3f;
#endif
#ifdef PREPASS_NORMAL
varying vGeometryNormalV: vec3f;
#endif
#ifdef PREPASS_LOCAL_POSITION
varying vPosition: vec3f;
#endif
#ifdef PREPASS_DEPTH
varying vViewPos: vec3f;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
varying vNormViewDepth: f32;
#endif
#endif
attribute position: vec3f;attribute age: f32;attribute life: f32;attribute size: vec3f;
#if !defined(BILLBOARD) || defined(BILLBOARDSTRETCHED_LOCAL)
attribute initialDirection: vec3f;
#endif
#ifdef BILLBOARDSTRETCHED
attribute direction: vec3f;
#endif
attribute angle: f32;
#ifdef ANIMATESHEET
attribute cellIndex: f32;
#endif
attribute offset: vec2f;attribute uv: vec2f;varying vUV: vec2f;varying vColor: vec4f;varying vPositionW: vec3f;
#if defined(BILLBOARD) && !defined(BILLBOARDY) && !defined(BILLBOARDSTRETCHED)
uniform invView: mat4x4f;
#endif
#include<clipPlaneVertexDeclaration>
#include<fogVertexDeclaration>
#include<logDepthDeclaration>
#ifdef COLORGRADIENTS
var colorGradientSamplerSampler: sampler;var colorGradientSampler: texture_2d<f32>;
#ifdef COLORGRADIENTS_COLOR2
attribute seed: vec4f;
#endif
#else
uniform colorDead: vec4f;attribute color: vec4f;
#endif
#ifdef ANIMATESHEET
uniform sheetInfos: vec3f;
#endif
#ifdef BILLBOARD
uniform eyePosition: vec3f;
#endif
fn particleBasePosition()->vec3f {
#ifdef LOCAL
return (uniforms.emitterWM*vec4f(vertexInputs.position,1.0)).xyz+uniforms.worldOffset;
#else
return vertexInputs.position+uniforms.worldOffset;
#endif
}
fn rotate(yaxis: vec3f,rotatedCorner: vec3f)->vec3f {let xaxis: vec3f=normalize(cross(vec3f(0.0,1.0,0.0),yaxis));let zaxis: vec3f=normalize(cross(yaxis,xaxis));let rotMatrix: mat3x3f=mat3x3f(xaxis,yaxis,zaxis);return particleBasePosition()+rotMatrix*rotatedCorner;}
#ifdef BILLBOARDSTRETCHED
fn rotateAlign(toCamera: vec3f,rotatedCorner: vec3f)->vec3f {
#ifdef BILLBOARDSTRETCHED_LOCAL
let stretchDirection: vec3f=vertexInputs.initialDirection;
#else
let stretchDirection: vec3f=vertexInputs.direction;
#endif
let normalizedToCamera: vec3f=normalize(toCamera);let normalizedCrossDirToCamera: vec3f=normalize(cross(normalize(stretchDirection),normalizedToCamera));
#ifdef BILLBOARDSTRETCHED_LOCAL
let row1: vec3f=normalize(stretchDirection);
#else
let row1: vec3f=normalize(cross(normalizedToCamera,normalizedCrossDirToCamera));
#endif
let rotMatrix: mat3x3f=mat3x3f(normalizedCrossDirToCamera,row1,normalizedToCamera);return particleBasePosition()+rotMatrix*rotatedCorner;}
fn stretchedNormal(toCamera: vec3f,stretchDirection: vec3f)->vec3f {let normalizedToCamera: vec3f=normalize(toCamera);let normalizedCrossDirToCamera: vec3f=normalize(cross(normalize(stretchDirection),normalizedToCamera));
#ifdef BILLBOARDSTRETCHED_LOCAL
let row1: vec3f=normalize(stretchDirection);
#else
let row1: vec3f=normalize(cross(normalizedToCamera,normalizedCrossDirToCamera));
#endif
return normalize(cross(normalizedCrossDirToCamera,row1));}
#endif
@vertex
fn main(input: VertexInputs)->FragmentInputs {
#ifdef PREPASS
var geometryNormalW: vec3f;
#endif
#ifdef EMITRATECTRL
let shouldCullParticle: bool=vertexInputs.life>0.0 && vertexInputs.age>=vertexInputs.life;
#endif
#ifdef ANIMATESHEET
let rowOffset: f32=floor(vertexInputs.cellIndex/uniforms.sheetInfos.z);let columnOffset: f32=vertexInputs.cellIndex-rowOffset*uniforms.sheetInfos.z;let uvScale: vec2f=uniforms.sheetInfos.xy;let uvOffset: vec2f=vec2f(vertexInputs.uv.x,1.0-vertexInputs.uv.y);vertexOutputs.vUV=(uvOffset+vec2f(columnOffset,rowOffset))*uvScale;
#else
vertexOutputs.vUV=vertexInputs.uv;
#endif
let ratio: f32=min(1.0,vertexInputs.age/vertexInputs.life);
#ifdef COLORGRADIENTS
#ifdef COLORGRADIENTS_COLOR2
let vColor1: vec4f=textureSampleLevel(colorGradientSampler,colorGradientSamplerSampler,vec2f(ratio,0.25),0.0);let vColor2: vec4f=textureSampleLevel(colorGradientSampler,colorGradientSamplerSampler,vec2f(ratio,0.75),0.0);vertexOutputs.vColor=mix(vColor1,vColor2,vertexInputs.seed.x);
#else
vertexOutputs.vColor=textureSampleLevel(colorGradientSampler,colorGradientSamplerSampler,vec2f(ratio,0.0),0.0);
#endif
#else
vertexOutputs.vColor=vertexInputs.color*vec4f(1.0-ratio)+uniforms.colorDead*vec4f(ratio);
#endif
let cornerPos: vec2f=(vertexInputs.offset-uniforms.translationPivot)*vertexInputs.size.yz*vertexInputs.size.x;
#ifdef BILLBOARD
var rotatedCorner: vec4f;rotatedCorner.w=0.0;
#ifdef BILLBOARDY
rotatedCorner.x=cornerPos.x*cos(vertexInputs.angle)-cornerPos.y*sin(vertexInputs.angle);rotatedCorner.z=cornerPos.x*sin(vertexInputs.angle)+cornerPos.y*cos(vertexInputs.angle);rotatedCorner.y=0.0;rotatedCorner.x+=uniforms.translationPivot.x;rotatedCorner.z+=uniforms.translationPivot.y;var yaxis: vec3f=vertexInputs.position+uniforms.worldOffset-uniforms.eyePosition;yaxis.y=0.0;vertexOutputs.vPositionW=rotate(normalize(yaxis),rotatedCorner.xyz);
#ifdef PREPASS
geometryNormalW=normalize(yaxis);
#endif
let viewPosition: vec4f=uniforms.view*vec4f(vertexOutputs.vPositionW,1.0);
#elif defined(BILLBOARDSTRETCHED)
rotatedCorner.x=cornerPos.x*cos(vertexInputs.angle)-cornerPos.y*sin(vertexInputs.angle);rotatedCorner.y=cornerPos.x*sin(vertexInputs.angle)+cornerPos.y*cos(vertexInputs.angle);rotatedCorner.z=0.0;rotatedCorner.x+=uniforms.translationPivot.x;rotatedCorner.y+=uniforms.translationPivot.y;let toCamera: vec3f=vertexInputs.position+uniforms.worldOffset-uniforms.eyePosition;vertexOutputs.vPositionW=rotateAlign(toCamera,rotatedCorner.xyz);
#ifdef PREPASS
#ifdef BILLBOARDSTRETCHED_LOCAL
geometryNormalW=stretchedNormal(toCamera,vertexInputs.initialDirection);
#else
geometryNormalW=stretchedNormal(toCamera,vertexInputs.direction);
#endif
#endif
let viewPosition: vec4f=uniforms.view*vec4f(vertexOutputs.vPositionW,1.0);
#else
rotatedCorner.x=cornerPos.x*cos(vertexInputs.angle)-cornerPos.y*sin(vertexInputs.angle);rotatedCorner.y=cornerPos.x*sin(vertexInputs.angle)+cornerPos.y*cos(vertexInputs.angle);rotatedCorner.z=0.0;rotatedCorner.x+=uniforms.translationPivot.x;rotatedCorner.y+=uniforms.translationPivot.y;let viewPosition: vec4f=uniforms.view*vec4f(particleBasePosition(),1.0)+rotatedCorner;vertexOutputs.vPositionW=(uniforms.invView*viewPosition).xyz;
#ifdef PREPASS
geometryNormalW=normalize((uniforms.invView*vec4f(0.0,0.0,1.0,0.0)).xyz);
#endif
#endif
#else
var rotatedCorner: vec3f;rotatedCorner.x=cornerPos.x*cos(vertexInputs.angle)-cornerPos.y*sin(vertexInputs.angle);rotatedCorner.y=0.0;rotatedCorner.z=cornerPos.x*sin(vertexInputs.angle)+cornerPos.y*cos(vertexInputs.angle);rotatedCorner.x+=uniforms.translationPivot.x;rotatedCorner.z+=uniforms.translationPivot.y;let yaxis: vec3f=normalize(vertexInputs.initialDirection);vertexOutputs.vPositionW=rotate(yaxis,rotatedCorner);
#ifdef PREPASS
geometryNormalW=yaxis;
#endif
let viewPosition: vec4f=uniforms.view*vec4f(vertexOutputs.vPositionW,1.0);
#endif
vertexOutputs.position=uniforms.projection*viewPosition;
#if defined(CLIPPLANE) || defined(CLIPPLANE2) || defined(CLIPPLANE3) || defined(CLIPPLANE4) || defined(CLIPPLANE5) || defined(CLIPPLANE6) || defined(FOG)
let worldPos: vec4f=vec4f(vertexOutputs.vPositionW,1.0);
#endif
#include<clipPlaneVertex>
#include<fogVertex>
#include<logDepthVertex>
#ifdef PREPASS
let geometryViewPosition: vec4f=uniforms.view*vec4f(vertexOutputs.vPositionW,1.0);
#if defined(PREPASS_NORMAL) || defined(PREPASS_WORLD_NORMAL)
var geometryNormalV=normalize((uniforms.view*vec4f(geometryNormalW,0.0)).xyz);let geometryViewDirection=select(vec3f(0.0,0.0,geometryViewPosition.z),geometryViewPosition.xyz,uniforms.projection[3][3]==0.0);if (dot(geometryNormalV,geometryViewDirection)>0.0) {geometryNormalV=-geometryNormalV;geometryNormalW=-geometryNormalW;}
#endif
#ifdef PREPASS_POSITION
vertexOutputs.vGeometryPositionW=vertexOutputs.vPositionW;
#endif
#ifdef PREPASS_WORLD_NORMAL
vertexOutputs.vGeometryNormalW=normalize(geometryNormalW);
#endif
#ifdef PREPASS_NORMAL
vertexOutputs.vGeometryNormalV=geometryNormalV;
#endif
#ifdef PREPASS_LOCAL_POSITION
#ifdef LOCAL
var geometryRenderPosition=vertexOutputs.vPositionW;
#if defined(BILLBOARD) && !defined(BILLBOARDY) && !defined(BILLBOARDSTRETCHED)
geometryRenderPosition=particleBasePosition()+(uniforms.invView*vec4f(rotatedCorner.xyz,0.0)).xyz;
#endif
vertexOutputs.vPosition=(uniforms.inverseEmitterWM*vec4f(geometryRenderPosition-uniforms.worldOffset,1.0)).xyz;
#else
vertexOutputs.vPosition=vertexOutputs.vPositionW;
#endif
#endif
#ifdef PREPASS_DEPTH
vertexOutputs.vViewPos=geometryViewPosition.xyz;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
vertexOutputs.vNormViewDepth=(geometryViewPosition.z-uniforms.cameraInfo.x)/(uniforms.cameraInfo.y-uniforms.cameraInfo.x);
#endif
#endif
#ifdef EMITRATECTRL
if (shouldCullParticle) {vertexOutputs.position=vec4f(0.0,0.0,2.0,1.0);vertexOutputs.vColor=vec4f(0.0);vertexOutputs.vUV=vec2f(0.0);vertexOutputs.vPositionW=vec3f(0.0);
#ifdef PREPASS
#ifdef PREPASS_POSITION
vertexOutputs.vGeometryPositionW=vec3f(0.0);
#endif
#ifdef PREPASS_WORLD_NORMAL
vertexOutputs.vGeometryNormalW=vec3f(0.0);
#endif
#ifdef PREPASS_NORMAL
vertexOutputs.vGeometryNormalV=vec3f(0.0);
#endif
#endif
}
#endif
}
`;l.ShadersStoreWGSL[h]||(l.ShadersStoreWGSL[h]=g);var _=[a,o,c,s,n,t];for(let e of _)l.IncludesShadersStoreWGSL[e.name]||(l.IncludesShadersStoreWGSL[e.name]=e.shader);var v={name:h,shader:g},y=e({noisePixelShaderWGSL:()=>S}),b=`noisePixelShader`,x=`uniform brightness: f32;uniform persistence: f32;uniform timeScale: f32;varying vUV: vec2f;fn hash22(input: vec2f)->vec2f {var p=vec2f(dot(input,vec2f(127.1,311.7)),dot(input,vec2f(269.5,183.3)));p=-vec2f(1.0)+2.0*fract(sin(p)*43758.5453123);return sin(p*6.283+uniforms.timeScale);}
fn interpolationNoise(p: vec2f)->f32 {let pi=floor(p);let pf=p-pi;let w=pf*pf*(vec2f(3.0)-2.0*pf);let f00=dot(hash22(pi+vec2f(0.0,0.0)),pf-vec2f(0.0,0.0));let f01=dot(hash22(pi+vec2f(0.0,1.0)),pf-vec2f(0.0,1.0));let f10=dot(hash22(pi+vec2f(1.0,0.0)),pf-vec2f(1.0,0.0));let f11=dot(hash22(pi+vec2f(1.0,1.0)),pf-vec2f(1.0,1.0));let xm1=mix(f00,f10,w.x);let xm2=mix(f01,f11,w.x);return mix(xm1,xm2,w.y);}
fn perlinNoise2D(x: f32,y: f32)->f32 {var sum=0.0;var frequency=0.0;var amplitude=0.0;for (var i=0; i<OCTAVES; i++) {frequency=pow(2.0,f32(i));amplitude=pow(uniforms.persistence,f32(i));sum=sum+interpolationNoise(vec2f(x*frequency,y*frequency))*amplitude;}
return sum;}
#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {let x=abs(input.vUV.x);let y=abs(input.vUV.y);let noise=uniforms.brightness+(1.0-uniforms.brightness)*perlinNoise2D(x,y);fragmentOutputs.color=vec4f(noise,noise,noise,1.0);}
`;l.ShadersStoreWGSL[b]||(l.ShadersStoreWGSL[b]=x);var S={name:b,shader:x},C=e({selectionPixelShaderWGSL:()=>D}),w=`selectionPixelShader`,T=`#ifdef INSTANCES
flat varying vSelectionId: f32;
#else
uniform selectionId: f32;
#endif
#ifdef STORE_CAMERASPACE_Z
varying vViewPosZ: f32;
#else
varying vDepthMetric: f32;
#endif
#ifdef ALPHATEST
varying vUV: vec2f;var diffuseSamplerSampler: sampler;var diffuseSampler: texture_2d<f32>;
#endif
#include<clipPlaneFragmentDeclaration>
#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
#ifdef ALPHATEST
if (textureSample(diffuseSampler,diffuseSamplerSampler,fragmentInputs.vUV).a<0.4) {discard;}
#endif
#ifdef INSTANCES
var id: f32=fragmentInputs.vSelectionId;
#else
var id: f32=uniforms.selectionId;
#endif
#ifdef STORE_CAMERASPACE_Z
fragmentOutputs.color=vec4(id,fragmentInputs.vViewPosZ,0.0,1.0);
#else
fragmentOutputs.color=vec4(id,fragmentInputs.vDepthMetric,0.0,1.0);
#endif
#define CUSTOM_FRAGMENT_MAIN_END
}
`;l.ShadersStoreWGSL[w]||(l.ShadersStoreWGSL[w]=T);var E=[r,i];for(let e of E)l.IncludesShadersStoreWGSL[e.name]||(l.IncludesShadersStoreWGSL[e.name]=e.shader);var D={name:w,shader:T};export{u as i,y as n,m as r,C as t};