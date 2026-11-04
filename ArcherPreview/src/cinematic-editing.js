import {cinematicBackgroundAt,cinematicInterpolationFactor,evaluateCinematic} from './cinematic-document.js';
import {actorPoseAt} from './cinematic-authoring.js';
const clone=value=>structuredClone(value),round=value=>Math.round(value*1e6)/1e6;
const identityAnchor=()=>({position:[0,0,0],rotation:[0,0,0,1]});
function localCameraAt(document,shot,time){const cameraShot={...shot};delete cameraShot.lookAtActorId;delete cameraShot.lookAtOffset;return evaluateCinematic({...document,anchor:identityAnchor(),shots:[cameraShot],tracks:{...document.tracks,backgrounds:document.tracks.backgrounds?.map(row=>({...row,anchor:identityAnchor()}))}},time).camera;}
function orbitSweep(shot){const a=shot.from.position.map((v,i)=>v-shot.from.target[i]),b=shot.to.position.map((v,i)=>v-shot.to.target[i]);return ((Math.atan2(b[0],b[2])-Math.atan2(a[0],a[2])+Math.PI*3)%(Math.PI*2)-Math.PI)+(shot.orbitTurns??0)*Math.PI*2;}

export function resizeCinematicDuration(document,duration,{mode='scale'}={}){
 if(!Number.isFinite(duration)||duration<.1||duration>600)throw new Error('전체 길이는0.1~600초로 정하세요.');
 const next=clone(document),old=next.duration;if(old===duration)return next;
 if(mode==='scale'){
  const ratio=duration/old,scale=value=>round(value*ratio);
  for(const shot of next.shots){shot.start=scale(shot.start);shot.end=scale(shot.end);}next.shots[0].start=0;next.shots.at(-1).end=duration;for(let i=1;i<next.shots.length;i++)next.shots[i].start=next.shots[i-1].end;
  for(const actor of next.actors)for(const key of ['start','end'])if(actor[key]!==undefined)actor[key]=scale(actor[key]);
  for(const track of next.tracks.transforms)for(const key of track.keys)key.time=scale(key.time);
  for(const track of next.tracks.animations){track.start=scale(track.start);track.end=scale(track.end);track.blendIn=Math.min(scale(track.blendIn),track.end-track.start);track.blendOut=Math.min(scale(track.blendOut),track.end-track.start);}
  for(const cue of next.tracks.subtitles){cue.start=scale(cue.start);cue.end=scale(cue.end);if(cue.effect){cue.effect.inDuration=Math.min(scale(cue.effect.inDuration),cue.end-cue.start);cue.effect.outDuration=Math.min(scale(cue.effect.outDuration),cue.end-cue.start);}}
  for(const cue of [...next.tracks.audio,...next.tracks.events,...(next.tracks.backgrounds??[])]){cue.time=scale(cue.time);if(cue.end!==undefined)cue.end=scale(cue.end);for(const key of ['fadeIn','fadeOut','fadeDuration'])if(cue[key]!==undefined)cue[key]=Math.min(key==='fadeDuration'?5:10,scale(cue[key]));}
  if(next.presentation)for(const key of ['fadeIn','fadeOut'])if(next.presentation[key]!==undefined)next.presentation[key]=Math.min(10,duration,scale(next.presentation[key]));
 }else if(mode==='trim'){
  if(duration>old){const last=next.shots.at(-1),pose=localCameraAt(document,document.shots.at(-1),old),ids=new Set(next.shots.map(shot=>shot.shotId));let serial=1;while(ids.has('shot-'+serial))serial++;next.shots.push({shotId:'shot-'+serial,start:old,end:duration,interpolation:'step',from:clone(pose),to:clone(pose),...(last.lookAtActorId?{lookAtActorId:last.lookAtActorId,...(last.lookAtOffset?{lookAtOffset:clone(last.lookAtOffset)}:{})}:{})});for(const actor of next.actors)if(actor.end===old)actor.end=duration;}
  else{
   next.shots=next.shots.filter(shot=>shot.start<duration);const last=next.shots.at(-1),source=document.shots.find(shot=>shot.shotId===last.shotId);if(last.end>duration){const ratio=(duration-last.start)/(last.end-last.start),progress=cinematicInterpolationFactor(ratio,last.interpolation,last.interpolationEnd);last.to=localCameraAt(document,source,duration);last.interpolationEnd=(last.interpolationEnd??1)*ratio;if(last.movement==='orbit'){const desired=orbitSweep(source)*progress,shortest=orbitSweep({...last,orbitTurns:0});last.orbitTurns=Math.round((desired-shortest)/(Math.PI*2));}}last.end=duration;
   next.actors=next.actors.filter(actor=>(actor.start??0)<duration);const ids=new Set(next.actors.map(actor=>actor.actorId));for(const actor of next.actors)if(actor.end!==undefined)actor.end=Math.min(actor.end,duration);
   next.tracks.transforms=next.tracks.transforms.filter(track=>ids.has(track.actorId));for(const track of next.tracks.transforms){const beyond=track.keys.find(key=>key.time>duration),pose=beyond?actorPoseAt(document,track.actorId,duration):null;track.keys=track.keys.filter(key=>key.time<=duration);if(pose&&track.keys.length&&track.keys.at(-1).time<duration){const previous=track.keys.at(-1);previous.interpolationEnd=(previous.interpolationEnd??1)*(duration-previous.time)/(beyond.time-previous.time);track.keys.push({time:duration,...pose,interpolation:previous.interpolation});}}
   for(const kind of ['animations','subtitles'])next.tracks[kind]=next.tracks[kind].filter(cue=>cue.start<duration&&(kind!=='animations'||ids.has(cue.actorId))).map(cue=>{cue.end=Math.min(cue.end,duration);if(kind==='animations'){cue.blendIn=Math.min(cue.blendIn,cue.end-cue.start);cue.blendOut=Math.min(cue.blendOut,cue.end-cue.start);}if(cue.effect){cue.effect.inDuration=Math.min(cue.effect.inDuration,cue.end-cue.start);cue.effect.outDuration=Math.min(cue.effect.outDuration,cue.end-cue.start);}return cue;});
   for(const kind of ['audio','events','backgrounds'])if(next.tracks[kind])next.tracks[kind]=next.tracks[kind].filter(cue=>cue.time<duration).map(cue=>{if(cue.end!==undefined)cue.end=Math.min(cue.end,duration);for(const key of ['fadeIn','fadeOut'])if(cue[key]!==undefined)cue[key]=Math.min(cue[key],(cue.end??duration)-cue.time);return cue;});
   for(const shot of next.shots)if(shot.lookAtActorId&&!ids.has(shot.lookAtActorId)){delete shot.lookAtActorId;delete shot.lookAtOffset;}
  }
  if(next.presentation)for(const key of ['fadeIn','fadeOut'])if(next.presentation[key]!==undefined)next.presentation[key]=Math.min(next.presentation[key],duration);
 }else throw new Error('길이 변경 방식을 고르세요.');
 next.duration=duration;return next;
}

