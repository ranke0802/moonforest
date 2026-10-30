import {MOURNING_CAVE_CLEARANCE_DATA as data} from './mourning-cave-clearance-data.js';
let distance;
function field(){
 if(distance)return distance;
 const {width,height,step,runs}=data;distance=new Float32Array(width*height);
 for(let i=0;i<runs.length;i+=2)distance.fill(1e4,runs[i],runs[i]+runs[i+1]);
 const diagonal=step*Math.SQRT2;
 for(let z=0;z<height;z++)for(let x=0;x<width;x++){
  const i=z*width+x;let d=distance[i];if(x)d=Math.min(d,distance[i-1]+step);
  if(z){d=Math.min(d,distance[i-width]+step);if(x)d=Math.min(d,distance[i-width-1]+diagonal);if(x+1<width)d=Math.min(d,distance[i-width+1]+diagonal);}distance[i]=d;
 }
 for(let z=height-1;z>=0;z--)for(let x=width-1;x>=0;x--){
  const i=z*width+x;let d=distance[i];if(x+1<width)d=Math.min(d,distance[i+1]+step);
  if(z+1<height){d=Math.min(d,distance[i+width]+step);if(x)d=Math.min(d,distance[i+width-1]+diagonal);if(x+1<width)d=Math.min(d,distance[i+width+1]+diagonal);}distance[i]=d;
 }return distance;
}
/** Conservative metres to the boundary of the baked full-pose root region.
 * Positive values certify clearance; non-positive values reject the position.
 * This supplements ordinary body collision and does not enlarge hit volumes.
 */
export function mourningCaveClearance(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z))return -data.step;
 const {width,height,step,minX,minZ}=data,u=(x-minX)/step-.5,v=(z-minZ)/step-.5,a=Math.floor(u),b=Math.floor(v);
 if(a<0||b<0||a+1>=width||b+1>=height)return -step;
 const d=field();let lower=-Infinity;
 // Each cone is a lower bound from a neighbouring cell centre. Their maximum
 // stays conservative and continuous, unlike a nearest-cell yes/no lookup.
 for(let dz=0;dz<2;dz++)for(let dx=0;dx<2;dx++){
  const xx=a+dx,zz=b+dz,centre=d[zz*width+xx]*.9238-step*Math.SQRT1_2;
  lower=Math.max(lower,centre-Math.hypot(x-(minX+(xx+.5)*step),z-(minZ+(zz+.5)*step)));
 }return lower;
}
