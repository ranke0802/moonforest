import {Color3,Material,Mesh,RawTexture,ShaderMaterial,Texture,Vector3,Vector4,VertexBuffer} from '@babylonjs/core';
import {PLAINS_STREAM} from './great-plains-layout.js';

export const PLAINS_RIVER_NOISE_SIZE=64;
export const PLAINS_RIVER_HALF_WIDTH=2;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));

// Immutable terrain-fitted surface: three columns avoid the old double-sided
// duplicate vertices while retaining the same 640-triangle draw budget.
export function buildPlainsRiverGeometry(points=PLAINS_STREAM,terrain){
 const positions=[],uvs=[],riverData=[],flowDirection=[],indices=[];let distance=0;
 for(let i=0;i<points.length;i++){
  const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
  if(i)distance+=Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]);
  const length=Math.hypot(b[0]-a[0],b[1]-a[1])||1,tx=(b[0]-a[0])/length,tz=(b[1]-a[1])/length;
  const half=PLAINS_RIVER_HALF_WIDTH-.04+.10*Math.sin(distance*.089)+.035*Math.sin(distance*.31),y=-.19-.065*i/Math.max(1,points.length-1);
  for(const u of [0,.5,1]){
   const side=(u*2-1)*half,x=p[0]-tz*side,z=p[1]+tx*side;
   positions.push(x,y,z);uvs.push(u,distance/4);riverData.push(clamp(y-(terrain?.heightAt(x,z)??-.64),0,1.5),0);flowDirection.push(tx,tz);
  }
  if(i)for(let j=0;j<2;j++){const p=(i-1)*3+j,q=i*3+j;indices.push(p,q,q+1,p,q+1,p+1);}
 }
 return {positions,uvs,riverData,flowDirection,indices};
}

// A single tiny repeatable height/bed tile. Generated once per map entry, with
// no downloads, canvas, image decoder, per-frame updates or extra water passes.
export function plainsRiverNoise(size=PLAINS_RIVER_NOISE_SIZE){
 const heights=new Float32Array(size*size),bytes=new Uint8Array(size*size*4);
 const hash=(x,y,seed)=>{let n=Math.imul(x+seed,374761393)^Math.imul(y+seed*3,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 const noise=(x,y,cells,seed)=>{const px=x/size*cells,py=y/size*cells,ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),h=(a,b)=>hash((a+cells)%cells,(b+cells)%cells,seed),mix=(a,b,t)=>a+(b-a)*t;return mix(mix(h(ix,iy),h(ix+1,iy),sx),mix(h(ix,iy+1),h(ix+1,iy+1),sx),sy);};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)heights[y*size+x]=noise(x,y,8,17)*.62+noise(x,y,16,41)*.25+Math.sin((x*3+y)*Math.PI*2/size)*.065;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const h=(dx,dy)=>heights[((y+dy+size)%size)*size+(x+dx+size)%size],i=(y*size+x)*4;
  bytes[i]=Math.round(clamp(.5+(h(-1,0)-h(1,0))*2.8)*255);
  bytes[i+1]=Math.round(clamp(.5+(h(0,-1)-h(0,1))*2.8)*255);
  bytes[i+2]=Math.round(clamp(heights[y*size+x])*255);
  bytes[i+3]=Math.round(clamp(noise(x,y,16,71)*.72+noise(x,y,8,137)*.28)*255);
 }
 return bytes;
}

export const PLAINS_RIVER_VERTEX=`precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec2 riverData;
attribute vec2 flowDirection;
uniform mat4 worldViewProjection;
varying vec3 vPosition;
varying vec2 vUV;
varying vec2 vFlow;
varying float vDepth;
void main(){vPosition=position;vUV=uv;vFlow=flowDirection;vDepth=riverData.x;gl_Position=worldViewProjection*vec4(position,1.0);}`;

