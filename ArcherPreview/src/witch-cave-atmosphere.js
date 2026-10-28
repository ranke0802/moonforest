import {Color3,Color4,MeshBuilder,ShaderMaterial} from '@babylonjs/core';
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
export function configureCaveAtmosphere(world){
  world.caveAtmosphere?.dispose();world.caveAtmosphere=null;
  world.sky.mesh.setEnabled(!world.cave);world.mountains.setEnabled(!world.cave);
  world.lighting.followHeight=world.cave;
  if(!world.cave){world.scene.clearColor=new Color4(.61,.71,.77,1);return;}
  world.scene.clearColor=new Color4(.24,.23,.28,1);
  world.scene.fogColor=new Color3(.24,.23,.28);
  world.scene.fogStart=38;world.scene.fogEnd=105;
  const water=MeshBuilder.CreateGround('cave-still-water',{width:117,height:117,subdivisions:1},world.scene);
  water.position.y=-2.8;water.isPickable=false;water.freezeWorldMatrix();
  const material=new ShaderMaterial('cave-painted-water',world.scene,{vertexSource,fragmentSource},{attributes:['position'],uniforms:['world','worldViewProjection','time','eye']});
  water.material=material;material.setFloat('time',0);material.setVector3('eye',world.camera.position);
  world.caveAtmosphere={tick(time){material.setFloat('time',time);material.setVector3('eye',world.camera.globalPosition);},dispose(){water.dispose();material.dispose();}};
}
