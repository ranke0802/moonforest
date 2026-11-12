import {Quaternion,Vector3} from '@babylonjs/core';
import {orderPoseNodes,refreshPoseMatrices} from './pose-matrices.js';
import {WOLF_CLIPS} from './wolf-spec.js';
// All R8 exported channels are LINEAR TRS or scalar Breath weights. Keep one
// bounded sampler table for the actor life; no native bindings on transitions.
function track(animation){const keys=animation.getKeys(),scalar=typeof keys[0].value==='number',quaternion=animation.targetProperty==='rotationQuaternion';let index=0;const out=scalar?null:keys[0].value.clone();return {sample(time){const f=time*animation.framePerSecond;if(f<keys[index].frame)index=0;while(index<keys.length-2&&f>keys[index+1].frame)index++;const a=keys[index],b=keys[Math.min(keys.length-1,index+1)],t=Math.max(0,Math.min(1,(f-a.frame)/Math.max(1e-9,b.frame-a.frame)));if(scalar)return a.value+(b.value-a.value)*t;if(quaternion)Quaternion.SlerpToRef(a.value,b.value,t,out);else Vector3.LerpToRef(a.value,b.value,t,out);return out;}};}
export class WolfAnimator{
 constructor(asset,config){this.asset=asset;this.clips=new Map();this.durations={};this.nodes=orderPoseNodes([...asset.transformNodes,...asset.meshes.filter(mesh=>mesh.getTotalVertices()===0)]);this.current=null;this.actionId=null;this.blend=1;this.samples=0;this.channels=0;
  for(const group of asset.animationGroups){group.stop();const fps=group.targetedAnimations[0]?.animation.framePerSecond??60;this.durations[group.name]=(group.to-group.from)/fps;const rows=group.targetedAnimations.map(({target,animation})=>{const property=animation.targetProperty,value=target[property];this.channels++;return {target,property,track:track(animation),from:typeof value==='number'?value:value.clone()};});this.clips.set(group.name,rows);}
  for(const name of Object.values(config.animations))if(!this.clips.has(name))throw Error('늑대 동작 누락: '+name);
  this.root=asset.transformNodes.find(n=>n.name==='root');if(!this.root)throw Error('늑대 루트 누락');this.rootPosition=new Vector3();this.rootRotation=Quaternion.Identity();this.transition(WOLF_CLIPS.rest,{clipTime:0,blendDuration:0});this.update(0);
 }
 transition(state,{clipTime=0,actionId=null,blendDuration=.16}={}){if(!this.clips.has(state))throw Error('늑대 동작 누락: '+state);if(state!==this.current||actionId!==this.actionId){this.current=state;this.actionId=actionId;this.blend=0;this.blendDuration=blendDuration;for(const c of this.clips.get(state)){const v=c.target[c.property];if(typeof v==='number')c.from=v;else c.from.copyFrom(v);}}this.time=clipTime;}
 update(dt){this.blend=this.blendDuration>0?Math.min(1,this.blend+Math.max(0,dt)/this.blendDuration):1;const mix=this.blend*this.blend*(3-2*this.blend);
  for(const c of this.clips.get(this.current)){const v=c.track.sample(this.time);if(typeof v==='number')c.target[c.property]=c.from+(v-c.from)*mix;else if(c.property==='rotationQuaternion')Quaternion.SlerpToRef(c.from,v,mix,c.target[c.property]);else Vector3.LerpToRef(c.from,v,mix,c.target[c.property]);}
  this.rootPosition.copyFrom(this.root.position);this.rootRotation.copyFrom(this.root.rotationQuaternion);this.samples++;
 }
 ensurePoseCurrent(){refreshPoseMatrices(this.nodes);}
 resetForReuse(){this.current=null;this.actionId=null;this.transition(WOLF_CLIPS.rest,{clipTime:0,blendDuration:0});this.update(0);return this;}
 inspectBindingCache(){return {enabled:true,eligible:true,mode:'bounded-authored-sampler',created:0,reused:this.samples,currentBindings:0,channels:this.channels,clips:this.clips.size};}
 dispose(){this.clips.clear();}
}
