// Offline only. Broad relief edits the existing three LODs, never their
// topology, UVs or texture. One fixed profile; no random per-instance noise.
export const CAVE_WALL_RELIEF_REVISION='broad-wall-relief-v1';
const smooth=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};
const subtract=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
const unit=v=>{const length=Math.hypot(...v);if(!(length>1e-12))throw Error('Invalid relief normal');return v.map(x=>x/length);};
const key=p=>p.map(x=>x.toFixed(5)).join(':');

export function caveWallReliefProfile(assetId){
 // Laboratory r3 prototype was visually rejected. Its source is deliberately
 // excluded from the packable helper; retain its original approved meshes.
 if(assetId==='cave-01-eroded-wall')return {
  protected:p=>p[1]<=3.05||p[1]>=4.8||Math.abs(p[0])>=3.25,
  map:p=>{const [x,y,z]=p,weight=smooth(0,.9,4-Math.abs(x))*smooth(3.05,3.5,y)*(1-smooth(4.4,4.8,y));return !weight?[...p]:[x,y,z-.22*Math.tanh(z/1.5)*weight*(.55+.45*Math.sin(x*.95+y*1.1+z*.3))];},
  maxDisplacement:.22,
 };
 throw Error('Unapproved wall relief source: '+assetId);
}

// J*t1 cross J*t2 is proportional to inverse-transpose(J)*normal.
// This transports authored split/smooth normals without exposing microscopic
// Boolean stitching triangles through a new face-normal regrouping.
function transportedNormal(profile,p,n){
 const tangent=unit(cross(n,Math.abs(n[1])<.8?[0,1,0]:[1,0,0])),bitangent=cross(n,tangent),h=.001;
 const derivative=v=>subtract(profile.map(p.map((x,k)=>x+h*v[k])),profile.map(p.map((x,k)=>x-h*v[k]))).map(x=>x/(2*h));
 return unit(cross(derivative(tangent),derivative(bitangent)));
}

export function buildCaveWallRelief(sources,assetId){
 if(sources.length!==3)throw Error('All three original LODs are required');
 const profile=caveWallReliefProfile(assetId),locked=new Set();
 // Protect WHOLE incident faces in every original LOD. A moved upper endpoint
 // otherwise also moves the interpolated surface below the protected height.
 for(const source of sources)for(const part of source.parts)for(let i=0;i<part.indices.length;i+=3){
  const points=part.indices.slice(i,i+3).map(id=>part.positions.slice(id*3,id*3+3));
  if(points.some(profile.protected))for(const p of points)locked.add(key(p));
 }
 const protectedPhysicalVertices=locked.size;let passes=0,orientationLocks=0;
 const mapped=p=>locked.has(key(p))?p:profile.map(p).map(Math.fround);
 for(;;){
  let added=0;passes++;
  for(const source of sources)for(const part of source.parts)for(let i=0;i<part.indices.length;i+=3){
   const p=part.indices.slice(i,i+3).map(id=>part.positions.slice(id*3,id*3+3)),q=p.map(mapped);
   const a=cross(subtract(p[1],p[0]),subtract(p[2],p[0])),b=cross(subtract(q[1],q[0]),subtract(q[2],q[0]));
   if(dot(a,b)<=0||Math.hypot(...b)<Math.hypot(...a)*.25)for(const v of p)if(!locked.has(key(v))){locked.add(key(v));added++;}
  }
  orientationLocks+=added;if(!added)break;
  // Monotone locks terminate at the unchanged original. A programming failure
  // must stop packing; do not roll a different profile or lower a quality gate.
  if(passes>100)throw Error('Wall relief constraints did not converge');
 }
 const levels=[],perLod=[];let maximum=0,minimumAreaRatio=Infinity,flippedFaces=0,protectedTriangleChanges=0;
 for(const source of sources){
  const output=structuredClone(source);let changed=0,normalChanged=0;
  for(let partIndex=0;partIndex<source.parts.length;partIndex++){
   const part=source.parts[partIndex],dest=output.parts[partIndex];
   for(let i=0;i<part.positions.length;i+=3){
    const p=part.positions.slice(i,i+3),q=mapped(p),distance=Math.hypot(...subtract(q,p));
    if(distance>profile.maxDisplacement+1e-5)throw Error('Relief exceeds approved displacement');
    dest.positions.splice(i,3,...q);maximum=Math.max(maximum,distance);
    if(distance>1e-7){changed++;const n=transportedNormal(profile,p,part.normals.slice(i,i+3));dest.normals.splice(i,3,...n.map(Math.fround));normalChanged++;}
   }
   for(let i=0;i<part.indices.length;i+=3){
    const ids=part.indices.slice(i,i+3),p=ids.map(id=>part.positions.slice(id*3,id*3+3)),q=ids.map(id=>dest.positions.slice(id*3,id*3+3));
    const a=cross(subtract(p[1],p[0]),subtract(p[2],p[0])),b=cross(subtract(q[1],q[0]),subtract(q[2],q[0]));
    minimumAreaRatio=Math.min(minimumAreaRatio,Math.hypot(...b)/Math.hypot(...a));if(dot(a,b)<=0)flippedFaces++;
    if(p.some(profile.protected)&&p.some((v,j)=>v.some((component,k)=>component!==q[j][k])))protectedTriangleChanges++;
   }
  }
  levels.push(output);perLod.push({level:source.level,triangles:source.parts.reduce((n,p)=>n+p.indices.length/3,0),changedVertices:changed,changedNormals:normalChanged});
 }
 if(flippedFaces||protectedTriangleChanges||minimumAreaRatio<.25)throw Error('Wall relief did not preserve protected topology');
 return {levels,stats:{revision:CAVE_WALL_RELIEF_REVISION,assetId,perLod,protectedPhysicalVertices,orientationLocks,constraintPasses:passes,maxDisplacement:maximum,minimumAreaRatio,flippedFaces,protectedTriangleChanges,newTriangles:0,newDrawCalls:0,newTextures:0}};
}
