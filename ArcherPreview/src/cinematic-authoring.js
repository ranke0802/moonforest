import {evaluateCinematic} from './cinematic-document.js';

const clone=value=>structuredClone(value);
function actorIn(document,id){const actor=document.actors.find(row=>row.actorId===id);if(!actor)throw new Error('배우를 먼저 선택하세요.');return actor;}
function editableActor(document,id){const actor=actorIn(document,id);if(actor.instanceId)throw new Error('기존 맵 대상은 보기만 가능합니다.');return actor;}
function timeIn(document,time){if(!Number.isFinite(time)||time<0||time>document.duration)throw new Error('장면 안의 시각을 입력하세요.');return time;}
const poseOf=actor=>({position:[...actor.position],rotation:[...actor.rotation],scale:actor.scale});
export function actorPoseAt(document,id,time){actorIn(document,id);timeIn(document,time);const actor=evaluateCinematic({...document,anchor:{position:[0,0,0],rotation:[0,0,0,1]}},time).actors.find(row=>row.actorId===id);return poseOf(actor);}
export function startActorPath(document,id){
 const next=clone(document),actor=editableActor(next,id);let track=next.tracks.transforms.find(row=>row.actorId===id);if(!track){track={actorId:id,keys:[]};next.tracks.transforms.push(track);}if(!track.keys.some(key=>key.time===0))track.keys.unshift({time:0,...poseOf(actor),interpolation:'linear'});return next;
}
export function recordActorPoint(document,id,time,pose=actorPoseAt(document,id,time),interpolation){
 timeIn(document,time);const next=startActorPath(document,id),track=next.tracks.transforms.find(row=>row.actorId===id),index=track.keys.findIndex(row=>row.time===time),previous=track.keys.filter(row=>row.time<=time).at(-1);interpolation??=track.keys[index]?.interpolation??previous?.interpolation??'linear';if(!['step','linear','smooth'].includes(interpolation))throw new Error('이동 방식을 선택하세요.');const key={time,...clone(pose),interpolation};if(index<0)track.keys.push(key);else track.keys[index]=key;track.keys.sort((a,b)=>a.time-b.time);return next;
}
export function setActorPointTime(document,id,index,time){
 timeIn(document,time);const next=clone(document);editableActor(next,id);const track=next.tracks.transforms.find(row=>row.actorId===id),key=track?.keys[index];if(!key)throw new Error('이동 지점을 선택하세요.');if(key.time===0&&time!==0)throw new Error('시작점은 0초입니다. 다른 지점의 시각을 바꾸세요.');if(track.keys.some((row,i)=>i!==index&&Math.abs(row.time-time)<1e-6))throw new Error('같은 시각에 지점이 있습니다. 다른 시각을 입력하세요.');key.time=time;track.keys.sort((a,b)=>a.time-b.time);return next;
}
export function removeActorPoint(document,id,index){const next=clone(document);editableActor(next,id);const track=next.tracks.transforms.find(row=>row.actorId===id);if(!track?.keys[index])throw new Error('이동 지점을 선택하세요.');if(track.keys[index].time===0&&track.keys.length>1)throw new Error('시작점은 경로 지우기로 함께 지울 수 있습니다.');track.keys.splice(index,1);if(!track.keys.length)next.tracks.transforms=next.tracks.transforms.filter(row=>row!==track);return next;}
export function clearActorPath(document,id){const next=clone(document);editableActor(next,id);next.tracks.transforms=next.tracks.transforms.filter(row=>row.actorId!==id);return next;}
function changedPose(document,id,time,change){editableActor(document,id);const pose=actorPoseAt(document,id,time);change(pose);if(time>0||document.tracks.transforms.some(row=>row.actorId===id))return recordActorPoint(document,id,time,pose);const next=clone(document);Object.assign(actorIn(next,id),pose);return next;}
export function rotateActor(document,id,time,degrees){if(!Number.isFinite(degrees))throw new Error('회전 각도를 입력하세요.');const next=changedPose(document,id,time,pose=>{const [x,y,z,w]=pose.rotation,s=Math.sin(degrees*Math.PI/360),c=Math.cos(degrees*Math.PI/360),q=[x*c+z*s,y*c+w*s,z*c-x*s,w*c-y*s],length=Math.hypot(...q);pose.rotation=q.map(value=>value/length);});const track=next.tracks.transforms.find(row=>row.actorId===id);if(track)delete track.orientToPath;return next;}
export function scaleActor(document,id,time,factor){if(!Number.isFinite(factor)||factor<=0)throw new Error('크기를 입력하세요.');return changedPose(document,id,time,pose=>pose.scale=Math.max(.1,Math.min(10,pose.scale*factor)));}
export function duplicateActor(document,id){
 const source=editableActor(document,id);if(document.actors.length>=20)throw new Error('배우는 최대 20명까지 추가할 수 있습니다.');const next=clone(document),existing=new Set(next.actors.map(row=>row.actorId));let serial=1;while(existing.has('actor-'+serial))serial++;const actorId='actor-'+serial,copy=clone(source);copy.actorId=actorId;copy.position[0]+=.75;next.actors.push(copy);for(const name of ['transforms','animations'])for(const track of document.tracks[name].filter(row=>row.actorId===id)){const copied=clone(track);copied.actorId=actorId;if(name==='transforms')for(const key of copied.keys)key.position[0]+=.75;next.tracks[name].push(copied);}return next;
}
export function deleteActor(document,id){const next=clone(document);actorIn(next,id);next.actors=next.actors.filter(row=>row.actorId!==id);for(const name of ['transforms','animations'])next.tracks[name]=next.tracks[name].filter(row=>row.actorId!==id);for(const shot of next.shots)if(shot.lookAtActorId===id){delete shot.lookAtActorId;delete shot.lookAtOffset;}return next;}
export function splitCameraShot(document,time,camera){
 timeIn(document,time);const next=clone(document),point=clone(camera);if(time===document.duration){next.shots.at(-1).to=point;return next;}const index=next.shots.findIndex(shot=>time>=shot.start&&time<shot.end),shot=next.shots[index];if(!shot)throw new Error('카메라 구간을 선택하세요.');if(time===shot.start){shot.from=point;if(index)next.shots[index-1].to=clone(point);return next;}
 const ids=new Set(next.shots.map(row=>row.shotId));let serial=1;while(ids.has('shot-'+serial))serial++;const right={...clone(shot),shotId:'shot-'+serial,start:time,from:point};shot.end=time;shot.to=clone(point);next.shots.splice(index+1,0,right);return next;
}
