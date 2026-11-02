import {TerrainHeightField} from './terrain.js';
import {PLAINS_SPAN,PLAINS_CLEARINGS,plainsRoadDistance,plainsStreamDistance} from './great-plains-layout.js';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function greatPlainsHeight(x,z){
 let h=.23+.12*Math.sin(x*.043)*Math.cos(z*.051);
 for(const [cx,cz,rise,radius]of [[-26,-19,2.8,18],[-63,-49,3.7,28],[8,-65,3.2,29],[-63,65,2.1,24],[42,42,2.4,28]]){
  const d=Math.hypot(x-cx,z-cz)/radius;if(d<1)h+=rise*(1-d*d)**2;
 }
 h=.2+(h-.2)*(.25+.75*smooth((plainsRoadDistance(x,z)+.2)/6));
 for(const c of PLAINS_CLEARINGS){const w=1-smooth((Math.hypot(x-c.x,z-c.z)-c.r)/3);const y=c.x===-26?.75:.2;h=h*(1-w)+y*w;}
 const river=1-smooth((plainsStreamDistance(x,z)-1.4)/2.3);h=h*(1-river)-.6*river;
 return h;
}
export const createGreatPlainsTerrain=()=>new TerrainHeightField({size:PLAINS_SPAN,subdivisions:184,height:greatPlainsHeight});
