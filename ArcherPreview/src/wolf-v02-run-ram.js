import {Quaternion,Vector3} from '@babylonjs/core';
import overlay from './wolf-v02-run-ram-overlay.json' with {type:'json'};
import {WOLF_CLIPS} from './wolf-spec.js';
import {playerDimensions} from './player-dimensions.js';
import {wolfContactShape} from './wolf-v02-contact-shapes.js';

export const WOLF_V02_RUN_RAM_OVERLAY=overlay;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
function indexAt(times,time){let index=0;while(index<times.length-2&&time>times[index+1])index++;return index;}
export function runRamWeight(time){const times=overlay.envelope.times,i=indexAt(times,time),j=i+1,t=clamp((time-times[i])/Math.max(1e-9,times[j]-times[i]),0,1);return overlay.envelope.weights[i]+(overlay.envelope.weights[j]-overlay.envelope.weights[i])*t;}
export function runRamForehead(phase,out){
 const table=overlay.contactCenter,clock=((phase%overlay.sourcePhaseDuration)+overlay.sourcePhaseDuration)%overlay.sourcePhaseDuration,i=indexAt(table.phaseTimes,clock),j=i+1,t=clamp((clock-table.phaseTimes[i])/Math.max(1e-9,table.phaseTimes[j]-table.phaseTimes[i]),0,1);
 out.set(table.phasePoints[i][0]+(table.phasePoints[j][0]-table.phasePoints[i][0])*t,table.phasePoints[i][1]+(table.phasePoints[j][1]-table.phasePoints[i][1])*t,table.phasePoints[i][2]+(table.phasePoints[j][2]-table.phasePoints[i][2])*t);return out;
}

// The ordinary sampler remains the only full-body pose source. This actor-owned
// partial layer uses the same original-pose slots and affected-branch refresh as
// attention/foot support; no pose cloning or second native animation runs live.
export class WolfV02RunRamLayer{
 constructor(e){
  this.e=e;this.a=Quaternion.Identity();this.b=Quaternion.Identity();this.delta=Quaternion.Identity();this.weighted=Quaternion.Identity();this.out=Quaternion.Identity();this.identity=Quaternion.Identity();
  this.warningPoint=new Vector3();this.foreheadOffset=Vector3.FromArray(overlay.contactCenter.localOffset);
  this.rows=overlay.channels.map(channel=>({channel,node:e.nodes[channel.node]}));
  for(const {node}of this.rows)if(!e.v02Pose.slots.has(node)){
   const slot={node,original:Quaternion.Identity(),changed:false,branch:[]};
   for(const descendant of e.animator.nodes)for(let parent=descendant;parent;parent=parent.parent)if(parent===node){slot.branch.push(descendant);break;}
   e.v02Pose.slots.set(node,slot);
  }
 }
 apply(){
  const e=this.e,b=e.brain;if(b.state!==WOLF_CLIPS.run||!b.action?.momentumRam)return;
  const phase=((b.time-overlay.sourcePhaseStart)%overlay.sourcePhaseDuration+overlay.sourcePhaseDuration)%overlay.sourcePhaseDuration,i=indexAt(overlay.phaseTimes,phase),j=i+1,t=clamp((phase-overlay.phaseTimes[i])/Math.max(1e-9,overlay.phaseTimes[j]-overlay.phaseTimes[i]),0,1),weight=runRamWeight(b.ramLayerTime??overlay.duration);
  if(weight>0)for(const {channel,node}of this.rows){
   Quaternion.FromArrayToRef(channel.values[i],0,this.a);Quaternion.FromArrayToRef(channel.values[j],0,this.b);Quaternion.SlerpToRef(this.a,this.b,t,this.delta);Quaternion.SlerpToRef(this.identity,this.delta,weight,this.weighted);
   e.v02Pose.remember(node);node.rotationQuaternion.multiplyToRef(this.weighted,this.out);node.rotationQuaternion.copyFrom(this.out);e.v02Pose.refresh(node);
  }
  if(b.ramStage==='chase'||b.ramStage==='brake'){
   const target=e.v02Ram.geometryValid?e.v02Ram.aim:e.player.position,height=e.v02Ram.geometryValid?0:1;
   e.v02Pose.aimJoint(e.nodes.neck,e.nodes.head,target,height,.72,.55,.6);e.v02Pose.aimJoint(e.nodes.head,e.nodes.head,target,height,.72,.60);
  }
 }
 updateWarning(){
  const e=this.e,b=e.brain;if(!b.action?.momentumRam)return false;
  const phase=e.v02Ram.current,ram=b.ramStage==='charge',maul=b.ramStage==='maul';
  if(!e.active||b.hp<=0||b.stagger||!phase||phase.resolved||!ram&&!maul||maul&&(!e.v02Ram.proneValid||!b.ramPawBraced)){e.ring.isVisible=false;return true;}
  const name=ram?'head':'jaw',shape=wolfContactShape(name,phase.config.kind),offset=ram?this.foreheadOffset:shape.offset,radius=(ram?overlay.contactCenter.radiusWorld:shape.radius)+playerDimensions(e.player).moveRadius;
  Vector3.TransformCoordinatesToRef(offset,e.nodes[name].getWorldMatrix(),this.warningPoint);const p=this.warningPoint,active=(b.ramContactTime??0)>=phase.config.contactStart;
  e.ring.isVisible=true;e.ring.position.setAll(0);e.ring.material.alpha=.88;e.ring.material.emissiveColor.set(1,active?.08:.55,active?.025:.08);
  if(this.warningX===p.x&&this.warningZ===p.z&&this.warningRadius===radius&&this.warningTerrain===e.world.terrain)return true;
  this.warningX=p.x;this.warningZ=p.z;this.warningRadius=radius;this.warningTerrain=e.world.terrain;const positions=e.v02Telegraph.positions;
  for(let i=0;i<=64;i++)for(let side=0;side<2;side++){const angle=i*Math.PI*2/64,r=radius+(side?1:-1)*.045,x=p.x+Math.sin(angle)*r,z=p.z+Math.cos(angle)*r,k=i*6+side*3;positions[k]=x;positions[k+1]=(e.world.terrain?.heightAt?.(x,z)??e.actor.position.y)+.045;positions[k+2]=z;}
  e.ring.updateVerticesData('position',positions,true);return true;
 }
}

