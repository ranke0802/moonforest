// The story's own opening wagon (0.3, 2026-11-19): the covered wagon with a
// pair of shafts (covered-wagon-shafts.glb, made in Blender from the source
// FBX: the single centre pole removed, two shafts and a cross bar added). The
// map's placed wagon stays for collision with its meshes hidden.
// Map lifetime: created by the story when the opening map's cast is built and
// disposed with it.
import {Matrix,TransformNode,Quaternion,Vector3} from '@babylonjs/core';
import {loadOwnedModel} from './owned-model.js';
import {attachCharacterOutlines} from '../character-outlines.js';
import {applyMonsterToon} from '../monster-toon.js';

const MODEL=new URL('./models/covered-wagon-shafts.glb',import.meta.url);
// The wagon's heading is the root's local +Z. The world is right-handed, so the
// glTF loader does not mirror the model: its front (shafts) needs +PI/2 here
// (-PI/2 put the shafts behind, away from the horse; 2026-11-19 user video).
export const WAGON_MODEL=Object.freeze({turn:Math.PI/2});

// The model's outline in the root's frame: per slice along its length, the
// furthest vertex in each of 16 directions across it. The rig sets the tipped
// wagon on the ground with these (wagon-rig.js). Built once at load.
const SLICES=8,AROUND=16;
function outlinePoints(root,meshes){
 const inverse=root.computeWorldMatrix(true).clone().invert(),local=new Matrix(),point=new Vector3(),all=[];
 for(const mesh of meshes){
  const data=mesh.getVerticesData?.('position');if(!data)continue;
  mesh.computeWorldMatrix(true).multiplyToRef(inverse,local);
  for(let i=0;i<data.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(data[i],data[i+1],data[i+2],local,point);all.push(point.x,point.y,point.z);}
 }
 if(!all.length)return null;
 let near=Infinity,far=-Infinity;for(let i=2;i<all.length;i+=3){if(all[i]<near)near=all[i];if(all[i]>far)far=all[i];}
 const span=Math.max(1e-6,far-near),best=new Float64Array(SLICES*AROUND).fill(-Infinity),pick=new Int32Array(SLICES*AROUND).fill(-1);
 for(let i=0;i<all.length;i+=3){
  const slice=Math.min(SLICES-1,Math.floor((all[i+2]-near)/span*SLICES));
  for(let d=0;d<AROUND;d+=1){const a=d/AROUND*Math.PI*2,reach=all[i]*Math.cos(a)+all[i+1]*Math.sin(a),k=slice*AROUND+d;if(reach>best[k]){best[k]=reach;pick[k]=i;}}
 }
 const chosen=[...new Set(pick)].filter(i=>i>=0),points=new Float32Array(chosen.length*3);
 chosen.forEach((i,n)=>{points[n*3]=all[i];points[n*3+1]=all[i+1];points[n*3+2]=all[i+2];});
 return points;
}

export function createWagonModel({scene,wagon,heightAt=()=>0,shadows=null}){
 let disposed=false,container=null,root=null,contact=null;const casters=[];
 const ready=(async()=>{
  container=await loadOwnedModel(scene,MODEL);
  if(disposed){container.dispose();container=null;return null;}
  root=new TransformNode('v03-story-wagon',scene);
  const body=new TransformNode('v03-story-wagon-body',scene);body.parent=root;body.rotation.y=WAGON_MODEL.turn;
  for(const node of container.rootNodes)node.parent=body;
  for(const mesh of container.meshes){mesh.isPickable=false;mesh.receiveShadows=true;}
  // Before the outline shells are added: the model's own vertices only.
  try{contact=outlinePoints(root,container.meshes);}catch(error){console.warn('[MoonForest 0.3] wagon outline points skipped',error);}
  // The canopy is seen from inside in the opening (the warrior wakes under it).
  for(const mesh of container.meshes)if(mesh.material)mesh.material.backFaceCulling=false;
  // Painted like the other actors (2026-11-19, user: it had no cartoon shading
  // and no shadow): the monsters' unlit toon material and character bands.
  try{applyMonsterToon(container);for(const mesh of container.meshes){mesh.metadata={...mesh.metadata,characterStyleOverrideGroup:'wolf'};if(mesh.material?.metadata?.moonforestMonsterToon)container.own(mesh.material);}}catch(error){console.warn('[MoonForest 0.3] wagon toon skipped',error);}
  try{attachCharacterOutlines(container,'wolf',{skipBoneProof:true});}catch(error){console.warn('[MoonForest 0.3] wagon outline skipped',error);}
  // Casts on the ground like the wolf (outline hulls excluded); removed on dispose.
  if(shadows)for(const mesh of container.meshes)if(mesh.getTotalVertices?.()>0&&!mesh.metadata?.moonforestOutline&&!/outline/i.test(mesh.name)){shadows.addShadowCaster(mesh,false);casters.push(mesh);}
  root.position.set(wagon.x,heightAt(wagon.x,wagon.z),wagon.z);
  root.rotationQuaternion=Quaternion.RotationYawPitchRoll(wagon.yaw??0,0,0);
  return root;
 })().catch(error=>{console.warn('[MoonForest 0.3] story wagon unavailable',error);return null;});
 return {
  ready,
  get root(){return root;},
  get contact(){return contact;},
  dispose(){
   disposed=true;contact=null;for(const mesh of casters.splice(0))try{shadows?.removeShadowCaster(mesh,false);}catch{}
   // Meshes, outline shells, loader materials and the toon copies all go with the model.
   if(container){container.dispose();container=null;}
   root?.dispose();root=null;
  },
 };
}
