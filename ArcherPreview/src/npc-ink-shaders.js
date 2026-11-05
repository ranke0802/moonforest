// InteriorInk math from the supplied NPC package, adapted to Babylon's existing
// post-process color/depth inputs. This module creates no engine or resources.
export const NPC_INK_DEPTH_EPSILON=1e-6;
export const NPC_INK_OFFSETS=Object.freeze([[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]].map(Object.freeze));

export function buildNpcInkFragment({maxProfiles=64}={}){
  if(!Number.isInteger(maxProfiles)||maxProfiles<2||maxProfiles>64)throw new RangeError('NPC ink needs2..64 profiles, with index0 reserved.');
  return `precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler,tNormal,tDepth,tSceneDepth;
uniform vec2 texel,nearFar;
uniform float pixelWorldFactor,reverseDepth;
uniform vec3 ink;
uniform vec2 npcProfiles[${maxProfiles}];

float forwardDepth(float depth){return reverseDepth>.5?1.-depth:depth;}
float distanceAt(float depth){return nearFar.x*nearFar.y/(nearFar.y-(nearFar.y-nearFar.x)*forwardDepth(depth));}
bool depthOccluded(float npcDepth,float sceneDepth){return forwardDepth(npcDepth)>forwardDepth(sceneDepth)+.000001;}
vec2 profileAt(float alpha){
  float profileIndex=floor((alpha-.5)*128.+.5);
  vec2 profile=vec2(1.85,.25);
  for(int i=1;i<${maxProfiles};i++){
    if(abs(float(i)-profileIndex)<.5)profile=npcProfiles[i];
  }
  return profile;
}
float edgeAt(vec2 off,vec3 n,float z,float scale){
  vec2 uv=vUV+off*texel;vec4 other=texture2D(tNormal,uv);if(other.a<.5)return 0.;
  float depth=texture2D(tDepth,uv).r;
  if(depthOccluded(depth,texture2D(tSceneDepth,uv).r))return 0.;
  vec3 nn=normalize(other.rgb*2.-1.);float dz=distanceAt(depth)-z;
  float slope=(abs(n.x*off.x)+abs(n.y*off.y))/max(.22,abs(n.z));
  float threshold=max(.0008*scale,z*pixelWorldFactor*1.4)+z*pixelWorldFactor*slope*1.8;
  float depthLine=smoothstep(threshold,threshold*2.4,dz);
  float normalLine=smoothstep(.16,.40,1.-dot(n,nn));
  return max(depthLine,normalLine*.78);
}
void main(){
  vec4 base=texture2D(textureSampler,vUV),center=texture2D(tNormal,vUV);
  if(center.a<.5){gl_FragColor=base;return;}
  float depth=texture2D(tDepth,vUV).r;
  if(depthOccluded(depth,texture2D(tSceneDepth,vUV).r)){gl_FragColor=base;return;}
  vec2 profile=profileAt(center.a);
  vec3 n=normalize(center.rgb*2.-1.);float z=distanceAt(depth);float e=0.;
  e=max(e,edgeAt(vec2(1,0),n,z,profile.x));e=max(e,edgeAt(vec2(-1,0),n,z,profile.x));e=max(e,edgeAt(vec2(0,1),n,z,profile.x));e=max(e,edgeAt(vec2(0,-1),n,z,profile.x));
  e=max(e,edgeAt(vec2(.707,.707),n,z,profile.x));e=max(e,edgeAt(vec2(-.707,.707),n,z,profile.x));e=max(e,edgeAt(vec2(.707,-.707),n,z,profile.x));e=max(e,edgeAt(vec2(-.707,-.707),n,z,profile.x));
  if(e<.035){gl_FragColor=base;return;}
  float alpha=clamp(e*profile.y,0.,.9);
  gl_FragColor=vec4(mix(base.rgb,ink,alpha),base.a);
}
`;
}

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smoothstep=(a,b,value)=>{const t=clamp((value-a)/(b-a),0,1);return t*t*(3-2*t);};
const normal=rgb=>{const value=rgb.map(channel=>channel*2-1),length=Math.hypot(...value);return value.map(channel=>channel/length);};

// Numeric reference functions deliberately use the same nonlinear hardware
// depth convention as both native depth textures; no gamma conversion occurs.
export function npcInkViewDistance(depth,nearFar,reverseDepth=false){
  const value=reverseDepth?1-depth:depth;
  return nearFar[0]*nearFar[1]/(nearFar[1]-(nearFar[1]-nearFar[0])*value);
}

export function npcInkDepthOccluded(npcDepth,sceneDepth,reverseDepth=false){
  const npc=reverseDepth?1-npcDepth:npcDepth,scene=reverseDepth?1-sceneDepth:sceneDepth;
  return npc>scene+NPC_INK_DEPTH_EPSILON;
}

export function npcInkEdgeAt({offset,normal:n,neighborNormal:nn,z,neighborZ,pixelWorldFactor,scale}){
  const dz=neighborZ-z,slope=(Math.abs(n[0]*offset[0])+Math.abs(n[1]*offset[1]))/Math.max(.22,Math.abs(n[2]));
  const threshold=Math.max(.0008*scale,z*pixelWorldFactor*1.4)+z*pixelWorldFactor*slope*1.8;
  const depthLine=smoothstep(threshold,threshold*2.4,dz),normalLine=smoothstep(.16,.40,1-n.reduce((sum,value,index)=>sum+value*nn[index],0));
  return Math.max(depthLine,normalLine*.78);
}

export function evaluateNpcInk({base,center,neighbors,nearFar,pixelWorldFactor,profiles=[],ink=[.052,.040,.054],reverseDepth=false}){
  const profileIndex=Math.floor((center.alpha-.5)*128+.5),unchanged=()=>({color:[...base],alpha:0,edge:0,profileIndex});
  if(center.alpha<.5||npcInkDepthOccluded(center.depth,center.sceneDepth,reverseDepth))return unchanged();
  const profile=profiles[profileIndex]??[1.85,.25],n=normal(center.rgb),z=npcInkViewDistance(center.depth,nearFar,reverseDepth);let edge=0;
  for(let i=0;i<NPC_INK_OFFSETS.length;i++){
    const other=neighbors[i];if(!other||other.alpha<.5||npcInkDepthOccluded(other.depth,other.sceneDepth,reverseDepth))continue;
    edge=Math.max(edge,npcInkEdgeAt({offset:NPC_INK_OFFSETS[i],normal:n,neighborNormal:normal(other.rgb),z,neighborZ:npcInkViewDistance(other.depth,nearFar,reverseDepth),pixelWorldFactor,scale:profile[0]}));
  }
  if(edge<.035)return {...unchanged(),edge};
  const alpha=clamp(edge*profile[1],0,.9),color=base.map((channel,index)=>index<3?channel*(1-alpha)+ink[index]*alpha:channel);
  return {color,alpha,edge,profileIndex};
}
