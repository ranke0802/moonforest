import {CAVE_ROCK_GLSL} from './cave-rock-shell.js';
import {CAVE_VIEW_GLSL,CAVE_VIEW_UNIFORMS} from './witch-cave-visibility.js';

// R = current player line-of-sight, G = explored memory. RGBA8, no mipmaps.
// Upload only when fog.revision changes. Bind the same field to ground, rocks,
// water, glow and ink; otherwise partially visible large meshes can leak detail.
export const CAVE_FOG_GLSL=`
uniform sampler2D caveFogMap;
uniform vec4 caveFogRect;
uniform float caveFogActive;
vec2 caveFogState(vec3 p){
  vec2 uv=(p.xz-caveFogRect.xy)/caveFogRect.zw;
  if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return vec2(0.);
  return texture2D(caveFogMap,uv).rg;
}
vec3 caveFogMemoryColor(vec3 p,float explored){
  // Unseen space reads as solid cave rock, not black painted void. Its actual
  // rooms/props remain unsubmitted; explored memory is only slightly lighter.
  float strata=.5+.5*sin(p.x*.51+p.y*.92+sin(p.z*.27))*sin(p.z*.43-p.y*.37);
  return mix(vec3(.27,.235,.245),vec3(.36,.30,.28),strata*.45)*mix(.87,1.,smoothstep(.05,.95,explored));
}
vec3 caveFogShade(vec3 base,vec3 p){
  if(caveFogActive<.5)return base;
  vec2 f=caveFogState(p);
  return mix(caveFogMemoryColor(p,f.y),base,smoothstep(.08,.92,f.x));
}
bool caveFogHidesInk(vec3 p){return caveFogActive>.5&&caveFogState(p).x<.92;}
`;

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
  if(caveForegroundCutaway(fogWorldPosition,caveEye,caveFocus))discard;
  vec2 state=caveFogState(fogWorldPosition);
  gl_FragColor=vec4(caveRockShade(fogWorldPosition,fogWorldNormal,state.y),1.);
}`;
