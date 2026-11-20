// The driver's wagon horse (0.3). Since 2026-11-19 evening a rigged model
// (wagon-horse-rig.glb, rigged and animated in Blender after the wolf rig's
// layout, re-fitted to the horse): Horse_Idle, Horse_Gallop (transverse
// gallop footfalls), Horse_Nervous (head tosses, side-steps, pawing) and
// Horse_Rear. It stands between the wagon's shafts in its harness; play()
// cross-fades between the clips.
import {Quaternion,TransformNode,Vector3} from '@babylonjs/core';
import {loadOwnedModel} from './owned-model.js';
import {attachCharacterOutlines} from '../character-outlines.js';
import {applyMonsterToon} from '../monster-toon.js';

const MODEL=new URL('./models/wagon-horse-rig.glb',import.meta.url);
// Model units: 87 tall (ear tips), 98 long, feet at y=0, head toward +z.
// The wagon's heading is its root's local +Z; the horse stands 3.55 m out along it.
export const WAGON_HORSE=Object.freeze({height:2.05,ahead:3.55,side:0,turn:0,fade:.25});
export const HORSE_CLIPS=Object.freeze(['Horse_Idle','Horse_Walk','Horse_Gallop','Horse_Nervous','Horse_Rear','Horse_Fall','Horse_Down','Horse_GetUp']);
// Played once, holding the last frame.
const ONCE=new Set(['Horse_Rear','Horse_Fall','Horse_GetUp']);
// Down but alive (2026-11-20, user: it lay dead still): quick shallow breaths
// in the chest, the head coming off the ground now and then, a leg twitching.
// Set over the Horse_Down clip each frame it plays: a chest scale and four
// bones tipped a little, nothing allocated. [bone, its child joint, lift, kick]
const STIR=Object.freeze({breath:.018,breathRate:3.6,liftRate:.52,kickRate:1.7,bones:[['neck1','neck2',.1,0],['neck2','head',.17,0],['fcan.L','fhoof.L',0,.07],['hcan.R','hhoof.R',0,.05]]});
const from=new Vector3(),to=new Vector3(),turn=new Quaternion(),world=new Quaternion(),parentWorld=new Quaternion();
// Tips a bone so its joint points (dx,dy,dz) further that way (world units on the unit direction).
function nudge(bone,child,dx,dy,dz){
 bone.computeWorldMatrix(true);child.computeWorldMatrix(true);
 child.absolutePosition.subtractToRef(bone.absolutePosition,from);if(from.lengthSquared()<1e-10||!bone.parent||!bone.rotationQuaternion)return;
 from.normalize();to.set(from.x+dx,from.y+dy,from.z+dz).normalize();Quaternion.FromUnitVectorsToRef(from,to,turn);
 bone.parent.absoluteRotationQuaternion.conjugateToRef(parentWorld);turn.multiplyToRef(bone.absoluteRotationQuaternion,world);parentWorld.multiplyToRef(world,bone.rotationQuaternion);
}

