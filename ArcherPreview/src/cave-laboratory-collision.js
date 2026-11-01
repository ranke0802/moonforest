import {CAVE_LABORATORY_GEOMETRY as contract,laboratoryEnabled} from './cave-laboratory-geometry.js';
import {CAVE_LABORATORY_COLLISION_DATA as data} from './cave-laboratory-collision-data.js';

// Both inputs are immutable modules. Validate the static contract once rather
// than repeating its array/regex checks in every navigation distance query.
const enabled=laboratoryEnabled();
let distances;
function field(){
  if(distances)return distances;
  if(data.algorithm!=='whole-cell-exact-native-body-v1'||data.version!==contract.version||data.revision!==contract.revision||data.sourceSha256!==contract.sourceSha256||data.terrainSha256!==contract.terrainSha256)throw Error('Laboratory collision and actual geometry revisions differ');
  const raw=atob(data.values),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  if(bytes.byteLength!==data.width*data.height*2)throw Error('Invalid laboratory distance field');
  distances=new Uint16Array(bytes.buffer);return distances;
}

// This value is normalized to CaveNavigation's existing radius+.08 contract.
// It does NOT relax that legacy coarse field or its radius. For this native
// alone, exact stored whole-cell distance >= radius+.002 is the physical test:
// (distance + legacyMargin - nativeSkin) >= radius + legacyMargin.
// The offline proof includes all ground heights within the queried cell.
export function caveLaboratoryClearance(x,z){
  if(!enabled)return Infinity;
  const col=Math.floor((x-data.minX)/data.step),row=Math.floor((z-data.minZ)/data.step);
  // Every actual vertex is2.25m inside this boundary. Outside it the model is
  // farther than any supported2.0m actor radius plus the2mm numerical skin.
  if(col<0||row<0||col>=data.width||row>=data.height)return Infinity;
  return field()[row*data.width+col]*data.quantum+data.legacyMargin-data.nativeSkin;
}

export function inspectLaboratoryCollision(){return {ready:!!distances,bytes:distances?.byteLength??0,allocatedMaximumBytes:data.width*data.height*2,step:data.step,sourceSha256:data.sourceSha256,revision:data.revision,maxSupportedRadius:data.maxSupportedRadius};}
