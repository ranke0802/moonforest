import {Quaternion,Vector3} from '@babylonjs/core';
import {WOLF_V02_AIR_REACTION,WOLF_V02_GET_UP} from './wolf-v02-spec.js';

export const WOLF_V02_AIR_IMPULSE=Object.freeze({distance:1.65,start:.04,duration:.45,arc:.45,turnRate:2});
const clamp=value=>Math.max(0,Math.min(1,value)),angle=(target,current)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));
export class WolfV02AirReaction{
 constructor(e){this.e=e;this.direction=new Vector3();this.previous=new Vector3();this.reset();}
 reset(){this.brain=null;this.scene=null;this.map=null;this.basis=false;this.elapsed=0;this.previousCurve=0;this.height=0;this.travelled=0;this.yaw=0;this.targetYaw=0;}
 begin(source,contact=null){
  const e=this.e,clip=e.config.catalog.find(clip=>clip.name===WOLF_V02_AIR_REACTION),vector=clip?.endpointModelGlTF?.headMinusPelvis;
  if(!clip||!vector)return false;
  this.brain=e.brain;this.scene=e.world.scene;this.map=e.world.mapId;this.basis=true;this.previousCurve=this.height=this.travelled=0;this.previous.copyFrom(e.actor.position);
  this.direction.copyFrom(e.actor.position).subtractInPlace(source);this.direction.y=0;if(this.direction.lengthSquared()<1e-8)this.direction.set(-Math.sin(e.actor.rotation.y),0,-Math.cos(e.actor.rotation.y));this.direction.normalize();
  // Preserve impact momentum rather than forcing a fixed sideways heading.
  // A central blow gives a small natural diagonal turn; a flank blow gives more.
  this.startYaw=e.actor.rotation.y;const rx=(contact?.x??source.x)-e.actor.position.x,rz=(contact?.z??source.z)-e.actor.position.z,torque=rz*this.direction.x-rx*this.direction.z,sign=Math.abs(torque)>.02?Math.sign(torque):1;
  this.targetYaw=this.startYaw+sign*(.25+.40*Math.min(1,Math.abs(torque)/Math.max(.1,e.radius)));this.yaw=this.startYaw;return true;
 }
 valid(){const e=this.e;if(!this.basis)return false;if(this.brain!==e.brain||this.scene!==e.world.scene||this.map!==e.world.mapId){this.reset();return false;}return true;}
 applyMotion(){
  if(!this.valid())return false;const e=this.e,b=e.brain;if(b.state!==WOLF_V02_AIR_REACTION&&b.state!==WOLF_V02_GET_UP)return false;
  const time=b.state===WOLF_V02_AIR_REACTION?b.time:Infinity,t=clamp((time-WOLF_V02_AIR_IMPULSE.start)/WOLF_V02_AIR_IMPULSE.duration),curve=t*(2-t),delta=curve-this.previousCurve;
  if(delta>0){e.actor.position.x+=this.direction.x*WOLF_V02_AIR_IMPULSE.distance*delta;e.actor.position.z+=this.direction.z*WOLF_V02_AIR_IMPULSE.distance*delta;}this.previousCurve=curve;
  const smooth=t*t*(3-2*t);this.yaw=this.startYaw+angle(this.targetYaw,this.startYaw)*smooth;e.actor.rotation.y=this.yaw;this.height=4*WOLF_V02_AIR_IMPULSE.arc*t*(1-t);return true;
 }
 afterMotion(){if(!this.valid())return;const p=this.e.actor.position;if(this.e.brain.state===WOLF_V02_AIR_REACTION)this.travelled+=Math.hypot(p.x-this.previous.x,p.z-this.previous.z);this.previous.copyFrom(p);}
 alignWithHeight(){
  if(!this.valid()||this.e.brain.state!==WOLF_V02_AIR_REACTION||!this.height)return false;
  const e=this.e,root=e.animator.root,q=root.rotationQuaternion,yaw=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));
  Quaternion.RotationYawPitchRollToRef(-yaw,0,0,e.inverseRoot);e.carrier.rotationQuaternion??=Quaternion.Identity();e.carrier.rotationQuaternion.copyFrom(e.inverseRoot);
  e.actor.computeWorldMatrix(true);const m=e.actor.getWorldMatrix().m,scale=Math.max(1e-6,Math.hypot(m[4],m[5],m[6]));
  e.offset.set(-root.position.x,0,-root.position.z);e.offset.rotateByQuaternionToRef(e.inverseRoot,e.offset);e.offset.y=this.height/scale;e.carrier.position.copyFrom(e.offset);e.carrier.computeWorldMatrix(true);e.animator.ensurePoseCurrent();return true;
 }
 turnToward(target,dt){
  if(!this.valid())return target;
  const step=WOLF_V02_AIR_IMPULSE.turnRate*Math.max(0,dt),difference=angle(target,this.yaw);this.yaw+=Math.max(-step,Math.min(step,difference));
  if(Math.abs(difference)<.015){this.basis=false;this.brain=this.scene=this.map=null;this.yaw=target;}
  return this.yaw;
 }
 inspect(){return {active:this.valid(),height:this.height,distance:this.travelled,away:this.direction.asArray(),yaw:this.yaw,targetYaw:this.targetYaw};}
}
