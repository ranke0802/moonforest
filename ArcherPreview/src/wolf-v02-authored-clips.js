import {Animation,AnimationGroup,Quaternion,Vector3} from '@babylonjs/core';
import data from './wolf-v02-attack-clips.json' with {type:'json'};
import feral from './wolf-v02-feral-clips.json' with {type:'json'};
import predator from './wolf-v02-predator-clips.json' with {type:'json'};

export const WOLF_V02_R9_CLIPS=data.clips;
export const WOLF_V02_FERAL_CLIPS=feral.clips;
export const WOLF_V02_PREDATOR_CLIPS=predator.clips;
export const WOLF_V02_ALL_AUTHORED_CLIPS=[...data.clips,...feral.clips,...predator.clips];
// Historical R9/R10 attacks stay in their source data and review exports. Live
// actors only prepare the current bites, support reactions and lateral gaits.
export const WOLF_V02_ACTIVE_CLIPS=[...feral.clips.filter(c=>c.name==='Wolf_Orbit_Step_V02'||c.name==='Wolf_Orbit_Step_Left_V02'),...predator.clips];
export const WOLF_V02_AUTHORED_CLIPS=WOLF_V02_ACTIVE_CLIPS;
export const WOLF_V02_AUTHORED_SOURCE=feral.sourceSha256;
if(predator.sourceSha256!==feral.sourceSha256)throw Error('R11 motions require the same approved R8 rig');
const properties={translation:'position',rotation:'rotationQuaternion',scale:'scaling'};
const installed=new WeakMap();
// One immutable key-value table for the module. Actors own their animation
// wrappers, target nodes, sampler cursors and blended pose; key values are read
// by the existing bounded sampler and are never rewritten by gameplay.
const templates=WOLF_V02_AUTHORED_CLIPS.map(clip=>({clip,channels:clip.channels.map(channel=>{
 const property=properties[channel.path];if(!property)throw Error('Unsupported authored wolf channel: '+channel.path);
 if(channel.times.length!==channel.values.length||channel.times.length<2)throw Error('Incomplete authored wolf keys');
 const animation=new Animation(clip.name+':'+channel.node+':'+property,property,clip.fps,channel.path==='rotation'?Animation.ANIMATIONTYPE_QUATERNION:Animation.ANIMATIONTYPE_VECTOR3,Animation.ANIMATIONLOOPMODE_CONSTANT);
 const keys=channel.times.map((time,index)=>{
  const value=channel.values[index],width=channel.path==='rotation'?4:3;
  if(!Number.isFinite(time)||time<0||time>clip.duration+1e-6||(index&&time<=channel.times[index-1])||value.length!==width||!value.every(Number.isFinite))throw Error('Invalid authored wolf animation key');
  return {frame:time*clip.fps,value:channel.path==='rotation'?Quaternion.FromArray(value):Vector3.FromArray(value)};
 });animation.setKeys(keys,true);return {node:channel.node,property,animation};
})}));

export function installWolfV02AttackClips(asset,config){
 if(installed.has(asset))return installed.get(asset);
 if(config.sourceSha256!==WOLF_V02_AUTHORED_SOURCE)throw Error('Authored wolf attacks require the approved R8 model');
 const nodes=new Map([...asset.transformNodes,...asset.meshes].map(node=>[node.name,node]));
 // Validate the whole mapping before adding any groups to a live container.
 for(const {clip,channels}of templates){
  if(asset.animationGroups.some(group=>group.name===clip.name))throw Error('Duplicate authored wolf attack: '+clip.name);
  for(const {node,property}of channels)if(!nodes.get(node)?.[property])throw Error('Authored wolf target missing: '+node+'/'+property);
 }
 const added=[];
 try{
  for(const {clip,channels}of templates){
   const group=new AnimationGroup(clip.name,asset.scene??asset.rootNodes?.[0]?.getScene()??asset.meshes[0].getScene());added.push(group);
   for(const {node,animation}of channels)group.addTargetedAnimation(animation.clone(),nodes.get(node));
   group.normalize(0,clip.duration*clip.fps);asset.animationGroups.push(group);
  }
 }catch(error){for(const group of added){const index=asset.animationGroups.indexOf(group);if(index>=0)asset.animationGroups.splice(index,1);group.dispose();}throw error;}
 const prepared={...config,animations:{...config.animations,...Object.fromEntries(WOLF_V02_AUTHORED_CLIPS.map(clip=>[clip.name,clip.name]))},catalog:[...config.catalog,...WOLF_V02_AUTHORED_CLIPS.map(({channels,...clip})=>clip)]};
 installed.set(asset,prepared);return prepared;
}
