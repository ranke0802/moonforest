import {Mesh,MeshBuilder,RawTexture,Texture,ShaderMaterial,Vector3} from '@babylonjs/core';

// Small tiling noise and two quads: soft painted smoke without a model,
// full-screen effect, light, shadow caster, particle simulation or AI asset.
export function portalNoise(size=128){
  let seed=7731;const grid=new Float32Array(32*32),data=new Uint8Array(size*size*4);
  for(let i=0;i<grid.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;grid[i]=seed/4294967296;}
  const smooth=t=>t*t*(3-2*t),noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy),g=(a,b)=>grid[((b%32+32)%32)*32+(a%32+32)%32];return (g(ix,iy)*(1-u)+g(ix+1,iy)*u)*(1-v)+(g(ix,iy+1)*(1-u)+g(ix+1,iy+1)*u)*v;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const n=noise(x/size*8,y/size*8)*.65+noise(x/size*16,y/size*16)*.25+noise(x/size*32,y/size*32)*.1,i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=Math.round(n*255);data[i+3]=255;}
  return data;
}
const vertexSource=`precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec2 mistUV;void main(){mistUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`;
export const portalMistFragment=`precision mediump float;varying vec2 mistUV;uniform sampler2D cloud;uniform float time;uniform float opacity;
void main(){vec2 p=mistUV*2.0-1.0;float edge=1.0-smoothstep(.18,1.0,length(p*vec2(1.0,.95)));
float a=texture2D(cloud,mistUV*.8+vec2(time*.009,-time*.018)).r;
float b=texture2D(cloud,mistUV*1.3+vec2(-time*.014,time*.006)).r;
float wisps=smoothstep(.25,.78,a*.64+b*.36);float alpha=edge*mix(.18,1.0,wisps)*opacity;
vec3 dusk=vec3(.50,.28,.69),lavender=vec3(.83,.65,.94);gl_FragColor=vec4(mix(dusk,lavender,clamp(a*1.2,0.0,1.0)),alpha);}`;
export function createPortalMist(world,portal){
  const texture=RawTexture.CreateRGBATexture(portalNoise(),128,128,world.scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);texture.wrapU=texture.wrapV=Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=1;
  const material=new ShaderMaterial('portal-lavender-mist',world.scene,{vertexSource,fragmentSource:portalMistFragment},{attributes:['position','uv'],uniforms:['worldViewProjection','time','opacity'],samplers:['cloud'],needAlphaBlending:true});
  material.backFaceCulling=false;material.disableDepthWrite=true;material.setTexture('cloud',texture);material.setFloat('time',0);material.setFloat('opacity',.70);
  const y=world.terrain.heightAt(portal.x,portal.z);
  const plume=MeshBuilder.CreatePlane('portal-mist-plume',{width:3.8,height:3.2},world.scene);plume.position.set(portal.x,y+1.28,portal.z);plume.billboardMode=Mesh.BILLBOARDMODE_Y;
  const veil=MeshBuilder.CreateGround('portal-mist-ground',{width:4.2,height:4.2},world.scene);veil.position.set(portal.x,y+.07,portal.z);veil.freezeWorldMatrix();
  const meshes=[plume,veil];for(const mesh of meshes){mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=false;mesh.metadata={portalMist:true};}
  let time=0,disposed=false;
  return {meshes,material,texture,update(dt){if(disposed)return;time+=Math.min(Math.max(dt,0),.1);const visible=Vector3.DistanceSquared(world.camera.globalPosition,plume.position)<55*55;for(const mesh of meshes)mesh.setEnabled(visible);if(visible)material.setFloat('time',time);},dispose(){if(disposed)return;disposed=true;for(const mesh of meshes)mesh.dispose();material.dispose();texture.dispose();}};
}
