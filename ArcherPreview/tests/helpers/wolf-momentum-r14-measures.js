import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {WOLF_CLIPS} from '../../src/wolf-spec.js';
import {WOLF_V02_GAIT} from '../../src/wolf-v02-spec.js';

const feet=['fore.L.paw','fore.R.paw','hind.L.paw','hind.R.paw'];
export function momentumRow(api,e){
 const bones=['pelvis','spine','chest','neck','head','jaw','tail_3',...feet],body=api.bodyPoints();
 return {time:api.elapsed,brainClip:e.brain.state,brainTime:e.brain.time,mode:e.brain.mode,behavior:e.brain.behavior,serial:e.brain.serial,action:e.brain.actionId,ramStage:e.brain.ramStage??null,poseClip:e.animator.current,poseTime:e.animator.time,blend:e.animator.blend,wolf:e.actor.position.asArray(),yaw:e.actor.rotation.y,player:api.f.player.position.asArray(),playerYaw:api.f.player.rotation.y,playerState:api.result.state,playerTime:api.result.clipTime,knockedDown:!!api.result.knockedDown,captured:!!api.controller.captured,playerCarrier:api.impactCarrier?.position.asArray()??null,body,bones:Object.fromEntries(bones.map(n=>[n,e.nodes[n].getAbsolutePosition().asArray()])),locals:Object.fromEntries(['pelvis','spine','chest','neck','head','jaw'].map(n=>[n,{position:e.nodes[n].position.asArray(),rotation:e.nodes[n].rotationQuaternion.asArray(),scale:e.nodes[n].scaling.asArray()}])),plants:e.v02Pose?.legs.map(l=>({name:l.name+'.paw',planted:l.planted,anchor:l.anchor.asArray()}))??[],ram:structuredClone(e.inspect().ram),contact:structuredClone(e.v02LastContact),impact:api.impact?{active:!!api.impact.active,ownerId:api.impact.owner?.id??null,velocity:api.impact.velocity?.asArray?.()??api.impact.velocity??null}:null};
}

// Read the immutable preserved R8 RUN keys directly. This never resamples or
// overwrites a live pose, and does not assume any new momentum-controller API.
export function runBodyOracle(f,time){
 const group=f.container.animationGroups.find(g=>g.name===WOLF_CLIPS.run),expected={};
 for(const {target,animation}of group.targetedAnimations){
  if(!['pelvis','spine','chest'].includes(target.name))continue;
  const keys=animation.getKeys(),frame=time*animation.framePerSecond;let index=0;
  while(index<keys.length-2&&frame>keys[index+1].frame)index++;
  const a=keys[index],b=keys[Math.min(index+1,keys.length-1)],t=Math.max(0,Math.min(1,(frame-a.frame)/Math.max(1e-9,b.frame-a.frame)));
  const value=animation.targetProperty==='rotationQuaternion'?Quaternion.Slerp(a.value,b.value,t):Vector3.Lerp(a.value,b.value,t);
  (expected[target.name]??={})[animation.targetProperty]=value.asArray();
 }
 return expected;
}
export function compareRunBody(f,row){
 const expected=runBodyOracle(f,row.poseTime);let maximumRotation=0,maximumPosition=0,maximumScale=0;
 for(const [name,values]of Object.entries(expected)){
  const actual=row.locals[name];
  if(values.rotationQuaternion){const a=Quaternion.FromArray(actual.rotation).normalize(),b=Quaternion.FromArray(values.rotationQuaternion).normalize();maximumRotation=Math.max(maximumRotation,2*Math.acos(Math.max(-1,Math.min(1,Math.abs(a.dot(b))))));}
  if(values.position)maximumPosition=Math.max(maximumPosition,Math.hypot(...values.position.map((v,k)=>v-actual.position[k])));
  if(values.scaling)maximumScale=Math.max(maximumScale,...values.scaling.map((v,k)=>Math.abs(v-actual.scale[k])));
 }
 return {maximumRotation,maximumPosition,maximumScale};
}
export function forwardRunPhaseDelta(previous,next){
 let delta=next-previous;if(delta<-1e-8)delta+=WOLF_V02_GAIT.runSourceDuration;return delta;
}
export function fixedLimbLengths(e){return Object.fromEntries(Object.entries(e.nodes).filter(([n])=>/^(fore|hind)\.[LR]\.(upper|lower|metatarsal|paw)$/.test(n)).map(([n,node])=>[n,node.position.length()]));}
export function fixedLimbError(e,lengths){let length=0,scale=0;for(const [n,initial]of Object.entries(lengths)){length=Math.max(length,Math.abs(e.nodes[n].position.length()-initial));scale=Math.max(scale,...e.nodes[n].scaling.asArray().map(v=>Math.abs(v-1)));}return {length,scale};}
export function nativePointWithoutImpact(node,actor,carrier){
 // Compose the actual unchanged native pose, treating only the optional
 // visual carrier as identity. This is a read-only reference world point;
 // it never removes the carrier from the live skeleton/contact/render pose.
 const chain=[];for(let current=node;current&&current!==actor;current=current.parent)if(current!==carrier)chain.push(current);
 let world=actor.computeWorldMatrix(true).clone();
 for(let i=chain.length-1;i>=0;i--){const n=chain[i],rotation=n.rotationQuaternion??Quaternion.FromEulerVector(n.rotation),local=Matrix.Compose(n.scaling,rotation,n.position);world=local.multiply(world);}
 return Vector3.TransformCoordinates(Vector3.Zero(),world);
}
export function actualPlayerLift(api){
 return Object.fromEntries(['mixamorig:Hips','mixamorig:Spine2'].map(name=>{const node=api.playerNodes[name],native=nativePointWithoutImpact(node,api.f.player,api.impactCarrier),actual=node.getAbsolutePosition();return [name,{actual:actual.asArray(),native:native.asArray(),delta:actual.subtract(native).asArray()}];}));
}
