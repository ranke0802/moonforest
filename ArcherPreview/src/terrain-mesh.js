import {Mesh,MeshBuilder,VertexBuffer,VertexData} from '@babylonjs/core';

export function createTerrainGround(scene,terrain,{borderExtension=0}={}){
  const mesh=MeshBuilder.CreateGround('forest-floor',{width:terrain.size,height:terrain.size,subdivisions:terrain.subdivisions},scene);
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind),normals=mesh.getVerticesData(VertexBuffer.NormalKind),uvs=mesh.getVerticesData(VertexBuffer.UVKind);
  for(let i=0;i<terrain.heights.length;i++){
    positions[i*3+1]=terrain.heights[i];
    // Stretch only the flat outermost ring beyond the fog. Keep every playable
    // triangle and the mesh budget unchanged; no exposed floor edge near the rim.
    if(borderExtension){
      if(Math.abs(positions[i*3])>=terrain.half-.001)positions[i*3]+=Math.sign(positions[i*3])*borderExtension;
      if(Math.abs(positions[i*3+2])>=terrain.half-.001)positions[i*3+2]+=Math.sign(positions[i*3+2])*borderExtension;
      // Preserve world-space texel density on the extended skirt as well.
      uvs[i*2]=(positions[i*3]+terrain.half)/terrain.size;
      uvs[i*2+1]=(positions[i*3+2]+terrain.half)/terrain.size;
    }
  }
  VertexData.ComputeNormals(positions,mesh.getIndices(),normals);
  mesh.setVerticesData(VertexBuffer.PositionKind,positions,false);mesh.setVerticesData(VertexBuffer.NormalKind,normals,false);
  mesh.setVerticesData(VertexBuffer.UVKind,uvs,false);
  mesh.refreshBoundingInfo();return mesh;
}

// A 64-segment flat ribbon follows the ground. Updating only visible/moving
// warnings is cheaper than the previous 64×64 torus, with no raycasts.
export function createTerrainRing(scene,terrain){
  const mesh=new Mesh('boss-attack-warning',scene),segments=64,positions=new Float32Array((segments+1)*6),indices=[],normals=new Float32Array(positions.length);
  for(let i=0;i<=segments;i++){normals[i*6+1]=normals[i*6+4]=1;if(i<segments){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}
  mesh.setVerticesData(VertexBuffer.PositionKind,positions,true);mesh.setVerticesData(VertexBuffer.NormalKind,normals,false);mesh.setIndices(indices);mesh.isPickable=false;
  let lastX=Infinity,lastZ=Infinity,lastRadius;
  return {mesh,update(center,radius){
    if(!mesh.isVisible||(Math.hypot(center.x-lastX,center.z-lastZ)<.025&&radius===lastRadius))return;
    lastX=center.x;lastZ=center.z;lastRadius=radius;mesh.position.set(center.x,0,center.z);
    for(let i=0;i<=segments;i++)for(let side=0;side<2;side++){
      const angle=i*Math.PI*2/segments,r=radius+(side?1:-1)*.0175,x=Math.sin(angle)*r,z=Math.cos(angle)*r,index=i*6+side*3;
      positions[index]=x;positions[index+1]=(terrain?.heightAt(center.x+x,center.z+z)??center.y)+.025;positions[index+2]=z;
    }
    mesh.updateVerticesData(VertexBuffer.PositionKind,positions,true);
  }};
}
