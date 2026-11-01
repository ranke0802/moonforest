import {segmentDistanceSquared} from '../../src/melee-collision.js';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function pointTriangleDistanceSquared(p,a,b,c){
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return dot(ap,ap);const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return dot(bp,bp);const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3),q=ap.map((x,i)=>x-ab[i]*v);return dot(q,q);}const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return dot(cp,cp);const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6),q=ap.map((x,i)=>x-ac[i]*w);return dot(q,q);}const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0){const w=(d4-d3)/((d4-d3)+(d5-d6)),q=bp.map((x,i)=>x-(c[i]-b[i])*w);return dot(q,q);}const denominator=1/(va+vb+vc),v=vb*denominator,w=vc*denominator,q=ap.map((x,i)=>x-ab[i]*v-ac[i]*w);return dot(q,q);
}
export function segmentTriangleDistanceSquared(p,q,a,b,c){
 const d=sub(q,p),e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)>1e-12){const inv=1/det,s=sub(p,a),u=dot(s,h)*inv,r=cross(s,e1),v=dot(d,r)*inv,t=dot(e2,r)*inv;if(u>=0&&v>=0&&u+v<=1&&t>=0&&t<=1)return 0;}
 return Math.min(pointTriangleDistanceSquared(p,a,b,c),pointTriangleDistanceSquared(q,a,b,c),segmentDistanceSquared(p,q,a,b),segmentDistanceSquared(p,q,b,c),segmentDistanceSquared(p,q,c,a));
}
export function skinSweepGap(encounter,strike){
 const body=encounter.asset.meshes.find(m=>m.skeleton&&m.morphTargetManager&&!m.metadata?.moonforestOutline);body.skeleton.prepare(true);const positions=body.getPositionData(true,true),matrix=body.getWorldMatrix().m,world=new Float64Array(positions.length),indices=body.getIndices();
 for(let i=0;i<positions.length;i+=3){const x=positions[i],y=positions[i+1],z=positions[i+2];world[i]=x*matrix[0]+y*matrix[4]+z*matrix[8]+matrix[12];world[i+1]=x*matrix[1]+y*matrix[5]+z*matrix[9]+matrix[13];world[i+2]=x*matrix[2]+y*matrix[6]+z*matrix[10]+matrix[14];}
 let minimum=Infinity,lowerBound=Infinity,closest=null,testedTriangles=0,temporalSamples=0;const read=i=>[world[i*3],world[i*3+1],world[i*3+2]];
 for(const contact of strike.contacts){const previous=contact.previous??contact.blade,current=contact.blade,travel=Math.max(...current.map((p,i)=>Math.hypot(...sub(p,previous[i])))),steps=Math.max(1,Math.ceil(travel/.01)),error=travel/(2*steps),all=[...previous,...current],lo=[0,1,2].map(j=>Math.min(...all.map(p=>p[j]))-.2),hi=[0,1,2].map(j=>Math.max(...all.map(p=>p[j]))+.2);let contactMinimum=Infinity;
  for(let i=0;i<indices.length;i+=3){const ids=[indices[i],indices[i+1],indices[i+2]];if([0,1,2].some(j=>Math.min(...ids.map(id=>world[id*3+j]))>hi[j]||Math.max(...ids.map(id=>world[id*3+j]))<lo[j]))continue;const tri=ids.map(read);testedTriangles++;
   for(let k=0;k<=steps;k++){const f=k/steps,blade=current.map((p,l)=>p.map((v,j)=>previous[l][j]+(v-previous[l][j])*f)),distance=Math.sqrt(segmentTriangleDistanceSquared(...blade,...tri));temporalSamples++;contactMinimum=Math.min(contactMinimum,distance);if(distance<minimum){minimum=distance;closest={triangle:i/3,alpha:f,pointTimeError:error};}}
  }
  // Every rejected triangle lies outside the entire swept blade AABB inflated
  // by.2m, so it is at least.2m from the sweep. Static rig pose is the same
  // frame convention used by the live fitted-contact solver.
  lowerBound=Math.min(lowerBound,Math.min(.2,contactMinimum-error));
 }
 return {minimumDistance:Number.isFinite(minimum)?minimum:null,minimumProvedDistance:lowerBound,bladeRadius:strike.bladeRadius,actualSurfaceClear:lowerBound>strike.bladeRadius,closest,testedTriangles,temporalSamples,scope:'Actual CPU-skinned mesh TRIANGLES versus the real line blade sweep; no lateral assist. Time sampling has a conservative travel/(2N) distance bound. Boss pose uses the current frame, matching the live solver.'};
}