export function setCinematicBackground(document,time,mapId,{transition='fade',fadeDuration=.6,anchor}={}){
 if(!['village','great-plains','monster-forest','witch-cave'].includes(mapId)||!Number.isFinite(time)||time<0||time>=document.duration)throw new Error('배경과 전환 시각을 확인하세요.');
 const next=clone(document);next.tracks.backgrounds??=[{time:0,mapId:next.mapId,transition:'cut',fadeDuration:0,anchor:clone(next.anchor)}];
 const prior=cinematicBackgroundAt(next,time),row={time:round(time),mapId,transition,fadeDuration,anchor:clone(anchor??(prior.mapId===mapId?prior.anchor:{position:[0,0,0],rotation:[0,0,0,1]}))},index=next.tracks.backgrounds.findIndex(item=>item.time===row.time);
 if(index<0)next.tracks.backgrounds.push(row);else next.tracks.backgrounds[index]=row;next.tracks.backgrounds.sort((a,b)=>a.time-b.time);if(time===0)next.mapId=mapId;return next;
}

export function applyCameraPreset(document,shotIndex,{preset='fixed',distance=3,angle=90}={}){
 if(!Number.isFinite(distance)||distance<=0||distance>100||!Number.isFinite(angle)||angle<=0||angle>360)throw new Error('이동 거리와 회전 각도를 확인하세요.');
 const next=clone(document),shot=next.shots[shotIndex];if(!shot)throw new Error('카메라 구간을 먼저 고르세요.');const from=shot.from,to=clone(from),offset=from.position.map((value,i)=>value-from.target[i]),length=Math.hypot(...offset),forward=offset.map(value=>value/Math.max(.001,length)),horizontal=Math.hypot(offset[0],offset[2]),right=horizontal<.001?[1,0,0]:[offset[2]/horizontal,0,-offset[0]/horizontal];delete shot.movement;delete shot.orbitTurns;delete shot.interpolationEnd;
 if(preset==='dolly-in'||preset==='dolly-out'){const delta=preset==='dolly-in'?-Math.min(distance,Math.max(0,length-.05)):distance;to.position=from.position.map((value,i)=>value+forward[i]*delta);}
 else if(preset==='truck-left'||preset==='truck-right'){const sign=preset==='truck-left'?-1:1;for(const key of ['position','target'])to[key]=from[key].map((value,i)=>value+right[i]*distance*sign);}
 else if(preset==='rise'||preset==='fall'){const sign=preset==='rise'?1:-1;to.position[1]+=distance*sign;to.target[1]+=distance*sign;}
 else if(preset==='orbit-left'||preset==='orbit-right'){const sign=preset==='orbit-left'?-1:1,radians=sign*angle*Math.PI/180,start=Math.atan2(offset[0],offset[2]),end=start+radians;to.position=[from.target[0]+Math.sin(end)*horizontal,from.position[1],from.target[2]+Math.cos(end)*horizontal];shot.movement='orbit';const shortest=((radians+Math.PI*3)%(Math.PI*2))-Math.PI;shot.orbitTurns=Math.round((radians-shortest)/(Math.PI*2));}
 else if(preset!=='fixed')throw new Error('카메라 이동을 고르세요.');shot.to=to;return next;
}
