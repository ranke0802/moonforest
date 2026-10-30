import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{S as t,g as n,x as r}from"./babylon~index-BNTVZe9z.js";import{t as i}from"./babylon~index~animationGroup.pure~flowGraphReceiveCustomEventBlock.pure~flowGraphPlayAnimat~ew3ox293-D-XQlhUT.js";import{t as a}from"./babylon~index~background.fragment~background.vertex~default.fragment~default.vertex~gaussia~k9zvq6gu-p_AOE0Rx.js";import{t as o}from"./babylon~index~default.fragment~default.vertex~gaussianSplatting.vertex~gaussianSplattingVox~bxnwx7tr-Bi1LMbjR.js";var s=e({gaussianSplattingVoxelVertexShader:()=>d}),c=`gaussianSplattingVoxelVertexShader`,l=`#include<__decl__gaussianSplattingVertex>
uniform vec2 dataTextureSize;uniform float alpha;uniform mat4 invWorldScale;uniform mat4 viewMatrix;uniform sampler2D rotationsATexture;uniform sampler2D rotationsBTexture;uniform sampler2D rotationScaleTexture;uniform sampler2D centersTexture;uniform sampler2D colorsTexture;
#if IS_COMPOUND
uniform mat4 partWorld[MAX_PART_COUNT];uniform float partVisibility[MAX_PART_COUNT];uniform sampler2D partIndicesTexture;
#endif
varying vec3 vNormalizedPosition;varying vec3 vNormalizedCenterPosition;varying float vAlpha;varying vec2 vPatchPosition;
#include<gaussianSplatting>
void main(void) {float splatIndex=getSplatIndex(int(position.z+0.5));Splat splat=readSplat(splatIndex);
#if IS_COMPOUND
if (partVisibility[splat.partIndex]==0.0) {gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
mat4 splatWorld=getPartWorld(splat.partIndex);
#else
mat4 splatWorld=world;
#endif
vec4 worldPos=computeVoxelSplatWorldPos(splat.rotationA,splat.rotationB,splat.rotationScale,splat.center.xyz,splatWorld,viewMatrix,invWorldScale,position.xy);gl_Position=viewMatrix*invWorldScale*worldPos;vNormalizedPosition=gl_Position.xyz*0.5+0.5;vec4 viewCenterPos=viewMatrix*invWorldScale*splatWorld*vec4(splat.center.xyz,1.0);vNormalizedCenterPosition=viewCenterPos.xyz*0.5+0.5;vAlpha=splat.color.w*alpha;
#if IS_COMPOUND
vAlpha*=partVisibility[splat.partIndex];
#endif
vPatchPosition=position.xy;}`;i.ShadersStore[c]||(i.ShadersStore[c]=l);var u=[t,a,o,n,r];for(let e of u)i.IncludesShadersStore[e.name]||(i.IncludesShadersStore[e.name]=e.shader);var d={name:c,shader:l};export{s as t};