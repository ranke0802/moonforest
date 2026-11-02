import {Mesh,VertexData,PBRMaterial,Color3} from '@babylonjs/core';
import {CAVE_PLACEMENTS} from './witch-cave-layout.js';
import {applyVillageToon} from './village-toon.js';

// Small iron wall plates/shelves support the existing freestanding lantern.
// One static batch, 480 triangles total; no texture, light or shadow pass.
export function caveLanternSupportGeometry(placements=CAVE_PLACEMENTS){
 const positions=[],normals=[],indices=[];
 for(const p of placements){if(!p.wallMount)continue;const d=p.wallMount.supportDepth,nx=Math.sin(p.yaw),nz=Math.cos(p.yaw),base=p.elevation-.025;
  for(const box of [ {width:.46,height:.07,depth:d+.28,y:-.035,z:(.22-d)/2}, {width:.22,height:.42,depth:.07,y:.09,z:-d+.015} ]){
   const data=VertexData.CreateBox(box),offset=positions.length/3;
   for(let i=0;i<data.positions.length;i+=3){const x=data.positions[i],y=data.positions[i+1]+box.y,z=data.positions[i+2]+box.z;positions.push(p.x+nz*x+nx*z,base+y,p.z-nx*x+nz*z);const u=data.normals[i],v=data.normals[i+1],w=data.normals[i+2];normals.push(nz*u+nx*w,v,-nx*u+nz*w);}
   for(const index of data.indices)indices.push(offset+index);
  }
 }
 return {positions,normals,indices};
}
export function createCaveLanternSupports(world,style){
 const mesh=new Mesh('cave-lantern-wall-fittings',world.scene),data=new VertexData();Object.assign(data,caveLanternSupportGeometry());data.applyToMesh(mesh);mesh.isPickable=false;mesh.freezeWorldMatrix();mesh.metadata={caveNoShadow:true};
 const material=new PBRMaterial('cave-lantern-wall-iron',world.scene);material.albedoColor=Color3.FromHexString('#665440');mesh.material=material;applyVillageToon([mesh],world.lighting);style.attach(material);
 return {mesh,dispose(){mesh.dispose();material.dispose();}};
}
