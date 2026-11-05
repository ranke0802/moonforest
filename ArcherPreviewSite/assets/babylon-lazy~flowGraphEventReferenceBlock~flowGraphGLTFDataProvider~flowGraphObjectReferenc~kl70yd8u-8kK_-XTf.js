import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{At as t,Bt as n,F as r,Ft as i,Gt as a,Ht as o,It as s,Ot as c,R as l,Ut as u,Vt as d,Wt as f,jt as p,kt as m}from"./babylon-game-Bp_kWzU6.js";import{l as h}from"./babylon-tools~game~cinematic-interaction-Dq0sw1ll.js";import{o as g,t as _}from"./babylon-tools~game~flowGraphEventReferenceBlock~flowGraphGLTFDataProvider~flowGraphObjectRe~hj0tdedi-DgRK7x6b.js";var v=e({_ENVTextureLoader:()=>y}),y=class{constructor(){this.supportCascades=!1}loadCubeData(e,t,n,r,i){if(Array.isArray(e))return;let o=u(e);if(o){t.width=o.width,t.height=o.width;try{l(),a(t,o),f(t,e,o).then(()=>{t.isReady=!0,t.onLoadedObservable.notifyObservers(t),t.onLoadedObservable.clear(),r&&r()},e=>{i?.(`Can not upload environment levels`,e)})}catch(e){i?.(`Can not upload environment file`,e)}}else i&&i(`Can not parse the environment file`,null)}loadData(){throw`.env not supported in 2d.`}},b=e({FlowGraphGLTFDataProvider:()=>x}),x=class extends s{constructor(e={}){super(e);let t=e.glTF,n=t?.animations?.map(e=>e._babylonAnimationGroup)||[];this.animationGroups=this.registerDataOutput(`animationGroups`,c,n);let r=t?.nodes?.map(e=>e._babylonTransformNode)||[];this.nodes=this.registerDataOutput(`nodes`,c,r)}getClassName(){return`FlowGraphGLTFDataProvider`}},S=e({FlowGraphObjectReferenceBlock:()=>w,GetInteractivityObjectReference:()=>C});function C(e,t){let n=t;for(;n;){let t=e.getObjectReference(n,`nodes`);if(t?.startsWith(`/nodes/`))return t;n=n.parent}return``}var w=class extends s{constructor(e){super(e),this.object=this.registerDataInput(`object`,c),this.value=this.registerDataOutput(`value`,t,``)}_updateOutputs(e){this.value.setValue(C(e,this.object.getValue(e)),e)}getClassName(){return`FlowGraphObjectReferenceBlock`}},T=e({FlowGraphEventReferenceBlock:()=>E}),E=class extends i{constructor(e){super(e),this.config=e,this._assetInverse=_.Identity(),this._selectionPointValue=g.Zero(),this._selectionRayOriginValue=g.Zero();let n=new g(NaN,NaN,NaN);this.node=this.registerDataInput(`node`,c),this.controllerIndexInput=this.registerDataInput(`controllerIndexInput`,m,-1),this.selectionPointInput=this.registerDataInput(`selectionPointInput`,p,n),this.selectionRayOriginInput=this.registerDataInput(`selectionRayOriginInput`,p,n),this.nodeReference=this.registerDataOutput(`nodeReference`,t,``),this.controllerIndex=this.registerDataOutput(`controllerIndex`,m,-1),this.selectionPoint=this.registerDataOutput(`selectionPoint`,p,n),this.selectionRayOrigin=this.registerDataOutput(`selectionRayOrigin`,p,n),this.value=this.registerDataOutput(`value`,t,``),this.out=this._registerSignalOutput(`out`)}_execute(e){this.nodeReference.setValue(C(e,this.node.getValue(e)),e);let t=this.controllerIndexInput.getValue(e);if(t<0)this.controllerIndex.setValue(-1,e);else{let n=e._getGlobalContextVariable(`khrInteractivityControllerIndices`,new Map),r=n.get(t);r===void 0&&(r=n.size,n.set(t,r),e._setGlobalContextVariable(`khrInteractivityControllerIndices`,n)),this.controllerIndex.setValue(r,e)}let n=this.node.getValue(e)?.parent;for(;n?.parent;)n=n.parent;n?.getWorldMatrix?(n.getWorldMatrix().invertToRef(this._assetInverse),g.TransformCoordinatesToRef(this.selectionPointInput.getValue(e),this._assetInverse,this._selectionPointValue),g.TransformCoordinatesToRef(this.selectionRayOriginInput.getValue(e),this._assetInverse,this._selectionRayOriginValue),this.selectionPoint.setValue(this._selectionPointValue,e),this.selectionRayOrigin.setValue(this._selectionRayOriginValue,e)):(this.selectionPoint.setValue(this.selectionPointInput.getValue(e),e),this.selectionRayOrigin.setValue(this.selectionRayOriginInput.getValue(e),e)),this.value.setValue(e.getEventReference(this.config.eventKey??`gltf:manual`),e),this.out._activateSignal(e)}getClassName(){return`FlowGraphEventReferenceBlock`}},D=e({selectionOutlinePixelShader:()=>A}),O=`selectionOutlinePixelShader`,k=`uniform sampler2D maskSampler;
#ifdef OUTLINELAYER_DEPTH_OCCLUSION
uniform sampler2D depthSampler;
#endif
varying vec2 vUV;uniform vec2 screenSize;uniform vec3 outlineColor;uniform float outlineThickness;
#ifdef OUTLINELAYER_DEPTH_OCCLUSION
uniform float occlusionStrength;uniform float occlusionThreshold;
#endif
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
vec2 texelSize=1.0/screenSize;vec2 sampleOffset=texelSize*outlineThickness;
#if defined(OUTLINELAYER_SAMPLING_TRIDIRECTIONAL) || defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
vec2 maskTopCenter=texture2D(maskSampler,vUV+vec2(0.0,sampleOffset.y)).rg;vec2 maskTopRight=texture2D(maskSampler,vUV+sampleOffset).rg;vec2 maskMiddleCenter=texture2D(maskSampler,vUV).rg;vec2 maskMiddleRight=texture2D(maskSampler,vUV+vec2(sampleOffset.x,0.0)).rg;
#endif
#if defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
vec2 maskTopLeft=texture2D(maskSampler,vUV+vec2(-sampleOffset.x,sampleOffset.y)).rg;vec2 maskMiddleLeft=texture2D(maskSampler,vUV+vec2(-sampleOffset.x,0.0)).rg;vec2 maskBottomRight=texture2D(maskSampler,vUV+vec2(sampleOffset.x,-sampleOffset.y)).rg;vec2 maskBottomCenter=texture2D(maskSampler,vUV+vec2(0.0,-sampleOffset.y)).rg;vec2 maskBottomLeft=texture2D(maskSampler,vUV+vec2(-sampleOffset.x,-sampleOffset.y)).rg;
#endif
#ifdef OUTLINELAYER_SAMPLING_TRIDIRECTIONAL
vec3 gradient=vec3(
maskMiddleCenter.r-maskMiddleRight.r,
maskMiddleCenter.r-maskTopCenter.r,
maskMiddleCenter.r-maskTopRight.r
);float edgeStrength=length(gradient);
#elif defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
float gradientX =
(maskTopLeft.r+2.0*maskMiddleLeft.r+maskBottomLeft.r) -
(maskTopRight.r+2.0*maskMiddleRight.r+maskBottomRight.r);float gradientY =
(maskBottomLeft.r+2.0*maskBottomCenter.r+maskBottomRight.r) -
(maskTopLeft.r+2.0*maskTopCenter.r+maskTopRight.r);float edgeStrength=length(vec2(gradientX,gradientY));
#endif
float outlineMask=step(0.5,edgeStrength); 
float finalOutlineMask=outlineMask;
#ifdef OUTLINELAYER_DEPTH_OCCLUSION
if (outlineMask>0.0) {
#if defined(OUTLINELAYER_SAMPLING_TRIDIRECTIONAL) || defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
float depthTopCenter=texture2D(depthSampler,vUV+vec2(0.0,sampleOffset.y)).r;float depthTopRight=texture2D(depthSampler,vUV+sampleOffset).r;float depthMiddleCenter=texture2D(depthSampler,vUV).r;float depthMiddleRight=texture2D(depthSampler,vUV+vec2(sampleOffset.x,0.0)).r;
#endif
#if defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
float depthTopLeft=texture2D(depthSampler,vUV+vec2(-sampleOffset.x,sampleOffset.y)).r;float depthMiddleLeft=texture2D(depthSampler,vUV+vec2(-sampleOffset.x,0.0)).r;float depthBottomRight=texture2D(depthSampler,vUV+vec2(sampleOffset.x,-sampleOffset.y)).r;float depthBottomCenter=texture2D(depthSampler,vUV+vec2(0.0,-sampleOffset.y)).r;float depthBottomLeft=texture2D(depthSampler,vUV+vec2(-sampleOffset.x,-sampleOffset.y)).r;
#endif
#if defined(OUTLINELAYER_SAMPLING_TRIDIRECTIONAL) || defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
float occlusionTopCenter=step(occlusionThreshold,abs(maskTopCenter.g-depthTopCenter));float occlusionTopRight=step(occlusionThreshold,abs(maskTopRight.g-depthTopRight));float occlusionMiddleCenter=step(occlusionThreshold,abs(maskMiddleCenter.g-depthMiddleCenter));float occlusionMiddleRight=step(occlusionThreshold,abs(maskMiddleRight.g-depthMiddleRight));
#endif
#if defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
float occlusionTopLeft=step(occlusionThreshold,abs(maskTopLeft.g-depthTopLeft));float occlusionMiddleLeft=step(occlusionThreshold,abs(maskMiddleLeft.g-depthMiddleLeft));float occlusionBottomRight=step(occlusionThreshold,abs(maskBottomRight.g-depthBottomRight));float occlusionBottomCenter=step(occlusionThreshold,abs(maskBottomCenter.g-depthBottomCenter));float occlusionBottomLeft=step(occlusionThreshold,abs(maskBottomLeft.g-depthBottomLeft));
#endif
float occlusionFactor=occlusionMiddleCenter;
#ifdef OUTLINELAYER_SAMPLING_TRIDIRECTIONAL
occlusionFactor=min(occlusionFactor,occlusionTopCenter);occlusionFactor=min(occlusionFactor,occlusionTopRight);occlusionFactor=min(occlusionFactor,occlusionMiddleRight);
#elif defined(OUTLINELAYER_SAMPLING_OCTADIRECTIONAL)
occlusionFactor=min(occlusionFactor,occlusionTopCenter);occlusionFactor=min(occlusionFactor,occlusionTopRight);occlusionFactor=min(occlusionFactor,occlusionTopLeft);occlusionFactor=min(occlusionFactor,occlusionMiddleRight);occlusionFactor=min(occlusionFactor,occlusionMiddleLeft);occlusionFactor=min(occlusionFactor,occlusionBottomRight);occlusionFactor=min(occlusionFactor,occlusionBottomCenter);occlusionFactor=min(occlusionFactor,occlusionBottomLeft);
#endif
finalOutlineMask*=1.0-occlusionStrength*occlusionFactor;}
#endif
gl_FragColor=vec4(outlineColor,finalOutlineMask);
#define CUSTOM_FRAGMENT_MAIN_END
}
`;h.ShadersStore[O]||(h.ShadersStore[O]=k);var A={name:O,shader:k},j=`fibonacci`,M=`fn rcp(x: f32)->f32
{return 1./x;}
const GOLDEN_RATIO=1.618033988749895;fn Golden2dSeq(i: u32,n: f32)->vec2f
{return vec2f(f32(i)/n+(0.5/n),fract(f32(i)*rcp(GOLDEN_RATIO)));}
fn SampleDiskGolden(i: u32,sampleCount: u32)->vec2f
{let f=Golden2dSeq(i,f32(sampleCount));return vec2f(sqrt(f.x),TWO_PI*f.y);}
`;h.IncludesShadersStoreWGSL[j]||(h.IncludesShadersStoreWGSL[j]=M);var N={name:j,shader:M},P=`diffusionProfile`,F=`uniform diffusionS: array<vec3f,5>;uniform diffusionD: array<f32,5>;uniform filterRadii: array<f32,5>;
`;h.IncludesShadersStoreWGSL[P]||(h.IncludesShadersStoreWGSL[P]=F);var I={name:P,shader:F},L=e({subSurfaceScatteringPixelShaderWGSL:()=>V}),R=`subSurfaceScatteringPixelShader`,z=`#include<helperFunctions>
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
`;h.ShadersStoreWGSL[R]||(h.ShadersStoreWGSL[R]=z);var B=[o,N,r,I];for(let e of B)h.IncludesShadersStoreWGSL[e.name]||(h.IncludesShadersStoreWGSL[e.name]=e.shader);var V={name:R,shader:z},H=e({volumetricLightingRenderVolumeVertexShaderWGSL:()=>K}),U=`volumetricLightingRenderVolumeVertexShader`,W=`#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position : vec3f;varying vWorldPos: vec4f;@vertex
fn main(input : VertexInputs)->FragmentInputs {let worldPos=mesh.world*vec4f(vertexInputs.position,1.0);vertexOutputs.vWorldPos=worldPos;vertexOutputs.position=scene.viewProjection*worldPos;}
`;h.ShadersStoreWGSL[U]||(h.ShadersStoreWGSL[U]=W);var G=[n,d];for(let e of G)h.IncludesShadersStoreWGSL[e.name]||(h.IncludesShadersStoreWGSL[e.name]=e.shader);var K={name:U,shader:W};export{S as a,T as i,L as n,b as o,D as r,v as s,H as t};