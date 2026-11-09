import {VertexBuffer,VertexData} from '@babylonjs/core';

// Each rectangle is stored in map coordinates; blending keeps its rim continuous.
export function buildEditedTerrain(terrain,baseHeights,patches=[]){
 if(!(baseHeights instanceof Float32Array)||baseHeights.length!==(terrain.subdivisions+1)**2||terrain.surfaceHeight)throw Error('이 지역은 지형 평탄화를 지원하지 않습니다.');
 const next=Object.assign(Object.create(Object.getPrototypeOf(terrain)),terrain,{heights:baseHeights.slice()}),n=terrain.subdivisions+1;
 for(const patch of patches){
  const minX=Math.max(0,Math.floor((patch.x-patch.halfWidth-patch.blend+terrain.half)/terrain.step)),maxX=Math.min(n-1,Math.ceil((patch.x+patch.halfWidth+patch.blend+terrain.half)/terrain.step));
  const minZ=Math.max(0,Math.floor((terrain.half-(patch.z+patch.halfDepth+patch.blend))/terrain.step)),maxZ=Math.min(n-1,Math.ceil((terrain.half-(patch.z-patch.halfDepth-patch.blend))/terrain.step));
  for(let row=minZ;row<=maxZ;row++)for(let col=minX;col<=maxX;col++){
   const x=col*terrain.step-terrain.half,z=terrain.half-row*terrain.step;
   const distance=Math.max(Math.abs(x-patch.x)-patch.halfWidth,Math.abs(z-patch.z)-patch.halfDepth,0);
   if(distance>=patch.blend)continue;
   const t=Math.max(0,Math.min(1,distance/patch.blend)),weight=1-t*t*(3-2*t),i=row*n+col;
   next.heights[i]+=(patch.height-next.heights[i])*weight;
  }
 }
 return next;
}

export function publishEditedTerrain(world,terrain){
 const mesh=world.ground,positions=mesh.getVerticesData(VertexBuffer.PositionKind)?.slice(),indices=mesh.getIndices();
 if(!positions||positions.length<terrain.heights.length*3||!indices)throw Error('지형 메시를 편집할 수 없습니다.');
 for(let i=0;i<terrain.heights.length;i++)positions[i*3+1]=terrain.heights[i];
 const normals=new Float32Array(positions.length);VertexData.ComputeNormals(positions,indices,normals);
 mesh.setVerticesData(VertexBuffer.PositionKind,positions,false);mesh.setVerticesData(VertexBuffer.NormalKind,normals,false);mesh.refreshBoundingInfo();
 world.terrain.heights.set(terrain.heights);
}
