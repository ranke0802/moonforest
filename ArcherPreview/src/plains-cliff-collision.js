import {PLAINS_LOOKOUT} from './great-plains-layout.js';

// Static, invisible solids over the entire steep annular band. They reuse the
// existing swept-circle/OBB navigation and spatial index; no terrain sampling,
// rendering or per-frame work is added. The west ramp remains a six-metre gap.
export function plainsCliffObstacles(hill=PLAINS_LOOKOUT){
 const inner=hill.capRadius-.05,outer=hill.capRadius+hill.cliffWidth+.08,segments=48,gap=hill.rampHalfWidth,pad=.015,obstacles=[];
 const box=(index,x,z,halfWidth,halfDepth,yaw)=>({id:'plains-cliff-lookout-'+index,source:'plains-lookout-cliff-band',terrainBarrier:true,shape:'box',x,z,halfWidth,halfDepth,yaw,radius:Math.hypot(halfWidth,halfDepth),height:hill.height+2});
 for(let i=0;i<segments;i++){
  const angle=(i+.5)*Math.PI*2/segments,half=Math.PI/segments,nx=Math.cos(angle)/hill.stretchX,nz=Math.sin(angle),length=Math.hypot(nx,nz),ux=nx/length,uz=nz/length,vx=-uz,vz=ux,points=[];
  for(const radius of [inner,outer])for(const a of [angle-half,angle,angle+half])points.push({x:Math.cos(a)*radius*hill.stretchX,z:Math.sin(a)*radius});
  const us=points.map(p=>p.x*ux+p.z*uz),vs=points.map(p=>p.x*vx+p.z*vz),u0=Math.min(...us)-pad,u1=Math.max(...us)+pad,v0=Math.min(...vs)-pad,v1=Math.max(...vs)+pad;
  const x=hill.x+ux*(u0+u1)/2+vx*(v0+v1)/2,z=hill.z+uz*(u0+u1)/2+vz*(v0+v1)/2,hx=(u1-u0)/2,hz=(v1-v0)/2;
  const corners=[];for(const u of [-hx,hx])for(const v of [-hz,hz])corners.push({x:x+ux*u+vx*v,z:z+uz*u+vz*v});
  const minZ=Math.min(...corners.map(p=>p.z)),maxZ=Math.max(...corners.map(p=>p.z));
  if(x<hill.x&&minZ<hill.z+gap&&maxZ>hill.z-gap){
   // Clip only the ramp-side boxes to horizontal gap edges. Conservative AABBs
   // cover the clipped band without leaving thin diagonal gaps at its mouth.
   const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x));
   for(const [suffix,low,high]of [['north',Math.max(minZ,hill.z+gap),maxZ],['south',minZ,Math.min(maxZ,hill.z-gap)]])if(high-low>1e-6)obstacles.push(box(i+'-'+suffix,(minX+maxX)/2,(low+high)/2,(maxX-minX)/2,(high-low)/2,0));
  }else obstacles.push(box(i,x,z,hx,hz,-Math.atan2(uz,ux)));
 }
 return obstacles;
}
