import {Color3,DynamicTexture,Mesh,MeshBuilder,StandardMaterial} from '@babylonjs/core';
import {PLAINS_PLACEMENTS} from './great-plains-layout.js';
import {createPlainsRiver} from './plains-river.js';

// Authored route signage and a single-pass flowing river. This owns every
// resource it creates and is disposed before a new map is made visible.
export function configurePlainsDecor(world){
 world.plainsDecor?.dispose();world.plainsDecor=null;
 if(!world.plains)return;
 const meshes=[],materials=[],textures=[],scene=world.scene;
 const river=createPlainsRiver(world);meshes.push(river.mesh);
 const label=(name,lines,x,z,y,width,height)=>{
  const texture=new DynamicTexture(name,{width:512,height:256},scene,false);textures.push(texture);
  const ctx=texture.getContext();ctx.fillStyle='#4b3c27';ctx.fillRect(0,0,512,256);ctx.strokeStyle='#bba87b';ctx.lineWidth=9;ctx.strokeRect(10,10,492,236);
  ctx.textAlign='center';ctx.fillStyle='#fff3d5';ctx.font='bold 34px "Malgun Gothic",sans-serif';
  lines.forEach((text,i)=>ctx.fillText(text,256,66+i*63));texture.update();
  const material=new StandardMaterial(name,scene);material.diffuseTexture=texture;material.emissiveColor=new Color3(.35,.35,.35);material.specularColor=Color3.Black();material.backFaceCulling=false;materials.push(material);
  const mesh=MeshBuilder.CreatePlane(name,{width,height},scene);mesh.position.set(x,world.terrain.heightAt(x,z)+y,z);mesh.billboardMode=Mesh.BILLBOARDMODE_Y;mesh.material=material;meshes.push(mesh);
 };
 label('plains-junction-names',['← 마을','마물의 숲 ↗','왕국 가도 ↓'],-1,18.3,1.6,1.1,.55);
 label('plains-village-name',['마을','← 귀환'], -85,-35.7,1.6,1,.5);
 for(const p of PLAINS_PLACEMENTS.filter(p=>p.boundaryMarker))label('church-marker-'+p.id,['✥','숲길 경계'],p.x,p.z+.25,.7,.48,.45);
 for(const p of PLAINS_PLACEMENTS.filter(p=>p.lootTier))label('chest-tier-'+p.id,[p.lootTier===2?'II':'I','보급함'],p.x,p.z+.5,.62,.42,.21);
 for(const mesh of meshes){mesh.isPickable=false;if(!mesh.billboardMode)mesh.freezeWorldMatrix();}
 let disposed=false;const observer=scene.onDisposeObservable.addOnce(()=>dispose());
 const dispose=()=>{if(disposed)return;disposed=true;scene.onDisposeObservable.remove(observer);river.dispose();for(const m of meshes)if(m!==river.mesh)m.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();};
 world.plainsDecor={dispose,meshes,river,tick:seconds=>river.tick(seconds)};
}
