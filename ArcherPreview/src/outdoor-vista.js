import {VILLAGE_PLAINS_BOUNDARY as boundary} from './village-plains-boundary.js';
import {PLAINS_RADIUS} from './great-plains-layout.js';
import {greatPlainsHeight} from './great-plains-terrain.js';
import {MOUNTAIN_RIDGE_LAYOUT} from './mountain-backdrop.js';

export const PLAINS_VISTA_FAR=1024;
export const VILLAGE_MOUNTAIN_SCALE=Object.freeze([1.9,1.3,1.9]);
export const PLAINS_MOUNTAIN_FOOT=PLAINS_RADIUS+.8;
const nearRadii=[PLAINS_MOUNTAIN_FOOT,126.8,141,160,192,235],farRadii=[180,230,290,365,520];
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
function passage(angle,center,inner,outer){
 const distance=Math.abs(Math.atan2(Math.sin(angle-center),Math.cos(angle-center)));
 return 1-smooth((distance-inner)/(outer-inner));
}
// Reuse both authored ridges, starting their foothills outside the playable
// disk. Keep the apron below the orbit-camera sightline, then rise outward.
// Portal-facing valleys leave the native town/forest scenery in front of the
// mountains. Only this cached plains position buffer changes; no frame work.
export function plainsVistaPositions(source){
 const out=new Float32Array(source.length),farVertices=MOUNTAIN_RIDGE_LAYOUT.far.segments*(MOUNTAIN_RIDGE_LAYOUT.far.radii.length-1)*6,feet=new Map();
 for(let i=0;i<source.length;i+=3){
  const vertex=i/3,far=vertex<farVertices,local=far?vertex:vertex-farVertices,layout=MOUNTAIN_RIDGE_LAYOUT[far?'far':'near'];
  // Every authored quad emits [lower,lower,upper,lower,upper,upper].
  const corner=local%6,row=Math.floor(local/6)%(layout.radii.length-1)+(corner===2||corner>=4?1:0);
  const angle=Math.atan2(source[i+2],source[i])-boundary.yaw,c=Math.cos(angle),s=Math.sin(angle);
  const town=passage(angle,-159.5*Math.PI/180,22*Math.PI/180,30*Math.PI/180),forest=passage(angle,-50*Math.PI/180,17*Math.PI/180,24*Math.PI/180);
  const notch=Math.max(town*(far?130:170),forest*(far?80:115));
  const relief=Math.hypot(source[i],source[i+2])-layout.radii[row],radius=(far?farRadii:nearRadii)[row]+notch+relief*(!far&&row<2?.05:1);
  let height;
  if(!far&&row<2){
   const key=source[i]+','+source[i+2];let foot=feet.get(key);
   if(foot===undefined){foot=Math.min(-.8,greatPlainsHeight(c*PLAINS_RADIUS,s*PLAINS_RADIUS)-.5);feet.set(key,foot);}
   height=foot;
  }else if(far)height=row===0?6:row===4?18:source[i+1]*3.2+[0,8,18,20][row];
  else height=row===5?10:source[i+1]*2.8+[0,0,3,6,8][row];
  out[i]=c*radius;out[i+1]=height;out[i+2]=s*radius;
 }
 return out;
}

const states=new WeakMap();
export function configureOutdoorVista(world,{village=true,plains=false}={}){
 const mesh=world.mountains;let state=states.get(mesh);
 if(!state){state={base:Float32Array.from(mesh.getVerticesData('position')),plains:null,mode:'base'};states.set(mesh,state);}
 const mode=plains?'plains':'base';
 if(state.mode!==mode){
  if(plains&&!state.plains)state.plains=plainsVistaPositions(state.base);
  mesh.setVerticesData('position',plains?state.plains:state.base,false);mesh.refreshBoundingInfo();state.mode=mode;
 }
 mesh.unfreezeWorldMatrix();mesh.scaling.set(...(plains?[1,1,1]:village?VILLAGE_MOUNTAIN_SCALE:[1,1,1]));mesh.freezeWorldMatrix();
 const yaw=plains?boundary.yaw:0;
 if(world.sky?.mesh)world.sky.mesh.rotation.y=yaw;
 world.lighting?.setWorldYaw(yaw);
 if(world.camera)world.camera.maxZ=plains?PLAINS_VISTA_FAR:village?350:220;
}
