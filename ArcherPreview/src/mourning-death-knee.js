import {Quaternion} from '@babylonjs/core';
import {MOURNING_FRONT_RIGHT_KNEEL_DEATH} from './mourning-death-knee-data.js';

export const MOURNING_DEATH_KNEE_BONES=Object.freeze(MOURNING_FRONT_RIGHT_KNEEL_DEATH.map(row=>row.name));

// Offline authored single-leg correction. Replace only the three copied local
// death tracks; native AnimationGroups, living actions and skin data stay intact.
// The normal sampler/pose refresh/cache remains the only per-frame path.
export function applyMourningDeathKneeTracks(channels,makeTrack){
 let changed=0;
 for(const row of MOURNING_FRONT_RIGHT_KNEEL_DEATH){
  const channel=channels.find(c=>c.target.name===row.name&&c.property==='rotationQuaternion');
  if(!channel)continue;
  if(channel.track.keys.length*4!==row.values.length)throw new Error('마녀 사망 무릎 동작의 프레임 수가 다릅니다.');
  const keys=channel.track.keys.map((key,i)=>({frame:key.frame,value:Quaternion.FromArray(row.values,i*4)}));
  channel.track=makeTrack({targetProperty:channel.property,framePerSecond:channel.track.fps,getKeys:()=>keys});changed++;
 }
 return changed;
}
