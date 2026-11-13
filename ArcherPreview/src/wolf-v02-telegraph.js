import {Color3,Vector3,VertexBuffer} from '@babylonjs/core';
import {WOLF_V02_ACTIONS} from './wolf-v02-spec.js';
import {WolfEncounter} from './wolf-encounter.js';
import {WOLF_CLIPS} from './wolf-spec.js';
import {wolfContactShape} from './wolf-v02-contact-shapes.js';

const cache=new WeakMap(),amber=new Color3(1,.55,.08),red=new Color3(1,.08,.025),blue=new Color3(.18,.55,1);
const delta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
function rootAt(clip,time,out){const f=Math.max(0,Math.min(clip.rootTrack.length-1,time*clip.fps)),i=Math.floor(f),j=Math.min(i+1,clip.rootTrack.length-1),t=f-i;for(let k=0;k<3;k++)out[k]=clip.rootTrack[i][k]+(clip.rootTrack[j][k]-clip.rootTrack[i][k])*t;}
function yawAt(clip,time){const frames=clip.yawTrack;if(!frames)return 0;const f=Math.max(0,Math.min(frames.length-1,time*clip.fps)),i=Math.floor(f),j=Math.min(i+1,frames.length-1);return frames[i]+delta(frames[j],frames[i])*(f-i);}

// Cache authored contact poses once during existing incremental preparation.
// No future-pose sampling, scene scans, new mesh/material or observer runs live.
export async function prepareWolfV02Telegraph(e,preparation){
 if(e.v02Telegraph)return;
 const key=e.config.catalog.find(clip=>clip.name===WOLF_V02_ACTIONS[3].sourceClip)?.rootTrack;if(!key)return;
 let profiles=cache.get(key);
 if(!profiles){
  profiles=new Map();const inverse=e.actor.getWorldMatrix().clone().invert(),point=new Vector3();
  for(const action of WOLF_V02_ACTIONS){
   const clip=e.config.catalog.find(clip=>clip.name===action.sourceClip);if(!clip)continue;
   await preparation.step('wolf-contact-preview-'+action.id,()=>{
    const phases=[];
    for(const phase of action.ramPhases??[action]){
     const samples=[];
     for(const time of [phase.contactStart,phase.impact,phase.contactEnd]){
      e.animator.transition(action.sourceClip,{clipTime:time,actionId:-1,blendDuration:0});e.animator.update(0);WolfEncounter.prototype.alignPose.call(e);
      for(const name of phase.contactParts??action.contactParts){const shape=wolfContactShape(name,phase.kind);Vector3.TransformCoordinatesToRef(shape.offset,e.nodes[name].getWorldMatrix(),point);Vector3.TransformCoordinatesToRef(point,inverse,point);samples.push({name,time,point:point.asArray(),radius:shape.radius});}
     }
     phases.push({id:phase.id,kind:phase.kind??'strike',start:phase.contactStart,end:phase.contactEnd,samples});
    }
    profiles.set(action.id,{clip,phases});
   });
  }
  e.animator.transition(WOLF_CLIPS.rest,{clipTime:0,actionId:null,blendDuration:0});e.animator.update(0);WolfEncounter.prototype.alignPose.call(e);cache.set(key,profiles);
 }
 e.v02Telegraph=new WolfV02Telegraph(e,profiles);e.warningRing.update=()=>e.v02Telegraph.update();
}

