import { TerrainHeightField } from './terrain.js';
import { VILLAGE_PADS, villageRoadDistance } from './village-layout.js';

const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function naturalHeight(x,z){
  const bumps=[[-33,-20,17,16,1.6],[28,-25,17,15,1.9],[-26,27,18,16,1.2],[29,26,18,17,1.4],[-51,5,20,21,2.4],[45,30,22,24,2.3],[8,-53,26,20,2.7]];
  let y=.12;
  for(const [cx,cz,rx,rz,rise]of bumps){const r2=((x-cx)/rx)**2+((z-cz)/rz)**2;if(r2<1)y+=rise*(1-r2)**2;}
  return y;
}
const padLevels=VILLAGE_PADS.map(p=>({...p,height:naturalHeight(p.x,p.z)}));
export function villageHeight(x,z){
  // A neighbouring pad's soft shoulder must never modify another building's
  // foundation. Resolve hard cores first, then blend only the walkable gaps.
  let core=null,coreDistance=Infinity;
  for(const pad of padLevels){const d=Math.hypot(x-pad.x,z-pad.z)/pad.radius;if(d<=1&&d<coreDistance){core=pad;coreDistance=d;}}
  if(core)return core.height;
  let y=naturalHeight(x,z);
  // Broad streets remain smooth; the hills beyond the houses retain their shape.
  const street=1-smooth((villageRoadDistance(x,z)-2.2)/2.5);
  if(Math.hypot(x,z)<44)y=y*(1-street*.45)+.12*street*.45;
  for(const pad of padLevels){
    const d=Math.hypot(x-pad.x,z-pad.z),blend=1-smooth((d-pad.radius)/2.8);
    if(blend>0)y=y*(1-blend)+pad.height*blend;
  }
  const plaza=1-smooth((Math.hypot(x,z)-7.2)/3.5);
  return y*(1-plaza)+.12*plaza;
}
export function createVillageTerrain(){return new TerrainHeightField({size:160,subdivisions:160,height:villageHeight});}
