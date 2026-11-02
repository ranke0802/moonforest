import {TerrainHeightField} from './terrain.js';
import {PLAINS_SPAN,PLAINS_CLEARINGS,plainsStreamDistance} from './great-plains-layout.js';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function greatPlainsHeight(x,z){
 let h=.25+.16*Math.sin(x*.065)*Math.cos(z*.057);
 for(const [cx,cz,rise,radius]of [[-61,-56,4.3,27],[8,-62,3.5,31],[-65,65,3.2,26],[39,39,2.3,26],[-35,82,1.7,26]]){const d=Math.hypot(x-cx,z-cz)/radius;if(d<1)h+=rise*(1-d*d)**2;}
 const lookout=Math.hypot((x+28)/1.1,z+20);
 const shelf=8*(1-smooth((lookout-9)/3));
 const ramp=x>-20?8*(1-smooth((x+18)/21))*(1-smooth((Math.abs(z+20)-3)/6)):0;
 h+=Math.max(shelf,ramp);
 for(const c of PLAINS_CLEARINGS){const w=1-smooth((Math.hypot(x-c.x,z-c.z)-c.r)/4);h=h*(1-w)+c.y*w;}
 const gate=1-smooth((Math.hypot(x+94,z+35)-8)/13);h=h*(1-gate)+.2*gate;
 const village=1-smooth((Math.hypot(x+127,z+43)-37)/7);h=h*(1-village)+.12*village;
 const river=1-smooth((plainsStreamDistance(x,z)-1.2)/3.2);h=h*(1-river)-.64*river;
 return h;
}
export const createGreatPlainsTerrain=()=>new TerrainHeightField({size:PLAINS_SPAN,subdivisions:216,height:greatPlainsHeight});
