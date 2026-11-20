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
// The shafts (2026-11-20, user: with the horse down they stuck out in the air
// over it). Measured on the model in the root's frame: the two poles leave the
// wagon's front at (0, 0.74, 1.17) and end 2.96 m on, 0.38 m higher, 0.92 m
// apart. They hang on a hinge node there; with the horse down the hinge turns
// them so the tips lie on the ground beside the horse's back, whatever the
// wagon does behind them (on its side, half lifted, upright again).
export const WAGON_SHAFTS=Object.freeze({mesh:'covered_wagon_primitive1',hinge:[0,.74,1.17],reach:2.96,rise:.38,ahead:4.05,aside:.25,asideTipped:1.1,clear:.06});
const SHAFT_LENGTH=Math.hypot(WAGON_SHAFTS.reach,WAGON_SHAFTS.rise),SHAFT_REST=Math.atan2(WAGON_SHAFTS.rise,WAGON_SHAFTS.reach);
const hingeAt=new Vector3(),aimed=new Quaternion(),blended=new Quaternion(),unroll=new Quaternion();
let raiseSign=0;
// Which sign of pitch lifts the local +Z (checked once, handedness-proof).
function pitchUp(){if(!raiseSign){const probe=Vector3.TransformCoordinates(new Vector3(0,0,1),Matrix.RotationYawPitchRoll(0,.3,0));raiseSign=probe.y>0?1:-1;}return raiseSign;}

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
 let disposed=false,container=null,root=null,contact=null,hinge=null,dropped=0;const casters=[];
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
  // The shafts move on their own node (the outline shell is the mesh's child).
  const shafts=container.meshes.find(mesh=>mesh.name===WAGON_SHAFTS.mesh);
  if(shafts){hinge=new TransformNode('v03-story-wagon-shafts',scene);hinge.parent=root;hinge.position.set(WAGON_SHAFTS.hinge[0],WAGON_SHAFTS.hinge[1],WAGON_SHAFTS.hinge[2]);hinge.rotationQuaternion=Quaternion.Identity();hinge.computeWorldMatrix(true);shafts.setParent(hinge);}
  root.position.set(wagon.x,heightAt(wagon.x,wagon.z),wagon.z);
  root.rotationQuaternion=Quaternion.RotationYawPitchRoll(wagon.yaw??0,0,0);
  return root;
 })().catch(error=>{console.warn('[MoonForest 0.3] story wagon unavailable',error);return null;});
 return {
  ready,
  get root(){return root;},
  get contact(){return contact;},
  // weight 0: fixed to the wagon (standing in harness) .. 1: tips on the
  // ground beside the fallen horse. tip: the wagon's own tip (0..1); side: the
  // side it falls to (the horse's back lies that way). Called per frame while
  // the horse is down; a few quaternion operations, nothing allocated.
  dropShafts(weight,tip=0,side=-1){
   if(!hinge||!root)return;
   if(!(weight>0)){if(dropped){dropped=0;hinge.rotationQuaternion.set(0,0,0,1);}return;}
   dropped=weight;
   const yaw=wagon.yaw??0,fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw),S=WAGON_SHAFTS,aside=side*(S.aside+S.asideTipped*Math.max(0,Math.min(1,tip)));
   const gx=wagon.x+fx*S.ahead+rx*aside,gz=wagon.z+fz*S.ahead+rz*aside;
   root.computeWorldMatrix(true);Vector3.TransformCoordinatesFromFloatsToRef(S.hinge[0],S.hinge[1],S.hinge[2],root.getWorldMatrix(),hingeAt);
   const heading=Math.atan2(gx-hingeAt.x,gz-hingeAt.z),drop=Math.max(-.95,Math.min(.95,(heightAt(gx,gz)+S.clear-hingeAt.y)/SHAFT_LENGTH));
   Quaternion.RotationYawPitchRollToRef(heading,pitchUp()*(Math.asin(drop)-SHAFT_REST),0,aimed);
   Quaternion.SlerpToRef(root.rotationQuaternion,aimed,Math.min(1,weight),blended);
   // local = parent^-1 * world
   root.rotationQuaternion.conjugateToRef(unroll);unroll.multiplyToRef(blended,hinge.rotationQuaternion);
  },
  dispose(){
   disposed=true;contact=null;hinge=null;for(const mesh of casters.splice(0))try{shadows?.removeShadowCaster(mesh,false);}catch{}
   // Meshes, outline shells, loader materials and the toon copies all go with the model.
   if(container){container.dispose();container=null;}
   root?.dispose();root=null;
  },
 };
}
