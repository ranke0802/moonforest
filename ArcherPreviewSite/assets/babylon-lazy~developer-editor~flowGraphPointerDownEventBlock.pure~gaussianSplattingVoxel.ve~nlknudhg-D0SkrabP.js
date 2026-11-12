import{Ar as e,Ea as t,Gi as n,Gu as r,Hi as i,Ji as a,Mr as o,Ta as s,Tr as c,Wi as l,Wu as u,Xu as d,Yu as f,af as p,ao as m,ef as h,if as g,io as _,jr as v,lo as y,nd as b,nf as x,rd as S,rf as C,tf as w}from"./babylon-game-BmUxks-L.js";import{n as T}from"./babylon-tools~moonforestV2~flowGraphEventReferenceBlock~flowGraphGLTFDataProvider~flowGraph~fx6pxob9-Cu_sj2zM.js";import{t as E}from"./babylon-tools~moonforestV2~npc-world~developer-editor~developer-actors~cinematic-game~autho~hip21b71-D-XQlhUT.js";var D=class extends g{constructor(e,t){super(e,t,3)}},O=class extends D{constructor(e,t,n){super(e,t),this._spatialAutoUpdate=!0,this._spatialMinUpdateTime=0,this._outBus=null,this._spatial=null,this._onOutBusDisposed=()=>{this.outBus=this.engine.defaultMainBus},typeof n.spatialAutoUpdate==`boolean`&&(this._spatialAutoUpdate=n.spatialAutoUpdate),typeof n.spatialMinUpdateTime==`number`&&(this._spatialMinUpdateTime=n.spatialMinUpdateTime)}get outBus(){return this._outBus}set outBus(e){if(this._outBus!==e){if(this._outBus&&(this._outBus.onDisposeObservable.removeCallback(this._onOutBusDisposed),!this._disconnect(this._outBus)))throw Error(`Disconnect failed`);if(this._outBus=e,this._outBus&&(this._outBus.onDisposeObservable.add(this._onOutBusDisposed),!this._connect(this._outBus)))throw Error(`Connect failed`)}}get spatial(){return this._spatial?this._spatial:this._initSpatialProperty()}dispose(){super.dispose(),this._spatial?.dispose(),this._spatial=null,this._outBus&&this._outBus.onDisposeObservable.removeCallback(this._onOutBusDisposed),this._outBus=null}_initSpatialProperty(){return this._spatial=this._createSpatialProperty(this._spatialAutoUpdate,this._spatialMinUpdateTime)}},k=class extends D{constructor(e,t){super(e,t)}},A=class e extends O{constructor(t,n,r){super(t,n,r),this._stereo=null,this._subGraph=new e._SubGraph(this)}async _initAsync(e){e.outBus?this.outBus=e.outBus:(await this.engine.isReadyPromise,this.outBus=this.engine.defaultMainBus),await this._subGraph.initAsync(e),p(e)&&this._initSpatialProperty(),this.engine._addNode(this)}dispose(){super.dispose(),this._stereo=null,this.engine._removeNode(this)}get _inNode(){return this._subGraph._inNode}get _outNode(){return this._subGraph._outNode}get stereo(){return this._stereo??=new C(this._subGraph)}getClassName(){return`_WebAudioBus`}_createSpatialProperty(e,t){return new h(this._subGraph,e,t)}_connect(e){return super._connect(e)?(e._inNode&&this._outNode?.connect(e._inNode),!0):!1}_disconnect(e){return super._disconnect(e)?(e._inNode&&this._outNode?.disconnect(e._inNode),!0):!1}};A._SubGraph=class extends w{get _downstreamNodes(){return this._owner._downstreamNodes??null}get _upstreamNodes(){return this._owner._upstreamNodes??null}};var j=class e extends k{constructor(t,n){super(t,n),this._subGraph=new e._SubGraph(this)}async _initAsync(e){if(await this._subGraph.initAsync(e),this.engine.mainOut&&!this._connect(this.engine.mainOut))throw Error(`Connect failed`);this.engine._addMainBus(this)}dispose(){super.dispose(),this.engine._removeMainBus(this)}get _inNode(){return this._subGraph._inNode}get _outNode(){return this._subGraph._outNode}_connect(e){return super._connect(e)?(e._inNode&&this._outNode?.connect(e._inNode),!0):!1}_disconnect(e){return super._disconnect(e)?(e._inNode&&this._outNode?.disconnect(e._inNode),!0):!1}getClassName(){return`_WebAudioMainBus`}};j._SubGraph=class extends x{get _downstreamNodes(){return this._owner._downstreamNodes??null}};var M=class extends f{constructor(e){super(e),this.type=`PointerDown`,this.targetMesh=this.registerDataInput(`targetMesh`,u,e?.targetMesh),this.pointerId=this.registerDataOutput(`pointerId`,r),this.pickedMesh=this.registerDataOutput(`pickedMesh`,u),this.pickedPoint=this.registerDataOutput(`pickedPoint`,u)}_executeEvent(e,t){let n=this.targetMesh.getValue(e),r=t.pickInfo?.pickedMesh;return n&&!(r===n||r&&d(r,n))?!0:(this.pointerId.setValue(t.event.pointerId,e),this.pickedMesh.setValue(r??null,e),this.pickedPoint.setValue(t.pickInfo?.pickedPoint??null,e),this._execute(e),!this.config?.stopPropagation)}_preparePendingTasks(e){}_cancelPendingTasks(e){}getClassName(){return`FlowGraphPointerDownEventBlock`}},N=!1;function P(){N||(N=!0,T(`FlowGraphPointerDownEventBlock`,M))}var F=`gaussianSplattingVertexShader`,I=`#include<__decl__gaussianSplattingVertex>
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
`;E.ShadersStore[F]||(E.ShadersStore[F]=I);var L=[v,t,s,c,m,a,n,y,e,_,l,i];for(let e of L)E.IncludesShadersStore[e.name]||(E.IncludesShadersStore[e.name]=e.shader);var R={name:F,shader:I},z=`gaussianSplattingVoxelVertexShader`,B=`#include<sceneUboDeclaration>
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
`;E.ShadersStoreWGSL[z]||(E.ShadersStoreWGSL[z]=B);var V=[b,S,o];for(let e of V)E.IncludesShadersStoreWGSL[e.name]||(E.IncludesShadersStoreWGSL[e.name]=e.shader);var H={name:z,shader:B};export{j as a,P as i,R as n,A as o,M as r,H as t};