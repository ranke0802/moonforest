import{$u as e,Da as t,Ea as n,Gu as r,Ju as i,Kr as a,Oa as o,Ta as s,Wu as c,Xu as l,Yu as u,Zu as d,di as f,ed as p,ga as m,lo as h,qr as g,td as _}from"./babylon-game-uE9lshiC.js";import{a as v,o as y,s as b,t as x}from"./babylon-tools~game~flowGraphEventReferenceBlock~flowGraphGLTFDataProvider~flowGraphObjectRe~mxvs7e9f-CAkV8rU7.js";import{n as S}from"./babylon-tools~game~flowGraphEventReferenceBlock~flowGraphGLTFDataProvider~flowGraphObjectRe~ih7qv4g8-Cu_sj2zM.js";import{t as C}from"./babylon-tools~game~npc-world~developer-editor~developer-actors~cinematic-interaction~cinema~di652mou-D-XQlhUT.js";var w=class{constructor(){this.supportCascades=!1}loadCubeData(){throw`.env not supported in Cube.`}loadData(e,t,n){let r=new Uint8Array(e.buffer,e.byteOffset,e.byteLength),i=a(r);n(i.width,i.height,t.generateMipMaps,!1,()=>{g(t,r)})}},T=class{constructor(){this.supportCascades=!1}loadCubeData(){throw`.ies not supported in Cube.`}loadData(e,t,n){let r=new Uint8Array(e.buffer,e.byteOffset,e.byteLength),i=m(r);n(i.width,i.height,!!t.useMipMaps,!1,()=>{let e=t.getEngine();t.type=1,t.format=6,t._gammaSpace=!1,e._uploadDataToTextureDirectly(t,i.data)})}};function E(t){switch(t){case`bool`:return!1;case`int`:return new _(0);case`float`:return NaN;case`float2`:return new v(NaN,NaN);case`float3`:return new y(NaN,NaN,NaN);case`float4`:return new b(NaN,NaN,NaN,NaN);case`float2x2`:return new e([NaN,NaN,NaN,NaN]);case`float3x3`:return new p([NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN]);case`float4x4`:return x.FromArray([NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN]);case`ref`:return``;default:return}}var D=class extends d{constructor(e){super(e),this.config=e,this._unregisterSignalInput(`in`),this._unregisterSignalOutput(`error`);for(let t of e.inputValueSockets??[])this.registerDataInput(t.name,i(t.type));for(let t of e.outputValueSockets??[])this.registerDataOutput(t.name,i(t.type),E(t.signature));for(let t of e.inputFlowSockets??[])this._registerSignalInput(t);for(let t of e.outputFlowSockets??[])this._registerSignalOutput(t)}_execute(e,t){}getClassName(){return`FlowGraphUnsupportedInteractivityBlock`}},O=class extends u{constructor(e){super(e),this.type=`PointerMove`,this.targetMesh=this.registerDataInput(`targetMesh`,c,e?.targetMesh),this.pointerId=this.registerDataOutput(`pointerId`,r),this.meshUnderPointer=this.registerDataOutput(`meshUnderPointer`,c),this.pickedPoint=this.registerDataOutput(`pickedPoint`,c)}_executeEvent(e,t){let n=this.targetMesh.getValue(e),r=t.pickInfo?.pickedMesh;return n&&!(r===n||r&&l(r,n))?!0:(this.pointerId.setValue(t.event.pointerId,e),this.meshUnderPointer.setValue(r??null,e),this.pickedPoint.setValue(t.pickInfo?.pickedPoint??null,e),this._execute(e),!this.config?.stopPropagation)}_preparePendingTasks(e){}_cancelPendingTasks(e){}getClassName(){return`FlowGraphPointerMoveEventBlock`}},k=!1;function A(){k||(k=!0,S(`FlowGraphPointerMoveEventBlock`,O))}var j=class extends u{constructor(e){super(e),this.type=`PointerUp`,this.targetMesh=this.registerDataInput(`targetMesh`,c,e?.targetMesh),this.pointerId=this.registerDataOutput(`pointerId`,r),this.pickedMesh=this.registerDataOutput(`pickedMesh`,c),this.pickedPoint=this.registerDataOutput(`pickedPoint`,c)}_executeEvent(e,t){let n=this.targetMesh.getValue(e),r=t.pickInfo?.pickedMesh;return n&&!(r===n||r&&l(r,n))?!0:(this.pointerId.setValue(t.event.pointerId,e),this.pickedMesh.setValue(r??null,e),this.pickedPoint.setValue(t.pickInfo?.pickedPoint??null,e),this._execute(e),!this.config?.stopPropagation)}_preparePendingTasks(e){}_cancelPendingTasks(e){}getClassName(){return`FlowGraphPointerUpEventBlock`}},M=!1;function N(){M||(M=!0,S(`FlowGraphPointerUpEventBlock`,j))}var P=`fibonacci`,F=`#define rcp(x) 1./x
#define GOLDEN_RATIO 1.618033988749895
vec2 Golden2dSeq(int i,float n)
{return vec2(float(i)/n+(0.5/n),fract(float(i)*rcp(GOLDEN_RATIO)));}
vec2 SampleDiskGolden(int i,int sampleCount)
{vec2 f=Golden2dSeq(i,float(sampleCount));return vec2(sqrt(f.x),TWO_PI*f.y);}`;C.IncludesShadersStore[P]||(C.IncludesShadersStore[P]=F);var I={name:P,shader:F},L=`diffusionProfile`,R=`uniform vec3 diffusionS[5];uniform float diffusionD[5];uniform float filterRadii[5];`;C.IncludesShadersStore[L]||(C.IncludesShadersStore[L]=R);var z={name:L,shader:R},B=`subSurfaceScatteringPixelShader`,V=`#include<helperFunctions>
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
totalWeight=max(totalWeight,HALF_MIN);gl_FragColor=vec4(inputColor.rgb+albedo*max(totalIrradiance/totalWeight,vec3(0.0)),1.);}`;C.ShadersStore[B]||(C.ShadersStore[B]=V);var H=[h,I,f,z];for(let e of H)C.IncludesShadersStore[e.name]||(C.IncludesShadersStore[e.name]=e.shader);var U={name:B,shader:V},W=`volumetricLightingRenderVolumeVertexShader`,G=`#include<__decl__sceneVertex>
#include<__decl__meshVertex>
attribute vec3 position;varying vec4 vWorldPos;void main(void) {vec4 worldPos=world*vec4(position,1.0);vWorldPos=worldPos;gl_Position=viewProjection*worldPos;}
`;C.ShadersStore[W]||(C.ShadersStore[W]=G);var K=[o,n,t,s];for(let e of K)C.IncludesShadersStore[e.name]||(C.IncludesShadersStore[e.name]=e.shader);var q={name:W,shader:G};export{O as a,T as c,N as i,w as l,U as n,A as o,j as r,D as s,q as t};