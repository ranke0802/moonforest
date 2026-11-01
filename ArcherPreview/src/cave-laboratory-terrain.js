import {CAVE_LABORATORY_GEOMETRY,laboratoryEnabled} from './cave-laboratory-geometry.js';
import {CAVE_LABORATORY_TERRAIN} from './cave-laboratory-terrain-data.js';

export function applyLaboratoryTerrain(terrain,contract=CAVE_LABORATORY_GEOMETRY,data=CAVE_LABORATORY_TERRAIN){
  if(!laboratoryEnabled(contract))return terrain;
  if(data.version!==contract.version||data.sourceSha256!==contract.sourceSha256||data.terrainSha256!==contract.terrainSha256||terrain.size!==data.size||terrain.subdivisions!==data.subdivisions)throw Error('Laboratory terrain and enclosure revisions differ');
  const seen=new Set();
  for(const [index,height]of data.overrides){
    if(!Number.isSafeInteger(index)||index<0||index>=terrain.heights.length||!Number.isFinite(height)||seen.has(index))throw Error('Invalid laboratory terrain override');
    seen.add(index);
    const stride=terrain.subdivisions+1,x=index%stride*terrain.step-terrain.half,z=terrain.half-Math.floor(index/stride)*terrain.step,b=contract.bounds;
    if(x<b.minX-.001||x>b.maxX+.001||z<b.minZ-.001||z>b.maxZ+.001)throw Error('Laboratory terrain override leaves its owned area');
    terrain.heights[index]=height;
  }
  // A number keeps the existing bounded CPU terrain cache safe to reuse.
  terrain.caveLaboratoryVersion=contract.version;
  return terrain;
}

export function restoreLaboratoryFloorNormals(normals,terrain,contract=CAVE_LABORATORY_GEOMETRY,data=CAVE_LABORATORY_TERRAIN){
  if(!laboratoryEnabled(contract)||terrain.caveLaboratoryVersion!==contract.version)return normals;
  for(const [index,x,y,z]of data.lockedNormals??[]){
    if(index*3+2>=normals.length||![x,y,z].every(Number.isFinite))throw Error('Invalid protected floor normal');
    normals[index*3]=x;normals[index*3+1]=y;normals[index*3+2]=z;
  }
  return normals;
}
