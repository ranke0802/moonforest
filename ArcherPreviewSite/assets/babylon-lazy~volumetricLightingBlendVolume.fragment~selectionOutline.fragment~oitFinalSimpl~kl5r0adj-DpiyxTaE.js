import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{Nt as t,Ot as n,Pt as r,_ as i,ct as a,kt as o,lt as s,m as c,ot as l,v as u}from"./babylon-game-Bp_kWzU6.js";import{Nt as d,l as f}from"./babylon-tools~game~cinematic-interaction-Dq0sw1ll.js";var p=e({_IESTextureLoader:()=>m}),m=class{constructor(){this.supportCascades=!1}loadCubeData(){throw`.ies not supported in Cube.`}loadData(e,t,n){let r=new Uint8Array(e.buffer,e.byteOffset,e.byteLength),i=l(r);n(i.width,i.height,!!t.useMipMaps,!1,()=>{let e=t.getEngine();t.type=1,t.format=6,t._gammaSpace=!1,e._uploadDataToTextureDirectly(t,i.data)})}},h=e({FlowGraphPointerMoveEventBlock:()=>g,RegisterFlowGraphPointerMoveEventBlock:()=>v}),g=class extends t{constructor(e){super(e),this.type=`PointerMove`,this.targetMesh=this.registerDataInput(`targetMesh`,n,e?.targetMesh),this.pointerId=this.registerDataOutput(`pointerId`,o),this.meshUnderPointer=this.registerDataOutput(`meshUnderPointer`,n),this.pickedPoint=this.registerDataOutput(`pickedPoint`,n)}_executeEvent(e,t){let n=this.targetMesh.getValue(e),i=t.pickInfo?.pickedMesh;return n&&!(i===n||i&&r(i,n))?!0:(this.pointerId.setValue(t.event.pointerId,e),this.meshUnderPointer.setValue(i??null,e),this.pickedPoint.setValue(t.pickInfo?.pickedPoint??null,e),this._execute(e),!this.config?.stopPropagation)}_preparePendingTasks(e){}_cancelPendingTasks(e){}getClassName(){return`FlowGraphPointerMoveEventBlock`}},_=!1;function v(){_||(_=!0,d(`FlowGraphPointerMoveEventBlock`,g))}var y=e({FlowGraphPointerUpEventBlock:()=>b,RegisterFlowGraphPointerUpEventBlock:()=>S}),b=class extends t{constructor(e){super(e),this.type=`PointerUp`,this.targetMesh=this.registerDataInput(`targetMesh`,n,e?.targetMesh),this.pointerId=this.registerDataOutput(`pointerId`,o),this.pickedMesh=this.registerDataOutput(`pickedMesh`,n),this.pickedPoint=this.registerDataOutput(`pickedPoint`,n)}_executeEvent(e,t){let n=this.targetMesh.getValue(e),i=t.pickInfo?.pickedMesh;return n&&!(i===n||i&&r(i,n))?!0:(this.pointerId.setValue(t.event.pointerId,e),this.pickedMesh.setValue(i??null,e),this.pickedPoint.setValue(t.pickInfo?.pickedPoint??null,e),this._execute(e),!this.config?.stopPropagation)}_preparePendingTasks(e){}_cancelPendingTasks(e){}getClassName(){return`FlowGraphPointerUpEventBlock`}},x=!1;function S(){x||(x=!0,d(`FlowGraphPointerUpEventBlock`,b))}var C=e({gaussianSplattingVoxelVertexShader:()=>D}),w=`gaussianSplattingVoxelVertexShader`,T=`#include<__decl__gaussianSplattingVertex>
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
vPatchPosition=position.xy;}`;f.ShadersStore[w]||(f.ShadersStore[w]=T);var E=[u,s,a,c,i];for(let e of E)f.IncludesShadersStore[e.name]||(f.IncludesShadersStore[e.name]=e.shader);var D={name:w,shader:T},O=e({oitFinalSimpleBlendPixelShader:()=>j}),k=`oitFinalSimpleBlendPixelShader`,A=`precision highp float;uniform sampler2D uFrontColor;void main() {ivec2 fragCoord=ivec2(gl_FragCoord.xy);vec4 frontColor=texelFetch(uFrontColor,fragCoord,0);glFragColor=frontColor;}
`;f.ShadersStore[k]||(f.ShadersStore[k]=A);var j={name:k,shader:A},M=e({oitFinalSimpleBlendPixelShaderWGSL:()=>F}),N=`oitFinalSimpleBlendPixelShader`,P=`var uFrontColor: texture_2d<f32>;@fragment
fn main(input: FragmentInputs)->FragmentOutputs {var fragCoord: vec2i=vec2i(fragmentInputs.position.xy);var frontColor: vec4f=textureLoad(uFrontColor,fragCoord,0);fragmentOutputs.color=frontColor;}
`;f.ShadersStoreWGSL[N]||(f.ShadersStoreWGSL[N]=P);var F={name:N,shader:P},I=e({selectionOutlinePixelShaderWGSL:()=>z}),L=`selectionOutlinePixelShader`,R=`var maskSamplerSampler: sampler;var maskSampler: texture_2d<f32>;
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
`;f.ShadersStoreWGSL[L]||(f.ShadersStoreWGSL[L]=R);var z={name:L,shader:R},B=e({volumetricLightingBlendVolumePixelShaderWGSL:()=>U}),V=`volumetricLightingBlendVolumePixelShader`,H=`varying vUV: vec2f;var textureSamplerSampler: sampler;var textureSampler: texture_2d<f32>;var depthSampler: texture_2d<f32>;uniform invProjection: mat4x4<f32>;uniform outputTextureSize: vec2f;
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
`;f.ShadersStoreWGSL[V]||(f.ShadersStoreWGSL[V]=H);var U={name:V,shader:H};export{C as a,p as c,O as i,I as n,y as o,M as r,h as s,B as t};