export function createWagonHorse({scene,heightAt=()=>0,wagon,shadows=null}){
 let disposed=false,container=null,root=null,observer=null,chest=null,stirTime=0,breathing=false;const casters=[],stirBones=[];
 const groups=new Map();let current=null,previous=null,fade=0,wanted='Horse_Idle';
 function start(name,{loop=true}={}){
  const group=groups.get(name);wanted=name;if(!group||group===current)return;
  if(previous&&previous!==current)previous.stop();
  previous=current;current=group;fade=0;
  group.start(loop,1,group.from,group.to,false);group.speedRatio=1;group.setWeightForAllAnimatables(previous?0:1);
  if(!previous)fade=1;
 }
 const ready=(async()=>{
  container=await loadOwnedModel(scene,MODEL);
  if(disposed){container.dispose();container=null;return null;}
  root=new TransformNode('v03-wagon-horse',scene);
  const s=WAGON_HORSE.height/87;
  const body=new TransformNode('v03-wagon-horse-body',scene);body.parent=root;
  for(const node of container.rootNodes)node.parent=body;
  body.scaling.setAll(s);body.rotation.y=WAGON_HORSE.turn;
  for(const group of container.animationGroups){group.stop();groups.set(group.name,group);}
  const node=name=>container.transformNodes.find(row=>row.name===name)??null;
  chest=node('chest');for(const row of STIR.bones){const bone=node(row[0]),child=node(row[1]);if(bone&&child)stirBones.push({bone,child,lift:row[2],kick:row[3]});}
  for(const mesh of container.meshes){mesh.isPickable=false;mesh.receiveShadows=true;}
  // Painted like the other actors (2026-11-19, user: it had no cartoon shading
  // and no shadow): the monsters' unlit toon material and character bands.
  try{applyMonsterToon(container);for(const mesh of container.meshes){mesh.metadata={...mesh.metadata,characterStyleOverrideGroup:'wolf'};if(mesh.material?.metadata?.moonforestMonsterToon)container.own(mesh.material);}}catch(error){console.warn('[MoonForest 0.3] horse toon skipped',error);}
  try{attachCharacterOutlines(container,'wolf',{skipBoneProof:true});}catch(error){console.warn('[MoonForest 0.3] horse outline skipped',error);}
  // Casts on the ground like the wolf (outline hulls excluded); removed on dispose.
  if(shadows)for(const mesh of container.meshes)if(mesh.getTotalVertices?.()>0&&!mesh.metadata?.moonforestOutline&&!/outline/i.test(mesh.name)){shadows.addShadowCaster(mesh,false);casters.push(mesh);}
  const yaw=wagon.yaw??0,fx=Math.sin(yaw),fz=Math.cos(yaw);
  const x=wagon.x+fx*WAGON_HORSE.ahead,z=wagon.z+fz*WAGON_HORSE.ahead;
  root.position=new Vector3(x,heightAt(x,z),z);root.rotation.y=yaw;
  start(wanted,{loop:!ONCE.has(wanted)});
  observer=scene.onBeforeRenderObservable.add(()=>{
   const dt=Math.min(.1,scene.getEngine().getDeltaTime()/1000);
   if(current&&fade<1){
    fade=Math.min(1,fade+dt/WAGON_HORSE.fade);
    current.setWeightForAllAnimatables(fade);previous?.setWeightForAllAnimatables(1-fade);
    if(fade>=1&&previous){previous.stop();previous=null;}
   }
   // Lying on the ground: breathing and stirring over the clip.
   if(wanted==='Horse_Down'&&current&&fade>=1){
    stirTime+=dt;const lift=Math.max(0,Math.sin(stirTime*STIR.liftRate)),kick=Math.max(0,Math.sin(stirTime*STIR.kickRate+1.3)),head=lift*lift*lift*lift,jerk=kick*kick*kick*kick*kick*kick*kick*kick;
    if(chest){chest.scaling.setAll(1+STIR.breath*Math.sin(stirTime*STIR.breathRate));breathing=true;}
    const side=Math.cos(root.rotation.y),ahead=-Math.sin(root.rotation.y);
    for(const row of stirBones)nudge(row.bone,row.child,side*row.kick*jerk,row.lift*head+row.kick*jerk*.4,ahead*row.kick*jerk);
   }else if(breathing){breathing=false;chest?.scaling.setAll(1);}
  });
  return root;
 })().catch(error=>{console.warn('[MoonForest 0.3] wagon horse unavailable',error);return null;});
 return {
  ready,
  get root(){return root;},
  get clip(){return wanted;},
  // Cross-fades to a clip (Horse_Rear plays once and holds its last frame).
  play(name){if(name===wanted&&current)return;if(!groups.size){wanted=name;return;}start(name,{loop:!ONCE.has(name)});},
  // Playback rate of the current clip (the walk follows the wagon's speed).
  speed(rate){if(current&&Math.abs(current.speedRatio-rate)>.02)current.speedRatio=rate;},
  // Moves the horse (story ride); y follows the ground.
  place(x,z,yaw){if(!root)return;root.position.set(x,heightAt(x,z),z);root.rotation.y=yaw;},
  dispose(){
   disposed=true;for(const mesh of casters.splice(0))try{shadows?.removeShadowCaster(mesh,false);}catch{}
   if(observer){scene.onBeforeRenderObservable.remove(observer);observer=null;}
   for(const group of groups.values())group.stop();groups.clear();current=previous=null;chest=null;stirBones.length=0;
   // Meshes, outline shells, clips, loader materials and the toon copies all go with the model.
   if(container){container.dispose();container=null;}
   root?.dispose();root=null;
  },
 };
}
