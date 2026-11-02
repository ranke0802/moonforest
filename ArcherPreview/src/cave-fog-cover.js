import {CAVE_ROCK_GLSL} from './cave-rock-shell.js';
import {CAVE_VIEW_GLSL,CAVE_VIEW_UNIFORMS} from './witch-cave-visibility.js';

// R = current player line-of-sight, G = explored memory. RGBA8, no mipmaps.
// Upload only when fog.revision changes. Bind the same field to ground, rocks,
// water, glow and ink; otherwise partially visible large meshes can leak detail.
export const CAVE_FOG_GLSL=`
#ifndef CAVE_FOG_STATE_DEFINED
#define CAVE_FOG_STATE_DEFINED
uniform sampler2D caveFogMap;
uniform vec4 caveFogRect;
uniform float caveFogActive;
// The paint/lantern and final fog stages ask about the same fragment. Retain
// this one existing lookup, never a second visibility texture or frame upload.
bool caveFogSampleReady=false;
vec3 caveFogSamplePosition=vec3(0.);
vec2 caveFogSampleValue=vec2(0.);
vec2 caveFogState(vec3 p){
  if(caveFogSampleReady&&all(equal(p,caveFogSamplePosition)))return caveFogSampleValue;
  vec2 uv=(p.xz-caveFogRect.xy)/caveFogRect.zw;
  vec2 state=vec2(0.);
  if(uv.x>=0.&&uv.y>=0.&&uv.x<=1.&&uv.y<=1.)state=texture2D(caveFogMap,uv).rg;
  caveFogSampleReady=true;caveFogSamplePosition=p;caveFogSampleValue=state;
  return state;
}
vec3 caveFogMemoryColor(vec3 p,float explored){
  // Low-detail darkness belongs to the real occluding surface, not a moving
  // black hemisphere. No repeated rock atlas or pattern is drawn in memory.
  return vec3(.024,.028,.038);
}
vec3 caveFogShade(vec3 base,vec3 p){
  if(caveFogActive<.5)return base;
  vec2 f=caveFogState(p);
  return mix(caveFogMemoryColor(p,f.y),base,smoothstep(.08,.92,f.x));
}
// An already submitted opaque surface still has a real face and depth. Retain
// a faint, desaturated version of that face instead of painting sharp black
// polygons across it. Hidden records/enemies keep their separate hard gate.
vec3 caveFogSurfaceMemory(vec3 base){
  vec3 bounded=clamp(base,vec3(0.),vec3(1.));
  float grey=dot(bounded,vec3(.2126,.7152,.0722));
  return mix(vec3(grey),bounded,.20)*.24;
}
vec3 caveFogShadeSurface(vec3 base,vec3 p,float environment){
  if(caveFogActive<.5)return base;
  vec2 state=caveFogState(p);
  vec3 memory=environment>.5?caveFogSurfaceMemory(base):caveFogMemoryColor(p,state.y);
  return mix(memory,base,smoothstep(.08,.92,state.x));
}
bool caveFogHidesInk(vec3 p){return caveFogActive>.5&&caveFogState(p).x<.92;}
#endif
`;

export function caveFogSurfaceMemory(base){const bounded=base.map(v=>Math.max(0,Math.min(1,v))),grey=bounded[0]*.2126+bounded[1]*.7152+bounded[2]*.0722;return bounded.map(v=>(grey*.8+v*.2)*.24);}

// A lightweight opaque cover, including unseen areas whose detailed geometry
// was not submitted. Add once; never rebuild geometry during normal movement.
// Caller must use the same terrain height function as the map and a matching
// winding/backFaceCulling policy for its right-handed scene.
export function buildCaveFogCover(fog,heightAt,{spacing=4,lift=.035,maxVertices=16384}={}){
  if(typeof heightAt!=='function'||!Number.isFinite(spacing)||spacing<=0||!Number.isFinite(lift))throw new TypeError('Invalid cover options');
  const cols=Math.ceil(fog.cols*fog.cellSize/spacing),rows=Math.ceil(fog.rows*fog.cellSize/spacing),count=(cols+1)*(rows+1);
  if(count>maxVertices)throw new RangeError('Fog cover exceeds vertex budget');
  const positions=new Float32Array(count*3),indices=new Uint32Array(cols*rows*6);
  const width=fog.cols*fog.cellSize,depth=fog.rows*fog.cellSize;
  for(let z=0;z<=rows;z++)for(let x=0;x<=cols;x++){
    const wx=fog.minX+x*width/cols,wz=fog.minZ+z*depth/rows,y=heightAt(wx,wz);
    if(!Number.isFinite(y))throw new TypeError('Non-finite terrain height');
    const i=(z*(cols+1)+x)*3;positions[i]=wx;positions[i+1]=y+lift;positions[i+2]=wz;
  }
  let at=0;
  for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){
    const a=z*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;
    indices.set([a,c,b,b,c,d],at);at+=6;
  }
  return {positions,indices,triangles:indices.length/3,textureRect:[fog.minX,fog.minZ,width,depth]};
}

// Only fully hidden patches submit this opaque rock shell. Partial patches use
// the original terrain once, with the same rock shading beyond current vision.
export const CAVE_FOG_COVER_FRAGMENT=`precision highp float;
varying vec3 fogWorldPosition;
varying vec3 fogWorldNormal;
uniform vec3 caveEye;uniform vec3 caveFocus;
${CAVE_FOG_GLSL}
${CAVE_ROCK_GLSL}
${CAVE_VIEW_UNIFORMS}
${CAVE_VIEW_GLSL}
void main(){
  if(caveFogActive<.5)discard;
  // The unknown-space enclosure stays closed, even when a local visible rock
  // is cut around the player. Never expose the backs of unsubmitted rooms.
  vec2 state=caveFogState(fogWorldPosition);
  vec3 rock=caveRockShade(fogWorldPosition,fogWorldNormal,state.y);
  rock=mix(caveFogSurfaceMemory(rock),rock,smoothstep(.08,.92,state.x));
  float haze=smoothstep(22.,48.,length(fogWorldPosition-caveEye));
  gl_FragColor=vec4(mix(rock,vec3(.024,.028,.038),haze),1.);
}`;
