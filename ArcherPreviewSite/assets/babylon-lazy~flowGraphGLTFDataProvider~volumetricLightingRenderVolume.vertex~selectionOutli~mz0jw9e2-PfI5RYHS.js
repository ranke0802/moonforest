import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{Bt as t,Gt as n,It as r,Nt as i,Ot as a,Pt as o,R as s,Ut as c,Vt as l,Wt as u,kt as d,ot as f}from"./babylon-game-BceOPjJS.js";import{Nt as p,l as m}from"./babylon-tools~game~cinematic-interaction-Bk4IdV0B.js";var h=e({_ENVTextureLoader:()=>g}),g=class{constructor(){this.supportCascades=!1}loadCubeData(e,t,r,i,a){if(Array.isArray(e))return;let o=c(e);if(o){t.width=o.width,t.height=o.width;try{s(),n(t,o),u(t,e,o).then(()=>{t.isReady=!0,t.onLoadedObservable.notifyObservers(t),t.onLoadedObservable.clear(),i&&i()},e=>{a?.(`Can not upload environment levels`,e)})}catch(e){a?.(`Can not upload environment file`,e)}}else a&&a(`Can not parse the environment file`,null)}loadData(){throw`.env not supported in 2d.`}},_=e({_IESTextureLoader:()=>v}),v=class{constructor(){this.supportCascades=!1}loadCubeData(){throw`.ies not supported in Cube.`}loadData(e,t,n){let r=new Uint8Array(e.buffer,e.byteOffset,e.byteLength),i=f(r);n(i.width,i.height,!!t.useMipMaps,!1,()=>{let e=t.getEngine();t.type=1,t.format=6,t._gammaSpace=!1,e._uploadDataToTextureDirectly(t,i.data)})}},y=e({FlowGraphGLTFDataProvider:()=>b}),b=class extends r{constructor(e={}){super(e);let t=e.glTF,n=t?.animations?.map(e=>e._babylonAnimationGroup)||[];this.animationGroups=this.registerDataOutput(`animationGroups`,a,n);let r=t?.nodes?.map(e=>e._babylonTransformNode)||[];this.nodes=this.registerDataOutput(`nodes`,a,r)}getClassName(){return`FlowGraphGLTFDataProvider`}},x=e({FlowGraphPointerMoveEventBlock:()=>S,RegisterFlowGraphPointerMoveEventBlock:()=>w}),S=class extends i{constructor(e){super(e),this.type=`PointerMove`,this.targetMesh=this.registerDataInput(`targetMesh`,a,e?.targetMesh),this.pointerId=this.registerDataOutput(`pointerId`,d),this.meshUnderPointer=this.registerDataOutput(`meshUnderPointer`,a),this.pickedPoint=this.registerDataOutput(`pickedPoint`,a)}_executeEvent(e,t){let n=this.targetMesh.getValue(e),r=t.pickInfo?.pickedMesh;return n&&!(r===n||r&&o(r,n))?!0:(this.pointerId.setValue(t.event.pointerId,e),this.meshUnderPointer.setValue(r??null,e),this.pickedPoint.setValue(t.pickInfo?.pickedPoint??null,e),this._execute(e),!this.config?.stopPropagation)}_preparePendingTasks(e){}_cancelPendingTasks(e){}getClassName(){return`FlowGraphPointerMoveEventBlock`}},C=!1;function w(){C||(C=!0,p(`FlowGraphPointerMoveEventBlock`,S))}var T=e({FlowGraphPointerUpEventBlock:()=>E,RegisterFlowGraphPointerUpEventBlock:()=>O}),E=class extends i{constructor(e){super(e),this.type=`PointerUp`,this.targetMesh=this.registerDataInput(`targetMesh`,a,e?.targetMesh),this.pointerId=this.registerDataOutput(`pointerId`,d),this.pickedMesh=this.registerDataOutput(`pickedMesh`,a),this.pickedPoint=this.registerDataOutput(`pickedPoint`,a)}_executeEvent(e,t){let n=this.targetMesh.getValue(e),r=t.pickInfo?.pickedMesh;return n&&!(r===n||r&&o(r,n))?!0:(this.pointerId.setValue(t.event.pointerId,e),this.pickedMesh.setValue(r??null,e),this.pickedPoint.setValue(t.pickInfo?.pickedPoint??null,e),this._execute(e),!this.config?.stopPropagation)}_preparePendingTasks(e){}_cancelPendingTasks(e){}getClassName(){return`FlowGraphPointerUpEventBlock`}},D=!1;function O(){D||(D=!0,p(`FlowGraphPointerUpEventBlock`,E))}var k=e({selectionOutlinePixelShader:()=>M}),A=`selectionOutlinePixelShader`,j=`uniform sampler2D maskSampler;
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
`;m.ShadersStore[A]||(m.ShadersStore[A]=j);var M={name:A,shader:j},N=e({volumetricLightingRenderVolumeVertexShaderWGSL:()=>L}),P=`volumetricLightingRenderVolumeVertexShader`,F=`#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position : vec3f;varying vWorldPos: vec4f;@vertex
fn main(input : VertexInputs)->FragmentInputs {let worldPos=mesh.world*vec4f(vertexInputs.position,1.0);vertexOutputs.vWorldPos=worldPos;vertexOutputs.position=scene.viewProjection*worldPos;}
`;m.ShadersStoreWGSL[P]||(m.ShadersStoreWGSL[P]=F);var I=[t,l];for(let e of I)m.IncludesShadersStoreWGSL[e.name]||(m.IncludesShadersStoreWGSL[e.name]=e.shader);var L={name:P,shader:F};export{y as a,x as i,k as n,_ as o,T as r,h as s,N as t};