export const PLAINS_RIVER_FRAGMENT=`precision highp float;
varying vec3 vPosition;
varying vec2 vUV;
varying vec2 vFlow;
varying float vDepth;
uniform sampler2D riverNoise;
uniform float flowTime;
uniform vec3 eyePosition;
uniform vec3 sunDirection;
uniform vec4 fogInfo;
uniform vec3 fogColor;
void main(){
 vec4 bed=texture2D(riverNoise,vec2(vUV.x*2.2,vUV.y));
 vec4 wave=texture2D(riverNoise,vec2(vUV.x*2.2+flowTime*.015625,vUV.y-flowTime*.125));
 vec2 ripple=(wave.rg*2.0-1.0)*.16+(bed.rg*2.0-1.0)*.035;
 vec2 bend=normalize(vFlow),slope=vec2(-bend.y,bend.x)*ripple.x+bend*ripple.y;
 vec3 n=normalize(vec3(slope.x,1.0,slope.y)),eye=normalize(eyePosition-vPosition);
 float bank=min(vUV.x,1.0-vUV.x),depth=clamp(vDepth*1.65+smoothstep(.0,.30,bank)*.20,0.0,1.0);
 vec3 bottom=mix(vec3(.22,.255,.16),vec3(.32,.33,.225),bed.a);
 vec3 color=mix(bottom,vec3(.095,.225,.205),smoothstep(.02,.9,depth));
 color*=.94+(bed.b-.45)*.10+(wave.b-.45)*.12;
 float fresnel=pow(1.0-clamp(dot(n,eye),0.0,1.0),3.0);
 color=mix(color,vec3(.33,.405,.39),fresnel*.46);
 vec3 halfLight=normalize(normalize(sunDirection)+eye);
 float glint=pow(max(0.0,dot(n,halfLight)),36.0);
 color+=vec3(.25,.255,.215)*glint*.28;
 float shore=(1.0-smoothstep(.012,.085,bank))*smoothstep(.62,.83,wave.b);
 color=mix(color,vec3(.41,.43,.345),shore*.18);
 float distanceToEye=length(eyePosition-vPosition),fog=0.0;
 if(fogInfo.x>2.5)fog=clamp((distanceToEye-fogInfo.y)/max(.001,fogInfo.z-fogInfo.y),0.0,1.0);
 else if(fogInfo.x>1.5)fog=1.0-exp(-pow(distanceToEye*fogInfo.w,2.0));
 else if(fogInfo.x>.5)fog=1.0-exp(-distanceToEye*fogInfo.w);
 gl_FragColor=vec4(mix(color,fogColor,fog),1.0);
}`;

export function createPlainsRiver(world){
 const scene=world.scene,geometry=buildPlainsRiverGeometry(PLAINS_STREAM,world.terrain),mesh=new Mesh('plains-stream',scene);
 mesh.setVerticesData(VertexBuffer.PositionKind,geometry.positions,false);
 mesh.setVerticesData(VertexBuffer.UVKind,geometry.uvs,false);
 mesh.setVerticesData('riverData',geometry.riverData,false,2);
 mesh.setVerticesData('flowDirection',geometry.flowDirection,false,2);
 mesh.setIndices(geometry.indices);mesh.isPickable=false;mesh.receiveShadows=false;mesh.freezeWorldMatrix();
 const texture=RawTexture.CreateRGBATexture(plainsRiverNoise(),PLAINS_RIVER_NOISE_SIZE,PLAINS_RIVER_NOISE_SIZE,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
 texture.name='plains-stream-flow-detail';texture.wrapU=texture.wrapV=Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=2;
 const material=new ShaderMaterial('plains-stream-water',scene,{vertexSource:PLAINS_RIVER_VERTEX,fragmentSource:PLAINS_RIVER_FRAGMENT},{attributes:['position','uv','riverData','flowDirection'],uniforms:['worldViewProjection','flowTime','eyePosition','sunDirection','fogInfo','fogColor'],samplers:['riverNoise'],needAlphaBlending:false,needAlphaTesting:false});
 material.backFaceCulling=false;material.transparencyMode=Material.MATERIAL_OPAQUE;material.alpha=1;mesh.material=material;
 material.setTexture('riverNoise',texture);let disposed=false,time=0;
 const fogInfo=new Vector4(0,0,1,0),fallbackSun=new Vector3(.3,.9,.25),fallbackFog=Color3.Black();
 const bind=()=>{if(disposed)return;material.setFloat('flowTime',time);material.setVector3('eyePosition',world.camera.globalPosition??world.camera.position);material.setVector3('sunDirection',world.lighting?.direction??fallbackSun);fogInfo.set(scene.fogEnabled===false?0:scene.fogMode??0,scene.fogStart??0,scene.fogEnd??1,scene.fogDensity??0);material.setVector4('fogInfo',fogInfo);material.setColor3('fogColor',scene.fogColor??fallbackFog);};
 material.onBindObservable.add(bind);bind();
 return {mesh,material,texture,tick(seconds){if(!disposed&&Number.isFinite(seconds))time=((seconds%64)+64)%64;},bind,inspect:()=>({disposed,time,vertices:mesh.getTotalVertices(),triangles:mesh.getTotalIndices()/3,textureBytes:PLAINS_RIVER_NOISE_SIZE**2*4,draws:1,opaque:true}),dispose(){if(disposed)return;disposed=true;material.onBindObservable.clear();mesh.dispose();material.dispose();texture.dispose();}};
}
