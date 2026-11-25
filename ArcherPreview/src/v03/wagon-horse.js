// The driver's wagon horse (0.3). Since 2026-11-19 evening a rigged model
// (wagon-horse-rig.glb, rigged and animated in Blender after the wolf rig's
// layout, re-fitted to the horse): Horse_Idle, Horse_Gallop (transverse
// gallop footfalls), Horse_Nervous (head tosses, side-steps, pawing) and
// Horse_Rear. It stands between the wagon's shafts in its harness; play()
// cross-fades between the clips.
import {Quaternion,TransformNode,Vector3} from '@babylonjs/core';
import {loadOwnedModel} from './owned-model.js';
import {attachCharacterOutlines} from '../character-outlines.js';
import {HorseCoat} from './horse-coat.js';
import {applyMonsterToon} from '../monster-toon.js';
import {prepareShadowFade,shadowFadeAttribute} from '../village-shadow-fade.js';

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

// Barycentric seat on the shipped back triangle 4456/4457/4458 at x=z=0.
// Each row is that triangle's weighted bind-local contact point for one joint.
const saddleJoints=[
 ['chest',.7104791,-.00478,3.60453,-4.30153],
 ['spine',.2525823,.02670,19.97983,-4.73213],
 ['scap.R',.0175231,4.54028,-5.63419,7.32146],
 ['scap.L',.0194156,-4.78952,-5.74710,7.47608]
];
// Babylon resets these SmartArrays by shortening their logical count. A
// dismounted horse can still occupy the previous frame's entries indefinitely.
function forgetMountNodes(list,owned){
 if(!list)return;
 for(let i=list.data.length-1;i>=0;i--){
  if(!owned.has(list.data[i]))continue;
  if(i<list.length){list.data.copyWithin(i,i+1,list.length);list.data[--list.length]=null;}
  else list.data[i]=null;
 }
}
export function createWagonHorse({scene,heightAt=()=>0,wagon,shadows=null,mounted=false,initialOpacity=1}){
 let disposed=false,container=null,root=null,observer=null,chest=null,stirTime=0,breathing=false;const casters=[],stirBones=[];
 const groups=new Map();let current=null,previous=null,fade=0,wanted='Horse_Idle';
 const loadController=mounted?new AbortController():null,saddle=[];
 const fadingMeshes=[],fadingCasters=[];
 let coatPaint=null;
 let opacity=Math.min(1,Math.max(0,initialOpacity));
 function setOpacity(value){
  value=Math.min(1,Math.max(0,value));
  if(value===opacity)return;
  opacity=value;
  for(const mesh of fadingMeshes)mesh.visibility=value;
  for(const mesh of fadingCasters)mesh.instancedBuffers[shadowFadeAttribute]=value;
 }
 function start(name,{loop=true}={}){
  const group=groups.get(name);wanted=name;if(!group||group===current)return;
  if(previous&&previous!==current)previous.stop();
  previous=current;current=group;fade=0;
  group.start(loop,1,group.from,group.to,false);group.speedRatio=1;group.setWeightForAllAnimatables(previous?0:1);
  if(!previous)fade=1;
 }
 const ready=(async()=>{
  container=await loadOwnedModel(scene,MODEL,{signal:loadController?.signal});
  if(disposed){container.dispose();container=null;return null;}
  root=new TransformNode('v03-wagon-horse',scene);
  const s=WAGON_HORSE.height/87;
  const body=new TransformNode('v03-wagon-horse-body',scene);body.parent=root;
  for(const node of container.rootNodes)node.parent=body;
  body.scaling.setAll(s);body.rotation.y=WAGON_HORSE.turn;
  for(const group of container.animationGroups){group.stop();groups.set(group.name,group);}
  const node=name=>container.transformNodes.find(row=>row.name===name)??null;
  if(mounted)for(const [name,weight,x,y,z] of saddleJoints){const bone=node(name);if(bone)saddle.push({bone,weight,x,y,z});}
  chest=node('chest');for(const row of STIR.bones){const bone=node(row[0]),child=node(row[1]);if(bone&&child)stirBones.push({bone,child,lift:row[2],kick:row[3]});}
  for(const mesh of container.meshes){mesh.isPickable=false;mesh.receiveShadows=true;}
  // The outdoor shadow map already has ordered coverage for a fractional
  // shadow. Keep its depth pass on the source material's opaque queue even
  // while the camera draws the translucent paint, using the same skinned mesh.
  if(mounted&&shadows?.customShaderOptions?.shaderName==='moonforestShadowFade'){
   for(const mesh of container.meshes){
    if(!mesh.getTotalVertices()||mesh.name==='harness'||!mesh.material)continue;
    prepareShadowFade(mesh);mesh.instancedBuffers[shadowFadeAttribute]=opacity;
    shadows.getShadowMap().setMaterialForRendering(mesh,mesh.material);fadingCasters.push(mesh);
   }
  }
  // Painted like the other actors (2026-11-19, user: it had no cartoon shading
  // and no shadow): the monsters' unlit toon material and character bands.
  try{applyMonsterToon(container);for(const mesh of container.meshes){mesh.metadata={...mesh.metadata,characterStyleOverrideGroup:'wolf'};if(mesh.material?.metadata?.moonforestMonsterToon)container.own(mesh.material);}}catch(error){console.warn('[MoonForest 0.3] horse toon skipped',error);}
  try{attachCharacterOutlines(container,'wolf',{skipBoneProof:true});}catch(error){console.warn('[MoonForest 0.3] horse outline skipped',error);}
  if(mounted)for(const mesh of container.meshes){
   if(mesh.name==='harness'||mesh.name.startsWith('harness /')){mesh.setEnabled(false);continue;}
   if(!mesh.getTotalVertices())continue;
   // The imported glTF OPAQUE flag takes precedence over mesh.visibility.
   // The personal horse owns this painted material. Its original opaque draw
   // returns at visibility 1; the outline already binds its own visibility.
   if(mesh.material?.metadata?.moonforestMonsterToon&&mesh.material.transparencyMode===0){
    mesh.material.transparencyMode=null;mesh.material.forceDepthWrite=true;
   }
   if(mesh.name==='wagon_horse'&&mesh.material?.metadata?.moonforestMonsterToon)coatPaint=new HorseCoat(mesh.material);
   fadingMeshes.push(mesh);mesh.visibility=opacity;
  }
  // Casts on the ground like the wolf (outline hulls excluded); removed on dispose.
  if(shadows)for(const mesh of container.meshes)if(mesh.isEnabled(false)&&mesh.getTotalVertices?.()>0&&!mesh.metadata?.moonforestOutline&&!/outline/i.test(mesh.name)){shadows.addShadowCaster(mesh,false);casters.push(mesh);}
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
 })().catch(error=>{if(!disposed)console.warn('[MoonForest 0.3] wagon horse unavailable',error);return null;});
 return {
  ready,
  get root(){return root;},
  get clip(){return wanted;},
  setOpacity,
  setCoat(value){coatPaint?.setCoat(value);},
  saddleContactToRef(out){
   if(saddle.length!==saddleJoints.length)return false;
   root.markAsDirty();
   out.set(0,0,0);
   for(const s of saddle){
    const m=s.bone.computeWorldMatrix().m;
    out.x+=s.weight*(s.x*m[0]+s.y*m[4]+s.z*m[8]+m[12]);
    out.y+=s.weight*(s.x*m[1]+s.y*m[5]+s.z*m[9]+m[13]);
    out.z+=s.weight*(s.x*m[2]+s.y*m[6]+s.z*m[10]+m[14]);
   }
   return true;
  },
  // Cross-fades to a clip (Horse_Rear plays once and holds its last frame).
  play(name){if(name===wanted&&current)return;if(!groups.size){wanted=name;return;}start(name,{loop:!ONCE.has(name)});},
  // Playback rate of the current clip (the walk follows the wagon's speed).
  speed(rate){if(current&&Math.abs(current.speedRatio-rate)>.02)current.speedRatio=rate;},
  // Moves the horse (story ride); y follows the ground.
  place(x,z,yaw){if(!root)return;root.position.set(x,heightAt(x,z),z);root.rotation.y=yaw;},
  dispose(){
   disposed=true;coatPaint=null;loadController?.abort();saddle.length=fadingMeshes.length=fadingCasters.length=0;
   for(const mesh of casters)try{shadows?.removeShadowCaster(mesh,false);}catch{}
   casters.length=0;
   if(observer){scene.onBeforeRenderObservable.remove(observer);observer=null;}
   for(const group of groups.values())group.stop();groups.clear();current=previous=null;chest=null;stirBones.length=0;
   // Meshes, outline shells, clips, loader materials and the toon copies all go with the model.
   if(container){
    if(mounted){
     const owned=new Set([...container.meshes,...container.transformNodes]);
     for(const renderer of scene.objectRenderers)forgetMountNodes(renderer.getActiveMeshes(),owned);
     forgetMountNodes(scene._registeredForLateAnimationBindings,owned);
    }
    container.dispose();container=null;
   }
   root?.dispose();root=null;
  },
 };
}
