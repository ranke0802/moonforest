import {Color3,Color4,Mesh,MeshBuilder,ShaderMaterial,Vector3,VertexData,Constants} from '@babylonjs/core';
import {CAVE_PLACEMENTS,CAVE_POOLS,CAVE_WATERFALLS,caveRoofHeight} from './witch-cave-layout.js';
import {caveSurfaceStyle} from './witch-cave-surfaces.js';
const vertexSource=`precision highp float;
attribute vec3 position;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 p;
void main(){p=(world*vec4(position,1.)).xyz;gl_Position=worldViewProjection*vec4(position,1.);}`;
const fragmentSource=`precision highp float;
varying vec3 p;uniform float time;uniform vec3 eye;
void main(){
 float ripples=sin(p.x*1.3+p.z*.9+time*.45)*sin(p.z*1.8-p.x*.5-time*.31);
 vec3 color=mix(vec3(.15,.24,.27),vec3(.24,.36,.39),.5+.5*ripples);
 float haze=smoothstep(38.,100.,length(p-eye));
 gl_FragColor=vec4(mix(color,vec3(.24,.23,.28),haze),1.);
}`;
const glowVertex=`precision highp float;
attribute vec3 position;attribute vec2 uv;varying vec2 glowUV;
uniform mat4 viewProjection;uniform vec3 right;uniform vec3 up;
#include<instancesDeclaration>
void main(){
#include<instancesVertex>
glowUV=uv;vec3 p=finalWorld[3].xyz+right*position.x+up*position.y;
gl_Position=viewProjection*vec4(p,1.);}`;
const glowFragment=`precision highp float;varying vec2 glowUV;uniform vec3 tint;
void main(){vec2 p=glowUV*2.-1.;float a=max(0.,1.-dot(p,p));gl_FragColor=vec4(tint,a*a*a*.2);}`;
const roofFragment=`precision highp float;varying vec3 p;uniform vec3 eye;uniform vec3 focus;
void main(){
 // A local cutaway keeps the orbit camera clear while the distant ceiling
 // joins the existing wall/column silhouettes. No transparent sorting pass.
 vec2 sight=focus.xz-eye.xz;
 float along=clamp(dot(p.xz-eye.xz,sight)/max(dot(sight,sight),.001),0.,1.);
 if(length(p.xz-mix(eye.xz,focus.xz,along))<mix(21.,14.,along))discard;
 float strata=sin(p.x*.73+sin(p.z*.24)*2.)*sin(p.z*.52-p.x*.13);
 vec3 color=mix(vec3(.25,.23,.28),vec3(.37,.34,.39),.5+strata*.25);
 float fog=smoothstep(38.,105.,length(p-eye));gl_FragColor=vec4(mix(color,vec3(.24,.23,.28),fog),1.);
}`;
const fallFragment=`precision highp float;varying vec3 p;uniform float time;uniform vec3 eye;
void main(){
 float ribbon=sin(p.x*9.+p.z*6.+sin(p.y*1.4-time*1.8))*.5+.5;
 float foam=pow(max(0.,sin(p.y*8.+time*4.)),7.);
 vec3 color=mix(vec3(.18,.31,.35),vec3(.48,.61,.62),ribbon*.45+foam*.25);
 float haze=smoothstep(38.,100.,length(p-eye));
 gl_FragColor=vec4(mix(color,vec3(.24,.23,.28),haze),1.);
}`;
function caveWater(world){
 const scene=world.scene,materials=[],meshes=[];
 const material=new ShaderMaterial('cave-painted-water',scene,{vertexSource,fragmentSource},{attributes:['position'],uniforms:['world','worldViewProjection','time','eye']});materials.push(material);
 for(const [i,pool]of CAVE_POOLS.entries()){
  const positions=[pool.x,pool.height,pool.z],indices=[],segments=64;
  for(let k=0;k<=segments;k++){
   const angle=k/segments*Math.PI*2,r=.96+.035*Math.sin(angle*7)+.025*Math.cos(angle*11);
   positions.push(pool.x+Math.cos(angle)*pool.rx*r,pool.height,pool.z+Math.sin(angle)*pool.rz*r);
   if(k)indices.push(0,k+1,k);
  }
  const mesh=new Mesh(i?'cave-water-pool-'+i:'cave-still-water',scene),data=new VertexData();data.positions=positions;data.indices=indices;data.applyToMesh(mesh);
  mesh.material=material;mesh.isPickable=false;mesh.freezeWorldMatrix();meshes.push(mesh);
 }
 material.backFaceCulling=false;
 const falls=new ShaderMaterial('cave-flowing-water',scene,{vertexSource,fragmentSource:fallFragment},{attributes:['position'],uniforms:['world','worldViewProjection','time','eye']});falls.backFaceCulling=false;materials.push(falls);
 for(const [i,p]of CAVE_WATERFALLS.entries()){
  const mesh=MeshBuilder.CreatePlane('cave-waterfall-'+i,{width:p.width,height:p.top-p.bottom},scene);
  mesh.position.set(p.x,(p.top+p.bottom)/2,p.z);mesh.rotation.y=p.yaw;mesh.material=falls;mesh.isPickable=false;mesh.freezeWorldMatrix();meshes.push(mesh);
 }
 return {tick(time){for(const mat of materials){mat.setFloat('time',time);mat.setVector3('eye',world.camera.globalPosition);}},dispose(){for(const mesh of meshes)mesh.dispose();for(const mat of materials)mat.dispose();}};
}
function caveCeiling(world){
  const positions=[],indices=[],segments=64,rings=12;
  for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++){
    const a=i/segments*Math.PI*2,r=ring/rings*72,x=Math.cos(a)*r,z=Math.sin(a)*r;
    positions.push(x,caveRoofHeight(x,z)+.6*Math.sin(x*.24)*Math.cos(z*.19),z);
    if(ring&&i){const at=ring*(segments+1)+i;indices.push(at,at-1,at-segments-2);if(ring>1)indices.push(at,at-segments-2,at-segments-1);}
  }
  const mesh=new Mesh('cave-distant-ceiling',world.scene),data=new VertexData();data.positions=positions;data.indices=indices;data.applyToMesh(mesh);mesh.isPickable=false;mesh.freezeWorldMatrix();
  const material=new ShaderMaterial('cave-ceiling-paint',world.scene,{vertexSource,fragmentSource:roofFragment},{attributes:['position'],uniforms:['world','worldViewProjection','eye','focus']});material.backFaceCulling=false;mesh.material=material;
  return {material,dispose(){mesh.dispose();material.dispose();}};
}
function caveGlow(world,asset,tint,height,offsetX=0){
  const material=new ShaderMaterial('cave-glow-'+asset,world.scene,{vertexSource:glowVertex,fragmentSource:glowFragment},{attributes:['position','uv'],uniforms:['world','viewProjection','right','up','tint'],needAlphaBlending:true});
  material.setColor3('tint',Color3.FromHexString(tint));material.backFaceCulling=false;material.disableDepthWrite=true;material.alphaMode=Constants.ALPHA_ADD;
  const source=MeshBuilder.CreatePlane('cave-glow-source-'+asset,{width:1.8,height:1.8},world.scene);source.material=material;source.isVisible=false;source.isPickable=false;
  const instances=CAVE_PLACEMENTS.filter(p=>p.asset.includes(asset)).map((p,i)=>{
    const mesh=source.createInstance('cave-glow-'+asset+i);mesh.position.set(p.x+Math.cos(p.yaw)*offsetX*p.scale,(p.elevation??world.terrain.heightAt(p.x,p.z))+height*p.scale,p.z-Math.sin(p.yaw)*offsetX*p.scale);mesh.isPickable=false;mesh.freezeWorldMatrix();return mesh;
  });
  return {material,dispose(){for(const m of instances)m.dispose();source.dispose();material.dispose();}};
}
export function configureCaveAtmosphere(world){
  world.caveAtmosphere?.dispose();world.caveAtmosphere=null;
  world.sky.mesh.setEnabled(!world.cave);world.mountains.setEnabled(!world.cave);
  world.lighting.followHeight=world.cave;
  if(!world.cave){world.scene.clearColor=new Color4(.61,.71,.77,1);return;}
  world.scene.clearColor=new Color4(.24,.23,.28,1);
  world.scene.fogColor=new Color3(.24,.23,.28);
  world.scene.fogStart=38;world.scene.fogEnd=105;
  const water=caveWater(world),style=caveSurfaceStyle(world);
  const glows=[caveGlow(world,'votive-lantern','#e6b46b',.8),caveGlow(world,'soul-collector-arm','#ad8dd3',2.784,.774)],ceiling=caveCeiling(world);
  const right=Vector3.Right(),up=Vector3.Up();
  world.caveAtmosphere={tick(time){water.tick(time);
    const m=world.camera.getWorldMatrix().m;right.set(m[0],m[1],m[2]);up.set(m[4],m[5],m[6]);
    for(const glow of glows){glow.material.setVector3('right',right);glow.material.setVector3('up',up);}
    ceiling.material.setVector3('eye',world.camera.globalPosition);ceiling.material.setVector3('focus',world.camera.target);
  },inspect:()=>style.inspect(),dispose(){style.dispose();ceiling.dispose();for(const glow of glows)glow.dispose();water.dispose();}};
  world.caveAtmosphere.tick(0);
}
