import {Color3,Constants,MaterialPluginBase} from '@babylonjs/core';

// Keep glTF's correct sRGB decoding and Babylon's shadow/instance/fog support.
// Replace the lighting result with painted color and three bright diffuse bands.
export class VillageToonShade extends MaterialPluginBase {
  constructor(material,lighting){super(material,'MoonforestVillageToon',310,{},true,true);this.lighting=lighting;}
  getUniforms(){return {ubo:[{name:'villageSun',size:4,type:'vec4'}],fragment:'uniform vec4 villageSun;'};}
  bindForSubMesh(buffer){const {direction,shadowsActive}=this.lighting;buffer.updateFloat4('villageSun',direction.x,direction.y,direction.z,shadowsActive?1:0);}
  getCustomCode(type){
    if(type!=='fragment')return null;
    return {CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
      float villageFacing = dot(normalize(normalW), villageSun.xyz);
      float villageBand = 0.78 + 0.14 * smoothstep(-0.10, -0.02, villageFacing)
                               + 0.12 * smoothstep(0.48, 0.56, villageFacing);
      float villageShadow = 1.0;
      #ifndef UNLIT
      if (villageSun.w > 0.5 && numLights > 0.0) {
        villageShadow = clamp(1.0 - numLights * (1.0 - aggShadow), 0.0, 1.0);
      }
      #endif
      finalDiffuse = surfaceAlbedo * villageBand * mix(0.76, 1.0, villageShadow);
      finalAmbient = vec3(0.0);
      finalEmissive = vec3(0.0);
    `};
  }
}

// StandardMaterial clamps its bright ambient + key light before texturing.
// Apply the shadow visibility afterward so the painted floor retains shadows
// even when that lighting sum saturates; fog and exposure still run normally.
export class VillageGroundShade extends VillageToonShade {
  getCustomCode(type){
    if(type!=='fragment')return null;
    return {CUSTOM_FRAGMENT_BEFORE_FOG:`
      float villageGroundShadow = 1.0;
      if (villageSun.w > 0.5 && numLights > 0.0) {
        villageGroundShadow = clamp(1.0 - numLights * (1.0 - aggShadow), 0.0, 1.0);
      }
      color.rgb *= mix(0.60, 1.0, villageGroundShadow);
    `};
  }
}

export function applyVillageToon(meshes,lighting){
  for(const mesh of meshes){
    const material=mesh.material;
    if(!mesh.getTotalVertices?.()||material?.getClassName()!=='PBRMaterial'||material.metadata?.villageToon)continue;
    material.unfreeze();
    // Lighting stays enabled solely to obtain the shadow visibility term. PBR
    // highlights, reflection, metallic/roughness and normal maps are disabled.
    material.unlit=false;material.disableLighting=false;
    material.bumpTexture=null;material.metallicTexture=null;material.ambientTexture=null;
    material.reflectionTexture=null;material.refractionTexture=null;material.emissiveTexture=null;
    material.emissiveColor=Color3.Black();material.reflectivityColor=Color3.Black();
    material.metallic=0;material.roughness=1;material.metallicF0Factor=0;
    material.environmentIntensity=0;material.specularIntensity=0;
    material.directIntensity=1;material.maxSimultaneousLights=3;
    // Mark visible base pixels in the existing pass. Hull ink may only draw
    // outside them, so open meshes and leaf clumps cannot turn solid black.
    Object.assign(material.stencil,{enabled:true,func:Constants.ALWAYS,backFunc:Constants.ALWAYS,funcRef:4,funcMask:4,mask:4,opStencilDepthPass:Constants.REPLACE,backOpStencilDepthPass:Constants.REPLACE});
    material.metadata={...material.metadata,villageToon:true};
    new VillageToonShade(material,lighting);
  }
}
