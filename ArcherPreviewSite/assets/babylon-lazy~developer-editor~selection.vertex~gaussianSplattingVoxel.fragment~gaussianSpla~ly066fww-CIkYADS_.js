import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{$t as t,Qt as n,Xt as r,Yt as i,Zt as a,en as o,in as s,mt as c,nn as l,pt as u,r as d,rn as f,tn as p}from"./babylon-game-BceOPjJS.js";import{l as m}from"./babylon-tools~game~cinematic-interaction-Bk4IdV0B.js";var h=e({gaussianSplattingVoxelPixelShader:()=>v}),g=`gaussianSplattingVoxelPixelShader`,_=`precision highp float;layout(location=0) out highp float glFragData[MAX_DRAW_BUFFERS];varying vec3 vNormalizedPosition;varying vec3 vNormalizedCenterPosition;varying float vAlpha;varying vec2 vPatchPosition;uniform float nearPlane;uniform float farPlane;uniform float stepSize;float max3(vec3 v) { return max(max(v.x,v.y),v.z); }
void main(void) {vec3 normPos=vNormalizedPosition.xyz;if (normPos.z<nearPlane || normPos.z>farPlane) {discard;}
float distToCenter=max3(abs(vNormalizedCenterPosition-normPos));float shadowingOpacity=clamp((distToCenter<stepSize ? 1.0 : exp(-dot(vPatchPosition,vPatchPosition)))*vAlpha,0.0,1.0);if (shadowingOpacity<=0.0) {discard;}
glFragData[0]=normPos.z<nearPlane+stepSize ? shadowingOpacity : 0.0;glFragData[1]=normPos.z>=nearPlane+stepSize && normPos.z<nearPlane+2.0*stepSize ? shadowingOpacity : 0.0;glFragData[2]=normPos.z>=nearPlane+2.0*stepSize && normPos.z<nearPlane+3.0*stepSize ? shadowingOpacity : 0.0;glFragData[3]=normPos.z>=nearPlane+3.0*stepSize && normPos.z<nearPlane+4.0*stepSize ? shadowingOpacity : 0.0;
#if MAX_DRAW_BUFFERS>4
glFragData[4]=normPos.z>=nearPlane+4.0*stepSize && normPos.z<nearPlane+5.0*stepSize ? shadowingOpacity : 0.0;glFragData[5]=normPos.z>=nearPlane+5.0*stepSize && normPos.z<nearPlane+6.0*stepSize ? shadowingOpacity : 0.0;
#if MAX_DRAW_BUFFERS>6
glFragData[6]=normPos.z>=nearPlane+6.0*stepSize && normPos.z<nearPlane+7.0*stepSize ? shadowingOpacity : 0.0;glFragData[7]=normPos.z>=nearPlane+7.0*stepSize && normPos.z<nearPlane+8.0*stepSize ? shadowingOpacity : 0.0;
#endif
#endif
}`;m.ShadersStore[g]||(m.ShadersStore[g]=_);var v={name:g,shader:_},y=e({gaussianSplattingVoxelPixelShaderWGSL:()=>C}),b=`gaussianSplattingVoxelPixelShader`,x=`var voxel_storage: texture_storage_3d<r8unorm,write>;var<storage,read_write> voxelOpacityBuffer: array<atomic<u32>>;
#include<iblVoxelOpacityAtomicMax>
varying vNormalizedPosition: vec3f;varying vNormalizedCenterPosition: vec3f;varying vAlpha: f32;varying vPatchPosition: vec2f;@fragment
fn main(input: FragmentInputs)->FragmentOutputs {let normPos: vec3f=input.vNormalizedPosition;let size: vec3<u32>=textureDimensions(voxel_storage);let stepSize: f32=1.0/f32(size.x);let diff: vec3f=abs(input.vNormalizedCenterPosition-normPos);let distToCenter: f32=max(max(diff.x,diff.y),diff.z);let gaussian: f32=exp(-dot(input.vPatchPosition,input.vPatchPosition));let shadowingOpacity: f32=clamp(
select(gaussian,1.0,distToCenter<stepSize)*input.vAlpha,
0.0,1.0
);if (shadowingOpacity<=0.0) {discard;}
let coord: vec3<u32>=min(
vec3<u32>(u32(normPos.x*f32(size.x)),u32(normPos.y*f32(size.y)),u32(normPos.z*f32(size.z))),
size-vec3<u32>(1u));let vidx: u32=coord.x+coord.y*size.x+coord.z*size.x*size.y;voxelOpacityAtomicMax(vidx,u32(shadowingOpacity*255.0+0.5));fragmentOutputs.color=vec4f(0.0,0.0,0.0,0.0);}
`;m.ShadersStoreWGSL[b]||(m.ShadersStoreWGSL[b]=x);var S=[d];for(let e of S)m.IncludesShadersStoreWGSL[e.name]||(m.IncludesShadersStoreWGSL[e.name]=e.shader);var C={name:b,shader:x},w=e({selectionVertexShaderWGSL:()=>O}),T=`selectionVertexShader`,E=`attribute position: vec3f;
#ifdef INSTANCES
attribute instanceSelectionId: f32;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<clipPlaneVertexDeclaration>
#include<instancesDeclaration>
uniform viewProjection: mat4x4f;
#ifdef STORE_CAMERASPACE_Z
uniform view: mat4x4f;
#else
uniform depthValues: vec2f;
#endif
#ifdef INSTANCES
flat varying vSelectionId: f32;
#endif
#ifdef STORE_CAMERASPACE_Z
varying vViewPosZ: f32;
#else
varying vDepthMetric: f32;
#endif
#ifdef ALPHATEST
varying vUV: vec2f;uniform diffuseMatrix: mat4x4f; 
#ifdef UV1
attribute uv: vec2f;
#endif
#ifdef UV2
attribute uv2: vec2f;
#endif
#endif
#define CUSTOM_VERTEX_DEFINITIONS
@vertex
fn main(input: VertexInputs)->FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
var positionUpdated: vec3f=vertexInputs.position;
#ifdef UV1
var uvUpdated: vec2f=vertexInputs.uv;
#endif
#ifdef UV2
var uv2Updated: vec2f=vertexInputs.uv2;
#endif
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
var worldPos: vec4f=finalWorld*vec4f(positionUpdated,1.0);vertexOutputs.position=uniforms.viewProjection*worldPos;
#ifdef ALPHATEST
#ifdef UV1
vertexOutputs.vUV=(uniforms.diffuseMatrix*vec4f(uvUpdated,1.0,0.0)).xy;
#endif
#ifdef UV2
vertexOutputs.vUV=(uniforms.diffuseMatrix*vec4f(uv2Updated,1.0,0.0)).xy;
#endif
#endif
#ifdef STORE_CAMERASPACE_Z
vertexOutputs.vViewPosZ=(uniforms.view*worldPos).z;
#else
#ifdef USE_REVERSE_DEPTHBUFFER
vertexOutputs.vDepthMetric=((-vertexOutputs.position.z+uniforms.depthValues.x)/(uniforms.depthValues.y));
#else
vertexOutputs.vDepthMetric=((vertexOutputs.position.z+uniforms.depthValues.x)/(uniforms.depthValues.y));
#endif
#endif
#ifdef INSTANCES
vertexOutputs.vSelectionId=vertexInputs.instanceSelectionId;
#endif
#include<clipPlaneVertex>
#define CUSTOM_VERTEX_MAIN_END
}
`;m.ShadersStoreWGSL[T]||(m.ShadersStoreWGSL[T]=E);var D=[s,f,l,p,c,o,t,n,a,r,i,u];for(let e of D)m.IncludesShadersStoreWGSL[e.name]||(m.IncludesShadersStoreWGSL[e.name]=e.shader);var O={name:T,shader:E};export{y as n,h as r,w as t};