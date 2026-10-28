import {TerrainHeightField} from './terrain.js';
import {FOREST_CAVE,FOREST_CLEARINGS,forestRoadDistance} from './monster-forest-layout.js';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function monsterForestHeight(x,z){
  let height=.2+.18*Math.sin(x*.065)*Math.cos(z*.08);
  for(const [cx,cz,r,h]of [[-17,17,15,1.8],[15,20,14,2.1],[-43,-15,18,3.5],[8,-17,12,1.8],[45,-35,22,4],[-43,42,21,3],[5,-58,22,3.2]]){
    const q=((x-cx)**2+(z-cz)**2)/(r*r);if(q<1)height+=h*(1-q)**2;
  }
  height*=.45+.55*smooth((forestRoadDistance(x,z)+1)/4);
  for(const c of [...FOREST_CLEARINGS,{...FOREST_CAVE,r:5.5}]){
    const weight=1-smooth((Math.hypot(x-c.x,z-c.z)-c.r)/3);
    height=height*(1-weight)+.18*weight;
  }
  return height;
}
export const createMonsterForestTerrain=()=>new TerrainHeightField({size:160,subdivisions:160,height:monsterForestHeight});
