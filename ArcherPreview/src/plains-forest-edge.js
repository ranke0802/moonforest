import {FOREST_PLACEMENTS,FOREST_ROUTES,FOREST_CLEARINGS} from './monster-forest-layout.js';
import {monsterForestHeight} from './monster-forest-terrain.js';
import {FOREST_PLAINS_BOUNDARY,forestToPlains,plainsToForest} from './plains-forest-boundary.js';

const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
// The forest owns this boundary. Only the plains receives the immutable source
// placements/paint/height; no reverse edits or forest runtime decorations.
export function forestEdgeWeight(x,z){
 const p=plainsToForest({x,z});
 return (1-smooth((Math.abs(p.x)-29)/9))*(1-smooth((24-p.z)/10))*(1-smooth((p.z-77)/12));
}
// Sample the native forest's one-metre triangles, including Float32 storage,
// without allocating a second complete terrain grid for every application.
const nativeHeights=new Float32Array(81*67),nativeReady=new Uint8Array(nativeHeights.length);
function nativeHeight(x,z){
 const col=x+40,row=80-z;
 if(col<0||col>80||row<0||row>66)return Math.fround(monsterForestHeight(x,z));
 const index=row*81+col;
 if(!nativeReady[index]){nativeHeights[index]=monsterForestHeight(x,z);nativeReady[index]=1;}
 return nativeHeights[index];
}
export function forestSourceHeight(x,z){
 const gx=Math.max(0,Math.min(160,x+80)),gz=Math.max(0,Math.min(160,80-z)),col=Math.min(159,Math.floor(gx)),row=Math.min(159,Math.floor(gz)),u=gx-col,v=gz-row;
 const h=(dx,dz)=>nativeHeight(col+dx-80,80-row-dz),a=h(0,0),b=h(1,0),c=h(0,1),d=h(1,1);
 return u>=v?a+u*(b-a)+v*(d-b):a+v*(c-a)+u*(d-c);
}
export const forestEdgeHeight=(x,z)=>{const p=plainsToForest({x,z});return forestSourceHeight(p.x,p.z);};
export const FOREST_EDGE_ROAD=Object.freeze(FOREST_ROUTES[0].samples.filter(p=>p[1]>=24).map(([x,z])=>{const p=forestToPlains({x,z});return Object.freeze([p.x,p.z]);}));
export const FOREST_EDGE_CLEARINGS=Object.freeze(FOREST_CLEARINGS.filter(c=>c.z>=40).map(c=>Object.freeze({...c,...forestToPlains(c),y:.18})));
export const FOREST_EDGE_PLACEMENTS=Object.freeze(FOREST_PLACEMENTS.filter(p=>Math.abs(p.x)<29&&p.z>24).map(p=>Object.freeze({
 ...p,...forestToPlains(p),id:'forest-boundary-'+p.id,sourcePlacement:p.id,
 yaw:p.yaw+FOREST_PLAINS_BOUNDARY.yaw,elevation:forestSourceHeight(p.x,p.z),forestBoundary:true,
})));
export function joinForestEdge(placements){
 // Replace the old approximation in the shared section. Preserve authored quest
 // anchors outside it; avoid stacking two unrelated tree/stone populations.
 return [...placements.filter(p=>p.villageBoundary||p.questId||p.boundaryMarker||forestEdgeWeight(p.x,p.z)<=.15),...FOREST_EDGE_PLACEMENTS];
}
