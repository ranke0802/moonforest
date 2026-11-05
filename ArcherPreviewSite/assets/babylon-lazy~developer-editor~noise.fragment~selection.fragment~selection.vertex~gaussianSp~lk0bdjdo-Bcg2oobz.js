import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{$ as t,Bt as n,Dn as r,En as i,Ht as a,On as o,Tn as s,Vt as c,_t as l,bt as u,cn as d,dn as f,et as p,fn as m,hn as h,kn as g,ln as ee,mn as _,mt as v,nt as y,on as b,pn as x,pt as S,sn as C,tt as w,un as T,vt as E,wn as D,y as O,yt as k}from"./babylon-game-Bp_kWzU6.js";import{l as A}from"./babylon-tools~game~cinematic-interaction-Dq0sw1ll.js";var j=class extends o{constructor(e,t){super(e,t,3)}},M=class extends j{constructor(e,t,n){super(e,t),this._spatialAutoUpdate=!0,this._spatialMinUpdateTime=0,this._outBus=null,this._spatial=null,this._onOutBusDisposed=()=>{this.outBus=this.engine.defaultMainBus},typeof n.spatialAutoUpdate==`boolean`&&(this._spatialAutoUpdate=n.spatialAutoUpdate),typeof n.spatialMinUpdateTime==`number`&&(this._spatialMinUpdateTime=n.spatialMinUpdateTime)}get outBus(){return this._outBus}set outBus(e){if(this._outBus!==e){if(this._outBus&&(this._outBus.onDisposeObservable.removeCallback(this._onOutBusDisposed),!this._disconnect(this._outBus)))throw Error(`Disconnect failed`);if(this._outBus=e,this._outBus&&(this._outBus.onDisposeObservable.add(this._onOutBusDisposed),!this._connect(this._outBus)))throw Error(`Connect failed`)}}get spatial(){return this._spatial?this._spatial:this._initSpatialProperty()}dispose(){super.dispose(),this._spatial?.dispose(),this._spatial=null,this._outBus&&this._outBus.onDisposeObservable.removeCallback(this._onOutBusDisposed),this._outBus=null}_initSpatialProperty(){return this._spatial=this._createSpatialProperty(this._spatialAutoUpdate,this._spatialMinUpdateTime)}},N=class extends j{constructor(e,t){super(e,t)}},P=e({_WebAudioBus:()=>F}),F=class e extends M{constructor(t,n,r){super(t,n,r),this._stereo=null,this._subGraph=new e._SubGraph(this)}async _initAsync(e){e.outBus?this.outBus=e.outBus:(await this.engine.isReadyPromise,this.outBus=this.engine.defaultMainBus),await this._subGraph.initAsync(e),g(e)&&this._initSpatialProperty(),this.engine._addNode(this)}dispose(){super.dispose(),this._stereo=null,this.engine._removeNode(this)}get _inNode(){return this._subGraph._inNode}get _outNode(){return this._subGraph._outNode}get stereo(){return this._stereo??=new r(this._subGraph)}getClassName(){return`_WebAudioBus`}_createSpatialProperty(e,t){return new D(this._subGraph,e,t)}_connect(e){return super._connect(e)?(e._inNode&&this._outNode?.connect(e._inNode),!0):!1}_disconnect(e){return super._disconnect(e)?(e._inNode&&this._outNode?.disconnect(e._inNode),!0):!1}};F._SubGraph=class extends s{get _downstreamNodes(){return this._owner._downstreamNodes??null}get _upstreamNodes(){return this._owner._upstreamNodes??null}};var te=e({_WebAudioMainBus:()=>I}),I=class e extends N{constructor(t,n){super(t,n),this._subGraph=new e._SubGraph(this)}async _initAsync(e){if(await this._subGraph.initAsync(e),this.engine.mainOut&&!this._connect(this.engine.mainOut))throw Error(`Connect failed`);this.engine._addMainBus(this)}dispose(){super.dispose(),this.engine._removeMainBus(this)}get _inNode(){return this._subGraph._inNode}get _outNode(){return this._subGraph._outNode}_connect(e){return super._connect(e)?(e._inNode&&this._outNode?.connect(e._inNode),!0):!1}_disconnect(e){return super._disconnect(e)?(e._inNode&&this._outNode?.disconnect(e._inNode),!0):!1}getClassName(){return`_WebAudioMainBus`}};I._SubGraph=class extends i{get _downstreamNodes(){return this._owner._downstreamNodes??null}};var L=e({noisePixelShader:()=>B}),R=`noisePixelShader`,z=`uniform float brightness;uniform float persistence;uniform float timeScale;varying vec2 vUV;vec2 hash22(vec2 p)
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
`;A.ShadersStore[R]||(A.ShadersStore[R]=z);var B={name:R,shader:z},V=e({selectionPixelShader:()=>G}),H=`selectionPixelShader`,U=`#ifdef INSTANCES
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
`;A.ShadersStore[H]||(A.ShadersStore[H]=U);var W=[u,k];for(let e of W)A.IncludesShadersStore[e.name]||(A.IncludesShadersStore[e.name]=e.shader);var G={name:H,shader:U},K=e({selectionVertexShader:()=>X}),q=`selectionVertexShader`,J=`attribute vec3 position;
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
`;A.ShadersStore[q]||(A.ShadersStore[q]=J);var Y=[h,_,x,m,E,f,T,ee,d,C,b,l];for(let e of Y)A.IncludesShadersStore[e.name]||(A.IncludesShadersStore[e.name]=e.shader);var X={name:q,shader:J},Z=e({gaussianSplattingVertexShaderWGSL:()=>re}),Q=`gaussianSplattingVertexShader`,$=`#include<sceneUboDeclaration>
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
`;A.ShadersStoreWGSL[Q]||(A.ShadersStoreWGSL[Q]=$);var ne=[n,c,a,v,y,w,O,S,p,t];for(let e of ne)A.IncludesShadersStoreWGSL[e.name]||(A.IncludesShadersStoreWGSL[e.name]=e.shader);var re={name:Q,shader:$};export{te as a,L as i,K as n,P as o,V as r,Z as t};