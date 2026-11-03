import {Quaternion,Vector3} from '@babylonjs/core';
import {orderPoseNodes,refreshPoseMatrices} from '../../src/pose-matrices.js';
import {readFileSync} from 'node:fs';
const ORIGINAL_MOURNING_FRONT_RIGHT_DEATH=JSON.parse(readFileSync(new URL('original-front-right-tracks.json',import.meta.url))).filter(row=>row.path==='rotation'&&/_(Thigh|Shin|Foot)$/.test(row.name));

const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

// Only the front-right foot chain (the viewer's right in the reference front
// view) changes. The body/root, other limbs, face, morphs and death clock retain
// the original lament. All scratch storage is reused across deaths/resets.
export function createMourningDeathKneeSolver(asset,actor,channels,makeTrack){
 const names=['DEF_FrontFoot.R_Thigh','DEF_FrontFoot.R_Shin','DEF_FrontFoot.R_Foot'],bones=names.map(name=>asset.transformNodes.find(n=>n.name===name));
 if(bones.some(bone=>!bone))return null;
 const tracks=new Map();
 for(const row of ORIGINAL_MOURNING_FRONT_RIGHT_DEATH){
  const channel=channels.find(c=>c.target.name===row.name&&c.property==='rotationQuaternion');if(!channel||channel.track.keys.length*4!==row.values.length)return null;
  const keys=channel.track.keys.map((key,i)=>({frame:key.frame,value:Quaternion.FromArray(row.values,i*4)}));
  tracks.set(channel.target,makeTrack({targetProperty:'rotationQuaternion',framePerSecond:channel.track.fps,getKeys:()=>keys}));
 }
 const [thigh,shin,foot]=bones,nodes=orderPoseNodes(asset.transformNodes.filter(n=>n.name.startsWith('DEF_FrontFoot.R_')));
 const hip=new Vector3(),knee=new Vector3(),ankle=new Vector3(),direction=new Vector3(),desired=new Vector3(),planar=new Vector3(),back=new Vector3(),originalLower=new Vector3();
 const originalFoot=Quaternion.Identity(),delta=Quaternion.Identity(),world=Quaternion.Identity(),inverse=Quaternion.Identity(),local=Quaternion.Identity();
 function turn(bone,from,to,weight){
  Quaternion.FromUnitVectorsToRef(from,to,delta);delta.multiplyToRef(bone.absoluteRotationQuaternion,world);
  bone.parent.absoluteRotationQuaternion.conjugateToRef(inverse);inverse.multiplyToRef(world,local);
  Quaternion.SlerpToRef(bone.rotationQuaternion,local,weight,bone.rotationQuaternion);bone.rotationQuaternion.normalize();bone.markAsDirty();bone.computeWorldMatrix();
 }
 return {
  tracks,nodes,
  sample(channel,time){return (channel.property==='rotationQuaternion'?tracks.get(channel.target):null)?.sample(time)??channel.track.sample(time);},
  apply(time){
   const weight=smooth((time-.55)/2.6);if(weight<=0)return false;
   hip.copyFrom(thigh.getAbsolutePosition());knee.copyFrom(shin.getAbsolutePosition());ankle.copyFrom(foot.getAbsolutePosition());originalFoot.copyFrom(foot.absoluteRotationQuaternion);
   originalLower.set(ankle.x-knee.x,0,ankle.z-knee.z).normalize();
   direction.copyFrom(knee).subtractInPlace(hip);const upperLength=direction.length();direction.scaleInPlace(1/upperLength);
   planar.set(direction.x,0,direction.z).normalize();
   // Let the unchanged abdomen fall bring the knee to the floor. Its contact
   // clearance scales with the existing model, rather than lowering the actor.
   const targetY=actor.getAbsolutePosition().y+.0295*Math.abs(actor.scaling.x),drop=Math.max(upperLength*.2,Math.min(upperLength*.98,hip.y-targetY)),reach=Math.sqrt(Math.max(0,upperLength*upperLength-drop*drop));
   desired.set(planar.x*reach,-drop,planar.z*reach).normalize();turn(thigh,direction,desired,weight);
   shin.markAsDirty();shin.computeWorldMatrix();foot.markAsDirty();foot.computeWorldMatrix();knee.copyFrom(shin.getAbsolutePosition());
   direction.copyFrom(foot.getAbsolutePosition()).subtractInPlace(knee);const lowerLength=direction.length();direction.scaleInPlace(1/lowerLength);
   const ankleY=ankle.y-.021*Math.abs(actor.scaling.x)*weight,rise=Math.max(-lowerLength*.98,Math.min(lowerLength*.98,ankleY-knee.y)),fold=Math.sqrt(Math.max(0,lowerLength*lowerLength-rise*rise));
   back.set(-.12,0,-1).applyRotationQuaternionToRef(actor.absoluteRotationQuaternion,back);back.y=0;back.normalize();
   Vector3.LerpToRef(originalLower,back,weight,planar);planar.normalize();
   // Solve the vertical component exactly even during the blend: a partially
   // rotated thigh must not drag the foot through the floor on the way down.
   desired.set(planar.x*fold,rise,planar.z*fold).normalize();turn(shin,direction,desired,1);
   foot.parent.absoluteRotationQuaternion.conjugateToRef(inverse);inverse.multiplyToRef(originalFoot,foot.rotationQuaternion);foot.rotationQuaternion.normalize();
   refreshPoseMatrices(nodes);return true;
  },
 };
}
