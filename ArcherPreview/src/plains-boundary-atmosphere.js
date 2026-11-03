import {SKY_HORIZON} from './sky.js';
import {VILLAGE_PLAINS_BOUNDARY} from './village-plains-boundary.js';
import {FOREST_PLAINS_BOUNDARY} from './plains-forest-boundary.js';

export const PLAINS_FOREST_ATMOSPHERE=Object.freeze({innerRadius:18,outerRadius:60,fog:Object.freeze([.19,.23,.21])});
const previous=new WeakMap();
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function plainsForestAtmosphereWeight(position){
 if(!Number.isFinite(position?.x)||!Number.isFinite(position?.z))return 0;
 const p=FOREST_PLAINS_BOUNDARY.plainsPortal,distance=Math.hypot(position.x-p.x,position.z-p.z),{innerRadius,outerRadius}=PLAINS_FOREST_ATMOSPHERE;
 return smooth((outerRadius-distance)/(outerRadius-innerRadius));
}

// Only the plains owns this transition. No terrain, mesh, texture, or material
// is rebuilt; the existing lights, sky transform and scene uniforms are used.
export function updatePlainsBoundaryAtmosphere(world,position,force=false){
 if(world?.mapId!=='great-plains'||!world.scene||!world.lighting||!Number.isFinite(position?.x)||!Number.isFinite(position?.z))return false;
 const weight=plainsForestAtmosphereWeight(position),last=previous.get(world);
 if(!force&&last===weight)return false;
 previous.set(world,weight);
 const base=VILLAGE_PLAINS_BOUNDARY.yaw,target=FOREST_PLAINS_BOUNDARY.yaw,yaw=base+Math.atan2(Math.sin(target-base),Math.cos(target-base))*weight;
 world.lighting.setWorldYaw(yaw);
 if(world.sky?.mesh)world.sky.mesh.rotation.y=yaw;
 const [r,g,b]=PLAINS_FOREST_ATMOSPHERE.fog;
 world.scene.fogColor.set(SKY_HORIZON.r+(r-SKY_HORIZON.r)*weight,SKY_HORIZON.g+(g-SKY_HORIZON.g)*weight,SKY_HORIZON.b+(b-SKY_HORIZON.b)*weight);
 return true;
}
