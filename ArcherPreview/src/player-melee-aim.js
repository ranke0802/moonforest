import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {PLAYER_STRIKES} from './player-strikes.js';
import {segmentDistanceSquared} from './melee-collision.js';
import {playerDimensions} from './player-dimensions.js';
import {WolfV02ShieldSweep} from './wolf-v02-shield.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const angles=[-.26,-.13,0,.13,.26,.39,.52,.65,.78,.91,1.04,1.17];
const shieldYaws=[-1.04,-.78,-.52,-.26,0,.26,.52,.78,1.04],swordYaws=[0];
const swordLocal=[[-.002,.405,0],[-.002,-.951,0]],shieldLocal=[[-.66,0,.192],[.66,0,.192]];
const body=/^(haunch|flank|ribcage|belly|mane|skull|muzzle|jaw|body|torso|pelvis|spine|chest|neck|head)/;
function neighbors(center,step,low,high){
 const a=clamp(center-step,low,high),b=clamp(center,low,high),c=clamp(center+step,low,high);
 return a===b?b===c?[b]:[b,c]:b===c?[a,b]:[a,b,c];
}
function rotate(point,pivot,axis,angle,out){
 const x=point[0]-pivot.x,y=point[1]-pivot.y,z=point[2]-pivot.z,c=Math.cos(angle),s=Math.sin(angle),d=axis.x*x+axis.y*y+axis.z*z;
 out[0]=pivot.x+x*c+(axis.y*z-axis.z*y)*s+axis.x*d*(1-c);
 out[1]=pivot.y+y*c+(axis.z*x-axis.x*z)*s+axis.y*d*(1-c);
 out[2]=pivot.z+z*c+(axis.x*y-axis.y*x)*s+axis.z*d*(1-c);
}

