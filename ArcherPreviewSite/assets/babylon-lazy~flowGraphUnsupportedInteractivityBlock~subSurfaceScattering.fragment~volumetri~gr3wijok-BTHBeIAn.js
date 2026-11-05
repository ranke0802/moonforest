import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{Bt as t,C as n,Ft as r,G as i,K as a,Lt as ee,Mt as o,Nt as s,Ot as c,Pt as l,Rt as u,S as d,Vt as f,W as p,_ as te,_t as m,ct as h,dt as g,j as _,kt as ne,lt as v,m as re,q as ie,ut as ae,v as oe,vt as se,xt as y,y as b,zt as x}from"./babylon-game-CkG4AARJ.js";import{Nt as S,l as C}from"./babylon-tools~game~cinematic-interaction-xFD1xHn1.js";import{a as w,o as T,s as E,t as D}from"./babylon-tools~game~flowGraphEventReferenceBlock~flowGraphGLTFDataProvider~flowGraphObjectRe~wj9ctf1s-D2mB0XXj.js";var O=e({_TGATextureLoader:()=>k}),k=class{constructor(){this.supportCascades=!1}loadCubeData(){throw`.env not supported in Cube.`}loadData(e,t,r){let i=new Uint8Array(e.buffer,e.byteOffset,e.byteLength),a=d(i);r(a.width,a.height,t.generateMipMaps,!1,()=>{n(t,i)})}},A=e({FlowGraphUnsupportedInteractivityBlock:()=>M});function j(e){switch(e){case`bool`:return!1;case`int`:return new x(0);case`float`:return NaN;case`float2`:return new w(NaN,NaN);case`float3`:return new T(NaN,NaN,NaN);case`float4`:return new E(NaN,NaN,NaN,NaN);case`float2x2`:return new ee([NaN,NaN,NaN,NaN]);case`float3x3`:return new u([NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN]);case`float4x4`:return D.FromArray([NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN]);case`ref`:return``;default:return}}var M=class extends r{constructor(e){super(e),this.config=e,this._unregisterSignalInput(`in`),this._unregisterSignalOutput(`error`);for(let t of e.inputValueSockets??[])this.registerDataInput(t.name,o(t.type));for(let t of e.outputValueSockets??[])this.registerDataOutput(t.name,o(t.type),j(t.signature));for(let t of e.inputFlowSockets??[])this._registerSignalInput(t);for(let t of e.outputFlowSockets??[])this._registerSignalOutput(t)}_execute(e,t){}getClassName(){return`FlowGraphUnsupportedInteractivityBlock`}},N=e({FlowGraphPointerDownEventBlock:()=>P,RegisterFlowGraphPointerDownEventBlock:()=>I}),P=class extends s{constructor(e){super(e),this.type=`PointerDown`,this.targetMesh=this.registerDataInput(`targetMesh`,c,e?.targetMesh),this.pointerId=this.registerDataOutput(`pointerId`,ne),this.pickedMesh=this.registerDataOutput(`pickedMesh`,c),this.pickedPoint=this.registerDataOutput(`pickedPoint`,c)}_executeEvent(e,t){let n=this.targetMesh.getValue(e),r=t.pickInfo?.pickedMesh;return n&&!(r===n||r&&l(r,n))?!0:(this.pointerId.setValue(t.event.pointerId,e),this.pickedMesh.setValue(r??null,e),this.pickedPoint.setValue(t.pickInfo?.pickedPoint??null,e),this._execute(e),!this.config?.stopPropagation)}_preparePendingTasks(e){}_cancelPendingTasks(e){}getClassName(){return`FlowGraphPointerDownEventBlock`}},F=!1;function I(){F||(F=!0,S(`FlowGraphPointerDownEventBlock`,P))}var L=e({gaussianSplattingVertexShader:()=>V}),R=`gaussianSplattingVertexShader`,z=`#include<__decl__gaussianSplattingVertex>
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
`;C.ShadersStore[R]||(C.ShadersStore[R]=z);var B=[oe,v,h,re,se,ie,a,y,te,m,i,p];for(let e of B)C.IncludesShadersStore[e.name]||(C.IncludesShadersStore[e.name]=e.shader);var V={name:R,shader:z},H=`fibonacci`,U=`#define rcp(x) 1./x
#define GOLDEN_RATIO 1.618033988749895
vec2 Golden2dSeq(int i,float n)
{return vec2(float(i)/n+(0.5/n),fract(float(i)*rcp(GOLDEN_RATIO)));}
vec2 SampleDiskGolden(int i,int sampleCount)
{vec2 f=Golden2dSeq(i,float(sampleCount));return vec2(sqrt(f.x),TWO_PI*f.y);}`;C.IncludesShadersStore[H]||(C.IncludesShadersStore[H]=U);var W={name:H,shader:U},G=`diffusionProfile`,K=`uniform vec3 diffusionS[5];uniform float diffusionD[5];uniform float filterRadii[5];`;C.IncludesShadersStore[G]||(C.IncludesShadersStore[G]=K);var ce={name:G,shader:K},le=e({subSurfaceScatteringPixelShader:()=>Y}),q=`subSurfaceScatteringPixelShader`,J=`#include<helperFunctions>
#include<fibonacci>
#include<subSurfaceScatteringFunctions>
#include<diffusionProfile>
varying vec2 vUV;uniform vec2 texelSize;uniform sampler2D textureSampler;uniform sampler2D irradianceSampler;uniform sampler2D depthSampler;uniform sampler2D albedoSampler;uniform vec2 viewportSize;uniform float metersPerUnit;const float LOG2_E=1.4426950408889634;const float SSS_PIXELS_PER_SAMPLE=4.;const int _SssSampleBudget=40;
#define rcp(x) 1./x
#define Sq(x) x*x
#define SSS_BILATERAL_FILTER true
vec3 EvalBurleyDiffusionProfile(float r,vec3 S)
{vec3 exp_13=exp2(((LOG2_E*(-1.0/3.0))*r)*S); 
vec3 expSum=exp_13*(1.+exp_13*exp_13); 
return (S*rcp((8.*PI)))*expSum; }
vec2 SampleBurleyDiffusionProfile(float u,float rcpS)
{u=1.-u; 
float g=1.+(4.*u)*(2.*u+sqrt(1.+(4.*u)*u));float n=exp2(log2(g)*(-1.0/3.0)); 
float p=(g*n)*n; 
float c=1.+p+n; 
float d=(3./LOG2_E*2.)+(3./LOG2_E)*log2(u); 
float x=(3./LOG2_E)*log2(c)-d; 
float rcpExp=((c*c)*c)*rcp(((4.*u)*((c*c)+(4.*u)*(4.*u))));float r=x*rcpS;float rcpPdf=(8.*PI*rcpS)*rcpExp; 
return vec2(r,rcpPdf);}
vec3 ComputeBilateralWeight(float xy2,float z,float mmPerUnit,vec3 S,float rcpPdf)
{
#ifndef SSS_BILATERAL_FILTER
z=0.;
#endif
float r=sqrt(xy2+(z*mmPerUnit)*(z*mmPerUnit));float area=rcpPdf;
#if SSS_CLAMP_ARTIFACT
return clamp(EvalBurleyDiffusionProfile(r,S)*area,0.0,1.0);
#else
return EvalBurleyDiffusionProfile(r,S)*area;
#endif
}
void EvaluateSample(int i,int n,vec3 S,float d,vec3 centerPosVS,float mmPerUnit,float pixelsPerMm,
float phase,inout vec3 totalIrradiance,inout vec3 totalWeight)
{float scale =rcp(float(n));float offset=rcp(float(n))*0.5;float sinPhase,cosPhase;sinPhase=sin(phase);cosPhase=cos(phase);vec2 bdp=SampleBurleyDiffusionProfile(float(i)*scale+offset,d);float r=bdp.x;float rcpPdf=bdp.y;float phi=SampleDiskGolden(i,n).y;float sinPhi,cosPhi;sinPhi=sin(phi);cosPhi=cos(phi);float sinPsi=cosPhase*sinPhi+sinPhase*cosPhi; 
float cosPsi=cosPhase*cosPhi-sinPhase*sinPhi; 
vec2 vec=r*vec2(cosPsi,sinPsi);vec2 position; 
float xy2;position=vUV+round((pixelsPerMm*r)*vec2(cosPsi,sinPsi))*texelSize;xy2 =r*r;vec4 textureSample=texture2D(irradianceSampler,position);float viewZ=texture2D(depthSampler,position).r;vec3 irradiance =textureSample.rgb;if (testLightingForSSS(textureSample.a))
{float relZ=viewZ-centerPosVS.z;vec3 weight=ComputeBilateralWeight(xy2,relZ,mmPerUnit,S,rcpPdf);totalIrradiance+=weight*irradiance;totalWeight +=weight;}
else
{}}
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) 
{vec4 irradianceAndDiffusionProfile =texture2D(irradianceSampler,vUV);vec3 centerIrradiance=irradianceAndDiffusionProfile.rgb;int diffusionProfileIndex=int(round(irradianceAndDiffusionProfile.a*255.));float centerDepth =0.;vec4 inputColor=texture2D(textureSampler,vUV);bool passedStencilTest=testLightingForSSS(irradianceAndDiffusionProfile.a);if (passedStencilTest)
{centerDepth=texture2D(depthSampler,vUV).r;}
if (!passedStencilTest) { 
gl_FragColor=inputColor;return;}
float distScale =1.;vec3 S =diffusionS[diffusionProfileIndex];float d =diffusionD[diffusionProfileIndex];float filterRadius=filterRadii[diffusionProfileIndex];vec2 centerPosNDC=vUV;vec2 cornerPosNDC=vUV+0.5*texelSize;vec3 centerPosVS =vec3(centerPosNDC*viewportSize,1.0)*centerDepth; 
vec3 cornerPosVS =vec3(cornerPosNDC*viewportSize,1.0)*centerDepth; 
float mmPerUnit =1000.*(metersPerUnit*rcp(distScale));float unitsPerMm=rcp(mmPerUnit);float unitsPerPixel=2.*abs(cornerPosVS.x-centerPosVS.x);float pixelsPerMm =rcp(unitsPerPixel)*unitsPerMm;float filterArea =PI*Sq(filterRadius*pixelsPerMm);int sampleCount =int(filterArea*rcp(SSS_PIXELS_PER_SAMPLE));int sampleBudget=_SssSampleBudget;int texturingMode=0;vec3 albedo =texture2D(albedoSampler,vUV).rgb;if (distScale==0. || sampleCount<1)
{
#ifdef DEBUG_SSS_SAMPLES
vec3 green=vec3(0.,1.,0.);gl_FragColor=vec4(green,1.0);return;
#endif
gl_FragColor=vec4(inputColor.rgb+albedo*centerIrradiance,1.0);return;}
#ifdef DEBUG_SSS_SAMPLES
vec3 red =vec3(1.,0.,0.);vec3 blue=vec3(0.,0.,1.);gl_FragColor=vec4(mix(blue,red,clamp(float(sampleCount)/float(sampleBudget),0.0,1.0)),1.0);return;
#endif
float phase=0.;int n=min(sampleCount,sampleBudget);vec3 centerWeight =vec3(0.); 
vec3 totalIrradiance=vec3(0.);vec3 totalWeight =vec3(0.);for (int i=0; i<n; i++)
{EvaluateSample(i,n,S,d,centerPosVS,mmPerUnit,pixelsPerMm,
phase,totalIrradiance,totalWeight);}
totalWeight=max(totalWeight,HALF_MIN);gl_FragColor=vec4(inputColor.rgb+albedo*max(totalIrradiance/totalWeight,vec3(0.0)),1.);}`;C.ShadersStore[q]||(C.ShadersStore[q]=J);var ue=[y,W,_,ce];for(let e of ue)C.IncludesShadersStore[e.name]||(C.IncludesShadersStore[e.name]=e.shader);var Y={name:q,shader:J},de=e({volumetricLightingRenderVolumeVertexShader:()=>pe}),X=`volumetricLightingRenderVolumeVertexShader`,Z=`#include<__decl__sceneVertex>
#include<__decl__meshVertex>
attribute vec3 position;varying vec4 vWorldPos;void main(void) {vec4 worldPos=world*vec4(position,1.0);vWorldPos=worldPos;gl_Position=viewProjection*worldPos;}
`;C.ShadersStore[X]||(C.ShadersStore[X]=Z);var fe=[g,v,ae,h];for(let e of fe)C.IncludesShadersStore[e.name]||(C.IncludesShadersStore[e.name]=e.shader);var pe={name:X,shader:Z},me=e({gaussianSplattingVoxelVertexShaderWGSL:()=>ge}),Q=`gaussianSplattingVoxelVertexShader`,$=`#include<sceneUboDeclaration>
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
`;C.ShadersStoreWGSL[Q]||(C.ShadersStoreWGSL[Q]=$);var he=[t,f,b];for(let e of he)C.IncludesShadersStoreWGSL[e.name]||(C.IncludesShadersStoreWGSL[e.name]=e.shader);var ge={name:Q,shader:$};export{N as a,L as i,de as n,A as o,le as r,O as s,me as t};