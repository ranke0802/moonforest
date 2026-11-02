import {Color3,Constants,MaterialPluginBase} from '@babylonjs/core';

export const VILLAGE_DISTANCE_TONE=Object.freeze({startRatio:.45,endRatio:.80,minimumStart:18,farFactor:.62});
export function villageDistanceFactor(distance,fogStart=65,fogEnd=80,enabled=true){
  if(!enabled)return 1;
  const p=VILLAGE_DISTANCE_TONE,start=Math.max(p.minimumStart,fogStart*p.startRatio),end=Math.max(start+1,fogEnd*p.endRatio),t=Math.max(0,Math.min(1,(distance-start)/(end-start)));
  return 1-(1-p.farFactor)*t*t*(3-2*t);
}
export function villageDistanceCoverage(distance,fogStart=65,fogEnd=80,enabled=true){
  if(!enabled)return 1;
  const t=Math.max(0,Math.min(1,(distance-fogStart)/Math.max(1,fogEnd-fogStart)));
  return 1-t*t*(3-2*t);
}

// Keep glTF's correct sRGB decoding and Babylon's shadow/instance support.
// Replace the lighting result with painted color and three bright diffuse bands.
export class VillageToonShade extends MaterialPluginBase {
  constructor(material,lighting){super(material,'MoonforestVillageToon',310,{},true,false);this.lighting=lighting;this.registerForExtraEvents=true;this._enable(true);}
  getUniforms(){return {ubo:[{name:'villageSun',size:4,type:'vec4'},{name:'villageFarTone',size:4,type:'vec4'},{name:'villageFarClip',size:2,type:'vec2'}],fragment:'uniform vec4 villageSun;uniform vec4 villageFarTone;uniform vec2 villageFarClip;'};}
  bindForSubMesh(buffer){const {direction,shadowsActive}=this.lighting;buffer.updateFloat4('villageSun',direction.x,direction.y,direction.z,shadowsActive?1:0);}
  hardBindForSubMesh(buffer){
    const scene=this._material.getScene(),p=VILLAGE_DISTANCE_TONE,start=Math.max(p.minimumStart,scene.fogStart*p.startRatio),end=Math.max(start+1,scene.fogEnd*p.endRatio),paint=scene.metadata?.cavePaintLighting;
    // Retained/frozen LOD materials bind the CURRENT region, never the map in
    // which they were first loaded. CavePaint/FoW own all cave attenuation.
    buffer.updateFloat4('villageFarTone',start,end,p.farFactor,paint&&!paint.disposed?0:1);
    buffer.updateFloat2('villageFarClip',scene.fogStart,Math.max(scene.fogStart+1,scene.fogEnd));
  }
  getCustomCode(type){
    if(type!=='fragment')return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:`
        float villageDistanceBayer2(vec2 p){return 2.0*mod(p.x+p.y,2.0)+mod(p.y,2.0);}`,
      CUSTOM_FRAGMENT_MAIN_BEGIN:`
        // The old sky fog hid the CPU cell-cull edge. Retain that coverage,
        // without washing painted colours pale or adding a transparent pass.
        // The same fixed Bayer rule as tree-view coverage and ink composes
        // as min(coverage), never a second multiplicative transparency.
        if(villageFarTone.w>0.5){
          float villageFarCoverage=1.0-smoothstep(villageFarClip.x,villageFarClip.y,length(vPositionW-vEyePosition.xyz));
          if(villageFarCoverage<0.999){
            vec2 villageFarPixel=mod(floor(gl_FragCoord.xy),4.0);
            float villageFarThreshold=(4.0*villageDistanceBayer2(mod(villageFarPixel,2.0))+villageDistanceBayer2(floor(villageFarPixel/2.0))+0.5)/16.0;
            if(villageFarCoverage<villageFarThreshold)discard;
          }
        }`,
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
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
      if (villageFarTone.w > 0.5) {
        float villageFarBlend = smoothstep(villageFarTone.x, villageFarTone.y, length(vPositionW-vEyePosition.xyz));
        finalDiffuse *= mix(1.0, villageFarTone.z, villageFarBlend);
      }
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
    // Pale sky fog ran AFTER toon shading and washed distant trees white.
    // Scenery now keeps its authored hue and uses the continuous linear-space
    // distance tone above. Characters and the outdoor floor keep their fog.
    material.fogEnabled=false;
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
