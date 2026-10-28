import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{y as t}from"./babylon~index-BgpJ9cf0.js";import{t as n}from"./babylon~index~animationGroup.pure~flowGraphReceiveCustomEventBlock.pure~flowGraphPlayAnimat~ew3ox293-D-XQlhUT.js";import{t as r}from"./babylon~index~packingFunctions~depth.fragment~gaussianSplatting.fragment~kernelBlur.fragmen~gehngc96-VZAULzAC.js";import{t as i}from"./babylon~index~clipPlaneFragmentDeclaration~background.fragment~color.fragment~default.fragm~k9n9e66f-DmgNSSos.js";import{t as a}from"./babylon~index~clipPlaneFragment~background.fragment~color.fragment~default.fragment~depth.f~c1co0n9g-BXOhbpTi.js";import{t as o}from"./babylon~index~logDepthDeclaration~background.fragment~background.vertex~default.fragment~de~lntfmh4r-BiCafb5W.js";import{t as s}from"./babylon~index~fogFragmentDeclaration~background.fragment~color.fragment~default.fragment~ga~jzu2wva7-CHEC_CHg.js";import{t as c}from"./babylon~index~gaussianSplattingFragmentDeclaration~background.fragment~default.fragment~gau~j5fezca6-BlwmFbwC.js";import{t as l}from"./babylon~index~gaussianSplattingFragmentDeclaration~background.fragment~color.fragment~defau~d6ftptll-5IoySmht.js";import{t as u}from"./babylon~index~objectIdFunctions~default.fragment~gaussianSplatting.fragment~particles.fragm~ifhbyknu-CbhlSg8M.js";import{t as d}from"./babylon~index~default.fragment~gaussianSplatting.fragment~particles.fragment~sprites.fragme~mor22a6k-BrhF27h9.js";import{t as f}from"./babylon~index~gaussianSplatting.fragment~particles.fragment~sprites.fragment-Bbw3o5KQ.js";var p=e({gaussianSplattingPixelShader:()=>_}),m=`gaussianSplattingPixelShader`,h=`#include<clipPlaneFragmentDeclaration>
#include<logDepthDeclaration>
#include<fogFragmentDeclaration>
#define PREPASS_CUSTOM_VARYINGS
#include<prePassDeclaration>[SCENE_MRT_COUNT]
#if defined(GPUPICKER_DEPTH) && !defined(PREPASS)
layout(location=0) out highp vec4 glFragData[2];
#endif
#ifdef GPUPICKER_PACK_DEPTH
#include<packingFunctions>
#endif
varying vec4 vColor;varying vec2 vPosition;
#ifdef PREPASS
uniform float geometryZeroAlphaDiscard;
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
#define CUSTOM_FRAGMENT_DEFINITIONS
#include<gaussianSplattingFragmentDeclaration>
void main () {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
vec4 finalColor=gaussianColor(vColor);
#define CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR
#ifdef PREPASS
if (finalColor.a<=0.0 && geometryZeroAlphaDiscard>0.0) {discard;}
vec4 geometryColor=finalColor;
#if defined(PREPASS_ALBEDO) || defined(PREPASS_ALBEDO_SQRT)
vec3 geometryAlbedo=vGeometryAlbedo;
#endif
#ifdef PREPASS_POSITION
vec3 geometryPositionW=vGeometryPositionW;
#endif
#ifdef PREPASS_LOCAL_POSITION
vec3 geometryPositionL=vGeometryPositionL;
#endif
#ifdef PREPASS_DEPTH
float geometryViewDepth=vGeometryViewDepth;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
float geometryNormalizedViewDepth=vGeometryNormalizedViewDepth;
#endif
#ifdef PREPASS_NORMAL
vec3 geometryNormalV=vGeometryNormalV;
#endif
#ifdef PREPASS_WORLD_NORMAL
vec3 geometryNormalW=vGeometryNormalW;
#endif
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
vec4 geometryCurrentPosition=vGeometryCurrentPosition;vec4 geometryPreviousPosition=vGeometryPreviousPosition;
#endif
#include<geometryRenderingFragment>
#elif defined(GPUPICKER_DEPTH)
glFragData[0]=finalColor;
#ifdef GPUPICKER_PACK_DEPTH
glFragData[1]=pack(gl_FragCoord.z);
#else
glFragData[1]=vec4(gl_FragCoord.z,0.0,0.0,1.0);
#endif
#else
gl_FragColor=finalColor;
#endif
#define CUSTOM_FRAGMENT_MAIN_END
}
`;n.ShadersStore[m]||(n.ShadersStore[m]=h);var g=[i,o,s,u,d,r,c,l,t,a,f];for(let e of g)n.IncludesShadersStore[e.name]||(n.IncludesShadersStore[e.name]=e.shader);var _={name:m,shader:h};export{p as t};