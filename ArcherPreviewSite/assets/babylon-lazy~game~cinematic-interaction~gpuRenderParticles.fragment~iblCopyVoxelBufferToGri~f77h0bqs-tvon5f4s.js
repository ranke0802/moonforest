import{t as e}from"./rolldown-runtime-DK3Fl9T5.js";import{Ht as t,I as n,J as r,L as i,P as a,Q as o,X as s,Y as c,Z as l,at as u,gt as d,ht as f,i as p,it as m,tt as h}from"./babylon-game-Bp_kWzU6.js";import{l as g}from"./babylon-tools~game~cinematic-interaction-Dq0sw1ll.js";var _=e({_HDRTextureLoader:()=>v}),v=class{constructor(){this.supportCascades=!1}loadCubeData(){throw`.hdr not supported in Cube.`}loadData(e,t,n){let r=new Uint8Array(e.buffer,e.byteOffset,e.byteLength),i=m(r),a=u(r,i),o=i.width*i.height,s=new Float32Array(o*4);for(let e=0;e<o;e+=1)s[e*4]=a[e*3],s[e*4+1]=a[e*3+1],s[e*4+2]=a[e*3+2],s[e*4+3]=1;n(i.width,i.height,t.generateMipMaps,!1,()=>{let e=t.getEngine();t.type=1,t.format=5,t._gammaSpace=!1,e._uploadDataToTextureDirectly(t,s)})}},y=e({volumetricLightingBlendVolumePixelShader:()=>S}),b=`volumetricLightingBlendVolumePixelShader`,x=`varying vec2 vUV;uniform sampler2D textureSampler;uniform sampler2D depthSampler;uniform mat4 invProjection;uniform vec2 outputTextureSize;
#ifdef USE_EXTINCTION
uniform vec3 extinction;
#endif
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {gl_FragColor=texture2D(textureSampler,vUV);
#ifdef USE_EXTINCTION
float depth=texelFetch(depthSampler,ivec2(gl_FragCoord.xy),0).r;vec4 ndc=vec4((gl_FragCoord.xy/outputTextureSize)*2.-1.,depth*2.-1.,1.0);vec4 viewPos=invProjection*ndc;viewPos=viewPos/viewPos.w;float eyeDist=length(viewPos);gl_FragColor2=vec4(exp(-extinction*eyeDist),1.0);
#endif
}
`;g.ShadersStore[b]||(g.ShadersStore[b]=x);var S={name:b,shader:x},C=e({gpuRenderParticlesPixelShaderWGSL:()=>D}),w=`gpuRenderParticlesPixelShader`,T=`var diffuseSamplerSampler: sampler;var diffuseSampler: texture_2d<f32>;varying vUV: vec2f;varying vColor: vec4f;
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
`;g.ShadersStoreWGSL[w]||(g.ShadersStoreWGSL[w]=T);var E=[i,n,d,o,h,t,l,s,f,c,r,a,p];for(let e of E)g.IncludesShadersStoreWGSL[e.name]||(g.IncludesShadersStoreWGSL[e.name]=e.shader);var D={name:w,shader:T},O=e({iblCopyVoxelBufferToGridComputeShaderWGSL:()=>j}),k=`iblCopyVoxelBufferToGridComputeShader`,A=`@group(0) @binding(0) var<storage,read> voxelOpacityBuffer: array<u32>;@group(0) @binding(1) var voxelGridTarget: texture_storage_3d<r8unorm,write>;@compute @workgroup_size(4,4,4)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {let size: vec3<u32>=textureDimensions(voxelGridTarget);if (id.x>=size.x || id.y>=size.y || id.z>=size.z) {return;}
let res: u32=size.x;let vidx: u32=id.x+id.y*res+id.z*res*res;let word: u32=voxelOpacityBuffer[vidx>>2u];let byteVal: u32=(word>>((vidx & 3u)*8u)) & 0xFFu;let opacity: f32=f32(byteVal)/255.0;textureStore(voxelGridTarget,vec3<i32>(id),vec4f(opacity,0.0,0.0,1.0));}
`;g.ShadersStoreWGSL[k]||(g.ShadersStoreWGSL[k]=A);var j={name:k,shader:A};export{_ as i,C as n,y as r,O as t};