// Adapt the real weapon pose to a short, fitted animal. Only arm rotations are
// added after native animation, then restored before the next sample. Damage
// still requires the ordinary real 3D weapon sweep; no synthetic low hit volume.
export class PlayerMeleeAim{
 constructor(asset){
  const nodes=[...asset.transformNodes,...asset.meshes];
  this.arms=Object.fromEntries(['Right','Left'].map(side=>{
   const node=nodes.find(n=>n.name==='mixamorig:'+side+'Arm');
   const forearm=nodes.find(n=>n.name==='mixamorig:'+side+'ForeArm'),hand=nodes.find(n=>n.name==='mixamorig:'+side+'Hand');
   return [side,node?{node,original:Quaternion.Identity(),branch:[node,...node.getDescendants(false)],changed:false,elbow:forearm&&hand?{node:forearm,hand,original:Quaternion.Identity(),changed:false}:null}:null];
  }));
  this.weapons={Right:nodes.find(n=>n.name==='Golden_Oathblade'),Left:nodes.find(n=>n.name==='Bunnyguard_Shield')};
  // Reuse the identical cached visible-face hull used by the real contact
  // sweep. A centreline cannot select the low edge of a held shield.
  this.shieldSweep=new WolfV02ShieldSweep();this.shieldLines=[];
  this.representativeShieldProfile=[];this.bodyCapsules=[];
  this.representativeShieldLines=[];this.elbowPivot=new Vector3();this.elbowAxis=new Vector3();this.upperDirection=new Vector3();this.lowerDirection=new Vector3();this.extended=[[0,0,0],[0,0,0]];
  this.axis=new Vector3();this.up=new Vector3(0,1,0);this.localAxis=new Vector3();this.localUp=new Vector3();this.pivot=new Vector3();this.point=new Vector3();this.inverseParent=Matrix.Identity();this.localDelta=Quaternion.Identity();this.yawDelta=Quaternion.Identity();this.combinedDelta=Quaternion.Identity();
  this.endpoints=[[0,0,0],[0,0,0]];this.yawed=[[0,0,0],[0,0,0]];this.rotated=[[0,0,0],[0,0,0]];this.reset();
 }
 reset(){this.restore();this.action=null;this.target=null;this.pitch=this.yaw=this.extension=0;this.lastPitch=this.lastExtension=0;this.lastError=null;this.resetFit();}
 resetFit(){this.fitReady=false;this.fitClock=0;this.lastWideTime=-Infinity;this.fitPitch=this.fitYaw=this.fitExtension=0;this.fullFitCount=this.localFitCount=0;}
 restore(){for(const arm of Object.values(this.arms))if(arm&&(arm.changed||arm.elbow?.changed)){if(arm.changed)arm.node.rotationQuaternion.copyFrom(arm.original);if(arm.elbow?.changed){arm.elbow.node.rotationQuaternion.copyFrom(arm.elbow.original);arm.elbow.changed=false;}arm.changed=false;for(const node of arm.branch){node.markAsDirty();node.computeWorldMatrix();}}}
 begin(result,player,target){
  if(result.actionId===this.action)return;
  this.action=result.actionId;this.pitch=this.yaw=this.extension=0;
  this.resetFit();
  const dx=(target?.actor.position.x??player.position.x)-player.position.x,dz=(target?.actor.position.z??player.position.z)-player.position.z,distance=Math.hypot(dx,dz);
  const forward=distance>1e-6?(dx*Math.sin(player.rotation.y)+dz*Math.cos(player.rotation.y))/distance:1;
  this.target=target?.regularWolfId&&target.active&&target.brain?.hp>0&&distance<3&&forward>.2?target:null;
 }
 apply(result,player,dt=1/60){
  this.restore();const strikes=PLAYER_STRIKES[result?.state],target=this.target;
  if(!strikes||result.actionId!==this.action||result.captured||result.staggered||result.guarding||result.shieldPending||!target?.active||target.brain?.hp<=0){this.pitch=0;return;}
  const time=result.clipTime??0,end=strikes.at(-1).to,envelope=clamp(time/.22,0,1)*clamp((end+.18-time)/.18,0,1);
  if(envelope<=0)return;
  const side=result.state==='shieldPush'?'Left':'Right',arm=this.arms[side],weapon=this.weapons[side];if(!arm||!weapon)return;
  // Equipment must really descend from the adjusted shoulder.
  if(!arm.branch.includes(weapon))return;
  const capsules=target.hurtCapsules?.();if(!capsules?.length)return;
  this.bodyCapsules.length=0;for(const capsule of capsules)if(body.test(capsule.name??''))this.bodyCapsules.push(capsule);
  if(!this.bodyCapsules.length)return;
  this.fitClock+=Math.max(0,dt);
  const local=side==='Left'?shieldLocal:swordLocal;
  weapon.computeWorldMatrix(true);const matrix=weapon.getWorldMatrix();
  for(let i=0;i<2;i++){Vector3.TransformCoordinatesFromFloatsToRef(...local[i],matrix,this.point);this.point.toArray(this.endpoints[i]);}
  let lines=[this.endpoints];
  if(side==='Left'&&this.shieldSweep.warm(weapon)){
   const profile=this.shieldSweep.profile;
   if(this.shieldLines.length!==profile.length){this.shieldLines=profile.map(()=>[[0,0,0],[0,0,0]]);const rows=[.17,.5,.83].map(part=>Math.round((profile.length-1)*part));this.representativeShieldLines=rows.map(row=>this.shieldLines[row]);this.representativeShieldProfile=rows.map(row=>profile[row]);}
   for(let row=0;row<this.representativeShieldProfile.length;row++)for(let end=0;end<2;end++){Vector3.TransformCoordinatesToRef(this.representativeShieldProfile[row][end],matrix,this.point);this.point.toArray(this.representativeShieldLines[row][end]);}
   lines=this.representativeShieldLines;
  }
  this.pivot.copyFrom(arm.node.getAbsolutePosition());this.axis.set(Math.cos(player.rotation.y),0,-Math.sin(player.rotation.y));
  let extensionLimit=0;
  if(side==='Left'&&arm.elbow){
   this.elbowPivot.copyFrom(arm.elbow.node.getAbsolutePosition());this.elbowPivot.subtractToRef(this.pivot,this.upperDirection);this.upperDirection.normalize();
   arm.elbow.hand.getAbsolutePosition().subtractToRef(this.elbowPivot,this.lowerDirection);this.lowerDirection.normalize();Vector3.CrossToRef(this.lowerDirection,this.upperDirection,this.elbowAxis);
   // Extend only the native elbow bend, leaving a seven-degree pre-bend. This
   // cannot hyperextend the chain and never changes either segment length.
   if(this.elbowAxis.lengthSquared()>1e-8){this.elbowAxis.normalize();extensionLimit=clamp(Math.acos(clamp(Vector3.Dot(this.upperDirection,this.lowerDirection),-1,1))-.12,0,Math.PI/3);}
  }
  const extensions=extensionLimit>.01?[0,extensionLimit*.5,extensionLimit]:[0];
  const margin=side==='Left'?playerDimensions(player).shieldStrikeRadius:playerDimensions(player).bladeRadius;
  let best=0,bestYaw=0,bestExtension=0,bestScore=Infinity,bestError=Infinity;
  const search=(pitches,yaws,elbows)=>{for(const extension of elbows)for(const yaw of yaws)for(const angle of pitches){
   let error=Infinity;
   for(const line of lines){
    if(extension){rotate(line[0],this.elbowPivot,this.elbowAxis,extension,this.extended[0]);rotate(line[1],this.elbowPivot,this.elbowAxis,extension,this.extended[1]);}
    const span=extension?this.extended:line;
    rotate(span[0],this.pivot,this.up,yaw,this.yawed[0]);rotate(span[1],this.pivot,this.up,yaw,this.yawed[1]);
    rotate(this.yawed[0],this.pivot,this.axis,angle,this.rotated[0]);rotate(this.yawed[1],this.pivot,this.axis,angle,this.rotated[1]);
    for(const capsule of this.bodyCapsules)error=Math.min(error,Math.max(0,Math.sqrt(segmentDistanceSquared(...this.rotated,...capsule.points))-capsule.radius-margin));
    if(error===0)break;
   }
   const score=error*error+(angle*angle+yaw*yaw+extension*extension)*.00025;
   if(score<bestScore){bestScore=score;best=angle;bestYaw=yaw;bestExtension=extension;bestError=error;}
  }};
  if(this.fitReady){
   // Follow the prior fit with at most 3x3x3 nearby candidates. The complete
   // bounded grid is a warm-up/recovery operation, not per-frame work.
   search(neighbors(this.fitPitch,.13,-.26,1.17),side==='Left'?neighbors(this.fitYaw,.26,-1.04,1.04):swordYaws,extensionLimit>.01?neighbors(this.fitExtension,.26,0,extensionLimit):[0]);this.localFitCount++;
  }
  const contactLead=time>=strikes[0].from-.28&&time<=end;
  if(!this.fitReady||(bestError>.005&&contactLead&&this.fitClock-this.lastWideTime>=.15)){
   search(angles,side==='Left'?shieldYaws:swordYaws,extensions);this.fitReady=true;this.lastWideTime=this.fitClock;this.fullFitCount++;
  }
  this.fitPitch=best;this.fitYaw=bestYaw;this.fitExtension=bestExtension;
  const desired=best*envelope,limit=Math.max(0,dt)*8;this.pitch+=clamp(desired-this.pitch,-limit,limit);this.yaw+=clamp(bestYaw*envelope-this.yaw,-limit,limit);this.extension+=clamp(bestExtension*envelope-this.extension,-limit,limit);
  // The native clip can straighten faster than the additive slew rate. Its
  // CURRENT bend allowance always takes precedence over temporal smoothing.
  this.extension=clamp(this.extension,0,extensionLimit);this.lastPitch=this.pitch;this.lastExtension=this.extension;this.lastError=bestError;
  if(Math.abs(this.pitch)+Math.abs(this.yaw)+Math.abs(this.extension)<1e-6)return;
  if(side==='Left'&&arm.elbow&&Math.abs(this.extension)>1e-6){
   arm.elbow.original.copyFrom(arm.elbow.node.rotationQuaternion);const parentMatrix=arm.elbow.node.parent.getWorldMatrix();parentMatrix.invertToRef(this.inverseParent);
   Vector3.TransformNormalToRef(this.elbowAxis,this.inverseParent,this.localAxis);this.localAxis.normalize();if(parentMatrix.determinant()<0)this.localAxis.scaleInPlace(-1);
   Quaternion.RotationAxisToRef(this.localAxis,this.extension,this.localDelta);this.localDelta.multiplyToRef(arm.elbow.original,arm.elbow.node.rotationQuaternion);arm.elbow.changed=true;
  }
  arm.original.copyFrom(arm.node.rotationQuaternion);const parentMatrix=arm.node.parent.getWorldMatrix();parentMatrix.invertToRef(this.inverseParent);
  Vector3.TransformNormalToRef(this.axis,this.inverseParent,this.localAxis);this.localAxis.normalize();if(parentMatrix.determinant()<0)this.localAxis.scaleInPlace(-1);
  Vector3.TransformNormalToRef(this.up,this.inverseParent,this.localUp);this.localUp.normalize();if(parentMatrix.determinant()<0)this.localUp.scaleInPlace(-1);
  Quaternion.RotationAxisToRef(this.localAxis,this.pitch,this.localDelta);Quaternion.RotationAxisToRef(this.localUp,this.yaw,this.yawDelta);this.localDelta.multiplyToRef(this.yawDelta,this.combinedDelta);this.combinedDelta.multiplyToRef(arm.original,arm.node.rotationQuaternion);arm.changed=true;
  for(const node of arm.branch){node.markAsDirty();node.computeWorldMatrix();}
 }
}
