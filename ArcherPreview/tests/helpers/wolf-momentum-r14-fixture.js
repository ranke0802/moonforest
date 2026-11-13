import {TransformNode,Vector3} from '@babylonjs/core';
import {wolfCombatR13Fixture} from './wolf-combat-r13-fixture.js';
import {playerDimensions} from '../../src/player-dimensions.js';
import {ARENA_RADIUS} from '../../src/world-limits.js';
import {villageTravelLimit,clampVillageExit} from '../../src/map-travel.js';

// Extend the existing real warrior+weapons fixture with exactly the optional
// main.js0.2 model carrier and pre-controller impact hook. The wolf itself must
// install the shared helper in combat; this fixture never fabricates a flight,
// collision, native knockdown, maul authorization or skeletal body state.
export async function wolfMomentumR14Fixture(t,{withCarrier=true,...equipment}={}){
 const api=await wolfCombatR13Fixture(null,equipment),{f}=api;
 let carrier=api.impactCarrier??null;
 if(withCarrier&&!carrier){
  carrier=new TransformNode('player-v02-impact-carrier',f.scene);carrier.parent=f.player;
  f.player.metadata={...f.player.metadata,moonforestV02ImpactCarrier:carrier};
  for(const node of new Set([...api.playerAsset.meshes,...api.playerAsset.transformNodes]))if(node.parent===f.player)node.parent=carrier;
 }
 if(!withCarrier&&carrier){for(const node of new Set([...api.playerAsset.meshes,...api.playerAsset.transformNodes]))if(node.parent===carrier)node.parent=f.player;delete f.player.metadata.moonforestV02ImpactCarrier;carrier.dispose();carrier=null;}
 const previous=new Vector3(),reaction=f.battle.playerReaction,nativeUpdate=reaction.update,dispose=api.dispose.bind(api),reset=api.resetCombat.bind(api);
 const constrainPlayerPosition=api.constrainPlayerPosition??(from=>{
  const world=f.world,limit=world.mapId==='village'?villageTravelLimit(from,ARENA_RADIUS):ARENA_RADIUS;
  world.navigation?.constrain(f.player.position,from,playerDimensions(f.player).moveRadius,limit);
  if(world.mapId==='village')clampVillageExit(f.player.position,from);
 });
 if(!api.nativeImpactPrelude)reaction.update=function(dt,actor){
  previous.copyFrom(actor.position);const distance=nativeUpdate.call(this,dt,actor);
  if(distance)constrainPlayerPosition(previous);
  f.battle.combat.v02Impact?.advance(dt,actor,constrainPlayerPosition);
  return distance;
 };
 api.resetCombat=()=>{reset();f.battle.combat.v02Impact?.reset();};
 api.dispose=async()=>{f.battle.combat.v02Impact?.reset();reaction.update=nativeUpdate;await dispose();};
 api.impactCarrier=carrier;api.constrainPlayerPosition=constrainPlayerPosition;
 api.poseReceivingClip=(enemy,name,time)=>{
  // An isolated genuine authored receiving pose; after the first real native
  // weapon hit, ordinary reaction/flight clocks resume. No gate is replaced.
  const clip=enemy.config.catalog.find(c=>c.name===name);if(!clip)throw Error('Missing real authored receiving clip '+name);
  enemy.v02Pose?.restore();const brain=enemy.brain;brain.start(name,'idle');brain.behavior='recovery';brain.recoveryRemaining=brain.recoveryFull=30;brain.recoveryElapsed=0;brain.time=time;
  const serial=brain.serial,hp=brain.hp,update=brain.update;
  brain.update=function(dt,...args){if(this.serial===serial&&this.hp===hp){this.time=time;return {events:[],speed:0};}return update.call(this,dt,...args);};
  enemy.animator.transition(name,{clipTime:time,actionId:serial,blendDuration:0});enemy.animator.update(0);
  const x=time*clip.fps,i=Math.floor(x),j=Math.min(i+1,clip.rootTrack.length-1);enemy.lastRoot=clip.rootTrack[i].map((v,k)=>v+(clip.rootTrack[j][k]-v)*(x-i));enemy.lastSerial=serial;enemy.wolfClip=name;enemy.previousWolfTime=time;enemy.motionYaw=enemy.actor.rotation.y;enemy.alignPose();
 };
 Object.defineProperty(api,'impact',{get:()=>f.battle.combat.v02Impact??null});
 if(t)t.after(()=>api.dispose());return api;
}

export const xzDistance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
export function attackerFrame(attacker,receiver){
 const away=new Vector3(receiver.x-attacker.x,0,receiver.z-attacker.z);
 if(away.lengthSquared()<1e-12)throw Error('An attacker direction requires distinct actual contact roots');
 away.normalize();return {away:away.asArray(),viewLeft:Vector3.Cross(Vector3.Up(),away).normalize().asArray()};
}
