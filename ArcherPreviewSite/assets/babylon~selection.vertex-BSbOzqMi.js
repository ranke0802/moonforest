import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{t}from"./babylon~index~animationGroup.pure~flowGraphReceiveCustomEventBlock.pure~flowGraphPlayAnimat~ew3ox293-D-XQlhUT.js";import{t as n}from"./babylon~index~bonesDeclaration~background.vertex~color.vertex~default.vertex~depth.vertex~g~cx5n95qo-DY0oao1e.js";import{t as r}from"./babylon~index~background.vertex~color.vertex~default.vertex~depth.vertex~glowMapGeneration.~ncf7ztgc-B2lNuIcz.js";import{t as i}from"./babylon~index~morphTargetsVertexGlobalDeclaration~default.vertex~depth.vertex~glowMapGenera~m9dilj39-Dc0gSVbD.js";import{t as a}from"./babylon~index~morphTargetsVertexDeclaration~default.vertex~depth.vertex~glowMapGeneration.v~iba0548h-DaWRtG2e.js";import{t as o}from"./babylon~index~background.vertex~color.vertex~default.vertex~depth.vertex~glowMapGeneration.~ez56tyw5-C0VM98qm.js";import{t as s}from"./babylon~index~morphTargetsVertexGlobal~default.vertex~depth.vertex~glowMapGeneration.vertex~nfff1d1v-7nyzCcw5.js";import{t as c}from"./babylon~index~morphTargetsVertex~default.vertex~depth.vertex~glowMapGeneration.vertex~outli~hv62zvmz-ZlFvefvk.js";import{t as l}from"./babylon~index~background.vertex~color.vertex~default.vertex~depth.vertex~glowMapGeneration.~cdmzk945-C5Ejogwi.js";import{t as u}from"./babylon~index~bonesVertex~background.vertex~color.vertex~default.vertex~depth.vertex~glowMa~m30qb955-Bb1Q-u7p.js";import{t as d}from"./babylon~index~background.vertex~color.vertex~default.vertex~depth.vertex~glowMapGeneration.~hc1c9n5w-DDO6QzrS.js";import{t as f}from"./babylon~index~clipPlaneVertexDeclaration~background.vertex~color.vertex~default.vertex~dept~erp0l4zv-DmZu0mF7.js";import{t as p}from"./babylon~index~clipPlaneVertex~background.vertex~color.vertex~default.vertex~depth.vertex~ga~brv1to9s-l8Hfvzkx.js";var m=e({selectionVertexShaderWGSL:()=>v}),h=`selectionVertexShader`,g=`attribute position: vec3f;
#ifdef INSTANCES
attribute instanceSelectionId: f32;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<clipPlaneVertexDeclaration>
#include<instancesDeclaration>
uniform viewProjection: mat4x4f;
#ifdef STORE_CAMERASPACE_Z
uniform view: mat4x4f;
#else
uniform depthValues: vec2f;
#endif
#ifdef INSTANCES
flat varying vSelectionId: f32;
#endif
#ifdef STORE_CAMERASPACE_Z
varying vViewPosZ: f32;
#else
varying vDepthMetric: f32;
#endif
#ifdef ALPHATEST
varying vUV: vec2f;uniform diffuseMatrix: mat4x4f; 
#ifdef UV1
attribute uv: vec2f;
#endif
#ifdef UV2
attribute uv2: vec2f;
#endif
#endif
#define CUSTOM_VERTEX_DEFINITIONS
@vertex
fn main(input: VertexInputs)->FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
var positionUpdated: vec3f=vertexInputs.position;
#ifdef UV1
var uvUpdated: vec2f=vertexInputs.uv;
#endif
#ifdef UV2
var uv2Updated: vec2f=vertexInputs.uv2;
#endif
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
var worldPos: vec4f=finalWorld*vec4f(positionUpdated,1.0);vertexOutputs.position=uniforms.viewProjection*worldPos;
#ifdef ALPHATEST
#ifdef UV1
vertexOutputs.vUV=(uniforms.diffuseMatrix*vec4f(uvUpdated,1.0,0.0)).xy;
#endif
#ifdef UV2
vertexOutputs.vUV=(uniforms.diffuseMatrix*vec4f(uv2Updated,1.0,0.0)).xy;
#endif
#endif
#ifdef STORE_CAMERASPACE_Z
vertexOutputs.vViewPosZ=(uniforms.view*worldPos).z;
#else
#ifdef USE_REVERSE_DEPTHBUFFER
vertexOutputs.vDepthMetric=((-vertexOutputs.position.z+uniforms.depthValues.x)/(uniforms.depthValues.y));
#else
vertexOutputs.vDepthMetric=((vertexOutputs.position.z+uniforms.depthValues.x)/(uniforms.depthValues.y));
#endif
#endif
#ifdef INSTANCES
vertexOutputs.vSelectionId=vertexInputs.instanceSelectionId;
#endif
#include<clipPlaneVertex>
#define CUSTOM_VERTEX_MAIN_END
}
`;t.ShadersStoreWGSL[h]||(t.ShadersStoreWGSL[h]=g);var _=[n,r,i,a,f,o,s,c,l,u,d,p];for(let e of _)t.IncludesShadersStoreWGSL[e.name]||(t.IncludesShadersStoreWGSL[e.name]=e.shader);var v={name:h,shader:g};export{m as t};