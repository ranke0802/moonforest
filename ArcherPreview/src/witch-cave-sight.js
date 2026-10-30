import {CAVE_SIGHT_DATA as data} from './witch-cave-sight-data.js';
let occupied;
// Static actual-mesh eye-height blockers. Water, low props and the empty
// interior of an arch are not inferred opaque from walking collision.
export function caveRockOccludes(x,z,halfExtent=0){
 if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(halfExtent))return true;
 if(!occupied){occupied=new Uint8Array(data.size*data.size);for(let i=0;i<data.runs.length;i+=2)occupied.fill(1,data.runs[i],data.runs[i]+data.runs[i+1]);}
 halfExtent=Math.max(0,halfExtent);
 const lowX=Math.max(0,Math.floor((x-halfExtent-data.min)/data.step)),highX=Math.min(data.size-1,Math.floor((x+halfExtent-data.min)/data.step));
 const lowZ=Math.max(0,Math.floor((z-halfExtent-data.min)/data.step)),highZ=Math.min(data.size-1,Math.floor((z+halfExtent-data.min)/data.step));
 for(let row=lowZ;row<=highZ;row++)for(let col=lowX;col<=highX;col++)if(occupied[row*data.size+col])return true;
 return false;
}
