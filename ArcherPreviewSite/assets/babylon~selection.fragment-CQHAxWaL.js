import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{t}from"./babylon~index~animationGroup.pure~flowGraphReceiveCustomEventBlock.pure~flowGraphPlayAnimat~ew3ox293-D-XQlhUT.js";import{t as n}from"./babylon~index~clipPlaneFragmentDeclaration~background.fragment~color.fragment~default.fragm~k9n9e66f-DmgNSSos.js";import{t as r}from"./babylon~index~clipPlaneFragment~background.fragment~color.fragment~default.fragment~depth.f~c1co0n9g-BXOhbpTi.js";var i=e({selectionPixelShader:()=>c}),a=`selectionPixelShader`,o=`#ifdef INSTANCES
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
`;t.ShadersStore[a]||(t.ShadersStore[a]=o);var s=[n,r];for(let e of s)t.IncludesShadersStore[e.name]||(t.IncludesShadersStore[e.name]=e.shader);var c={name:a,shader:o};export{i as t};