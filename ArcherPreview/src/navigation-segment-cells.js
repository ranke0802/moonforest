// Conservative L-infinity expansion of a finite segment. For each X column,
// intersect the segment with that column expanded by the query radius, then
// visit only the Z interval it can reach. This is a capsule superset, not a
// collision test: the existing analytic narrow phase remains authoritative.
// Traversal stays X-major/Z-minor, within the old bounding rectangle.
export function visitSegmentCells(a,b,radius,cellSize,visit){
  const minX=Math.floor((Math.min(a.x,b.x)-radius)/cellSize),maxX=Math.floor((Math.max(a.x,b.x)+radius)/cellSize);
  const minZ=Math.floor((Math.min(a.z,b.z)-radius)/cellSize),maxZ=Math.floor((Math.max(a.z,b.z)+radius)/cellSize);
  const dx=b.x-a.x,dz=b.z-a.z;
  const slackX=Number.EPSILON*16*Math.max(1,Math.abs(a.x),Math.abs(b.x),radius);
  const slackZ=Number.EPSILON*16*Math.max(1,Math.abs(a.z),Math.abs(b.z),radius);
  let count=0;
  for(let x=minX;x<=maxX;x++){
    let start=0,end=1;
    if(dx){
      const t0=(x*cellSize-radius-slackX-a.x)/dx,t1=((x+1)*cellSize+radius+slackX-a.x)/dx;
      start=Math.max(0,Math.min(t0,t1));end=Math.min(1,Math.max(t0,t1));
      if(start>end)continue;
    }
    const z0=a.z+dz*start,z1=a.z+dz*end;
    const low=Math.max(minZ,Math.floor((Math.min(z0,z1)-radius-slackZ)/cellSize));
    const high=Math.min(maxZ,Math.floor((Math.max(z0,z1)+radius+slackZ)/cellSize));
    for(let z=low;z<=high;z++){visit(x,z);count++;}
  }
  return count;
}
