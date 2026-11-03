import manifest from '../public/assets/village-plains-outskirts.json' with {type:'json'};
import {plainsToVillage,VILLAGE_PLAINS_BOUNDARY} from './village-plains-boundary.js';

// A small reciprocal vista, beyond the unchanged village ground/exit road.
// The central lookout is inside this window; the rest of the plains is omitted.
export const VILLAGE_PLAINS_OUTSKIRTS_WINDOW=Object.freeze({minX:-32,maxX:32,minZ:80,maxZ:170});
export const VILLAGE_PLAINS_OUTSKIRTS_GROUND_WINDOW=Object.freeze({minX:-40,maxX:40,minZ:80,maxZ:178});
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
export const VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS=freeze(manifest.placements);

// Offline authoring oracle. Gameplay reads the static sidecar above; it never
// traverses the plains, constructs terrain or calculates this selection again.
export function buildVillagePlainsOutskirts({placements,assets,terrain}){
 const window=VILLAGE_PLAINS_OUTSKIRTS_WINDOW,result=[];
 for(const p of placements){
  if(p.villageBoundary||p.asset==='village-approach'||!['tree','rock','prop'].includes(p.kind)||p.lootTier!==undefined)continue;
  const local=plainsToVillage(p);
  if(local.x<window.minX||local.x>window.maxX||local.z<window.minZ||local.z>window.maxZ)continue;
  const config=assets[p.asset];if(!config)throw new Error(`Missing outskirts source ${p.asset}`);
  const elevation=p.elevation??(p.topElevation!==undefined?p.topElevation-config.height*p.scale:terrain.heightAt(p.x,p.z));
  // Explicit source foundation survives the target's clamped village field.
  // These background instances never create new village collision or loot.
  const target={...p,id:`village-plains-outskirts-${p.id}`,sourcePlacementId:p.id,...local,yaw:p.yaw-VILLAGE_PLAINS_BOUNDARY.yaw,elevation,colliderRadius:0,background:true,villagePlainsOutskirts:true};
  delete target.topElevation;result.push(target);
 }
 return result;
}
