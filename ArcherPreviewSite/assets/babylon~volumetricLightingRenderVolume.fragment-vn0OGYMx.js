import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{t}from"./babylon~index~animationGroup.pure~flowGraphReceiveCustomEventBlock.pure~flowGraphPlayAnimat~ew3ox293-D-XQlhUT.js";import{t as n}from"./babylon~index~background.fragment~background.vertex~default.fragment~default.vertex~gaussia~k9zvq6gu-p_AOE0Rx.js";import{t as r}from"./babylon~index~volumetricLightingRenderVolume.fragment~openpbr.fragment~geometry.fragment-CkGcgCjz.js";var i=e({volumetricLightingRenderVolumePixelShader:()=>c}),a=`volumetricLightingRenderVolumePixelShader`,o=`#include<__decl__sceneFragment>
uniform mat4 invViewProjection;uniform vec3 lightDir; 
uniform vec2 outputTextureSize;uniform vec4 extinctionPhaseG;uniform vec3 lightPower;uniform vec2 textureRatio;uniform sampler2D depthTexture;varying vec4 vWorldPos;float henyeyGreenstein(float g,float cosTheta) {float denom=1.0+g*g-2.0*g*cosTheta;return 1.0/(4.0*3.14159265)*(1.0-g*g)/(denom*sqrt(max(denom,0.0)));}
vec3 integrateDirectional(float eyeDist,vec3 viewDir,vec3 lightDir) {float phaseG=extinctionPhaseG.w;
#ifdef USE_EXTINCTION
vec3 extinction=extinctionPhaseG.xyz;return henyeyGreenstein(phaseG,dot(viewDir,lightDir))*(vec3(1.0)-exp(-extinction*eyeDist))/extinction;
#else
return vec3(henyeyGreenstein(phaseG,dot(viewDir,lightDir)))*vec3(eyeDist);
#endif
}
void main(void) {float depth=texelFetch(depthTexture,ivec2(gl_FragCoord.xy*textureRatio),0).r;vec4 worldPos=vWorldPos;if (gl_FragCoord.z>depth) {vec4 ndc=vec4((gl_FragCoord.xy/outputTextureSize)*2.0-1.0,depth*2.0-1.0,1.0);worldPos=invViewProjection*ndc;worldPos=worldPos/worldPos.w;}
vec3 viewDir=worldPos.xyz-vEyePosition.xyz;float eyeDist=length(viewDir);viewDir=viewDir/eyeDist;float fSign=gl_FrontFacing ? 1.0 : -1.0;vec3 integral=integrateDirectional(eyeDist,-viewDir,lightDir);gl_FragColor=vec4(lightPower*integral*fSign,1.0);}
`;t.ShadersStore[a]||(t.ShadersStore[a]=o);var s=[r,n];for(let e of s)t.IncludesShadersStore[e.name]||(t.IncludesShadersStore[e.name]=e.shader);var c={name:a,shader:o};export{i as t};