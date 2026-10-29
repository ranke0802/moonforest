import {CAVE_COLLISION_DATA as data} from './witch-cave-collision-data.js';
let distance;
function field(){
 if(distance)return distance;
 const {size,step,runs}=data;distance=new Float32Array(size*size).fill(1e4);
 for(let i=0;i<runs.length;i+=2)distance.fill(0,runs[i],runs[i]+runs[i+1]);
 const diagonal=step*Math.SQRT2;
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const i=z*size+x;let d=distance[i];
  if(x)d=Math.min(d,distance[i-1]+step);
  if(z){d=Math.min(d,distance[i-size]+step);if(x)d=Math.min(d,distance[i-size-1]+diagonal);if(x+1<size)d=Math.min(d,distance[i-size+1]+diagonal);}
  distance[i]=d;
 }
 for(let z=size-1;z>=0;z--)for(let x=size-1;x>=0;x--){
  const i=z*size+x;let d=distance[i];
  if(x+1<size)d=Math.min(d,distance[i+1]+step);
  if(z+1<size){d=Math.min(d,distance[i+size]+step);if(x)d=Math.min(d,distance[i+size-1]+diagonal);if(x+1<size)d=Math.min(d,distance[i+size+1]+diagonal);}
  distance[i]=d;
 }
 return distance;
}
export function caveMeshClearance(x,z){
 const {size,step,min}=data,u=(x-min)/step-.5,v=(z-min)/step-.5;
 if(u<0||v<0||u>=size-1||v>=size-1)return -1;
 const a=Math.floor(u),b=Math.floor(v),fx=u-a,fz=v-b,i=b*size+a,d=field();
 // Octile distances can exceed Euclidean distance by 8.24%. Account for that
 // and the occupied cell's half diagonal, rather than shrinking the player.
 return ((d[i]*(1-fx)+d[i+1]*fx)*(1-fz)+(d[i+size]*(1-fx)+d[i+size+1]*fx)*fz)*.9238-step*Math.SQRT1_2-.04;
}
