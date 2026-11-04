import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{C as t,Cn as n,Dn as r,En as i,Ft as a,Lt as o,Mt as s,Rt as c,S as l,Sn as u,Tn as d,ct as f,dt as p,j as m,lt as h,ut as g,wn as _,xt as v,zt as y}from"./babylon-game-dzYjm6Bm.js";import{a as b,o as x,s as S,t as C}from"./babylon-tools~game~flowGraphEventReferenceBlock~flowGraphGLTFDataProvider~flowGraphObjectRe~o7rzo1tq-29EzcLPb.js";import{t as w}from"./babylon-tools~game~developer-editor~developer-actors~cinematic-game~authored-placement-runt~mzpfqcw1-D-XQlhUT.js";var T=class extends i{constructor(e,t){super(e,t,3)}},E=class extends T{constructor(e,t,n){super(e,t),this._spatialAutoUpdate=!0,this._spatialMinUpdateTime=0,this._outBus=null,this._spatial=null,this._onOutBusDisposed=()=>{this.outBus=this.engine.defaultMainBus},typeof n.spatialAutoUpdate==`boolean`&&(this._spatialAutoUpdate=n.spatialAutoUpdate),typeof n.spatialMinUpdateTime==`number`&&(this._spatialMinUpdateTime=n.spatialMinUpdateTime)}get outBus(){return this._outBus}set outBus(e){if(this._outBus!==e){if(this._outBus&&(this._outBus.onDisposeObservable.removeCallback(this._onOutBusDisposed),!this._disconnect(this._outBus)))throw Error(`Disconnect failed`);if(this._outBus=e,this._outBus&&(this._outBus.onDisposeObservable.add(this._onOutBusDisposed),!this._connect(this._outBus)))throw Error(`Connect failed`)}}get spatial(){return this._spatial?this._spatial:this._initSpatialProperty()}dispose(){super.dispose(),this._spatial?.dispose(),this._spatial=null,this._outBus&&this._outBus.onDisposeObservable.removeCallback(this._onOutBusDisposed),this._outBus=null}_initSpatialProperty(){return this._spatial=this._createSpatialProperty(this._spatialAutoUpdate,this._spatialMinUpdateTime)}},D=class extends T{constructor(e,t){super(e,t)}},O=e({_WebAudioBus:()=>k}),k=class e extends E{constructor(t,n,r){super(t,n,r),this._stereo=null,this._subGraph=new e._SubGraph(this)}async _initAsync(e){e.outBus?this.outBus=e.outBus:(await this.engine.isReadyPromise,this.outBus=this.engine.defaultMainBus),await this._subGraph.initAsync(e),r(e)&&this._initSpatialProperty(),this.engine._addNode(this)}dispose(){super.dispose(),this._stereo=null,this.engine._removeNode(this)}get _inNode(){return this._subGraph._inNode}get _outNode(){return this._subGraph._outNode}get stereo(){return this._stereo??=new d(this._subGraph)}getClassName(){return`_WebAudioBus`}_createSpatialProperty(e,t){return new u(this._subGraph,e,t)}_connect(e){return super._connect(e)?(e._inNode&&this._outNode?.connect(e._inNode),!0):!1}_disconnect(e){return super._disconnect(e)?(e._inNode&&this._outNode?.disconnect(e._inNode),!0):!1}};k._SubGraph=class extends n{get _downstreamNodes(){return this._owner._downstreamNodes??null}get _upstreamNodes(){return this._owner._upstreamNodes??null}};var A=e({_WebAudioMainBus:()=>j}),j=class e extends D{constructor(t,n){super(t,n),this._subGraph=new e._SubGraph(this)}async _initAsync(e){if(await this._subGraph.initAsync(e),this.engine.mainOut&&!this._connect(this.engine.mainOut))throw Error(`Connect failed`);this.engine._addMainBus(this)}dispose(){super.dispose(),this.engine._removeMainBus(this)}get _inNode(){return this._subGraph._inNode}get _outNode(){return this._subGraph._outNode}_connect(e){return super._connect(e)?(e._inNode&&this._outNode?.connect(e._inNode),!0):!1}_disconnect(e){return super._disconnect(e)?(e._inNode&&this._outNode?.disconnect(e._inNode),!0):!1}getClassName(){return`_WebAudioMainBus`}};j._SubGraph=class extends _{get _downstreamNodes(){return this._owner._downstreamNodes??null}};var M=e({_TGATextureLoader:()=>N}),N=class{constructor(){this.supportCascades=!1}loadCubeData(){throw`.env not supported in Cube.`}loadData(e,n,r){let i=new Uint8Array(e.buffer,e.byteOffset,e.byteLength),a=l(i);r(a.width,a.height,n.generateMipMaps,!1,()=>{t(n,i)})}},P=e({FlowGraphUnsupportedInteractivityBlock:()=>I});function F(e){switch(e){case`bool`:return!1;case`int`:return new y(0);case`float`:return NaN;case`float2`:return new b(NaN,NaN);case`float3`:return new x(NaN,NaN,NaN);case`float4`:return new S(NaN,NaN,NaN,NaN);case`float2x2`:return new o([NaN,NaN,NaN,NaN]);case`float3x3`:return new c([NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN]);case`float4x4`:return C.FromArray([NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN]);case`ref`:return``;default:return}}var I=class extends a{constructor(e){super(e),this.config=e,this._unregisterSignalInput(`in`),this._unregisterSignalOutput(`error`);for(let t of e.inputValueSockets??[])this.registerDataInput(t.name,s(t.type));for(let t of e.outputValueSockets??[])this.registerDataOutput(t.name,s(t.type),F(t.signature));for(let t of e.inputFlowSockets??[])this._registerSignalInput(t);for(let t of e.outputFlowSockets??[])this._registerSignalOutput(t)}_execute(e,t){}getClassName(){return`FlowGraphUnsupportedInteractivityBlock`}},L=`fibonacci`,R=`#define rcp(x) 1./x
#define GOLDEN_RATIO 1.618033988749895
vec2 Golden2dSeq(int i,float n)
{return vec2(float(i)/n+(0.5/n),fract(float(i)*rcp(GOLDEN_RATIO)));}
vec2 SampleDiskGolden(int i,int sampleCount)
{vec2 f=Golden2dSeq(i,float(sampleCount));return vec2(sqrt(f.x),TWO_PI*f.y);}`;w.IncludesShadersStore[L]||(w.IncludesShadersStore[L]=R);var z={name:L,shader:R},B=`diffusionProfile`,V=`uniform vec3 diffusionS[5];uniform float diffusionD[5];uniform float filterRadii[5];`;w.IncludesShadersStore[B]||(w.IncludesShadersStore[B]=V);var H={name:B,shader:V},U=e({subSurfaceScatteringPixelShader:()=>q}),W=`subSurfaceScatteringPixelShader`,G=`#include<helperFunctions>
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
totalWeight=max(totalWeight,HALF_MIN);gl_FragColor=vec4(inputColor.rgb+albedo*max(totalIrradiance/totalWeight,vec3(0.0)),1.);}`;w.ShadersStore[W]||(w.ShadersStore[W]=G);var K=[v,z,m,H];for(let e of K)w.IncludesShadersStore[e.name]||(w.IncludesShadersStore[e.name]=e.shader);var q={name:W,shader:G},J=e({volumetricLightingRenderVolumeVertexShader:()=>Q}),Y=`volumetricLightingRenderVolumeVertexShader`,X=`#include<__decl__sceneVertex>
#include<__decl__meshVertex>
attribute vec3 position;varying vec4 vWorldPos;void main(void) {vec4 worldPos=world*vec4(position,1.0);vWorldPos=worldPos;gl_Position=viewProjection*worldPos;}
`;w.ShadersStore[Y]||(w.ShadersStore[Y]=X);var Z=[p,h,g,f];for(let e of Z)w.IncludesShadersStore[e.name]||(w.IncludesShadersStore[e.name]=e.shader);var Q={name:Y,shader:X};export{A as a,M as i,U as n,O as o,P as r,J as t};