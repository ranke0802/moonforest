import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{H as t,It as n,K as r,M as i,N as a,Ot as o,U as s,V as c,a as l,b as u,bt as d,gn as f,h as p,x as m,yt as h}from"./babylon-game-CRNdG57U.js";import{Nt as g,h as _,l as v}from"./babylon-tools~game~cinematic-interaction-Bk4IdV0B.js";var y=e({_BasisTextureLoader:()=>b}),b=class{constructor(){this.supportCascades=!1}loadCubeData(e,t,n,r,i){if(Array.isArray(e))return;let a=t.getEngine().getCaps(),o={supportedCompressionFormats:{etc1:!!a.etc1,s3tc:!!a.s3tc,pvrtc:!!a.pvrtc,etc2:!!a.etc2,astc:!!a.astc,bc7:!!a.bptc}};m(e,o).then(e=>{let n=e.fileInfo.images[0].levels.length>1&&t.generateMipMaps;u(t,e),t.getEngine()._setCubeMapTextureParams(t,n),t.isReady=!0,t.onLoadedObservable.notifyObservers(t),t.onLoadedObservable.clear(),r&&r()}).catch(e=>{_.Warn(`Failed to transcode Basis file, transcoding may not be supported on this device`),t.isReady=!0,i&&i(e)})}loadData(e,t,n){let r=t.getEngine().getCaps(),i={supportedCompressionFormats:{etc1:!!r.etc1,s3tc:!!r.s3tc,pvrtc:!!r.pvrtc,etc2:!!r.etc2,astc:!!r.astc,bc7:!!r.bptc}};m(e,i).then(e=>{let r=e.fileInfo.images[0].levels[0],i=e.fileInfo.images[0].levels.length>1&&t.generateMipMaps;n(r.width,r.height,i,e.format!==-1,()=>{u(t,e)})}).catch(e=>{_.Warn(`Failed to transcode Basis file, transcoding may not be supported on this device`),_.Warn(`Failed to transcode Basis file: ${e}`),n(0,0,!1,!1,()=>{},!0)})}},x=e({FlowGraphDebugBlock:()=>C,RegisterFlowGraphDebugBlock:()=>T}),S=100,C=class e extends n{constructor(e){super(e),this.log=[],this._isDebug=!0,this.input=this.registerDataInput(`input`,o),this.output=this.registerDataOutput(`output`,o)}_updateOutputs(e){let t=this.input.getValue(e);this.output.setValue(t,e),this._logValue(t)}_logValue(t){if(t==null)this.log.push([`null`,`null`]);else{let n=e._FormatValue(t);this.log.push([n,String(t)])}this.log.length>S&&this.log.shift()}static _FormatValue(e){if(typeof e==`number`)return Number.isInteger(e)?e.toString():e.toFixed(4);if(typeof e==`boolean`||typeof e==`string`)return String(e);if(e&&typeof e==`object`){if(`w`in e&&`x`in e&&`y`in e&&`z`in e)return`(${e.x.toFixed(3)}, ${e.y.toFixed(3)}, ${e.z.toFixed(3)}, ${e.w.toFixed(3)})`;if(`z`in e&&`x`in e&&`y`in e)return`(${e.x.toFixed(3)}, ${e.y.toFixed(3)}, ${e.z.toFixed(3)})`;if(`x`in e&&`y`in e)return`(${e.x.toFixed(3)}, ${e.y.toFixed(3)})`;if(`r`in e&&`g`in e&&`b`in e){let t=`a`in e?`, ${e.a.toFixed(3)}`:``;return`(${e.r.toFixed(3)}, ${e.g.toFixed(3)}, ${e.b.toFixed(3)}${t})`}if(typeof e.toString==`function`&&e.toString!==Object.prototype.toString)return e.toString()}try{let t=JSON.stringify(e);return t.length>64?t.substring(0,61)+`...`:t}catch{return String(e)}}getClassName(){return`FlowGraphDebugBlock`}},w=!1;function T(){w||(w=!0,g(`FlowGraphDebugBlock`,C))}var E=e({gaussianSplattingPixelShader:()=>A}),D=`gaussianSplattingPixelShader`,O=`#include<clipPlaneFragmentDeclaration>
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
`;v.ShadersStore[D]||(v.ShadersStore[D]=O);var k=[d,r,s,a,i,f,t,c,p,h,l];for(let e of k)v.IncludesShadersStore[e.name]||(v.IncludesShadersStore[e.name]=e.shader);var A={name:D,shader:O},j=e({textureProcessorPixelShaderWGSL:()=>P}),M=`textureProcessorPixelShader`,N=`#ifdef OPERAND_A_TEXTURE
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
`;v.ShadersStoreWGSL[M]||(v.ShadersStoreWGSL[M]=N);var P={name:M,shader:N};export{y as i,E as n,x as r,j as t};