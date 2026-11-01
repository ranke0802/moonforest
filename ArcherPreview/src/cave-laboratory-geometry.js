// Approved derived source. Keep geometry, all LODs, terrain and replacement
// boundaries on this one revision; model/bake QA remains a deployment gate.
export const CAVE_LABORATORY_GEOMETRY=Object.freeze({
 enabled:true,version:1,revision:'lab-large-joints-r3-v1',
 sourceSha256:'eadcb1b51b5314ac6bfc8ac5fbd5951d027ef51fc6636063caedf55bf304bd6b',
 terrainSha256:'7d0fb908cd01d1c76d255f8ff13ceca5c710e7798f916bcc42d93bf043b7c471',assetId:'cave-derived-laboratory-rock',
 bounds:Object.freeze({minX:-48,maxX:-23,minZ:-30,maxZ:-7}),
 placement:Object.freeze({x:-35.5,z:-18.5,elevation:1.825,scale:1,yaw:0,kind:'rock'}),
 legacyAssets:Object.freeze(['cave-01-eroded-wall','cave-03-great-column']),
 retiredGroundTriangles:Object.freeze([]),
});

export const CAVE_LABORATORY_CLIP_GLSL=`
#ifndef CAVE_LABORATORY_CLIP_DEFINED
#define CAVE_LABORATORY_CLIP_DEFINED
bool caveLaboratoryClip(vec3 p,float clipEnabled,vec4 rect){
 return clipEnabled>.5&&p.x>=rect.x&&p.z>=rect.y&&p.x<=rect.z&&p.z<=rect.w;
}
#endif
`;
export function laboratoryLegacySource(id,contract=CAVE_LABORATORY_GEOMETRY){return contract?.legacyAssets?.includes(id)??false;}
export function activeLaboratoryClip(scene,material){const contract=scene?.metadata?.caveLaboratoryGeometry;return contract?.enabled&&material?.metadata?.caveLegacyLaboratoryClip?contract:null;}
export function laboratoryHidesLegacy(point,contract=CAVE_LABORATORY_GEOMETRY){const b=contract?.bounds;return contract?.enabled===true&&!!b&&point.x>=b.minX&&point.z>=b.minZ&&point.x<=b.maxX&&point.z<=b.maxZ;}

export function laboratoryEnabled(contract=CAVE_LABORATORY_GEOMETRY){
 if(!contract?.enabled)return false;
 if(!Number.isSafeInteger(contract.version)||contract.version<1||!contract.revision||!/^[a-f0-9]{64}$/.test(contract.sourceSha256??''))throw Error('Laboratory geometry has no approved revision');
 if(!/^[a-f0-9]{64}$/.test(contract.terrainSha256??''))throw Error('Laboratory geometry has no matching terrain source');
 const b=contract.bounds;
 if(!b||![b.minX,b.maxX,b.minZ,b.maxZ].every(Number.isFinite)||b.minX>=b.maxX||b.minZ>=b.maxZ)throw Error('Invalid laboratory replacement bounds');
 if(!Array.isArray(contract.retiredGroundTriangles)||contract.retiredGroundTriangles.some(v=>!Number.isSafeInteger(v)||v<0))throw Error('Invalid laboratory ground ownership');
 if(!Array.isArray(contract.legacyAssets)||contract.legacyAssets.length!==2||!['cave-01-eroded-wall','cave-03-great-column'].every(id=>contract.legacyAssets.includes(id)))throw Error('Laboratory legacy clipping must remain limited to the two approved sources');
 return true;
}

// Stable cell/diagonal identity, independent of patch order or triangle winding.
// Terrain uses the a--d diagonal. Other topology must never be guessed as a cell.
export function groundTriangleKey(a,b,c,subdivisions){
 const rowWidth=subdivisions+1,ids=[a,b,c],row=Math.min(...ids.map(i=>Math.floor(i/rowWidth))),col=Math.min(...ids.map(i=>i%rowWidth));
 if(row<0||col<0||row>=subdivisions||col>=subdivisions)return -1;
 const base=row*rowWidth+col,values=new Set(ids);
 if(values.size!==3||!values.has(base)||!values.has(base+rowWidth+1))return -1;
 const half=values.has(base+1)?0:values.has(base+rowWidth)?1:-1;
 return half<0?-1:(row*subdivisions+col)*2+half;
}

export function retiredLaboratoryGround(contract=CAVE_LABORATORY_GEOMETRY,subdivisions){
 if(!laboratoryEnabled(contract))return null;
 const retired=new Set(contract.retiredGroundTriangles);
 if([...retired].some(key=>key>=subdivisions*subdivisions*2))throw Error('Laboratory ownership does not match terrain grid');
 return retired;
}

// Exact polygon subtraction, not triangle-centre deletion. The four disjoint
// outside pieces preserve winding and interpolate the existing roof normals.
export function clipLaboratoryCeiling(geometry,contract=CAVE_LABORATORY_GEOMETRY){
 if(!laboratoryEnabled(contract))return geometry;
 const {positions,indices,normals}=geometry,b=contract.bounds,outPositions=Array.from(positions),outNormals=normals?Array.from(normals):null,outIndices=[],lookup=new Map();
 const point=id=>({p:Array.from(positions.slice(id*3,id*3+3)),n:normals?Array.from(normals.slice(id*3,id*3+3)):null,id});
 const interpolate=(a,c,t)=>({p:a.p.map((v,k)=>v+(c.p[k]-v)*t),n:a.n?a.n.map((v,k)=>v+(c.n[k]-v)*t):null});
 const clip=(polygon,axis,bound,sign)=>{
  const inside=[],outside=[];
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i],c=polygon[(i+1)%polygon.length],da=sign*(a.p[axis]-bound),dc=sign*(c.p[axis]-bound);
   (da>=0?inside:outside).push(a);
   if((da<0)!==(dc<0)){const cut=interpolate(a,c,da/(da-dc));inside.push(cut);outside.push(cut);}
  }
  return {inside,outside};
 };
 const vertex=v=>{
  if(v.id!==undefined)return v.id;
  const key=[...v.p,...(v.n??[])].map(x=>Math.round(x*1e8)).join(':');
  if(lookup.has(key))return lookup.get(key);
  const id=outPositions.length/3;outPositions.push(...v.p);if(outNormals)outNormals.push(...v.n);lookup.set(key,id);return id;
 };
 const emit=polygon=>{for(let i=1;i+1<polygon.length;i++){
  const a=polygon[0].p,c=polygon[i].p,d=polygon[i+1].p,ab=c.map((v,k)=>v-a[k]),ac=d.map((v,k)=>v-a[k]);
  if(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])>1e-10)outIndices.push(vertex(polygon[0]),vertex(polygon[i]),vertex(polygon[i+1]));
 }};
 for(let i=0;i<indices.length;i+=3){
  let polygon=[point(indices[i]),point(indices[i+1]),point(indices[i+2])];
  for(const [axis,bound,sign]of [[0,b.minX,1],[0,b.maxX,-1],[2,b.minZ,1],[2,b.maxZ,-1]]){
   if(polygon.length<3)break;
   const pieces=clip(polygon,axis,bound,sign);emit(pieces.outside);polygon=pieces.inside;
  }
 }
 return {...geometry,positions:Float32Array.from(outPositions),indices:Uint32Array.from(outIndices),...(outNormals?{normals:Float32Array.from(outNormals)}:{})};
}
