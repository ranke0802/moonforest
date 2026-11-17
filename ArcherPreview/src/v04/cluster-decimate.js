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
 const outIndices=[],seen=new Set(),order=[];
 for(let i=0;i<indices.length;i+=3){
  const a=best.get(cellOf[indices[i]]),b=best.get(cellOf[indices[i+1]]),c=best.get(cellOf[indices[i+2]]);
  if(a===b||b===c||a===c)continue;
  for(const cell of [a,b,c])if(cell.slot<0){cell.slot=order.length;order.push(cell.vertex);}
  const s=[a.slot,b.slot,c.slot].sort((p,q)=>p-q),key=s[0]+s[1]*65536+s[2]*4294967296;
  if(seen.has(key))continue;seen.add(key);outIndices.push(a.slot,b.slot,c.slot);
 }
 const pick=(source,width)=>{const out=new Float32Array(order.length*width);for(let i=0;i<order.length;i++)for(let k=0;k<width;k++)out[i*width+k]=source[order[i]*width+k];return out;};
 const outAttributes={};for(const [name,{data,size:width}] of Object.entries(attributes))outAttributes[name]={data:pick(data,width),size:width};
 return {positions:pick(positions,3),indices:outIndices,attributes:outAttributes,triangles:outIndices.length/3};
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