// The low authored pose already supports the body. For R14, the forepaws finish
// that support on the actual fallen torso before either jaw can score damage.
export class WolfV02ForepawBrace{
 constructor(e){this.e=e;this.serial=null;this.from=[new Vector3(),new Vector3()];}
 apply(){
  const e=this.e,b=e.brain;if(!b.action?.momentumRam||!['settle','maul'].includes(b.ramStage)||!e.v02Ram.proneValid){b.ramPawBraced=false;this.serial=null;return;}
  if(this.serial!==b.serial){this.serial=b.serial;this.start=b.combatClock;for(let i=0;i<2;i++)this.from[i].copyFrom(e.nodes[i?'fore.R.paw':'fore.L.paw'].getAbsolutePosition());}
  const t=clamp((b.combatClock-this.start)/.15,0,1),mix=t*t*(3-2*t),a=e.v02Ram.a,c=e.v02Ram.b,y=Math.max(a.y,c.y)+.07+.16*e.config.scale,rx=Math.cos(e.actor.rotation.y),rz=-Math.sin(e.actor.rotation.y);let ready=t>=1;
  for(let i=0;i<2;i++){
   const leg=e.v02Pose.legs[i],side=i?-1:1,x=(a.x*.6+c.x*.4)+rx*side*.13,z=(a.z*.6+c.z*.4)+rz*side*.13;
   e.v02Pose.plant(leg,false);leg.anchor.set(this.from[i].x+(x-this.from[i].x)*mix,this.from[i].y+(y-this.from[i].y)*mix,this.from[i].z+(z-this.from[i].z)*mix);e.v02Pose.solveLeg(leg);
   if(!leg.planted||Vector3.DistanceSquared(leg.foot.getAbsolutePosition(),leg.anchor)>.04*.04)ready=false;
  }
  b.ramPawBraced=ready;
 }
}
