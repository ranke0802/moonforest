import {CAVE_LABORATORY_GEOMETRY,laboratoryEnabled,laboratoryLegacySource,clipLaboratoryCeiling} from '../src/cave-laboratory-geometry.js';

// Mirrors the existing walls' colour/outline/shadow fragment ownership. Keep
// their shared source resources and every triangle outside the replacement.
export function caveCollisionGeometry(id,geometry,contract=CAVE_LABORATORY_GEOMETRY){
  if(!laboratoryEnabled(contract)||!laboratoryLegacySource(id,contract))return geometry;
  const p=geometry.positions,b=contract.bounds;
  let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
  for(let i=0;i<p.length;i+=3){minX=Math.min(minX,p[i]);maxX=Math.max(maxX,p[i]);minZ=Math.min(minZ,p[i+2]);maxZ=Math.max(maxZ,p[i+2]);}
  if(maxX<b.minX||minX>b.maxX||maxZ<b.minZ||minZ>b.maxZ)return geometry;
  return clipLaboratoryCeiling(geometry,contract);
}