export class WolfV02Telegraph{
 constructor(e,profiles){
  this.e=e;this.profiles=profiles;this.positions=e.ring.getVerticesData(VertexBuffer.PositionKind);this.root=[0,0,0];this.futureRoot=[0,0,0];this.points=Array.from({length:6},()=>({x:0,z:0,radius:0}));this.lastPoints=Array.from({length:6},()=>({x:Infinity,z:Infinity,radius:0}));this.serial=null;this.phase=null;this.stage='hidden';this.samples=0;this.uploads=0;this.lastVisible=false;
 }
 reset(){this.serial=this.phase=null;this.stage='hidden';this.samples=0;this.lastVisible=false;this.e.ring.isVisible=false;}
 update(){
  const e=this.e,b=e.brain,action=b.action,profile=action&&this.profiles.get(action.id);
  if(!e.active||b.hp<=0||b.mode!=='attack'||b.stagger||!profile){e.ring.isVisible=false;this.stage='hidden';this.lastVisible=false;return;}
  const phase=profile.phases.find(phase=>b.time<=phase.end&&(!action.ramPhases||!e.v02Ram.phases.find(state=>state.config.id===phase.id)?.resolved));
  if(!phase||!action.ramPhases&&e.v02ResolvedSerial===b.serial||phase.kind==='maul'&&(!e.v02Ram.authorized||!e.v02Ram.proneValid)){e.ring.isVisible=false;this.stage='hidden';this.lastVisible=false;return;}
  this.serial=b.serial;this.phase=phase.id;this.stage=b.time<phase.start?'windup':b.time<=phase.end?'active':'recovery';this.samples=phase.samples.length;
  const clip=profile.clip,scale=e.config.scale,yaw=e.motionYaw??e.actor.rotation.y,cos=Math.cos(yaw),sin=Math.sin(yaw),originYaw=yawAt(clip,action.clipStart??0);
  rootAt(clip,b.time,this.root);
  for(let i=0;i<phase.samples.length;i++){
   const sample=phase.samples[i],point=this.points[i];rootAt(clip,sample.time,this.futureRoot);
   const x=(this.futureRoot[0]-this.root[0])*scale,z=(this.futureRoot[2]-this.root[2])*scale,angle=yaw+yawAt(clip,sample.time)-originYaw,c=Math.cos(angle),s=Math.sin(angle);
   const extra=phase.kind==='maul'?1-e.v02Ram.chaseProgress:0;
   point.x=e.actor.position.x+x*cos+z*sin+(sample.point[0]*c+sample.point[2]*s)*scale+e.v02Ram.chaseCorrectionX*extra;point.z=e.actor.position.z+z*cos-x*sin+(sample.point[2]*c-sample.point[0]*s)*scale+e.v02Ram.chaseCorrectionZ*extra;
   point.radius=sample.radius+e.player.metadata?.playerDimensions?.moveRadius;
   if(!Number.isFinite(point.radius))point.radius=sample.radius+.2881;
  }
  e.ring.isVisible=true;e.ring.position.setAll(0);const material=e.ring.material;material.emissiveColor.copyFrom(this.stage==='windup'?amber:this.stage==='active'?red:blue);material.alpha=.88;
  const terrain=e.world.terrain,height=terrain?.heightAt,unchanged=this.lastVisible&&this.lastPhase===phase.id&&this.lastSerial===b.serial&&this.lastStage===this.stage&&this.lastTerrain===terrain&&this.lastHeight===height&&this.lastY===e.actor.position.y&&this.points.every((point,i)=>i>=this.samples||Math.hypot(point.x-this.lastPoints[i].x,point.z-this.lastPoints[i].z)<.015&&point.radius===this.lastPoints[i].radius);
  if(unchanged)return;
  this.lastVisible=true;this.lastPhase=phase.id;this.lastSerial=b.serial;this.lastStage=this.stage;this.lastTerrain=terrain;this.lastHeight=height;this.lastY=e.actor.position.y;
  for(let i=0;i<this.samples;i++)Object.assign(this.lastPoints[i],this.points[i]);
  // The outline is the convex swept footprint of the same bounded part spheres.
  // Its line is 9cm thick, independent of the wolf's large actor radius.
  for(let segment=0;segment<=64;segment++){
   const angle=segment*Math.PI*2/64,nx=Math.sin(angle),nz=Math.cos(angle);let best=-Infinity,selected=this.points[0];
   for(let i=0;i<this.samples;i++){const point=this.points[i],support=point.x*nx+point.z*nz+point.radius;if(support>best){best=support;selected=point;}}
   for(let side=0;side<2;side++){const r=selected.radius+(side?1:-1)*.045,x=selected.x+nx*r,z=selected.z+nz*r,index=segment*6+side*3;this.positions[index]=x;this.positions[index+1]=(e.world.terrain?.heightAt?.(x,z)??e.actor.position.y)+.045;this.positions[index+2]=z;}
  }
  e.ring.updateVerticesData(VertexBuffer.PositionKind,this.positions,true);
  this.uploads++;
 }
 inspect(){return {serial:this.serial,phase:this.phase,stage:this.stage,partSamples:this.samples,visible:this.e.ring.isVisible,uploads:this.uploads,points:this.points.slice(0,this.samples).map(point=>({...point}))};}
}
