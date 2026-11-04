import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{Bt as t,G as n,K as r,Nt as i,Ot as a,Pt as ee,Vt as te,W as o,_ as s,_t as c,ct as l,kt as u,lt as d,m as f,q as p,v as m,vt as h,xt as g,y as _}from"./babylon-game-BceOPjJS.js";import{Nt as v,l as y}from"./babylon-tools~game~cinematic-interaction-Bk4IdV0B.js";var b=e({FlowGraphPointerDownEventBlock:()=>x,RegisterFlowGraphPointerDownEventBlock:()=>C}),x=class extends i{constructor(e){super(e),this.type=`PointerDown`,this.targetMesh=this.registerDataInput(`targetMesh`,a,e?.targetMesh),this.pointerId=this.registerDataOutput(`pointerId`,u),this.pickedMesh=this.registerDataOutput(`pickedMesh`,a),this.pickedPoint=this.registerDataOutput(`pickedPoint`,a)}_executeEvent(e,t){let n=this.targetMesh.getValue(e),r=t.pickInfo?.pickedMesh;return n&&!(r===n||r&&ee(r,n))?!0:(this.pointerId.setValue(t.event.pointerId,e),this.pickedMesh.setValue(r??null,e),this.pickedPoint.setValue(t.pickInfo?.pickedPoint??null,e),this._execute(e),!this.config?.stopPropagation)}_preparePendingTasks(e){}_cancelPendingTasks(e){}getClassName(){return`FlowGraphPointerDownEventBlock`}},S=!1;function C(){S||(S=!0,v(`FlowGraphPointerDownEventBlock`,x))}var w=e({gaussianSplattingVertexShader:()=>O}),T=`gaussianSplattingVertexShader`,E=`#include<__decl__gaussianSplattingVertex>
#ifdef LOGARITHMICDEPTH
#extension GL_EXT_frag_depth : enable
#endif
#include<clipPlaneVertexDeclaration>
#include<fogVertexDeclaration>
#include<logDepthDeclaration>
#include<helperFunctions>
uniform vec2 invViewport;uniform vec2 dataTextureSize;uniform vec2 focal;uniform float kernelSize;uniform float minPixelSize;uniform vec3 eyePosition;uniform float alpha;
#ifdef PREPASS
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
uniform mat4 previousWorld;uniform mat4 previousViewProjection;
#if IS_COMPOUND
uniform mat4 previousPartWorld[MAX_PART_COUNT];
#endif
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
uniform vec2 geometryDepthRange;
#endif
#endif
#if IS_COMPOUND
uniform mat4 partWorld[MAX_PART_COUNT];uniform float partVisibility[MAX_PART_COUNT];
#endif
uniform sampler2D covariancesATexture;uniform sampler2D covariancesBTexture;uniform sampler2D centersTexture;uniform sampler2D colorsTexture;
#ifdef USE_SOG
uniform sampler2D sogQuatsTexture;uniform vec3 sogMeansMin;uniform vec3 sogMeansMax;
#ifdef USE_SOG_V2
uniform sampler2D sogCodebookTexture; 
#else
uniform vec3 sogScalesMin;uniform vec3 sogScalesMax;uniform vec4 sogSh0Min;uniform vec4 sogSh0Max;uniform float sogShnMin;uniform float sogShnMax;
#endif
#if SH_DEGREE>0
uniform sampler2D sogShNCentroidsTexture;uniform sampler2D sogShNLabelsTexture;uniform float sogShCoeffCount;
#endif
#endif
#if SH_DEGREE>0 && !defined(USE_SOG)
uniform highp usampler2D shTexture0;
#endif
#if SH_DEGREE>1 && !defined(USE_SOG)
uniform highp usampler2D shTexture1;
#endif
#if SH_DEGREE>2 && !defined(USE_SOG)
uniform highp usampler2D shTexture2;
#endif
#if SH_DEGREE>3 && !defined(USE_SOG)
uniform highp usampler2D shTexture3;uniform highp usampler2D shTexture4;
#endif
#if IS_COMPOUND
uniform sampler2D partIndicesTexture;
#endif
varying vec4 vColor;varying vec2 vPosition;
#ifdef PREPASS
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
#define CUSTOM_VERTEX_DEFINITIONS
#include<gaussianSplatting>
void main () {
#define CUSTOM_VERTEX_MAIN_BEGIN
float splatIndex=getSplatIndex(int(position.z+0.5));Splat splat=readSplat(splatIndex);vec3 covA=splat.covA.xyz;vec3 covB=vec3(splat.covA.w,splat.covB.xy);
#if IS_COMPOUND
mat4 splatWorld=getPartWorld(splat.partIndex);
#else
mat4 splatWorld=world;
#endif
vec4 worldPos=splatWorld*vec4(splat.center.xyz,1.0);vColor=splat.color;vPosition=position.xy;
#if defined(PREPASS_ALBEDO) || defined(PREPASS_ALBEDO_SQRT)
vGeometryAlbedo=splat.color.xyz;
#endif
#if SH_DEGREE>0
mat3 worldRot=mat3(splatWorld);mat3 normWorldRot=inverseMat3(worldRot);vec3 eyeToSplatLocalSpace=normalize(normWorldRot*(worldPos.xyz-eyePosition));
#if defined(GS_DBG_ENABLED) && IS_COMPOUND
{vec4 _row3=texelFetch(dbgPartData,ivec2(int(splat.partIndex),3),0);
#if SH_DEGREE>3
float _so4=texelFetch(dbgPartData,ivec2(int(splat.partIndex),4),0).x;
#else
float _so4=1.0;
#endif
vColor.xyz=_row3.x*splat.color.xyz+computeSHWeighted(splat,eyeToSplatLocalSpace,_row3.y,_row3.z,_row3.w,_so4);}
#elif defined(GS_DBG_ENABLED) && GS_DBG_SH_DC==0
vColor.xyz=computeSH(splat,eyeToSplatLocalSpace);
#else
vColor.xyz=splat.color.xyz+computeSH(splat,eyeToSplatLocalSpace);
#endif
#else
#if defined(GS_DBG_ENABLED) && IS_COMPOUND
{float _shDc=texelFetch(dbgPartData,ivec2(int(splat.partIndex),3),0).x;vColor.xyz=_shDc*splat.color.xyz;}
#elif defined(GS_DBG_ENABLED) && GS_DBG_SH_DC==0
vColor.xyz=vec3(0.0);
#endif
#endif
vColor.w*=alpha;
#if IS_COMPOUND
vColor.w*=partVisibility[splat.partIndex];
#endif
vec2 scale=vec2(1.,1.);
#define CUSTOM_VERTEX_UPDATE
gl_Position=gaussianSplatting(position.xy,worldPos.xyz,scale,covA,covB,splatWorld,view,projection);
#ifdef PREPASS
#if defined(PREPASS_POSITION) || defined(PREPASS_LOCAL_POSITION) || defined(PREPASS_DEPTH) || defined(PREPASS_NORMALIZED_VIEW_DEPTH) || defined(PREPASS_NORMAL) || defined(PREPASS_WORLD_NORMAL) || defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
vec3 geometrySplatViewPosition=(view*worldPos).xyz;
#endif
#if defined(PREPASS_POSITION) || defined(PREPASS_LOCAL_POSITION) || defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
vec4 geometryPlaneViewPosition=inverseProjection*gl_Position;geometryPlaneViewPosition/=geometryPlaneViewPosition.w;vec3 geometryPlanePositionW=worldPos.xyz+transpose(mat3(view))*(geometryPlaneViewPosition.xyz-geometrySplatViewPosition);
#if defined(PREPASS_LOCAL_POSITION) || defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
vec3 geometryPlanePositionL=splat.center.xyz+inverseMat3(mat3(splatWorld))*(geometryPlanePositionW-worldPos.xyz);
#endif
#endif
#ifdef PREPASS_POSITION
vGeometryPositionW=geometryPlanePositionW;
#endif
#ifdef PREPASS_LOCAL_POSITION
vGeometryPositionL=geometryPlanePositionL;
#endif
#ifdef PREPASS_DEPTH
vGeometryViewDepth=geometrySplatViewPosition.z;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
vGeometryNormalizedViewDepth=(geometrySplatViewPosition.z-geometryDepthRange.x)/(geometryDepthRange.y-geometryDepthRange.x);
#endif
#if defined(PREPASS_NORMAL) || defined(PREPASS_WORLD_NORMAL)
vec3 geometryNormalV=vec3(0.0,0.0,geometrySplatViewPosition.z<0.0 ? 1.0 : -1.0);vec3 geometryNormalW=normalize(transpose(mat3(view))*geometryNormalV);
#ifdef PREPASS_NORMAL
vGeometryNormalV=geometryNormalV;
#endif
#ifdef PREPASS_WORLD_NORMAL
vGeometryNormalW=geometryNormalW;
#endif
#endif
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
vGeometryCurrentPosition=gl_Position;
#if IS_COMPOUND
vGeometryPreviousPosition=previousViewProjection*previousPartWorld[splat.partIndex]*vec4(geometryPlanePositionL,1.0);
#else
vGeometryPreviousPosition=previousViewProjection*previousWorld*vec4(geometryPlanePositionL,1.0);
#endif
#endif
#endif
#include<clipPlaneVertex>
#include<fogVertex>
#include<logDepthVertex>
#define CUSTOM_VERTEX_MAIN_END
}
`;y.ShadersStore[T]||(y.ShadersStore[T]=E);var D=[m,d,l,f,h,p,r,g,s,c,n,o];for(let e of D)y.IncludesShadersStore[e.name]||(y.IncludesShadersStore[e.name]=e.shader);var O={name:T,shader:E},k=e({gaussianSplattingVoxelVertexShader:()=>N}),A=`gaussianSplattingVoxelVertexShader`,j=`#include<__decl__gaussianSplattingVertex>
uniform vec2 dataTextureSize;uniform float alpha;uniform mat4 invWorldScale;uniform mat4 viewMatrix;uniform sampler2D rotationsATexture;uniform sampler2D rotationsBTexture;uniform sampler2D rotationScaleTexture;uniform sampler2D centersTexture;uniform sampler2D colorsTexture;
#if IS_COMPOUND
uniform mat4 partWorld[MAX_PART_COUNT];uniform float partVisibility[MAX_PART_COUNT];uniform sampler2D partIndicesTexture;
#endif
varying vec3 vNormalizedPosition;varying vec3 vNormalizedCenterPosition;varying float vAlpha;varying vec2 vPatchPosition;
#include<gaussianSplatting>
void main(void) {float splatIndex=getSplatIndex(int(position.z+0.5));Splat splat=readSplat(splatIndex);
#if IS_COMPOUND
if (partVisibility[splat.partIndex]==0.0) {gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
mat4 splatWorld=getPartWorld(splat.partIndex);
#else
mat4 splatWorld=world;
#endif
vec4 worldPos=computeVoxelSplatWorldPos(splat.rotationA,splat.rotationB,splat.rotationScale,splat.center.xyz,splatWorld,viewMatrix,invWorldScale,position.xy);gl_Position=viewMatrix*invWorldScale*worldPos;vNormalizedPosition=gl_Position.xyz*0.5+0.5;vec4 viewCenterPos=viewMatrix*invWorldScale*splatWorld*vec4(splat.center.xyz,1.0);vNormalizedCenterPosition=viewCenterPos.xyz*0.5+0.5;vAlpha=splat.color.w*alpha;
#if IS_COMPOUND
vAlpha*=partVisibility[splat.partIndex];
#endif
vPatchPosition=position.xy;}`;y.ShadersStore[A]||(y.ShadersStore[A]=j);var M=[m,d,l,f,s];for(let e of M)y.IncludesShadersStore[e.name]||(y.IncludesShadersStore[e.name]=e.shader);var N={name:A,shader:j},P=e({oitFinalSimpleBlendPixelShader:()=>L}),F=`oitFinalSimpleBlendPixelShader`,I=`precision highp float;uniform sampler2D uFrontColor;void main() {ivec2 fragCoord=ivec2(gl_FragCoord.xy);vec4 frontColor=texelFetch(uFrontColor,fragCoord,0);glFragColor=frontColor;}
`;y.ShadersStore[F]||(y.ShadersStore[F]=I);var L={name:F,shader:I},R=e({gaussianSplattingVoxelVertexShaderWGSL:()=>H}),z=`gaussianSplattingVoxelVertexShader`,B=`#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute splatIndex0: vec4f;attribute splatIndex1: vec4f;attribute splatIndex2: vec4f;attribute splatIndex3: vec4f;attribute position: vec3f;uniform dataTextureSize: vec2f;uniform alpha: f32;uniform invWorldScale: mat4x4f;uniform viewMatrix: mat4x4f;
#if IS_COMPOUND
uniform partWorld: array<mat4x4<f32>,MAX_PART_COUNT>;uniform partVisibility: array<f32,MAX_PART_COUNT>;
#endif
var rotationsATexture: texture_2d<f32>;var rotationsBTexture: texture_2d<f32>;var rotationScaleTexture: texture_2d<f32>;var centersTexture: texture_2d<f32>;var colorsTexture: texture_2d<f32>;
#if IS_COMPOUND
var partIndicesTexture: texture_2d<f32>;
#endif
varying vNormalizedPosition: vec3f;varying vNormalizedCenterPosition: vec3f;varying vAlpha: f32;varying vPatchPosition: vec2f;
#include<gaussianSplatting>
@vertex
fn main(input: VertexInputs)->FragmentInputs {let splatIndex: f32=getSplatIndex(
i32(vertexInputs.position.z+0.5),
vertexInputs.splatIndex0,vertexInputs.splatIndex1,
vertexInputs.splatIndex2,vertexInputs.splatIndex3
);var splat: Splat=readSplat(splatIndex,uniforms.dataTextureSize);
#if IS_COMPOUND
if (uniforms.partVisibility[splat.partIndex]==0.0) {vertexOutputs.position=vec4f(2.0,2.0,2.0,1.0);return vertexOutputs;}
let splatWorld: mat4x4f=getPartWorld(splat.partIndex);
#else
let splatWorld: mat4x4f=mesh.world;
#endif
let quadPos: vec2f=vertexInputs.position.xy;let worldPos: vec4f=computeVoxelSplatWorldPos(splat.rotationA,splat.rotationB,splat.rotationScale,splat.center.xyz,splatWorld,uniforms.viewMatrix,uniforms.invWorldScale,quadPos);vertexOutputs.vNormalizedPosition=(uniforms.invWorldScale*worldPos).xyz*0.5+0.5;let clipPos: vec4f=uniforms.viewMatrix*uniforms.invWorldScale*worldPos;vertexOutputs.position=vec4f(clipPos.x,clipPos.y,clipPos.z*0.5+0.5,1.0);vertexOutputs.vNormalizedCenterPosition=(uniforms.invWorldScale*splatWorld*vec4f(splat.center.xyz,1.0)).xyz*0.5+0.5;vertexOutputs.vAlpha=splat.color.w*uniforms.alpha;
#if IS_COMPOUND
vertexOutputs.vAlpha*=uniforms.partVisibility[splat.partIndex];
#endif
vertexOutputs.vPatchPosition=quadPos;}
`;y.ShadersStoreWGSL[z]||(y.ShadersStoreWGSL[z]=B);var V=[t,te,_];for(let e of V)y.IncludesShadersStoreWGSL[e.name]||(y.IncludesShadersStoreWGSL[e.name]=e.shader);var H={name:z,shader:B},U=e({oitFinalSimpleBlendPixelShaderWGSL:()=>K}),W=`oitFinalSimpleBlendPixelShader`,G=`var uFrontColor: texture_2d<f32>;@fragment
fn main(input: FragmentInputs)->FragmentOutputs {var fragCoord: vec2i=vec2i(fragmentInputs.position.xy);var frontColor: vec4f=textureLoad(uFrontColor,fragCoord,0);fragmentOutputs.color=frontColor;}
`;y.ShadersStoreWGSL[W]||(y.ShadersStoreWGSL[W]=G);var K={name:W,shader:G},q=e({selectionOutlinePixelShaderWGSL:()=>X}),J=`selectionOutlinePixelShader`,Y=`var maskSamplerSampler: sampler;var maskSampler: texture_2d<f32>;
#ifdef OUTLINELAYER_DEPTH_OCCLUSION
var depthSamplerSampler: sampler;var depthSampler: texture_2d<f32>;
#endif
varying vUV: vec2f;uniform screenSize: vec2f;uniform outlineColor: vec3f;uniform outlineThickness: f32;
#ifdef OUTLINELAYER_DEPTH_OCCLUSION
uniform occlusionStrength: f32;uniform occlusionThreshold: f32;
#endif
#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
let texelSize: vec2f=1.0/uniforms.screenSize;let sampleOffset: vec2f=texelSize*uniforms.outlineThickness;
#if defined(OUTLINELAYER_SAMPLING_TRIDIRECTIONAL) || defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
let maskTopCenter: vec2f=textureSampleLevel(maskSampler,maskSamplerSampler,fragmentInputs.vUV+vec2f(0.0,sampleOffset.y),0.0).rg;let maskTopRight: vec2f=textureSampleLevel(maskSampler,maskSamplerSampler,fragmentInputs.vUV+sampleOffset,0.0).rg;let maskMiddleCenter: vec2f=textureSampleLevel(maskSampler,maskSamplerSampler,fragmentInputs.vUV,0.0).rg;let maskMiddleRight: vec2f=textureSampleLevel(maskSampler,maskSamplerSampler,fragmentInputs.vUV+vec2f(sampleOffset.x,0.0),0.0).rg;
#endif
#if defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
let maskTopLeft: vec2f=textureSampleLevel(maskSampler,maskSamplerSampler,fragmentInputs.vUV+vec2f(-sampleOffset.x,sampleOffset.y),0.0).rg;let maskMiddleLeft: vec2f=textureSampleLevel(maskSampler,maskSamplerSampler,fragmentInputs.vUV+vec2f(-sampleOffset.x,0.0),0.0).rg;let maskBottomRight: vec2f=textureSampleLevel(maskSampler,maskSamplerSampler,fragmentInputs.vUV+vec2f(sampleOffset.x,-sampleOffset.y),0.0).rg;let maskBottomCenter: vec2f=textureSampleLevel(maskSampler,maskSamplerSampler,fragmentInputs.vUV+vec2f(0.0,-sampleOffset.y),0.0).rg;let maskBottomLeft: vec2f=textureSampleLevel(maskSampler,maskSamplerSampler,fragmentInputs.vUV+vec2f(-sampleOffset.x,-sampleOffset.y),0.0).rg;
#endif
#ifdef OUTLINELAYER_SAMPLING_TRIDIRECTIONAL
let gradient: vec3f=vec3f(
maskMiddleCenter.r-maskMiddleRight.r,
maskMiddleCenter.r-maskTopCenter.r,
maskMiddleCenter.r-maskTopRight.r
);let edgeStrength: f32=length(gradient);
#elif defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
let gradientX: f32 =
(maskTopLeft.r+2.0*maskMiddleLeft.r+maskBottomLeft.r) -
(maskTopRight.r+2.0*maskMiddleRight.r+maskBottomRight.r);let gradientY: f32 =
(maskBottomLeft.r+2.0*maskBottomCenter.r+maskBottomRight.r) -
(maskTopLeft.r+2.0*maskTopCenter.r+maskTopRight.r);let edgeStrength: f32=length(vec2f(gradientX,gradientY));
#endif
let outlineMask: f32=step(0.5,edgeStrength); 
var finalOutlineMask: f32=outlineMask;
#ifdef OUTLINELAYER_DEPTH_OCCLUSION
if (outlineMask>0.0) {
#if defined(OUTLINELAYER_SAMPLING_TRIDIRECTIONAL) || defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
let depthTopCenter: f32=textureSampleLevel(depthSampler,depthSamplerSampler,fragmentInputs.vUV+vec2f(0.0,sampleOffset.y),0.0).r;let depthTopRight: f32=textureSampleLevel(depthSampler,depthSamplerSampler,fragmentInputs.vUV+sampleOffset,0.0).r;let depthMiddleCenter: f32=textureSampleLevel(depthSampler,depthSamplerSampler,fragmentInputs.vUV,0.0).r;let depthMiddleRight: f32=textureSampleLevel(depthSampler,depthSamplerSampler,fragmentInputs.vUV+vec2f(sampleOffset.x,0.0),0.0).r;
#endif
#if defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
let depthTopLeft: f32=textureSampleLevel(depthSampler,depthSamplerSampler,fragmentInputs.vUV+vec2f(-sampleOffset.x,sampleOffset.y),0.0).r;let depthMiddleLeft: f32=textureSampleLevel(depthSampler,depthSamplerSampler,fragmentInputs.vUV+vec2f(-sampleOffset.x,0.0),0.0).r;let depthBottomRight: f32=textureSampleLevel(depthSampler,depthSamplerSampler,fragmentInputs.vUV+vec2f(sampleOffset.x,-sampleOffset.y),0.0).r;let depthBottomCenter: f32=textureSampleLevel(depthSampler,depthSamplerSampler,fragmentInputs.vUV+vec2f(0.0,-sampleOffset.y),0.0).r;let depthBottomLeft: f32=textureSampleLevel(depthSampler,depthSamplerSampler,fragmentInputs.vUV+vec2f(-sampleOffset.x,-sampleOffset.y),0.0).r;
#endif
#if defined(OUTLINELAYER_SAMPLING_TRIDIRECTIONAL) || defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
let occlusionTopCenter: f32=step(uniforms.occlusionThreshold,abs(maskTopCenter.g-depthTopCenter));let occlusionTopRight: f32=step(uniforms.occlusionThreshold,abs(maskTopRight.g-depthTopRight));let occlusionMiddleCenter: f32=step(uniforms.occlusionThreshold,abs(maskMiddleCenter.g-depthMiddleCenter));let occlusionMiddleRight: f32=step(uniforms.occlusionThreshold,abs(maskMiddleRight.g-depthMiddleRight));
#endif
#if defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
let occlusionTopLeft: f32=step(uniforms.occlusionThreshold,abs(maskTopLeft.g-depthTopLeft));let occlusionMiddleLeft: f32=step(uniforms.occlusionThreshold,abs(maskMiddleLeft.g-depthMiddleLeft));let occlusionBottomRight: f32=step(uniforms.occlusionThreshold,abs(maskBottomRight.g-depthBottomRight));let occlusionBottomCenter: f32=step(uniforms.occlusionThreshold,abs(maskBottomCenter.g-depthBottomCenter));let occlusionBottomLeft: f32=step(uniforms.occlusionThreshold,abs(maskBottomLeft.g-depthBottomLeft));
#endif
var occlusionFactor: f32=occlusionMiddleCenter;
#ifdef OUTLINELAYER_SAMPLING_TRIDIRECTIONAL
occlusionFactor=min(occlusionFactor,occlusionTopCenter);occlusionFactor=min(occlusionFactor,occlusionTopRight);occlusionFactor=min(occlusionFactor,occlusionMiddleRight);
#elif defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
occlusionFactor=min(occlusionFactor,occlusionTopCenter);occlusionFactor=min(occlusionFactor,occlusionTopRight);occlusionFactor=min(occlusionFactor,occlusionTopLeft);occlusionFactor=min(occlusionFactor,occlusionMiddleRight);occlusionFactor=min(occlusionFactor,occlusionMiddleLeft);occlusionFactor=min(occlusionFactor,occlusionBottomRight);occlusionFactor=min(occlusionFactor,occlusionBottomCenter);occlusionFactor=min(occlusionFactor,occlusionBottomLeft);
#endif
finalOutlineMask*=1.0-uniforms.occlusionStrength*occlusionFactor;}
#endif
fragmentOutputs.color=vec4f(uniforms.outlineColor,finalOutlineMask);
#define CUSTOM_FRAGMENT_MAIN_END
}
`;y.ShadersStoreWGSL[J]||(y.ShadersStoreWGSL[J]=Y);var X={name:J,shader:Y},Z=e({volumetricLightingBlendVolumePixelShaderWGSL:()=>ne}),Q=`volumetricLightingBlendVolumePixelShader`,$=`varying vUV: vec2f;var textureSamplerSampler: sampler;var textureSampler: texture_2d<f32>;var depthSampler: texture_2d<f32>;uniform invProjection: mat4x4<f32>;uniform outputTextureSize: vec2f;
#ifdef USE_EXTINCTION
uniform extinction: vec3f;
#endif
#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {fragmentOutputs.color=textureSample(textureSampler,textureSamplerSampler,input.vUV);
#ifdef USE_EXTINCTION
let depth=textureLoad(depthSampler,vec2u(fragmentInputs.position.xy),0).r;let ndc=vec4f((fragmentInputs.position.xy/uniforms.outputTextureSize)*2.-1.,depth,1.0);var viewPos=uniforms.invProjection*ndc;viewPos=viewPos/viewPos.w;let eyeDist=length(viewPos);fragmentOutputs.color2=vec4f(exp(-uniforms.extinction*eyeDist),1.0);
#endif
}
`;y.ShadersStoreWGSL[Q]||(y.ShadersStoreWGSL[Q]=$);var ne={name:Q,shader:$};export{P as a,b as c,R as i,q as n,k as o,U as r,w as s,Z as t};