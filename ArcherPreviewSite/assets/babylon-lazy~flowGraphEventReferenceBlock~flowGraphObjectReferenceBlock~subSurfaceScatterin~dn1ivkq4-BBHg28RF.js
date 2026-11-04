import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{A as t,At as n,Bt as r,F as i,Ft as ee,Ht as te,I as a,It as o,J as s,L as c,Ot as l,P as ne,Vt as u,X as d,Y as f,an as p,g as m,gt as h,ht as g,i as _,jt as v,kt as y,lt as b,tt as x}from"./babylon-game-dzYjm6Bm.js";import{o as S,t as C}from"./babylon-tools~game~flowGraphEventReferenceBlock~flowGraphGLTFDataProvider~flowGraphObjectRe~o7rzo1tq-29EzcLPb.js";import{t as w}from"./babylon-tools~game~developer-editor~developer-actors~cinematic-game~authored-placement-runt~mzpfqcw1-D-XQlhUT.js";var T=e({FlowGraphObjectReferenceBlock:()=>D,GetInteractivityObjectReference:()=>E});function E(e,t){let n=t;for(;n;){let t=e.getObjectReference(n,`nodes`);if(t?.startsWith(`/nodes/`))return t;n=n.parent}return``}var D=class extends o{constructor(e){super(e),this.object=this.registerDataInput(`object`,l),this.value=this.registerDataOutput(`value`,n,``)}_updateOutputs(e){this.value.setValue(E(e,this.object.getValue(e)),e)}getClassName(){return`FlowGraphObjectReferenceBlock`}},O=e({FlowGraphEventReferenceBlock:()=>k}),k=class extends ee{constructor(e){super(e),this.config=e,this._assetInverse=C.Identity(),this._selectionPointValue=S.Zero(),this._selectionRayOriginValue=S.Zero();let t=new S(NaN,NaN,NaN);this.node=this.registerDataInput(`node`,l),this.controllerIndexInput=this.registerDataInput(`controllerIndexInput`,y,-1),this.selectionPointInput=this.registerDataInput(`selectionPointInput`,v,t),this.selectionRayOriginInput=this.registerDataInput(`selectionRayOriginInput`,v,t),this.nodeReference=this.registerDataOutput(`nodeReference`,n,``),this.controllerIndex=this.registerDataOutput(`controllerIndex`,y,-1),this.selectionPoint=this.registerDataOutput(`selectionPoint`,v,t),this.selectionRayOrigin=this.registerDataOutput(`selectionRayOrigin`,v,t),this.value=this.registerDataOutput(`value`,n,``),this.out=this._registerSignalOutput(`out`)}_execute(e){this.nodeReference.setValue(E(e,this.node.getValue(e)),e);let t=this.controllerIndexInput.getValue(e);if(t<0)this.controllerIndex.setValue(-1,e);else{let n=e._getGlobalContextVariable(`khrInteractivityControllerIndices`,new Map),r=n.get(t);r===void 0&&(r=n.size,n.set(t,r),e._setGlobalContextVariable(`khrInteractivityControllerIndices`,n)),this.controllerIndex.setValue(r,e)}let n=this.node.getValue(e)?.parent;for(;n?.parent;)n=n.parent;n?.getWorldMatrix?(n.getWorldMatrix().invertToRef(this._assetInverse),S.TransformCoordinatesToRef(this.selectionPointInput.getValue(e),this._assetInverse,this._selectionPointValue),S.TransformCoordinatesToRef(this.selectionRayOriginInput.getValue(e),this._assetInverse,this._selectionRayOriginValue),this.selectionPoint.setValue(this._selectionPointValue,e),this.selectionRayOrigin.setValue(this._selectionRayOriginValue,e)):(this.selectionPoint.setValue(this.selectionPointInput.getValue(e),e),this.selectionRayOrigin.setValue(this.selectionRayOriginInput.getValue(e),e)),this.value.setValue(e.getEventReference(this.config.eventKey??`gltf:manual`),e),this.out._activateSignal(e)}getClassName(){return`FlowGraphEventReferenceBlock`}},A=e({volumetricLightingRenderVolumePixelShader:()=>P}),j=`volumetricLightingRenderVolumePixelShader`,M=`#include<__decl__sceneFragment>
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
`;w.ShadersStore[j]||(w.ShadersStore[j]=M);var N=[t,b];for(let e of N)w.IncludesShadersStore[e.name]||(w.IncludesShadersStore[e.name]=e.shader);var P={name:j,shader:M},F=e({gaussianSplattingPixelShaderWGSL:()=>z}),I=`gaussianSplattingPixelShader`,L=`#include<clipPlaneFragmentDeclaration>
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
`;w.ShadersStoreWGSL[I]||(w.ShadersStoreWGSL[I]=L);var R=[h,x,d,c,a,p,f,s,m,g,ne,_];for(let e of R)w.IncludesShadersStoreWGSL[e.name]||(w.IncludesShadersStoreWGSL[e.name]=e.shader);var z={name:I,shader:L},B=`fibonacci`,V=`fn rcp(x: f32)->f32
{return 1./x;}
const GOLDEN_RATIO=1.618033988749895;fn Golden2dSeq(i: u32,n: f32)->vec2f
{return vec2f(f32(i)/n+(0.5/n),fract(f32(i)*rcp(GOLDEN_RATIO)));}
fn SampleDiskGolden(i: u32,sampleCount: u32)->vec2f
{let f=Golden2dSeq(i,f32(sampleCount));return vec2f(sqrt(f.x),TWO_PI*f.y);}
`;w.IncludesShadersStoreWGSL[B]||(w.IncludesShadersStoreWGSL[B]=V);var H={name:B,shader:V},U=`diffusionProfile`,W=`uniform diffusionS: array<vec3f,5>;uniform diffusionD: array<f32,5>;uniform filterRadii: array<f32,5>;
`;w.IncludesShadersStoreWGSL[U]||(w.IncludesShadersStoreWGSL[U]=W);var G={name:U,shader:W},K=e({subSurfaceScatteringPixelShaderWGSL:()=>X}),q=`subSurfaceScatteringPixelShader`,J=`#include<helperFunctions>
#include<fibonacci>
#include<subSurfaceScatteringFunctions>
#include<diffusionProfile>
varying vUV: vec2f;uniform texelSize: vec2f;var textureSamplerSampler: sampler;var textureSampler: texture_2d<f32>;var irradianceSamplerSampler: sampler;var irradianceSampler: texture_2d<f32>;var depthSamplerSampler: sampler;var depthSampler: texture_2d<f32>;var albedoSamplerSampler: sampler;var albedoSampler: texture_2d<f32>;uniform viewportSize: vec2f;uniform metersPerUnit: f32;const LOG2_E=1.4426950408889634;const SSS_PIXELS_PER_SAMPLE=4.;const _SssSampleBudget=40u;
#define SSS_BILATERAL_FILTER true
fn EvalBurleyDiffusionProfile(r: f32,S: vec3f)->vec3f
{let exp_13=exp2(((LOG2_E*(-1.0/3.0))*r)*S); 
let expSum=exp_13*(1.+exp_13*exp_13); 
return (S*rcp(8.*PI))*expSum; }
fn SampleBurleyDiffusionProfile(u_: f32,rcpS: f32)->vec2f
{let u=1.-u_; 
let g=1.+(4.*u)*(2.*u+sqrt(1.+(4.*u)*u));let n=exp2(log2(g)*(-1.0/3.0)); 
let p=(g*n)*n; 
let c=1.+p+n; 
let d=(3./LOG2_E*2.)+(3./LOG2_E)*log2(u); 
let x=(3./LOG2_E)*log2(c)-d; 
let rcpExp=((c*c)*c)*rcp((4.*u)*((c*c)+(4.*u)*(4.*u)));let r=x*rcpS;let rcpPdf=(8.*PI*rcpS)*rcpExp; 
return vec2f(r,rcpPdf);}
fn ComputeBilateralWeight(xy2: f32,z_: f32,mmPerUnit: f32,S: vec3f,rcpPdf: f32)->vec3f
{
#ifndef SSS_BILATERAL_FILTER
let z=0.;
#else
let z=z_;
#endif
let r=sqrt(xy2+(z*mmPerUnit)*(z*mmPerUnit));let area=rcpPdf;
#ifdef SSS_CLAMP_ARTIFACT
return clamp(EvalBurleyDiffusionProfile(r,S)*area,vec3f(0.0),vec3f(1.0));
#else
return EvalBurleyDiffusionProfile(r,S)*area;
#endif
}
fn EvaluateSample(i: u32,n: u32,S: vec3f,d: f32,centerPosVS: vec3f,mmPerUnit: f32,pixelsPerMm: f32,
phase: f32,totalIrradiance: ptr<function,vec3f>,totalWeight: ptr<function,vec3f>)
{let scale =rcp(f32(n));let offset=rcp(f32(n))*0.5;let sinPhase=sin(phase);let cosPhase=cos(phase);let bdp=SampleBurleyDiffusionProfile(f32(i)*scale+offset,d);let r=bdp.x;let rcpPdf=bdp.y;let phi=SampleDiskGolden(i,n).y;let sinPhi=sin(phi);let cosPhi=cos(phi);let sinPsi=cosPhase*sinPhi+sinPhase*cosPhi; 
let cosPsi=cosPhase*cosPhi-sinPhase*sinPhi; 
let vec=r*vec2f(cosPsi,sinPsi);let position=fragmentInputs.vUV+round((pixelsPerMm*r)*vec2(cosPsi,sinPsi))*uniforms.texelSize;let xy2 =r*r;let textureRead=textureSampleLevel(irradianceSampler,irradianceSamplerSampler,position,0.);let viewZ=textureSampleLevel(depthSampler,depthSamplerSampler,position,0.).r;let irradiance =textureRead.rgb;if (testLightingForSSS(textureRead.a))
{let relZ=viewZ-centerPosVS.z;let weight=ComputeBilateralWeight(xy2,relZ,mmPerUnit,S,rcpPdf);*totalIrradiance+=weight*irradiance;*totalWeight +=weight;}
else
{}}
#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {let irradianceAndDiffusionProfile =textureSampleLevel(irradianceSampler,irradianceSamplerSampler,fragmentInputs.vUV,0.);let centerIrradiance=irradianceAndDiffusionProfile.rgb;let diffusionProfileIndex=u32(round(irradianceAndDiffusionProfile.a*255.));var centerDepth =0.;let inputColor=textureSampleLevel(textureSampler,textureSamplerSampler,fragmentInputs.vUV,0.);let passedStencilTest=testLightingForSSS(irradianceAndDiffusionProfile.a);if (passedStencilTest)
{centerDepth=textureSampleLevel(depthSampler,depthSamplerSampler,fragmentInputs.vUV,0.).r;}
if (!passedStencilTest) { 
fragmentOutputs.color=inputColor;return fragmentOutputs;}
let distScale =1.;let S =uniforms.diffusionS[diffusionProfileIndex];let d =uniforms.diffusionD[diffusionProfileIndex];let filterRadius=uniforms.filterRadii[diffusionProfileIndex];let centerPosNDC=fragmentInputs.vUV;let cornerPosNDC=fragmentInputs.vUV+0.5*uniforms.texelSize;let centerPosVS =vec3f(centerPosNDC*uniforms.viewportSize,1.0)*centerDepth; 
let cornerPosVS =vec3f(cornerPosNDC*uniforms.viewportSize,1.0)*centerDepth; 
let mmPerUnit =1000.*(uniforms.metersPerUnit*rcp(distScale));let unitsPerMm=rcp(mmPerUnit);let unitsPerPixel=2.*abs(cornerPosVS.x-centerPosVS.x);let pixelsPerMm =rcp(unitsPerPixel)*unitsPerMm;let filterArea =PI*square(filterRadius*pixelsPerMm);let sampleCount =u32(filterArea*rcp(SSS_PIXELS_PER_SAMPLE));let sampleBudget=_SssSampleBudget;let albedo =textureSampleLevel(albedoSampler,albedoSamplerSampler,fragmentInputs.vUV,0.).rgb;if (distScale==0. || sampleCount<1)
{
#ifdef DEBUG_SSS_SAMPLES
let green=vec3f(0.,1.,0.);fragmentOutputs.color=vec4f(green,1.0);return fragmentOutputs;
#endif
fragmentOutputs.color=vec4f(inputColor.rgb+albedo*centerIrradiance,1.0);return fragmentOutputs;}
#ifdef DEBUG_SSS_SAMPLES
let red =vec3f(1.,0.,0.);let blue=vec3f(0.,0.,1.);fragmentOutputs.color=vec4f(mix(blue,red,clamp(f32(sampleCount)/f32(sampleBudget),0.0,1.0)),1.0);return fragmentOutputs;
#endif
let phase=0.;let n=min(sampleCount,sampleBudget);var totalIrradiance=vec3f(0.);var totalWeight =vec3f(0.);for (var i=0u; i<n; i++)
{EvaluateSample(i,n,S,d,centerPosVS,mmPerUnit,pixelsPerMm,
phase,&totalIrradiance,&totalWeight);}
totalWeight=max(totalWeight,vec3f(HALF_MIN));fragmentOutputs.color=vec4f(inputColor.rgb+albedo*max(totalIrradiance/totalWeight,vec3f(0.0)),1.);}
`;w.ShadersStoreWGSL[q]||(w.ShadersStoreWGSL[q]=J);var Y=[te,H,i,G];for(let e of Y)w.IncludesShadersStoreWGSL[e.name]||(w.IncludesShadersStoreWGSL[e.name]=e.shader);var X={name:q,shader:J},Z=e({volumetricLightingRenderVolumePixelShaderWGSL:()=>ie}),Q=`volumetricLightingRenderVolumePixelShader`,$=`#include<sceneUboDeclaration>
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
`;w.ShadersStoreWGSL[Q]||(w.ShadersStoreWGSL[Q]=$);var re=[r,u];for(let e of re)w.IncludesShadersStoreWGSL[e.name]||(w.IncludesShadersStoreWGSL[e.name]=e.shader);var ie={name:Q,shader:$};export{O as a,A as i,K as n,T as o,F as r,Z as t};