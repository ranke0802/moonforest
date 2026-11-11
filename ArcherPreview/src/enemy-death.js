import {prepareEnemyExteriorOutline,isRuntimeOutline} from './character-outlines.js';
import {configureCharacterExteriorStencil} from './character-ink-stencil.js';
import {orderEnemyFadeInkAfterSurfaces} from './character-render-cost.js';

export const CORPSE_FADE_SECONDS=5;
export const MOURNING_DEATH_HOLD_SECONDS=.65;
export const MOURNING_CORPSE_SECONDS=10;
export class EnemyDeath {
  constructor(){this.reset();}
  reset({holdPose=false,clipSeconds=5.2,holdSeconds=MOURNING_DEATH_HOLD_SECONDS}={}){
    this.started=false;this.elapsed=0;this.holdPose=Boolean(holdPose);
    this.duration=this.holdPose?MOURNING_CORPSE_SECONDS:CORPSE_FADE_SECONDS;
    this.fadeStart=this.holdPose?Math.min(this.duration-1,Math.max(0,Number.isFinite(clipSeconds)?clipSeconds:5.2)+Math.max(0,Number.isFinite(holdSeconds)?holdSeconds:MOURNING_DEATH_HOLD_SECONDS)):0;
  }
  advance(dt){const first=!this.started;this.started=true;this.elapsed=Math.min(this.duration,this.elapsed+Math.max(0,Number.isFinite(dt)?dt:0));return first;}
  // Keep the authored collapse, then ease the entire corpse out together.
  get opacity(){const t=Math.max(0,Math.min(1,(this.elapsed-this.fadeStart)/(this.duration-this.fadeStart)));return 1-t*t*(3-2*t);}
  get finished(){return this.started&&this.elapsed>=this.duration;}
}

const fadeMaterials=new WeakSet();
export function enableEnemyFade(asset){
  for(const mesh of asset.meshes){
    if(!mesh.getTotalVertices?.())continue;
    mesh.metadata={...mesh.metadata,moonforestEnemyFade:true};
    if(!mesh.metadata.mourningReferenceLook&&!mesh.parent?.metadata?.mourningReferenceLook){
      if(prepareEnemyExteriorOutline(mesh))orderEnemyFadeInkAfterSurfaces(mesh.getScene(),mesh.renderingGroupId);
      else if(!isRuntimeOutline(mesh)&&mesh.material?.stencil)configureCharacterExteriorStencil(mesh.material,null,2);
    }
    const material=mesh.material;if(!material||fadeMaterials.has(material))continue;
    // glTF OPAQUE takes priority over mesh.visibility in Babylon. Override only
    // this decision for fading enemies, never shared material alpha or modes.
    const original=material.needAlphaBlendingForMesh;
    material.needAlphaBlendingForMesh=function(target){return target.metadata?.moonforestEnemyFade===true&&target.visibility<1||original.call(this,target);};
    fadeMaterials.add(material);
  }
}
