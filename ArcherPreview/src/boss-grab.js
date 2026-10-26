import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import { ENEMY_ARENA_RADIUS } from './world-limits.js';

const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export const GRAB_ESCAPE_WINDOW = .3;
const localPosition=(node,actor)=>{
  actor.computeWorldMatrix(true);node.computeWorldMatrix(true);
  return Vector3.TransformCoordinates(node.getAbsolutePosition(),actor.getWorldMatrix().clone().invert());
};

/** Moves the complete equipped actor, keeping the captured ankle at the animated palm.
 * The source skeleton, clips and equipment attachments are never rewritten. */
export class BossGrab {
  constructor(onControl=()=>{},onImpact=()=>{},{heightAt,constrainLanding}={}){this.onControl=onControl;this.onImpact=onImpact;this.heightAt=heightAt;this.constrainLanding=constrainLanding;this.phase=null;}
  groundAt(position){return this.heightAt?.(position.x,position.z)??this.savedY;}
  get active(){return this.phase!==null;}
  get holding(){return this.phase==='holding';}
  get canEscape(){return this.holding&&this.time<=GRAB_ESCAPE_WINDOW+1e-9;}
  get label(){return this.holding?'붙잡힘 · 회전':this.phase==='flight'?'던져짐':this.active?'착지 · 경직':'';}
  start(player,nodes,bossSerial,critical=false){
    if(this.active||!nodes?.['mixamorig:RightFoot']||!nodes?.['mixamorig:Head'])return false;
    this.player=player;this.serial=bossSerial;this.critical=critical;this.phase='holding';this.time=0;
    this.savedRotation=player.rotation.clone();this.savedQuaternion=player.rotationQuaternion?.clone()||null;this.savedY=player.position.y;
    this.startPosition=player.position.clone();
    this.startRotation=this.savedQuaternion?.clone()||Quaternion.FromEulerVector(this.savedRotation);
    this.foot=localPosition(nodes['mixamorig:RightFoot'],player);
    this.points=Object.entries(nodes).filter(([name])=>name.startsWith('mixamorig:')).map(([,node])=>localPosition(node,player));
    const bodyAxis=localPosition(nodes['mixamorig:Head'],player).subtract(this.foot).normalize();
    const front=Vector3.Forward().subtract(bodyAxis.scale(Vector3.Dot(Vector3.Forward(),bodyAxis))).normalize();
    this.localFrame=Quaternion.RotationQuaternionFromAxis(Vector3.Cross(bodyAxis,front).normalize(),bodyAxis,front);
    this.startFoot=nodes['mixamorig:RightFoot'].getAbsolutePosition().clone();
    this.previousPosition=player.position.clone();this.velocity=Vector3.Zero();this.radial=new Vector3(0,0,1);
    this.onControl(true);return true;
  }
  hold(dt,boss,nodes){
    const hand=nodes['mixamorig:RightHand'],forearm=nodes['mixamorig:RightForeArm'];
    hand.computeWorldMatrix(true);forearm.computeWorldMatrix(true);
    const palm=hand.getAbsolutePosition().add(hand.getAbsolutePosition().subtract(forearm.getAbsolutePosition()).normalize().scale(.06));
    const radial=palm.subtract(boss.position);radial.y=0;
    if(radial.lengthSquared()>.01)this.radial.copyFrom(radial.normalize());
    const desired=Quaternion.RotationQuaternionFromAxis(Vector3.Cross(this.radial,Vector3.Up()).normalize(),this.radial,Vector3.Up()).multiply(this.localFrame.conjugate());
    this.player.rotationQuaternion=Quaternion.Slerp(this.startRotation,desired,smooth(this.time/.14));
    const offset=Vector3.TransformCoordinates(this.foot,Matrix.Compose(this.player.scaling,this.player.rotationQuaternion,Vector3.Zero()));
    this.player.position.copyFrom(Vector3.Lerp(this.startFoot,palm,smooth(this.time/.14)).subtract(offset));
    if(dt>0)this.velocity=Vector3.Lerp(this.velocity,this.player.position.subtract(this.previousPosition).scale(1/dt),.45);
    this.previousPosition.copyFrom(this.player.position);this.player.computeWorldMatrix(true);
  }
  throw(){
    this.phase='flight';this.time=0;this.flightStart=this.player.position.clone();
    this.flightRotation=this.player.rotationQuaternion?.clone()||this.startRotation.clone();
    const direction=this.velocity.clone();direction.y=0;
    if(direction.lengthSquared()<.1)direction.copyFrom(this.radial);
    this.flightEnd=this.flightStart.add(direction.normalize().scale(3.2));
    const radius=Math.hypot(this.flightEnd.x,this.flightEnd.z);
    if(radius>ENEMY_ARENA_RADIUS){this.flightEnd.x*=ENEMY_ARENA_RADIUS/radius;this.flightEnd.z*=ENEMY_ARENA_RADIUS/radius;}
    this.constrainLanding?.(this.flightEnd,this.flightStart);
    const matrix=Matrix.Compose(this.player.scaling,this.flightRotation,Vector3.Zero());
    const lowest=Math.min(...this.points.map(p=>Vector3.TransformCoordinates(p,matrix).y));
    this.flightClearance=Math.max(.1,-lowest+.13);
    this.flightEnd.y=this.groundAt(this.flightEnd)+this.flightClearance;
  }
  update(dt,{boss,nodes,serial,state,clipTime,duration,interrupted=false}){
    if(!this.active||dt<=0)return;
    this.time+=dt;
    if(this.holding){
      this.hold(dt,boss,nodes);
      if(interrupted||serial!==this.serial||state!=='Skill_02'||clipTime>=duration*.88)this.throw();
    }else if(this.phase==='flight'){
      const t=Math.min(1,this.time/.65);
      this.player.position.copyFrom(Vector3.Lerp(this.flightStart,this.flightEnd,t));this.player.position.y+=4*.75*t*(1-t);
      if(this.heightAt)this.player.position.y=Math.max(this.player.position.y,this.groundAt(this.player.position)+this.flightClearance);
      if(t>=1){this.phase='recover';this.time=0;this.onImpact(this.critical);}
    }else{
      const t=smooth(this.time/.6);
      this.player.rotationQuaternion=Quaternion.Slerp(this.flightRotation,this.startRotation,t);
      this.player.position.y=this.flightEnd.y+(this.groundAt(this.player.position)-this.flightEnd.y)*t;
      if(t>=1)this.reset();
    }
    this.player.computeWorldMatrix(true);
  }
  escape(){
    if(!this.canEscape)return false;
    // Restore the safe grounded capture point before beginning the player's roll.
    this.player.position.copyFrom(this.startPosition);
    this.reset();return true;
  }
  reset(){
    if(!this.active)return;
    this.player.rotation.copyFrom(this.savedRotation);this.player.rotationQuaternion=this.savedQuaternion;
    this.player.position.y=this.groundAt(this.player.position);this.player.computeWorldMatrix(true);
    this.phase=null;this.onControl(false);
  }
}
