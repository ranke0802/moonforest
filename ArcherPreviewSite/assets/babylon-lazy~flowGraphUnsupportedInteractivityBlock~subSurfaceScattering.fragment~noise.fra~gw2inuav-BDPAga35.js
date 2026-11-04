import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{$ as t,Bt as n,C as r,Ft as i,Ht as a,Lt as o,Mt as s,Rt as ee,S as te,Vt as ne,_t as re,bt as ie,cn as ae,ct as c,dn as l,dt as u,et as d,fn as f,hn as oe,j as se,ln as ce,lt as le,mn as ue,mt as de,nt as p,on as m,pn as h,pt as g,sn as _,tt as v,un as y,ut as b,vt as x,xt as S,y as C,yt as w,zt as T}from"./babylon-game-BceOPjJS.js";import{l as E}from"./babylon-tools~game~cinematic-interaction-Bk4IdV0B.js";import{a as D,o as O,s as k,t as A}from"./babylon-tools~game~flowGraphEventReferenceBlock~flowGraphGLTFDataProvider~flowGraphObjectRe~zg6kltdv-BljkKZco.js";var j=e({_TGATextureLoader:()=>M}),M=class{constructor(){this.supportCascades=!1}loadCubeData(){throw`.env not supported in Cube.`}loadData(e,t,n){let i=new Uint8Array(e.buffer,e.byteOffset,e.byteLength),a=te(i);n(a.width,a.height,t.generateMipMaps,!1,()=>{r(t,i)})}},N=e({FlowGraphUnsupportedInteractivityBlock:()=>F});function P(e){switch(e){case`bool`:return!1;case`int`:return new T(0);case`float`:return NaN;case`float2`:return new D(NaN,NaN);case`float3`:return new O(NaN,NaN,NaN);case`float4`:return new k(NaN,NaN,NaN,NaN);case`float2x2`:return new o([NaN,NaN,NaN,NaN]);case`float3x3`:return new ee([NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN]);case`float4x4`:return A.FromArray([NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN]);case`ref`:return``;default:return}}var F=class extends i{constructor(e){super(e),this.config=e,this._unregisterSignalInput(`in`),this._unregisterSignalOutput(`error`);for(let t of e.inputValueSockets??[])this.registerDataInput(t.name,s(t.type));for(let t of e.outputValueSockets??[])this.registerDataOutput(t.name,s(t.type),P(t.signature));for(let t of e.inputFlowSockets??[])this._registerSignalInput(t);for(let t of e.outputFlowSockets??[])this._registerSignalOutput(t)}_execute(e,t){}getClassName(){return`FlowGraphUnsupportedInteractivityBlock`}},I=e({noisePixelShader:()=>z}),L=`noisePixelShader`,R=`uniform float brightness;uniform float persistence;uniform float timeScale;varying vec2 vUV;vec2 hash22(vec2 p)
{p=p*mat2(127.1,311.7,269.5,183.3);p=-1.0+2.0*fract(sin(p)*43758.5453123);return sin(p*6.283+timeScale);}
float interpolationNoise(vec2 p)
{vec2 pi=floor(p);vec2 pf=p-pi;vec2 w=pf*pf*(3.-2.*pf);float f00=dot(hash22(pi+vec2(.0,.0)),pf-vec2(.0,.0));float f01=dot(hash22(pi+vec2(.0,1.)),pf-vec2(.0,1.));float f10=dot(hash22(pi+vec2(1.0,0.)),pf-vec2(1.0,0.));float f11=dot(hash22(pi+vec2(1.0,1.)),pf-vec2(1.0,1.));float xm1=mix(f00,f10,w.x);float xm2=mix(f01,f11,w.x);float ym=mix(xm1,xm2,w.y); 
return ym;}
float perlinNoise2D(float x,float y)
{float sum=0.0;float frequency=0.0;float amplitude=0.0;for(int i=0; i<OCTAVES; i++)
{frequency=pow(2.0,float(i));amplitude=pow(persistence,float(i));sum=sum+interpolationNoise(vec2(x*frequency,y*frequency))*amplitude;}
return sum;}
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void)
{float x=abs(vUV.x);float y=abs(vUV.y);float noise=brightness+(1.0-brightness)*perlinNoise2D(x,y);gl_FragColor=vec4(noise,noise,noise,1.0);}
`;E.ShadersStore[L]||(E.ShadersStore[L]=R);var z={name:L,shader:R},fe=e({selectionPixelShader:()=>me}),B=`selectionPixelShader`,V=`#ifdef INSTANCES
flat varying float vSelectionId;
#else
uniform float selectionId;
#endif
#ifdef STORE_CAMERASPACE_Z
varying float vViewPosZ;
#else
varying float vDepthMetric;
#endif
#ifdef ALPHATEST
varying vec2 vUV;uniform sampler2D diffuseSampler;
#endif
#include<clipPlaneFragmentDeclaration>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
#ifdef ALPHATEST
if (texture2D(diffuseSampler,vUV).a<0.4)
discard;
#endif
#ifdef INSTANCES
float id=vSelectionId;
#else
float id=selectionId;
#endif
#ifdef STORE_CAMERASPACE_Z
gl_FragColor=vec4(id,vViewPosZ,0.0,1.0);
#else
gl_FragColor=vec4(id,vDepthMetric,0.0,1.0);
#endif
#define CUSTOM_FRAGMENT_MAIN_END
}
`;E.ShadersStore[B]||(E.ShadersStore[B]=V);var pe=[ie,w];for(let e of pe)E.IncludesShadersStore[e.name]||(E.IncludesShadersStore[e.name]=e.shader);var me={name:B,shader:V},he=e({selectionVertexShader:()=>_e}),H=`selectionVertexShader`,U=`attribute vec3 position;
#ifdef INSTANCES
attribute float instanceSelectionId;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<clipPlaneVertexDeclaration>
#include<instancesDeclaration>
uniform mat4 viewProjection;
#ifdef STORE_CAMERASPACE_Z
uniform mat4 view;
#else
uniform vec2 depthValues;
#endif
#ifdef INSTANCES
flat varying float vSelectionId;
#endif
#ifdef STORE_CAMERASPACE_Z
varying float vViewPosZ;
#else
varying float vDepthMetric;
#endif
#ifdef ALPHATEST
varying vec2 vUV;uniform mat4 diffuseMatrix;
#ifdef UV1
attribute vec2 uv;
#endif
#ifdef UV2
attribute vec2 uv2;
#endif
#endif
#define CUSTOM_VERTEX_DEFINITIONS
void main(void) {
#define CUSTOM_VERTEX_MAIN_BEGIN
vec3 positionUpdated=position;
#ifdef UV1
vec2 uvUpdated=uv;
#endif
#ifdef UV2
vec2 uv2Updated=uv2;
#endif
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(positionUpdated,1.0);gl_Position=viewProjection*worldPos;
#ifdef ALPHATEST
#ifdef UV1
vUV=vec2(diffuseMatrix*vec4(uvUpdated,1.0,0.0));
#endif
#ifdef UV2
vUV=vec2(diffuseMatrix*vec4(uv2Updated,1.0,0.0));
#endif
#endif
#ifdef STORE_CAMERASPACE_Z
vViewPosZ=(view*worldPos).z;
#else
#ifdef USE_REVERSE_DEPTHBUFFER
vDepthMetric=((-gl_Position.z+depthValues.x)/(depthValues.y));
#else
vDepthMetric=((gl_Position.z+depthValues.x)/(depthValues.y));
#endif
#endif
#ifdef INSTANCES
vSelectionId=instanceSelectionId;
#endif
#include<clipPlaneVertex>
#define CUSTOM_VERTEX_MAIN_END
}
`;E.ShadersStore[H]||(E.ShadersStore[H]=U);var ge=[oe,ue,h,f,x,l,y,ce,ae,_,m,re];for(let e of ge)E.IncludesShadersStore[e.name]||(E.IncludesShadersStore[e.name]=e.shader);var _e={name:H,shader:U},W=`fibonacci`,G=`#define rcp(x) 1./x
#define GOLDEN_RATIO 1.618033988749895
vec2 Golden2dSeq(int i,float n)
{return vec2(float(i)/n+(0.5/n),fract(float(i)*rcp(GOLDEN_RATIO)));}
vec2 SampleDiskGolden(int i,int sampleCount)
{vec2 f=Golden2dSeq(i,float(sampleCount));return vec2(sqrt(f.x),TWO_PI*f.y);}`;E.IncludesShadersStore[W]||(E.IncludesShadersStore[W]=G);var ve={name:W,shader:G},K=`diffusionProfile`,q=`uniform vec3 diffusionS[5];uniform float diffusionD[5];uniform float filterRadii[5];`;E.IncludesShadersStore[K]||(E.IncludesShadersStore[K]=q);var ye={name:K,shader:q},be=e({subSurfaceScatteringPixelShader:()=>Se}),J=`subSurfaceScatteringPixelShader`,Y=`#include<helperFunctions>
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
totalWeight=max(totalWeight,HALF_MIN);gl_FragColor=vec4(inputColor.rgb+albedo*max(totalIrradiance/totalWeight,vec3(0.0)),1.);}`;E.ShadersStore[J]||(E.ShadersStore[J]=Y);var xe=[S,ve,se,ye];for(let e of xe)E.IncludesShadersStore[e.name]||(E.IncludesShadersStore[e.name]=e.shader);var Se={name:J,shader:Y},Ce=e({volumetricLightingRenderVolumeVertexShader:()=>Te}),X=`volumetricLightingRenderVolumeVertexShader`,Z=`#include<__decl__sceneVertex>
#include<__decl__meshVertex>
attribute vec3 position;varying vec4 vWorldPos;void main(void) {vec4 worldPos=world*vec4(position,1.0);vWorldPos=worldPos;gl_Position=viewProjection*worldPos;}
`;E.ShadersStore[X]||(E.ShadersStore[X]=Z);var we=[u,le,b,c];for(let e of we)E.IncludesShadersStore[e.name]||(E.IncludesShadersStore[e.name]=e.shader);var Te={name:X,shader:Z},Ee=e({gaussianSplattingVertexShaderWGSL:()=>Oe}),Q=`gaussianSplattingVertexShader`,$=`#include<sceneUboDeclaration>
#include<meshUboDeclaration>
#include<helperFunctions>
#include<clipPlaneVertexDeclaration>
#include<fogVertexDeclaration>
#include<logDepthDeclaration>
attribute splatIndex0: vec4f;attribute splatIndex1: vec4f;attribute splatIndex2: vec4f;attribute splatIndex3: vec4f;attribute position: vec3f;uniform invViewport: vec2f;uniform dataTextureSize: vec2f;uniform focal: vec2f;uniform kernelSize: f32;uniform minPixelSize: f32;uniform eyePosition: vec3f;uniform alpha: f32;
#ifdef PREPASS
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
uniform previousWorld: mat4x4f;uniform previousViewProjection: mat4x4f;
#if IS_COMPOUND
uniform previousPartWorld: array<mat4x4<f32>,MAX_PART_COUNT>;
#endif
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
uniform geometryDepthRange: vec2f;
#endif
#endif
#if IS_COMPOUND
uniform partWorld: array<mat4x4<f32>,MAX_PART_COUNT>;uniform partVisibility: array<f32,MAX_PART_COUNT>;
#endif
var covariancesATexture: texture_2d<f32>;var covariancesBTexture: texture_2d<f32>;var centersTexture: texture_2d<f32>;var colorsTexture: texture_2d<f32>;
#ifdef USE_SOG
var sogQuatsTexture: texture_2d<f32>;uniform sogMeansMin: vec3f;uniform sogMeansMax: vec3f;
#ifdef USE_SOG_V2
var sogCodebookTexture: texture_2d<f32>;
#else
uniform sogScalesMin: vec3f;uniform sogScalesMax: vec3f;uniform sogSh0Min: vec4f;uniform sogSh0Max: vec4f;uniform sogShnMin: f32;uniform sogShnMax: f32;
#endif
#if SH_DEGREE>0
var sogShNCentroidsTexture: texture_2d<f32>;var sogShNLabelsTexture: texture_2d<f32>;uniform sogShCoeffCount: f32;
#endif
#endif
#if SH_DEGREE>0 && !defined(USE_SOG)
var shTexture0: texture_2d<u32>;
#endif
#if SH_DEGREE>1 && !defined(USE_SOG)
var shTexture1: texture_2d<u32>;
#endif
#if SH_DEGREE>2 && !defined(USE_SOG)
var shTexture2: texture_2d<u32>;
#endif
#if SH_DEGREE>3 && !defined(USE_SOG)
var shTexture3: texture_2d<u32>;var shTexture4: texture_2d<u32>;
#endif
#if IS_COMPOUND
var partIndicesTexture: texture_2d<f32>;
#endif
varying vColor: vec4f;varying vPosition: vec2f;
#ifdef PREPASS
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
#define CUSTOM_VERTEX_DEFINITIONS
#include<gaussianSplatting>
@vertex
fn main(input : VertexInputs)->FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
let splatIndex: f32=getSplatIndex(i32(vertexInputs.position.z+0.5),vertexInputs.splatIndex0,vertexInputs.splatIndex1,vertexInputs.splatIndex2,vertexInputs.splatIndex3);var splat: Splat=readSplat(splatIndex,uniforms.dataTextureSize);var covA: vec3f=splat.covA.xyz;var covB: vec3f=vec3f(splat.covA.w,splat.covB.xy);
#if IS_COMPOUND
let splatWorld: mat4x4f=getPartWorld(splat.partIndex);
#else
let splatWorld: mat4x4f=mesh.world;
#endif
let worldPos: vec4f=splatWorld*vec4f(splat.center.xyz,1.0);vertexOutputs.vPosition=vertexInputs.position.xy;
#if defined(PREPASS_ALBEDO) || defined(PREPASS_ALBEDO_SQRT)
vertexOutputs.vGeometryAlbedo=splat.color.xyz;
#endif
#if SH_DEGREE>0
let worldRot: mat3x3f= mat3x3f(splatWorld[0].xyz,splatWorld[1].xyz,splatWorld[2].xyz);let normWorldRot: mat3x3f=inverseMat3(worldRot);var eyeToSplatLocalSpace: vec3f=normalize(normWorldRot*(worldPos.xyz-uniforms.eyePosition.xyz));
#if defined(GS_DBG_ENABLED) && IS_COMPOUND
{let _row3=textureLoad(dbgPartData,vec2i(i32(splat.partIndex),3),0);
#if SH_DEGREE>3
let _so4=textureLoad(dbgPartData,vec2i(i32(splat.partIndex),4),0).x;
#else
let _so4: f32=1.0;
#endif
vertexOutputs.vColor=vec4f(_row3.x*splat.color.xyz+computeSHWeighted(splat,eyeToSplatLocalSpace,_row3.y,_row3.z,_row3.w,_so4),splat.color.w*uniforms.alpha);}
#elif defined(GS_DBG_ENABLED) && GS_DBG_SH_DC==0
vertexOutputs.vColor=vec4f(computeSH(splat,eyeToSplatLocalSpace),splat.color.w*uniforms.alpha);
#else
vertexOutputs.vColor=vec4f(splat.color.xyz+computeSH(splat,eyeToSplatLocalSpace),splat.color.w*uniforms.alpha);
#endif
#else
#if defined(GS_DBG_ENABLED) && IS_COMPOUND
{let _shDc=textureLoad(dbgPartData,vec2i(i32(splat.partIndex),3),0).x;vertexOutputs.vColor=vec4f(_shDc*splat.color.xyz,splat.color.w*uniforms.alpha);}
#elif defined(GS_DBG_ENABLED) && GS_DBG_SH_DC==0
vertexOutputs.vColor=vec4f(0.0,0.0,0.0,splat.color.w*uniforms.alpha);
#else
vertexOutputs.vColor=vec4f(splat.color.xyz,splat.color.w*uniforms.alpha);
#endif
#endif
#if IS_COMPOUND
vertexOutputs.vColor.w*=uniforms.partVisibility[splat.partIndex];
#endif
var scale: vec2f=vec2f(1.,1.);
#define CUSTOM_VERTEX_UPDATE
vertexOutputs.position=gaussianSplatting(vertexInputs.position.xy,worldPos.xyz,scale,covA,covB,splatWorld,scene.view,scene.projection,uniforms.focal,uniforms.invViewport,uniforms.kernelSize,uniforms.minPixelSize);
#ifdef PREPASS
#if defined(PREPASS_POSITION) || defined(PREPASS_LOCAL_POSITION) || defined(PREPASS_DEPTH) || defined(PREPASS_NORMALIZED_VIEW_DEPTH) || defined(PREPASS_NORMAL) || defined(PREPASS_WORLD_NORMAL) || defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
let geometrySplatViewPosition=(scene.view*worldPos).xyz;let viewRotation=mat3x3f(scene.view[0].xyz,scene.view[1].xyz,scene.view[2].xyz);
#endif
#if defined(PREPASS_POSITION) || defined(PREPASS_LOCAL_POSITION) || defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
var geometryPlaneViewPosition=scene.inverseProjection*vertexOutputs.position;geometryPlaneViewPosition/=geometryPlaneViewPosition.w;let geometryPlanePositionW=worldPos.xyz+transpose(viewRotation)*(geometryPlaneViewPosition.xyz-geometrySplatViewPosition);
#if defined(PREPASS_LOCAL_POSITION) || defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
let splatWorldRotation=mat3x3f(splatWorld[0].xyz,splatWorld[1].xyz,splatWorld[2].xyz);let geometryPlanePositionL=splat.center.xyz+inverseMat3(splatWorldRotation)*(geometryPlanePositionW-worldPos.xyz);
#endif
#endif
#ifdef PREPASS_POSITION
vertexOutputs.vGeometryPositionW=geometryPlanePositionW;
#endif
#ifdef PREPASS_LOCAL_POSITION
vertexOutputs.vGeometryPositionL=geometryPlanePositionL;
#endif
#ifdef PREPASS_DEPTH
vertexOutputs.vGeometryViewDepth=geometrySplatViewPosition.z;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
vertexOutputs.vGeometryNormalizedViewDepth=(geometrySplatViewPosition.z-uniforms.geometryDepthRange.x)/(uniforms.geometryDepthRange.y-uniforms.geometryDepthRange.x);
#endif
#if defined(PREPASS_NORMAL) || defined(PREPASS_WORLD_NORMAL)
let geometryNormalV=vec3f(0.0,0.0,select(-1.0,1.0,geometrySplatViewPosition.z<0.0));let geometryNormalW=normalize(transpose(viewRotation)*geometryNormalV);
#ifdef PREPASS_NORMAL
vertexOutputs.vGeometryNormalV=geometryNormalV;
#endif
#ifdef PREPASS_WORLD_NORMAL
vertexOutputs.vGeometryNormalW=geometryNormalW;
#endif
#endif
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
vertexOutputs.vGeometryCurrentPosition=vertexOutputs.position;
#if IS_COMPOUND
vertexOutputs.vGeometryPreviousPosition=uniforms.previousViewProjection*uniforms.previousPartWorld[splat.partIndex]*vec4f(geometryPlanePositionL,1.0);
#else
vertexOutputs.vGeometryPreviousPosition=uniforms.previousViewProjection*uniforms.previousWorld*vec4f(geometryPlanePositionL,1.0);
#endif
#endif
#endif
#include<clipPlaneVertex>
#include<fogVertex>
#include<logDepthVertex>
#define CUSTOM_VERTEX_MAIN_END
}
`;E.ShadersStoreWGSL[Q]||(E.ShadersStoreWGSL[Q]=$);var De=[n,ne,a,de,p,v,C,g,d,t];for(let e of De)E.IncludesShadersStoreWGSL[e.name]||(E.IncludesShadersStoreWGSL[e.name]=e.shader);var Oe={name:Q,shader:$};export{fe as a,j as c,he as i,Ce as n,I as o,be as r,N as s,Ee as t};