import{Ar as e,Ea as t,Gu as n,Ku as r,Qu as i,Ta as a,Tr as o,Wu as s,Zu as c,ad as l,jr as u,qu as d,xi as f}from"./babylon-game-uE9lshiC.js";import{o as p,t as m}from"./babylon-tools~game~flowGraphEventReferenceBlock~flowGraphGLTFDataProvider~flowGraphObjectRe~mxvs7e9f-CAkV8rU7.js";import{t as h}from"./babylon-tools~game~npc-world~developer-editor~developer-actors~cinematic-interaction~cinema~di652mou-D-XQlhUT.js";function g(e,t){let n=t;for(;n;){let t=e.getObjectReference(n,`nodes`);if(t?.startsWith(`/nodes/`))return t;n=n.parent}return``}var _=class extends i{constructor(e){super(e),this.object=this.registerDataInput(`object`,s),this.value=this.registerDataOutput(`value`,r,``)}_updateOutputs(e){this.value.setValue(g(e,this.object.getValue(e)),e)}getClassName(){return`FlowGraphObjectReferenceBlock`}},v=class extends c{constructor(e){super(e),this.config=e,this._assetInverse=m.Identity(),this._selectionPointValue=p.Zero(),this._selectionRayOriginValue=p.Zero();let t=new p(NaN,NaN,NaN);this.node=this.registerDataInput(`node`,s),this.controllerIndexInput=this.registerDataInput(`controllerIndexInput`,n,-1),this.selectionPointInput=this.registerDataInput(`selectionPointInput`,d,t),this.selectionRayOriginInput=this.registerDataInput(`selectionRayOriginInput`,d,t),this.nodeReference=this.registerDataOutput(`nodeReference`,r,``),this.controllerIndex=this.registerDataOutput(`controllerIndex`,n,-1),this.selectionPoint=this.registerDataOutput(`selectionPoint`,d,t),this.selectionRayOrigin=this.registerDataOutput(`selectionRayOrigin`,d,t),this.value=this.registerDataOutput(`value`,r,``),this.out=this._registerSignalOutput(`out`)}_execute(e){this.nodeReference.setValue(g(e,this.node.getValue(e)),e);let t=this.controllerIndexInput.getValue(e);if(t<0)this.controllerIndex.setValue(-1,e);else{let n=e._getGlobalContextVariable(`khrInteractivityControllerIndices`,new Map),r=n.get(t);r===void 0&&(r=n.size,n.set(t,r),e._setGlobalContextVariable(`khrInteractivityControllerIndices`,n)),this.controllerIndex.setValue(r,e)}let n=this.node.getValue(e)?.parent;for(;n?.parent;)n=n.parent;n?.getWorldMatrix?(n.getWorldMatrix().invertToRef(this._assetInverse),p.TransformCoordinatesToRef(this.selectionPointInput.getValue(e),this._assetInverse,this._selectionPointValue),p.TransformCoordinatesToRef(this.selectionRayOriginInput.getValue(e),this._assetInverse,this._selectionRayOriginValue),this.selectionPoint.setValue(this._selectionPointValue,e),this.selectionRayOrigin.setValue(this._selectionRayOriginValue,e)):(this.selectionPoint.setValue(this.selectionPointInput.getValue(e),e),this.selectionRayOrigin.setValue(this.selectionRayOriginInput.getValue(e),e)),this.value.setValue(e.getEventReference(this.config.eventKey??`gltf:manual`),e),this.out._activateSignal(e)}getClassName(){return`FlowGraphEventReferenceBlock`}},y=`gaussianSplattingVoxelVertexShader`,b=`#include<__decl__gaussianSplattingVertex>
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
vPatchPosition=position.xy;}`;h.ShadersStore[y]||(h.ShadersStore[y]=b);var x=[u,t,a,o,e];for(let e of x)h.IncludesShadersStore[e.name]||(h.IncludesShadersStore[e.name]=e.shader);var S={name:y,shader:b},C=`oitFinalSimpleBlendPixelShader`,w=`precision highp float;uniform sampler2D uFrontColor;void main() {ivec2 fragCoord=ivec2(gl_FragCoord.xy);vec4 frontColor=texelFetch(uFrontColor,fragCoord,0);glFragColor=frontColor;}
`;h.ShadersStore[C]||(h.ShadersStore[C]=w);var T={name:C,shader:w},E=`oitFinalSimpleBlendPixelShader`,D=`var uFrontColor: texture_2d<f32>;@fragment
fn main(input: FragmentInputs)->FragmentOutputs {var fragCoord: vec2i=vec2i(fragmentInputs.position.xy);var frontColor: vec4f=textureLoad(uFrontColor,fragCoord,0);fragmentOutputs.color=frontColor;}
`;h.ShadersStoreWGSL[E]||(h.ShadersStoreWGSL[E]=D);var O={name:E,shader:D},k=`selectionOutlinePixelShader`,A=`var maskSamplerSampler: sampler;var maskSampler: texture_2d<f32>;
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
`;h.ShadersStoreWGSL[k]||(h.ShadersStoreWGSL[k]=A);var j={name:k,shader:A},M=`fibonacci`,N=`fn rcp(x: f32)->f32
{return 1./x;}
const GOLDEN_RATIO=1.618033988749895;fn Golden2dSeq(i: u32,n: f32)->vec2f
{return vec2f(f32(i)/n+(0.5/n),fract(f32(i)*rcp(GOLDEN_RATIO)));}
fn SampleDiskGolden(i: u32,sampleCount: u32)->vec2f
{let f=Golden2dSeq(i,f32(sampleCount));return vec2f(sqrt(f.x),TWO_PI*f.y);}
`;h.IncludesShadersStoreWGSL[M]||(h.IncludesShadersStoreWGSL[M]=N);var P={name:M,shader:N},F=`diffusionProfile`,I=`uniform diffusionS: array<vec3f,5>;uniform diffusionD: array<f32,5>;uniform filterRadii: array<f32,5>;
`;h.IncludesShadersStoreWGSL[F]||(h.IncludesShadersStoreWGSL[F]=I);var L={name:F,shader:I},R=`subSurfaceScatteringPixelShader`,z=`#include<helperFunctions>
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
`;h.ShadersStoreWGSL[R]||(h.ShadersStoreWGSL[R]=z);var B=[l,P,f,L];for(let e of B)h.IncludesShadersStoreWGSL[e.name]||(h.IncludesShadersStoreWGSL[e.name]=e.shader);var V={name:R,shader:z},H=`volumetricLightingBlendVolumePixelShader`,U=`varying vUV: vec2f;var textureSamplerSampler: sampler;var textureSampler: texture_2d<f32>;var depthSampler: texture_2d<f32>;uniform invProjection: mat4x4<f32>;uniform outputTextureSize: vec2f;
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
`;h.ShadersStoreWGSL[H]||(h.ShadersStoreWGSL[H]=U);var W={name:H,shader:U};export{T as a,_ as c,O as i,g as l,V as n,S as o,j as r,v as s,W as t};