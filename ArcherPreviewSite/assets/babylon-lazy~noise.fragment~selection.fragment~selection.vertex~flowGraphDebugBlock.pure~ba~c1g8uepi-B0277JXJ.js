import{$a as e,$n as t,Ai as n,Bd as r,Fd as i,Gi as a,Gr as o,Hd as s,Id as c,Ld as l,Md as u,Mr as d,Nd as ee,Ni as f,Or as p,Pd as m,Qa as h,Qu as g,Rd as te,Vd as _,Wr as v,Wu as y,ad as b,ao as x,co as S,fa as ne,fi as re,io as ie,ji as ae,la as oe,nd as C,pi as w,rd as T,sa as E,so as D,ua as O,zd as k}from"./babylon-game-D7DEFyT0.js";import{n as A}from"./babylon-tools~moonforestV2~flowGraphEventReferenceBlock~flowGraphGLTFDataProvider~flowGraph~fx6pxob9-Cu_sj2zM.js";import{r as j}from"./babylon-tools~moonforestV2~npc-world~developer-editor~developer-actors~cinematic-game~autho~cw9i536n-qt8HpUyX.js";import{t as M}from"./babylon-tools~moonforestV2~npc-world~developer-editor~developer-actors~cinematic-game~autho~hip21b71-D-XQlhUT.js";var N=class{constructor(){this.supportCascades=!1}loadCubeData(e,t,n,r,i){if(Array.isArray(e))return;let a=t.getEngine().getCaps(),s={supportedCompressionFormats:{etc1:!!a.etc1,s3tc:!!a.s3tc,pvrtc:!!a.pvrtc,etc2:!!a.etc2,astc:!!a.astc,bc7:!!a.bptc}};o(e,s).then(e=>{let n=e.fileInfo.images[0].levels.length>1&&t.generateMipMaps;v(t,e),t.getEngine()._setCubeMapTextureParams(t,n),t.isReady=!0,t.onLoadedObservable.notifyObservers(t),t.onLoadedObservable.clear(),r&&r()}).catch(e=>{j.Warn(`Failed to transcode Basis file, transcoding may not be supported on this device`),t.isReady=!0,i&&i(e)})}loadData(e,t,n){let r=t.getEngine().getCaps(),i={supportedCompressionFormats:{etc1:!!r.etc1,s3tc:!!r.s3tc,pvrtc:!!r.pvrtc,etc2:!!r.etc2,astc:!!r.astc,bc7:!!r.bptc}};o(e,i).then(e=>{let r=e.fileInfo.images[0].levels[0],i=e.fileInfo.images[0].levels.length>1&&t.generateMipMaps;n(r.width,r.height,i,e.format!==-1,()=>{v(t,e)})}).catch(e=>{j.Warn(`Failed to transcode Basis file, transcoding may not be supported on this device`),j.Warn(`Failed to transcode Basis file: ${e}`),n(0,0,!1,!1,()=>{},!0)})}},P=100,F=class e extends g{constructor(e){super(e),this.log=[],this._isDebug=!0,this.input=this.registerDataInput(`input`,y),this.output=this.registerDataOutput(`output`,y)}_updateOutputs(e){let t=this.input.getValue(e);this.output.setValue(t,e),this._logValue(t)}_logValue(t){if(t==null)this.log.push([`null`,`null`]);else{let n=e._FormatValue(t);this.log.push([n,String(t)])}this.log.length>P&&this.log.shift()}static _FormatValue(e){if(typeof e==`number`)return Number.isInteger(e)?e.toString():e.toFixed(4);if(typeof e==`boolean`||typeof e==`string`)return String(e);if(e&&typeof e==`object`){if(`w`in e&&`x`in e&&`y`in e&&`z`in e)return`(${e.x.toFixed(3)}, ${e.y.toFixed(3)}, ${e.z.toFixed(3)}, ${e.w.toFixed(3)})`;if(`z`in e&&`x`in e&&`y`in e)return`(${e.x.toFixed(3)}, ${e.y.toFixed(3)}, ${e.z.toFixed(3)})`;if(`x`in e&&`y`in e)return`(${e.x.toFixed(3)}, ${e.y.toFixed(3)})`;if(`r`in e&&`g`in e&&`b`in e){let t=`a`in e?`, ${e.a.toFixed(3)}`:``;return`(${e.r.toFixed(3)}, ${e.g.toFixed(3)}, ${e.b.toFixed(3)}${t})`}if(typeof e.toString==`function`&&e.toString!==Object.prototype.toString)return e.toString()}try{let t=JSON.stringify(e);return t.length>64?t.substring(0,61)+`...`:t}catch{return String(e)}}getClassName(){return`FlowGraphDebugBlock`}},I=!1;function L(){I||(I=!0,A(`FlowGraphDebugBlock`,F))}var R=`gaussianSplattingPixelShader`,z=`#include<clipPlaneFragmentDeclaration>
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
`;M.ShadersStore[R]||(M.ShadersStore[R]=z);var B=[S,a,f,w,re,s,ae,n,p,D,t];for(let e of B)M.IncludesShadersStore[e.name]||(M.IncludesShadersStore[e.name]=e.shader);var V={name:R,shader:z},H=`noisePixelShader`,U=`uniform float brightness;uniform float persistence;uniform float timeScale;varying vec2 vUV;vec2 hash22(vec2 p)
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
`;M.ShadersStore[H]||(M.ShadersStore[H]=U);var W={name:H,shader:U},G=`selectionPixelShader`,K=`#ifdef INSTANCES
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
`;M.ShadersStore[G]||(M.ShadersStore[G]=K);var q=[S,D];for(let e of q)M.IncludesShadersStore[e.name]||(M.IncludesShadersStore[e.name]=e.shader);var se={name:G,shader:K},J=`selectionVertexShader`,Y=`attribute vec3 position;
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
`;M.ShadersStore[J]||(M.ShadersStore[J]=Y);var ce=[_,r,k,te,x,l,c,i,m,ee,u,ie];for(let e of ce)M.IncludesShadersStore[e.name]||(M.IncludesShadersStore[e.name]=e.shader);var le={name:J,shader:Y},X=`gaussianSplattingVertexShader`,Z=`#include<sceneUboDeclaration>
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
`;M.ShadersStoreWGSL[X]||(M.ShadersStoreWGSL[X]=Z);var ue=[C,T,b,e,ne,O,d,h,oe,E];for(let e of ue)M.IncludesShadersStoreWGSL[e.name]||(M.IncludesShadersStoreWGSL[e.name]=e.shader);var de={name:X,shader:Z},Q=`textureProcessorPixelShader`,$=`#ifdef OPERAND_A_TEXTURE
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
`;M.ShadersStoreWGSL[Q]||(M.ShadersStoreWGSL[Q]=$);var fe={name:Q,shader:$};export{W as a,L as c,se as i,N as l,de as n,V as o,le as r,F as s,fe as t};