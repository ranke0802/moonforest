import {Vector3} from '@babylonjs/core';
import {wolfHuntFixture,stepWolfHunt} from './wolf-hunt-fixture.js';
import {WOLF_CLIPS} from '../../src/wolf-spec.js';
import {playerDimensions} from '../../src/player-dimensions.js';
export {wolfHuntFixture,stepWolfHunt};
export const feralFeet=['fore.L.paw','fore.R.paw','hind.L.paw','hind.R.paw'];
export const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
export function headAttention(e,player){
 const head=e.nodes.head,point=head.getAbsolutePosition();
 // The approved wolf's +Y axis follows the upper muzzle. +Z points down.
 const forward=Vector3.TransformNormal(Vector3.Up(),head.getWorldMatrix());
 const target=Math.atan2(player.position.x-point.x,player.position.z-point.z),body=player.position.add(new Vector3(0,playerDimensions(player).bodyAimHeight,0)),desired=body.subtract(point).normalize();
 return {degrees:Math.abs(angleDelta(Math.atan2(forward.x,forward.z),target))*180/Math.PI,
   degrees3D:Math.acos(Math.max(-1,Math.min(1,Vector3.Dot(forward.normalize(),desired))))*180/Math.PI,
   forward:forward.asArray(),desired:desired.asArray(),aim:body.asArray(),head:point.asArray()};
}
export async function resetFeral(f,{distance=6,hp=900,speed=1,sequence=null,behavior='position'}={}){
 await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];
 e.actor.position.setAll(0);e.actor.rotation.y=0;f.player.position.set(0,0,distance);f.player.rotation.y=Math.PI;
 e.brain.configureAttacks({custom:!!sequence,sequence:sequence??[],speed});e.brain.hp=hp;
 e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.behavior=behavior;e.brain.observation=0;
 e.brain.positionElapsed=0;e.brain.plannedId=null;e.playerHp=500;e.playerInvulnerable=0;
 return e;
}
export function quantile(values,q){const ordered=[...values].sort((a,b)=>a-b);return ordered[Math.min(ordered.length-1,Math.floor(q*(ordered.length-1)))];}
export function gaitCalibration(e,clip){
 const duration=e.animator.durations[clip],rows=[];
 for(let i=0;i<=120;i++){
  const time=duration*i/120;e.animator.transition(clip,{clipTime:time,actionId:-700,blendDuration:0});e.animator.update(0);e.alignPose();
  rows.push(Object.fromEntries(feralFeet.map(name=>[name,e.nodes[name].getAbsolutePosition().asArray()])));
 }
 return Object.fromEntries(feralFeet.map(name=>[name,Math.min(...rows.map(row=>row[name][1]))]));
}
export function supportMotion(rows,groundLevels){
 const pairs=[];
 for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i];if(a.clip!==b.clip||a.serial!==b.serial||b.sourceTime<a.sourceTime||a.wallTime<.3)continue;
  for(const name of feralFeet){const from=a.feet[name],to=b.feet[name],floor=groundLevels[name];
   if(from[1]<=floor+.025&&to[1]<=floor+.025)pairs.push({name,time:b.wallTime,speed:Math.hypot(to[0]-from[0],to[2]-from[2])/(b.wallTime-a.wallTime),distance:Math.hypot(to[0]-from[0],to[2]-from[2])});
  }
 }
 const speeds=pairs.map(p=>p.speed);return {samples:pairs.length,p50:quantile(speeds,.5),p95:quantile(speeds,.95),max:Math.max(...speeds),groundTolerance:.025,groundLevels};
}
export function poseRow(e,player,wallTime){return {wallTime,clip:e.brain.state,serial:e.brain.serial,behavior:e.brain.behavior,mode:e.brain.mode,sourceTime:e.brain.time,actor:e.actor.position.asArray(),player:player.position.asArray(),gaze:headAttention(e,player),feet:Object.fromEntries(feralFeet.map(name=>[name,e.nodes[name].getAbsolutePosition().asArray()]))};}
