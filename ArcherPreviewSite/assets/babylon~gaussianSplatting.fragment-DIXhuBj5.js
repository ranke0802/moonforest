import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{b as t}from"./babylon~index-Cqs0uHiE.js";import{t as n}from"./babylon~index~animationGroup.pure~flowGraphReceiveCustomEventBlock.pure~flowGraphPlayAnimat~ew3ox293-D-XQlhUT.js";import{t as r}from"./babylon~index~packingFunctions~depth.fragment~gaussianSplatting.fragment~kernelBlur.fragmen~gehngc96-BaOlvuOs.js";import{t as i}from"./babylon~index~clipPlaneFragmentDeclaration~background.fragment~color.fragment~default.fragm~lv6ffjie-BgKCG_Qz.js";import{t as a}from"./babylon~index~clipPlaneFragment~background.fragment~color.fragment~default.fragment~depth.f~jdcemrqc-HvOw10c3.js";import{t as o}from"./babylon~index~logDepthDeclaration~background.fragment~background.vertex~default.fragment~de~h7hiicaf-PtIH_nCu.js";import{t as s}from"./babylon~index~fogFragmentDeclaration~background.fragment~color.fragment~default.fragment~ga~f97tbju4-DyZXulcb.js";import{t as c}from"./babylon~index~gaussianSplattingFragmentDeclaration~background.fragment~default.fragment~gau~jrd8c5p7-DgvbrGen.js";import{t as l}from"./babylon~index~gaussianSplattingFragmentDeclaration~background.fragment~color.fragment~defau~evjb4g6k-BEfbBYRh.js";import{t as u}from"./babylon~index~objectIdFunctions~default.fragment~gaussianSplatting.fragment~gpuRenderPartic~mawb8fa9-Bx-H0pkw.js";import{n as d,t as f}from"./babylon~index~default.fragment~gaussianSplatting.fragment~gpuRenderParticles.fragment~parti~mza1pylg-BsAtiiM4.js";import{t as p}from"./babylon~index~gaussianSplatting.fragment~gpuRenderParticles.fragment~particles.fragment~spr~d6iypw60-CkB9SVS0.js";var m=e({gaussianSplattingPixelShaderWGSL:()=>v}),h=`gaussianSplattingPixelShader`,g=`#include<clipPlaneFragmentDeclaration>
#include<logDepthDeclaration>
#include<fogFragmentDeclaration>
#define PREPASS_CUSTOM_VARYINGS
#include<prePassDeclaration>[SCENE_MRT_COUNT]
#ifdef GPUPICKER_PACK_DEPTH
#include<packingFunctions>
#endif
varying vColor: vec4f;varying vPosition: vec2f;
#ifdef PREPASS
uniform geometryZeroAlphaDiscard: f32;
#ifdef PREPASS_POSITION
varying vGeometryPositionW: vec3f;
#endif
#ifdef PREPASS_LOCAL_POSITION
varying vGeometryPositionL: vec3f;
#endif
#ifdef PREPASS_DEPTH
varying vGeometryViewDepth: f32;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
varying vGeometryNormalizedViewDepth: f32;
#endif
#ifdef PREPASS_NORMAL
varying vGeometryNormalV: vec3f;
#endif
#ifdef PREPASS_WORLD_NORMAL
varying vGeometryNormalW: vec3f;
#endif
#if defined(PREPASS_ALBEDO) || defined(PREPASS_ALBEDO_SQRT)
varying vGeometryAlbedo: vec3f;
#endif
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
varying vGeometryCurrentPosition: vec4f;varying vGeometryPreviousPosition: vec4f;
#endif
#endif
#define CUSTOM_FRAGMENT_DEFINITIONS
#include<gaussianSplattingFragmentDeclaration>
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
var finalColor: vec4f=gaussianColor(input.vColor,input.vPosition);
#define CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR
#ifdef PREPASS
if (finalColor.a<=0.0 && uniforms.geometryZeroAlphaDiscard>0.0) {discard;}
let geometryColor=finalColor;
#if defined(PREPASS_ALBEDO) || defined(PREPASS_ALBEDO_SQRT)
let geometryAlbedo=input.vGeometryAlbedo;
#endif
#ifdef PREPASS_POSITION
let geometryPositionW=input.vGeometryPositionW;
#endif
#ifdef PREPASS_LOCAL_POSITION
let geometryPositionL=input.vGeometryPositionL;
#endif
#ifdef PREPASS_DEPTH
let geometryViewDepth=input.vGeometryViewDepth;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
let geometryNormalizedViewDepth=input.vGeometryNormalizedViewDepth;
#endif
#ifdef PREPASS_NORMAL
let geometryNormalV=input.vGeometryNormalV;
#endif
#ifdef PREPASS_WORLD_NORMAL
let geometryNormalW=input.vGeometryNormalW;
#endif
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
let geometryCurrentPosition=input.vGeometryCurrentPosition;let geometryPreviousPosition=input.vGeometryPreviousPosition;
#endif
#include<geometryRenderingFragment>
#elif defined(GPUPICKER_DEPTH)
fragmentOutputs.fragData0=finalColor;
#ifdef GPUPICKER_PACK_DEPTH
fragmentOutputs.fragData1=pack(fragmentInputs.position.z);
#else
fragmentOutputs.fragData1=vec4f(fragmentInputs.position.z,0.0,0.0,1.0);
#endif
#else
fragmentOutputs.color=finalColor;
#endif
#define CUSTOM_FRAGMENT_MAIN_END
}
`;n.ShadersStoreWGSL[h]||(n.ShadersStoreWGSL[h]=g);var _=[i,o,s,u,d,r,c,l,t,a,f,p];for(let e of _)n.IncludesShadersStoreWGSL[e.name]||(n.IncludesShadersStoreWGSL[e.name]=e.shader);var v={name:h,shader:g};export{m as t};