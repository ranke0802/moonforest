import {Color3,Material,MaterialPluginBase,StandardMaterial} from '@babylonjs/core';
import {VillageGroundDetail} from './village-ground.js';
import {VillageGroundShade} from './village-toon.js';

// StandardMaterial's floor lighting operates on gamma-encoded diffuse samples.
// A glTF albedo may already use hardware sRGB decoding. Undo only that input
// conversion, retaining its existing owned texture/allocation and all soil alpha.
class OutskirtsGroundColorInput extends MaterialPluginBase {
 constructor(material,texture){super(material,'MoonforestOutskirtsGroundInput',300,{MOONFOREST_OUTSKIRTS_GROUND_INPUT:true},true,true);this.doNotSerialize=true;this.texture=texture;}
 getClassName(){return 'MoonforestOutskirtsGroundColorInput';}
 getUniforms(){return {ubo:[{name:'outskirtsHardwareSrgb',size:1,type:'float'}],fragment:'uniform float outskirtsHardwareSrgb;'};}
 bindForSubMesh(buffer){buffer.updateFloat('outskirtsHardwareSrgb',this.texture.getInternalTexture?.()?._useSRGBBuffer?1:0);}
 getCustomCode(type){return type==='fragment'?{CUSTOM_FRAGMENT_UPDATE_ALPHA:`
  if(outskirtsHardwareSrgb>0.5){
    vec3 outskirtsLinear=max(baseColor.rgb,vec3(0.0));
    baseColor.rgb=mix(12.92*outskirtsLinear,1.055*pow(outskirtsLinear,vec3(1.0/2.4))-vec3(0.055),step(vec3(0.0031308),outskirtsLinear));
  }
 `}:null;}
}

export function isVillagePlainsOutskirtsGround(config){return config?.surfaceStyle==='outskirts-ground';}

// Call after applyVillageGround succeeds and immediately after the container
// loads, before toon/lighting/shader preparation. No fetch, observer or texture
// clone is added. The container owns replacements and its original glTF albedo;
// the existing world-floor owner alone releases the borrowed packed detail.
export function applyVillagePlainsOutskirtsGround(world,container,{config}={}){
 if(!isVillagePlainsOutskirtsGround(config))return false;
 const detail=world.floorMaterial?.pluginManager?.getPlugin('MoonforestGroundDetail')?.texture;
 if(!detail||!world.lighting)throw new Error('대평원 외경 지면보다 마을 바닥 재질을 먼저 준비해야 합니다.');
 const meshes=container.meshes.filter(mesh=>mesh.getTotalVertices?.()>0),colors=new Map();
 for(const mesh of meshes){const original=mesh.material,color=original?.albedoTexture??original?.diffuseTexture;if(!color)throw new Error('대평원 외경 지면의 원본 색 텍스처가 없습니다.');colors.set(original,color);}
 const replacements=new Map();
 for(const mesh of meshes){
  const original=mesh.material,color=colors.get(original);let material=replacements.get(original);
  if(!material){
   if(original.metadata?.villageOutskirtsGround&&original.getClassName()==='StandardMaterial')material=original;
   else{
    material=new StandardMaterial(`${original.name}-outskirts-floor`,world.scene);container.materials.push(material);
    material.diffuseTexture=color;material.diffuseColor=Color3.White();material.specularColor=Color3.Black();
    material.ambientColor=world.floorMaterial.ambientColor?.clone()??Color3.Black();material.emissiveColor=Color3.Black();
    material.alpha=1;material.transparencyMode=Material.MATERIAL_OPAQUE;material.useAlphaFromDiffuseTexture=false;
    material.backFaceCulling=world.floorMaterial.backFaceCulling;material.fogEnabled=world.floorMaterial.fogEnabled;
    material.metadata={...original.metadata,villageOutskirtsGround:true,villageNoOutline:true,villageNoShadowCaster:true};
    new OutskirtsGroundColorInput(material,color);new VillageGroundDetail(material,detail);new VillageGroundShade(material,world.lighting);
   }
   material.pluginManager.getPlugin('MoonforestGroundDetail').texture=detail;
   material.pluginManager.getPlugin('MoonforestVillageToon').lighting=world.lighting;
   replacements.set(original,material);
  }
  mesh.material=material;mesh.metadata={...mesh.metadata,villageOutskirtsGround:true,villageNoOutline:true,villageNoShadowCaster:true};
 }
 return true;
}
