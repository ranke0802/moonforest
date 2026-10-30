import {MaterialPluginBase,MeshBuilder,ShaderMaterial} from '@babylonjs/core';
export const ELENA_STYLE=Object.freeze({outlinePixels:.5,internalLineStrength:.2,brightness:1.35,contactGround:true,pbr:false});
export class ElenaPaint extends MaterialPluginBase{
  constructor(material){super(material,'ElenaPaint',330,{},true,true);}
  getCustomCode(type){if(type!=='fragment')return null;return {CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
    // Bright three-band painted shading, with no metallic/roughness reflection.
    float elenaLight = dot(normalize(normalW),normalize(vec3(-.4,1.0,.6)));
    float elenaBand = .86 + .07*smoothstep(-.15,-.10,elenaLight) + .07*smoothstep(.45,.50,elenaLight);
    float elenaCrease = clamp(length(fwidth(normalW))*2.0,0.0,1.0);
    float elenaPaintEdge = clamp(length(fwidth(surfaceAlbedo))*1.5,0.0,1.0);
    finalDiffuse *= 1.35 * elenaBand * (1.0 - .20*max(elenaCrease,elenaPaintEdge));
  `};}
}
export function applyElenaStyle(asset){
  for(const material of new Set(asset.meshes.map(m=>m.material))){
    if(material?.getClassName()!=='PBRMaterial'||material.metadata?.elenaStyle)continue;
    new ElenaPaint(material);material.metadata={...material.metadata,elenaStyle:ELENA_STYLE};
  }
}
// One soft contact patch, not a new shadow map or downloaded texture.
export function createElenaContact(world){
  const mesh=MeshBuilder.CreateGround('elena-contact-ground',{width:.9,height:.65},world.scene);
  const material=new ShaderMaterial('elena-contact-soft',world.scene,{vertexSource:'precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec2 vUV;void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}',fragmentSource:'precision mediump float;varying vec2 vUV;uniform float opacity;void main(){float a=1.0-smoothstep(.05,1.0,length((vUV-.5)*2.0));gl_FragColor=vec4(.09,.06,.12,a*a*.23*opacity);}'},{attributes:['position','uv'],uniforms:['worldViewProjection','opacity'],needAlphaBlending:true});
  material.disableDepthWrite=true;mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=false;mesh.setEnabled(false);
  return {mesh,update(actor,visible,opacity=1){mesh.setEnabled(visible);if(!visible)return;mesh.position.copyFrom(actor.position);mesh.position.y=(world.terrain?.heightAt(actor.position.x,actor.position.z)??actor.position.y)+.035;mesh.rotation.y=actor.rotation.y;material.setFloat('opacity',opacity);},hide(){mesh.setEnabled(false);},dispose(){mesh.dispose();material.dispose();}};
}
