// Vertex-clustering decimation for small scenery seen from far away (0.4).
// Pure arrays in, arrays out: no engine. Vertices are snapped to a coarse 3D
// grid; each occupied cell keeps the vertex farthest from the mesh centre (so
// the outline does not shrink) with all of its attributes; triangles that
// collapse or repeat are dropped. Thin parts (grass blades) fall away, the
// mass and colour stay — which is all a 20-pixel tuft shows.

export function clusterDecimate({positions,indices,attributes={}},cells){
 const count=positions.length/3,n=Math.max(1,Math.floor(cells));
 let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
 for(let i=0;i<count;i++){const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;}
 const size=Math.max(maxX-minX,maxY-minY,maxZ-minZ,1e-6)/n,cx=(minX+maxX)/2,cy=(minY+maxY)/2,cz=(minZ+maxZ)/2;
 const cellOf=new Int32Array(count),best=new Map();
 for(let i=0;i<count;i++){
  const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];
  const key=Math.min(n-1,Math.floor((x-minX)/size))+1024*(Math.min(n-1,Math.floor((y-minY)/size))+1024*Math.min(n-1,Math.floor((z-minZ)/size)));
  cellOf[i]=key;const reach=(x-cx)**2+(y-cy)**2+(z-cz)**2,old=best.get(key);
  if(!old||reach>old.reach)best.set(key,{vertex:i,reach,slot:-1});
 }
 // Output is unwelded: three vertices per triangle. Texture coordinates are
 // taken from ONE source vertex for the whole triangle — baked atlases are
 // made of small islands, and interpolating between islands samples the dark
 // gaps between them (a decimated bush turned almost black).
 const triangles=[],seen=new Set();
 for(let i=0;i<indices.length;i+=3){
  const a=best.get(cellOf[indices[i]]),b=best.get(cellOf[indices[i+1]]),c=best.get(cellOf[indices[i+2]]);
  if(a===b||b===c||a===c)continue;
  const s=[a.vertex,b.vertex,c.vertex].sort((p,q)=>p-q),key=s[0]+'/'+s[1]+'/'+s[2];
  if(seen.has(key))continue;seen.add(key);triangles.push(a.vertex,b.vertex,c.vertex);
 }
 const count3=triangles.length,outPositions=new Float32Array(count3*3),outIndices=new Array(count3);
 for(let i=0;i<count3;i++){const v=triangles[i];outPositions[i*3]=positions[v*3];outPositions[i*3+1]=positions[v*3+1];outPositions[i*3+2]=positions[v*3+2];outIndices[i]=i;}
 const outAttributes={};
 for(const [name,{data,size:width}] of Object.entries(attributes)){
  const out=new Float32Array(count3*width),flat=/^uv\d*$/.test(name);
  for(let i=0;i<count3;i++){const v=triangles[flat?i-i%3:i];for(let k=0;k<width;k++)out[i*width+k]=data[v*width+k];}
  outAttributes[name]={data:out,size:width};
 }
 return {positions:outPositions,indices:outIndices,attributes:outAttributes,triangles:count3/3};
}

// The finest grid (2…maxCells per axis) whose result stays within the budget.
export function decimateToBudget(geometry,maxTriangles,{maxCells=14}={}){
 let chosen=null;
 for(let cells=2;cells<=maxCells;cells++){
  const result=clusterDecimate(geometry,cells);
  if(result.triangles>maxTriangles)break;
  if(result.triangles>0)chosen={...result,cells};
 }
 return chosen;
}
