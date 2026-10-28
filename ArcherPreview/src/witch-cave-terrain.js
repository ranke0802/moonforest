import {TerrainHeightField} from './terrain.js';
import {caveSurface} from './witch-cave-layout.js';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function witchCaveHeight(x,z){
  const {distance,height}=caveSurface(x,z);
  const shelf=1-smooth((distance+.4)/2.5);
  const basin=-3.6+.12*Math.sin(x*.17)*Math.cos(z*.13);
  return basin+(height-basin)*shelf+.045*Math.sin(x*.7)*Math.sin(z*.53)*shelf;
}
export const createWitchCaveTerrain=()=>new TerrainHeightField({size:160,subdivisions:240,height:witchCaveHeight});
// A cached conservative distance field keeps collision work independent of
// the number of repeated rock meshes and of camera rotation.
let field;
export function caveClearance(x,z){
  const n=321,step=.5,half=80;
  if(!field){field=new Float32Array(n*n);for(let row=0;row<n;row++)for(let col=0;col<n;col++)field[row*n+col]=-caveSurface(col*step-half,row*step-half).distance;}
  const u=(x+half)/step,v=(z+half)/step;if(u<0||v<0||u>=n-1||v>=n-1)return -100;
  const col=Math.floor(u),row=Math.floor(v),a=u-col,b=v-row,i=row*n+col;
  return (field[i]*(1-a)+field[i+1]*a)*(1-b)+(field[i+n]*(1-a)+field[i+n+1]*a)*b-.26;
}
