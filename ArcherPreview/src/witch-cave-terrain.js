import {TerrainHeightField} from './terrain.js';
import {caveSurface,caveWaterWeight,CAVE_WATERFALLS,caveFlowRows} from './witch-cave-layout.js';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const channels=CAVE_WATERFALLS.flatMap(p=>{const rows=caveFlowRows(p);return rows.slice(1).map((b,i)=>({a:rows[i],b}));});
function channelBed(x,z,ground,distance){
  // Keep every walkable grid cell and its surrounding margin unchanged. The
  // upper feeder can pass beneath the raised route before emerging at the lip.
  const outside=smooth((distance-2.6)/1.4);if(!outside)return ground;
  for(const {a,b}of channels){
    const dx=b[0]-a[0],dz=b[2]-a[2],length2=dx*dx+dz*dz;
    const t=length2?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/length2)):0;
    const width=(a[3]+(b[3]-a[3])*t)*.5;
    const bank=1-smooth((Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t)-width-.4)/1.1);
    const bed=a[1]+(b[1]-a[1])*t-.28;
    if(bed<ground)ground+=(bed-ground)*bank*outside;
  }
  return ground;
}
// Compatibility for callers: walking follows the exact rendered terrain
// triangles. Jagged ramp props sit outside the walking lane.
export const caveRampHeight=(x,z,ground)=>ground;
export function witchCaveHeight(x,z){
  const {distance,height}=caveSurface(x,z);
  // Keep the full rendered terrain triangle under the walkable margin flat.
  // A cliff beginning inside a grid cell otherwise pulls its legal edge down.
  const shelf=1-smooth((distance-1)/3);
  const water=caveWaterWeight(x,z);
  const rock=height+1.8+.55*Math.sin(x*.28)*Math.cos(z*.23);
  const lowPool=smooth((x-18)/10)*smooth((z-15)/8);
  const basin=rock*(1-water)+(-3.6-lowPool*1.3+.12*Math.sin(x*.17)*Math.cos(z*.13))*water;
  const ground=basin+(height-basin)*shelf+.025*Math.sin(x*.7)*Math.sin(z*.53)*shelf;
  return channelBed(x,z,ground,distance);
}
export const createWitchCaveTerrain=()=>new TerrainHeightField({size:160,subdivisions:192,height:witchCaveHeight});
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
