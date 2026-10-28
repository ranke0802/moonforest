import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{t}from"./babylon~index~animationGroup.pure~flowGraphReceiveCustomEventBlock.pure~flowGraphPlayAnimat~ew3ox293-D-XQlhUT.js";import{t as n}from"./babylon~index~helperFunctions~background.fragment~background.vertex~copyTextureToTexture.fr~ba1nomlt-jmamdwPt.js";import{t as r}from"./babylon~index~clipPlaneFragmentDeclaration~background.fragment~color.fragment~default.fragm~lv6ffjie-BgKCG_Qz.js";import{t as i}from"./babylon~index~clipPlaneFragment~background.fragment~color.fragment~default.fragment~depth.f~jdcemrqc-HvOw10c3.js";import{t as a}from"./babylon~index~logDepthDeclaration~background.fragment~background.vertex~default.fragment~de~h7hiicaf-PtIH_nCu.js";import{t as o}from"./babylon~index~imageProcessingDeclaration~background.fragment~default.fragment~gpuRenderPart~ii4u11o8-fjGP8RPD.js";import{t as s}from"./babylon~index~imageProcessingFunctions~background.fragment~default.fragment~gpuRenderPartic~fq6faq6c-CaQSDpmw.js";import{t as c}from"./babylon~index~fogFragmentDeclaration~background.fragment~color.fragment~default.fragment~ga~f97tbju4-DyZXulcb.js";import{t as l}from"./babylon~index~gaussianSplattingFragmentDeclaration~background.fragment~default.fragment~gau~jrd8c5p7-DgvbrGen.js";import{t as u}from"./babylon~index~gaussianSplattingFragmentDeclaration~background.fragment~color.fragment~defau~evjb4g6k-BEfbBYRh.js";import{t as d}from"./babylon~index~objectIdFunctions~default.fragment~gaussianSplatting.fragment~gpuRenderPartic~mawb8fa9-Bx-H0pkw.js";import{n as f,t as p}from"./babylon~index~default.fragment~gaussianSplatting.fragment~gpuRenderParticles.fragment~parti~mza1pylg-BsAtiiM4.js";import{t as m}from"./babylon~index~gaussianSplatting.fragment~gpuRenderParticles.fragment~particles.fragment~spr~d6iypw60-CkB9SVS0.js";var h=e({gpuRenderParticlesPixelShaderWGSL:()=>y}),g=`gpuRenderParticlesPixelShader`,_=`var diffuseSamplerSampler: sampler;var diffuseSampler: texture_2d<f32>;varying vUV: vec2f;varying vColor: vec4f;
#ifdef PREPASS
uniform geometryZeroAlphaDiscard: f32;
#ifdef PREPASS_POSITION
varying vGeometryPositionW: vec3f;
#endif
#ifdef PREPASS_WORLD_NORMAL
varying vGeometryNormalW: vec3f;
#endif
#ifdef PREPASS_NORMAL
varying vGeometryNormalV: vec3f;
#endif
#endif
#define PREPASS_VELOCITY_ZERO
#include<prePassDeclaration>[SCENE_MRT_COUNT]
#include<clipPlaneFragmentDeclaration>
#include<imageProcessingDeclaration>
#include<logDepthDeclaration>
#include<helperFunctions>
#include<imageProcessingFunctions>
#include<fogFragmentDeclaration>
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#include<clipPlaneFragment>
let textureColor: vec4f=textureSample(diffuseSampler,diffuseSamplerSampler,input.vUV);var baseColor: vec4f=textureColor*input.vColor;
#ifdef PREPASS
let geometryAlbedo: vec3f=toLinearSpaceVec3(baseColor.rgb);
#endif
#ifdef BLENDMULTIPLYMODE
let alpha: f32=input.vColor.a*textureColor.a;baseColor=vec4f(baseColor.rgb*alpha+vec3f(1.0)*(1.0-alpha),baseColor.a);
#endif
#include<logDepthFragment>
#include<fogFragment>(color,baseColor)
#ifdef IMAGEPROCESSINGPOSTPROCESS
baseColor=vec4f(toLinearSpaceVec3(baseColor.rgb),baseColor.a);
#else
#ifdef IMAGEPROCESSING
baseColor=vec4f(toLinearSpaceVec3(baseColor.rgb),baseColor.a);baseColor=applyImageProcessing(baseColor);
#endif
#endif
#ifdef PREPASS
let geometryColor: vec4f=baseColor;if (geometryColor.a<=0.0 && uniforms.geometryZeroAlphaDiscard>0.0) {discard;}
#ifdef PREPASS_POSITION
let geometryPositionW: vec3f=input.vGeometryPositionW;
#endif
#ifdef PREPASS_LOCAL_POSITION
let geometryPositionL: vec3f=input.vPosition;
#endif
#ifdef PREPASS_DEPTH
let geometryViewDepth: f32=input.vViewPos.z;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
let geometryNormalizedViewDepth: f32=input.vNormViewDepth;
#endif
#ifdef PREPASS_NORMAL
let geometryNormalV: vec3f=normalize(input.vGeometryNormalV);
#endif
#ifdef PREPASS_WORLD_NORMAL
let geometryNormalW: vec3f=normalize(input.vGeometryNormalW);
#endif
#include<geometryRenderingFragment>
#else
fragmentOutputs.color=baseColor;
#endif
}
`;t.ShadersStoreWGSL[g]||(t.ShadersStoreWGSL[g]=_);var v=[d,f,r,o,a,n,s,c,i,l,u,p,m];for(let e of v)t.IncludesShadersStoreWGSL[e.name]||(t.IncludesShadersStoreWGSL[e.name]=e.shader);var y={name:g,shader:_};export{h as t};