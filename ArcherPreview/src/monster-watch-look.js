import {Quaternion,Vector3} from '@babylonjs/core';
import {playerDimensions} from './player-dimensions.js';
import {orderPoseNodes} from './pose-matrices.js';

const up=new Vector3(0,1,0),clamp=(value,limit)=>Math.max(-limit,Math.min(limit,value)),angle=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
// The existing bear's headfront child is the measured forward marker. Never
// reuse the quadruped's local +Y axis, alter its rig or turn the actor/torso.
export class MonsterWatchLook{
 constructor(encounter){
  this.e=encounter;this.head=encounter.nodes?.['mixamorig:Head'];this.front=encounter.nodes?.headfront;const neck=encounter.nodes?.['mixamorig:Neck'];
  this.slots=[];this.sample=null;
  if(this.head&&this.front&&neck&&this.front.parent===this.head){
   for(const node of [neck,this.head])this.slots.push({node,original:Quaternion.Identity(),applied:Quaternion.Identity(),changed:false,branch:orderPoseNodes([node,...node.getDescendants(false)])});
  }
  this.origin=new Vector3();this.forward=new Vector3();this.target=new Vector3();this.right=new Vector3();
  this.delta=Quaternion.Identity();this.world=Quaternion.Identity();this.parent=Quaternion.Identity();this.desired=Quaternion.Identity();this.local=Quaternion.Identity();
 }
 refresh(slot){slot.node.markAsDirty();for(const node of slot.branch)node.computeWorldMatrix();}
 restore(){
  const samples=this.e.animator?.samples,sameSample=!Number.isFinite(samples)||samples===this.sample;
  for(const slot of this.slots){
   if(slot.changed&&sameSample&&slot.node.rotationQuaternion?.equalsWithEpsilon(slot.applied,1e-10)){slot.node.rotationQuaternion.copyFrom(slot.original);this.refresh(slot);}
   slot.changed=false;
  }
 }
 rotate(slot,axis,radians){
  if(Math.abs(radians)<1e-8)return;
  const node=slot.node;if(!slot.changed){slot.original.copyFrom(node.rotationQuaternion);slot.changed=true;}
  node.getWorldMatrix();this.world.copyFrom(node.absoluteRotationQuaternion);Quaternion.RotationAxisToRef(axis,radians,this.delta);this.delta.multiplyToRef(this.world,this.desired);
  node.parent.getWorldMatrix();this.parent.copyFrom(node.parent.absoluteRotationQuaternion).conjugateInPlace();this.parent.multiplyToRef(this.desired,this.local);node.rotationQuaternion.copyFrom(this.local).normalize();this.refresh(slot);slot.applied.copyFrom(node.rotationQuaternion);
 }
 direction(){
  this.origin.copyFrom(this.head.getAbsolutePosition());this.forward.copyFrom(this.front.getAbsolutePosition()).subtractInPlace(this.origin);return this.forward.lengthSquared()>1e-10;
 }
 aim(slot,fraction,yawLimit,pitchLimit){
  if(!this.direction())return;
  let yaw=Math.atan2(this.forward.x,this.forward.z),desired=Math.atan2(this.target.x-this.origin.x,this.target.z-this.origin.z);
  this.rotate(slot,up,clamp(angle(desired,yaw)*fraction,yawLimit));
  if(!this.direction())return;
  yaw=Math.atan2(this.forward.x,this.forward.z);this.right.set(Math.cos(yaw),0,-Math.sin(yaw));
  const pitch=Math.atan2(this.forward.y,Math.hypot(this.forward.x,this.forward.z)),targetPitch=Math.atan2(this.target.y-this.origin.y,Math.hypot(this.target.x-this.origin.x,this.target.z-this.origin.z));
  this.rotate(slot,this.right,-clamp((targetPitch-pitch)*fraction,pitchLimit));
 }
 apply(){
  this.restore();const e=this.e,state=e.territoryState,b=e.brain;
  if(e.kind!=='bear'||!e.bearSize||!state?.enabled||(state.phase!=='watch'&&state.phase!=='disengage')||e.active===false||!b||b.hp<=0||b.stagger>0||b.mode!=='idle'||!e.player?.position||this.slots.length!==2)return false;
  for(const slot of this.slots)if(!slot.node.rotationQuaternion||!slot.node.parent)return false;
  const position=e.player.position;if(!Number.isFinite(position.x)||!Number.isFinite(position.y)||!Number.isFinite(position.z))return false;
  this.sample=e.animator?.samples;this.target.copyFrom(e.player.position);this.target.y+=playerDimensions(e.player).bodyAimHeight;
  this.aim(this.slots[0],.45,.28,.16);this.aim(this.slots[1],1,.45,.28);return true;
 }
}
