import{Ei as e,Qu as t,Wu as n,cd as r,ld as i,nd as a,rd as o,ud as s}from"./babylon-game-BmUxks-L.js";import{t as c}from"./babylon-tools~moonforestV2~npc-world~developer-editor~developer-actors~cinematic-game~autho~hip21b71-D-XQlhUT.js";var l=class{constructor(){this.supportCascades=!1}loadCubeData(t,n,a,o,c){if(Array.isArray(t))return;let l=r(t);if(l){n.width=l.width,n.height=l.width;try{e(),s(n,l),i(n,t,l).then(()=>{n.isReady=!0,n.onLoadedObservable.notifyObservers(n),n.onLoadedObservable.clear(),o&&o()},e=>{c?.(`Can not upload environment levels`,e)})}catch(e){c?.(`Can not upload environment file`,e)}}else c&&c(`Can not parse the environment file`,null)}loadData(){throw`.env not supported in 2d.`}},u=class extends t{constructor(e={}){super(e);let t=e.glTF,r=t?.animations?.map(e=>e._babylonAnimationGroup)||[];this.animationGroups=this.registerDataOutput(`animationGroups`,n,r);let i=t?.nodes?.map(e=>e._babylonTransformNode)||[];this.nodes=this.registerDataOutput(`nodes`,n,i)}getClassName(){return`FlowGraphGLTFDataProvider`}},d=`selectionOutlinePixelShader`,f=`uniform sampler2D maskSampler;
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
`;c.ShadersStore[d]||(c.ShadersStore[d]=f);var p={name:d,shader:f},m=`volumetricLightingRenderVolumeVertexShader`,h=`#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position : vec3f;varying vWorldPos: vec4f;@vertex
fn main(input : VertexInputs)->FragmentInputs {let worldPos=mesh.world*vec4f(vertexInputs.position,1.0);vertexOutputs.vWorldPos=worldPos;vertexOutputs.position=scene.viewProjection*worldPos;}
`;c.ShadersStoreWGSL[m]||(c.ShadersStoreWGSL[m]=h);var g=[a,o];for(let e of g)c.IncludesShadersStoreWGSL[e.name]||(c.IncludesShadersStoreWGSL[e.name]=e.shader);var _={name:m,shader:h};export{l as i,p as n,u as r,_ as t};