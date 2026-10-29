import {TerrainHeightField} from './terrain.js';
import {caveSurface,caveWaterWeight,CAVE_RAMPS} from './witch-cave-layout.js';
import {CAVE_RAMP_PROFILE} from './witch-cave-ramp-profile.js';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function rampCoordinates(p,x,z){const c=Math.cos(p.yaw),s=Math.sin(p.yaw),dx=(x-p.x)/p.scale,dz=(z-p.z)/p.scale;return {x:dx*c-dz*s,z:dx*s+dz*c};}
function rampTop(x,z){
  const p=CAVE_RAMP_PROFILE,u=(Math.max(-1.4,Math.min(1.4,x))-p.minX)/p.stepX,v=(Math.max(-3.4,Math.min(3.4,z))-p.minZ)/p.stepZ;
  const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,h=p.heights;
  return (h[j][i]*(1-a)+h[j][i+1]*a)*(1-b)+(h[j+1][i]*(1-a)+h[j+1][i+1]*a)*b;
}
export function caveRampHeight(x,z,ground){
  for(const p of CAVE_RAMPS){const q=rampCoordinates(p,x,z);if(Math.abs(q.x)<=1.4&&Math.abs(q.z)<=3.4)ground=Math.max(ground,p.elevation-.025+rampTop(q.x,q.z)*p.scale);}
  return ground;
}
export function witchCaveHeight(x,z){
  const {distance,height}=caveSurface(x,z);
  const shelf=1-smooth((distance+.4)/2.5);
  const water=caveWaterWeight(x,z);
  const rock=height+1.8+.55*Math.sin(x*.28)*Math.cos(z*.23);
  const basin=rock*(1-water)+(-3.6+.12*Math.sin(x*.17)*Math.cos(z*.13))*water;
  let floor=basin+(height-basin)*shelf+.045*Math.sin(x*.7)*Math.sin(z*.53)*shelf;
  for(const p of CAVE_RAMPS){
    const q=rampCoordinates(p,x,z),outside=Math.hypot(Math.max(0,Math.abs(q.x)-1.4),Math.max(0,Math.abs(q.z)-3.4));
    if(outside>=2.8)continue;
    const top=p.elevation-.025+rampTop(q.x,q.z)*p.scale,inside=Math.min(1.4-Math.abs(q.x),3.4-Math.abs(q.z));
    const underlay=top-.03-.32*smooth(inside/.6),blend=1-smooth(outside/2.8);
    floor=Math.max(floor,floor+(underlay-floor)*blend);
  }
  return floor;
}
export const createWitchCaveTerrain=()=>{const terrain=new TerrainHeightField({size:160,subdivisions:192,height:witchCaveHeight});terrain.surfaceHeight=caveRampHeight;return terrain;};
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
