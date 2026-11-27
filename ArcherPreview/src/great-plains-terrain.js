import {TerrainHeightField} from './terrain.js';
import {PLAINS_SPAN,PLAINS_CLEARINGS,PLAINS_LOOKOUT,PLAINS_STREAM,plainsStreamDistance} from './great-plains-layout-base.js';
import {plainsToVillage,VILLAGE_PLAINS_BOUNDARY as boundary} from './village-plains-boundary.js';
import {villageHeight} from './village-terrain.js';
import {forestEdgeWeight,forestEdgeHeight} from './plains-forest-edge.js';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const STREAM_CHANNEL_RADIUS=1.2,STREAM_BANK_WIDTH=3.2,STREAM_BANK_LIMIT=STREAM_CHANNEL_RADIUS+STREAM_BANK_WIDTH;
let streamMinX=Infinity,streamMaxX=-Infinity;
for(const [x] of PLAINS_STREAM){
 streamMinX=Math.min(streamMinX,x);
 streamMaxX=Math.max(streamMaxX,x);
}

// Beyond the outer bank the river weight is zero. Axis distances are lower
// bounds for the exact distance, so skip far samples before calling Math.hypot.
function boundedStreamDistance(x,z){
 if(streamMinX-x>STREAM_BANK_LIMIT||x-streamMaxX>STREAM_BANK_LIMIT)return STREAM_BANK_LIMIT;
 let best=STREAM_BANK_LIMIT;
 for(const [px,pz] of PLAINS_STREAM){
  const dx=x-px,dz=z-pz;
  if(Math.abs(dx)>best||Math.abs(dz)>best)continue;
  best=Math.min(best,Math.hypot(dx,dz));
 }
 return best;
}

function sampleGreatPlainsHeight(x,z,streamDistance){
 let h=.25+.34*Math.sin(x*.059+.8*Math.sin(z*.031))*Math.cos(z*.053)+.12*Math.sin((x+z)*.14);
 for(const [cx,cz,rise,radius]of [[-61,-56,4.3,27],[8,-62,3.5,31],[-65,65,3.2,26],[39,39,2.3,26],[-35,82,1.7,26]]){const d=Math.hypot(x-cx,z-cz)/radius;if(d<1)h+=rise*(1-d*d)**2;}
 for(const [cx,cz,rise,rx,rz]of [[-71,7,1.8,23,17],[-18,49,1.9,25,19],[21,3,1.25,21,18],[41,76,1.1,24,16],[-40,-63,1.6,23,19]]){const d=((x-cx)/rx)**2+((z-cz)/rz)**2;if(d<1)h+=rise*(1-d)**2;}
 const hill=PLAINS_LOOKOUT,lookout=Math.hypot((x-hill.x)/hill.stretchX,z-hill.z);
 const shelf=hill.height*(1-smooth((lookout-hill.capRadius)/hill.cliffWidth));
 const ramp=x<hill.rampTopX+2?hill.height*smooth((x-hill.rampStartX)/(hill.rampTopX-hill.rampStartX))*(1-smooth((Math.abs(z-hill.z)-hill.rampHalfWidth)/hill.rampShoulder)):0;
 h+=Math.max(shelf,ramp);
 for(const c of PLAINS_CLEARINGS){const w=1-smooth((Math.hypot(x-c.x,z-c.z)-c.r)/4);h=h*(1-w)+c.y*w;}
 const gate=1-smooth((Math.hypot(x-boundary.plainsPortal.x,z-boundary.plainsPortal.z)-8)/13);h=h*(1-gate)+boundary.height*gate;
 const local=plainsToVillage({x,z}),village=(1-smooth((Math.abs(local.x)-38)/8))*(1-smooth((30-local.z)/8))*(1-smooth((local.z-88)/10));if(village>0)h=h*(1-village)+villageHeight(local.x,local.z)*village;
 const river=1-smooth((streamDistance(x,z)-STREAM_CHANNEL_RADIUS)/STREAM_BANK_WIDTH);h=h*(1-river)-.64*river;
 const forest=forestEdgeWeight(x,z);if(forest>0)h=h*(1-forest)+forestEdgeHeight(x,z)*forest;
 return h;
}
export const greatPlainsHeight=(x,z)=>sampleGreatPlainsHeight(x,z,plainsStreamDistance);
const createHeightField=height=>new TerrainHeightField({size:PLAINS_SPAN,subdivisions:216,height});
export const createGreatPlainsTerrain=()=>createHeightField(greatPlainsHeight);
export const createGreatPlainsV03Terrain=()=>createHeightField((x,z)=>sampleGreatPlainsHeight(x,z,boundedStreamDistance));
