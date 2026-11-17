// Where meadow grass grows (0.4) — pure logic, no engine.
// The map is cut into square cells; each cell scatters tufts on a jittered
// grid and keeps a candidate when its roll is under the local density. The
// result is deterministic per cell and shuffled, so any prefix of a cell is
// an even thinning of it (used far away) and a lower `amount` is a subset.

export const MEADOW_CELL=20;
const hash=(x,z,seed)=>{let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^Math.imul(seed|0,1442695041);h=Math.imul(h^(h>>>13),1274126177);return (h^(h>>>16))>>>0;};
// Smooth 0…1 noise on a unit lattice.
export function valueNoise(x,z,seed=1){
 const x0=Math.floor(x),z0=Math.floor(z),fx=x-x0,fz=z-z0,sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);
 const a=hash(x0,z0,seed),b=hash(x0+1,z0,seed),c=hash(x0,z0+1,seed),d=hash(x0+1,z0+1,seed);
 return (a+(b-a)*sx+(c-a)*sz+(a-b-c+d)*sx*sz)/4294967296;
}
export const smooth=t=>{t=t<0?0:t>1?1:t;return t*t*(3-2*t);};

export const TUFT_STRIDE=5; // x, z, width scale, yaw, height stretch
// density(x,z) → 0…1 share of candidates kept · tall(x,z) → 0…1 (taller, wider)
export function scatterCell(cx,cz,{cell=MEADOW_CELL,spacing=.8,seed=4,density,tall=()=>0,amount=1}){
 let state=hash(cx,cz,seed)||1;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const n=Math.max(1,Math.round(cell/spacing)),step=cell/n,kept=[];
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  // Always draw the same numbers per candidate so `amount` only thins.
  const x=cx*cell+(i+random())*step,z=cz*cell+(j+random())*step,roll=random(),size=random(),yaw=random()*Math.PI*2,lift=random();
  const share=density(x,z);if(!(share>0)||roll>=share*amount)continue;
  const high=tall(x,z);
  kept.push([x,z,.62+size*.78+high*.55,yaw,.9+lift*.3+high*.75]);
 }
 for(let i=kept.length-1;i>0;i--){const j=Math.floor(random()*(i+1)),swap=kept[i];kept[i]=kept[j];kept[j]=swap;}
 const out=new Float32Array(kept.length*TUFT_STRIDE);
 for(let i=0;i<kept.length;i++)out.set(kept[i],i*TUFT_STRIDE);
 return out;
}
// Cells whose square touches a disc of `radius` around the origin.
export function meadowCells(radius,cell=MEADOW_CELL){
 const limit=Math.ceil(radius/cell),cells=[];
 for(let cx=-limit;cx<limit;cx++)for(let cz=-limit;cz<limit;cz++){
  const x=(cx+.5)*cell,z=(cz+.5)*cell,nearX=Math.max(Math.abs(x)-cell/2,0),nearZ=Math.max(Math.abs(z)-cell/2,0);
  if(Math.hypot(nearX,nearZ)<radius)cells.push({cx,cz,x,z});
 }
 return cells;
}
