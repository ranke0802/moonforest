import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{t}from"./babylon~index~animationGroup.pure~flowGraphReceiveCustomEventBlock.pure~flowGraphPlayAnimat~ew3ox293-D-XQlhUT.js";import{t as n}from"./babylon~index~bonesDeclaration~background.vertex~color.vertex~default.vertex~depth.vertex~g~oxg6jep0-DEnRcima.js";import{n as r,t as i}from"./babylon~index~background.vertex~color.vertex~default.vertex~depth.vertex~glowMapGeneration.~hc1c9n5w-CSSXCxU2.js";import{t as a}from"./babylon~index~morphTargetsVertexGlobalDeclaration~default.vertex~depth.vertex~glowMapGenera~m9dilj39-CFjrwGMD.js";import{t as o}from"./babylon~index~morphTargetsVertexDeclaration~default.vertex~depth.vertex~glowMapGeneration.v~iba0548h-DPLEorS1.js";import{t as s}from"./babylon~index~background.vertex~color.vertex~default.vertex~depth.vertex~glowMapGeneration.~l04s8zz6-DVej4Tov.js";import{t as c}from"./babylon~index~morphTargetsVertexGlobal~default.vertex~depth.vertex~glowMapGeneration.vertex~gtreb56f-Cpn2RX8h.js";import{t as l}from"./babylon~index~morphTargetsVertex~default.vertex~depth.vertex~glowMapGeneration.vertex~iblVo~iczlwbew-BStGTK70.js";import{t as u}from"./babylon~index~background.vertex~color.vertex~default.vertex~depth.vertex~glowMapGeneration.~j4tts58z-D2bzSRXp.js";import{t as d}from"./babylon~index~bonesVertex~background.vertex~color.vertex~default.vertex~depth.vertex~glowMa~m30qb955-CV6USHis.js";import{t as f}from"./babylon~index~clipPlaneVertexDeclaration~background.vertex~color.vertex~default.vertex~dept~dv4k3l68-CmmPZCAH.js";import{t as p}from"./babylon~index~clipPlaneVertex~background.vertex~color.vertex~default.vertex~depth.vertex~ga~kqsvnyfs-6VoYBmV_.js";var m=e({selectionVertexShader:()=>v}),h=`selectionVertexShader`,g=`attribute vec3 position;
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
`;t.ShadersStore[h]||(t.ShadersStore[h]=g);var _=[n,r,a,o,f,s,c,l,u,d,i,p];for(let e of _)t.IncludesShadersStore[e.name]||(t.IncludesShadersStore[e.name]=e.shader);var v={name:h,shader:g};export{m as t};