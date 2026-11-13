import {wolfRamFixture} from './wolf-ram-fixture.js';
import {PlayerStrikeSampler,PLAYER_STRIKE_AIM_YAW} from '../../src/player-strikes.js';
import {playerDimensions} from '../../src/player-dimensions.js';
import {WOLF_CLIPS} from '../../src/wolf-spec.js';
import {WOLF_V02_BY_ID,whipElapsedAt} from '../../src/wolf-v02-spec.js';

// Reuse the approved coupled native warrior fixture. Supply the real strike
// sampler to its SINGLE existing after-animation battle/contact pass. No gate,
// blade, body capsule, damage event or prone state is fabricated.
export async function wolfCombatR13Fixture(t,{attackBonus=5,defense=2,autoAim=true}={}){
 const api=await wolfRamFixture(),{f}=api,sampler=new PlayerStrikeSampler(),samples=[],damageEvents=[];
 const sword=api.playerNodes.Golden_Oathblade??api.playerAsset.meshes.find(mesh=>mesh.name==='Golden_Oathblade'),shield=api.playerNodes.Bunnyguard_Shield??api.playerAsset.meshes.find(mesh=>mesh.name==='Bunnyguard_Shield');
 if(!sword||!shield)throw Error('The actual warrior sword/shield mesh nodes are required');
 const pose=f.battle.poseAndContacts.bind(f.battle),update=f.battle.update.bind(f.battle),reset=api.resetPlayer.bind(api),step=api.step.bind(api);
 let lastAction=null;
 f.battle.update=(dt,player)=>{
  const result=api.result,attacking=!result.captured&&!result.staggered&&['attack','moveAttack','slash','judgment','shieldPush'].includes(result.state);
  if(attacking&&result.actionId!==lastAction){
   lastAction=result.actionId;const target=f.battle.nearestTarget(player.position);
   if(autoAim&&target&&Math.hypot(target.actor.position.x-player.position.x,target.actor.position.z-player.position.z)<(target.meleeAimDistance??4))player.rotation.y=Math.atan2(target.actor.position.x-player.position.x,target.actor.position.z-player.position.z)+(PLAYER_STRIKE_AIM_YAW[result.state]??0);
  }
  return update(dt,player);
 };
 f.battle.poseAndContacts=(player,result)=>{
  const sample=sampler.sample(result,sword,shield,true,player.rotation.y,attackBonus,playerDimensions(player));
  api.lastStrike=sample;
  const before=f.battle.encounters.map(enemy=>({id:enemy.id,hp:enemy.brain.hp,mode:enemy.brain.mode,clip:enemy.brain.state}));
  const hitStop=pose(player,result,sample,shield);
  if(sample?.contacts.length)samples.push({time:api.elapsed,playerState:result.state,playerClipTime:result.clipTime,actionId:result.actionId,player:player.position.asArray(),playerYaw:player.rotation.y,sample:structuredClone(sample),before,after:f.battle.encounters.map(enemy=>({id:enemy.id,hp:enemy.brain.hp,mode:enemy.brain.mode,clip:enemy.brain.state,position:enemy.actor.position.asArray()}))});
  return hitStop;
 };
 const installCallbacks=()=>{
  const receiveHit=f.battle.onPlayerHit,receiveDamage=f.battle.onDamage;
  f.battle.onPlayerHit=(...args)=>{const accepted=receiveHit(...args);if(accepted!==false)sampler.reset();return accepted;};
  f.battle.onDamage=(...args)=>{receiveDamage(...args);damageEvents.push({time:api.elapsed,value:args[1],heavy:!!args[2],kind:args[3],burstIndex:args[4]??null,critical:!!args[5],enemyId:args[6]?.id??null});};
 };
 api.resetCombat=()=>{reset();lastAction=null;sampler.reset();samples.length=0;damageEvents.length=0;api.lastStrike=null;f.battle.combat.defense=defense;installCallbacks();};
 api.step=(dt,input={})=>{if(Math.hypot(input.x??0,input.y??0)>.08&&api.result.state==='run'&&!api.controller.knockedDown&&!api.controller.captured)f.player.rotation.y=Math.atan2(input.x,input.y);return step(dt,input);};
 api.strikeSampler=sampler;api.strikeSamples=samples;api.damageEvents=damageEvents;api.swordNode=sword;api.shieldNode=shield;api.resetCombat();
 api.summon=async({distance=3,hp=900,sequence=null,speed=1,random=()=>.5}={})=>{
  api.resetCombat();f.world.mapId='great-plains';f.world.navigation=null;f.world.terrain={place(point){point.y=0;},heightAt(){return 0;}};
  f.player.position.set(0,0,distance);f.player.rotation.y=Math.PI;await f.battle.summon(f.player,1,'wolf');
  const enemy=f.battle.encounters[0];enemy.actor.position.setAll(0);enemy.actor.rotation.y=0;enemy.brain.hp=hp;enemy.brain.random=random;enemy.brain.configureAttacks({custom:!!sequence,sequence:sequence??[],speed});return enemy;
 };
 api.watch=enemy=>{enemy.v02Pose?.restore();enemy.brain.start(WOLF_CLIPS.watch,'idle');enemy.brain.behavior='recovery';enemy.brain.recoveryRemaining=enemy.brain.recoveryFull=30;enemy.brain.recoveryElapsed=0;enemy.brain.followupId=null;enemy.animator.transition(WOLF_CLIPS.watch,{clipTime:0,actionId:enemy.brain.serial,blendDuration:0});enemy.animator.update(0);enemy.alignPose();};
 api.poseTarget=(enemy,id,{sourceTime=WOLF_V02_BY_ID[id].impact}={})=>{
  // Isolated receiving-geometry calibration, separate from autonomous gates:
  // hold a genuine authored attack pose until the first real incoming damage.
  // The ordinary receiving gate and native warrior remain untouched. Once hit,
  // the actual brain clock/reaction resumes, so this cannot fabricate damage.
  const action=WOLF_V02_BY_ID[id];enemy.v02Pose?.restore();enemy.brain.start(action.sourceClip,'idle');enemy.brain.behavior='recovery';enemy.brain.recoveryRemaining=enemy.brain.recoveryFull=30;enemy.brain.recoveryElapsed=0;enemy.brain.followupId=null;enemy.brain.time=sourceTime;
  const brain=enemy.brain,serial=brain.serial,hp=brain.hp,update=brain.update;
  brain.update=function(dt,...args){if(this.serial===serial&&this.hp===hp){this.time=sourceTime;return {events:[],speed:0};}return update.call(this,dt,...args);};
  enemy.animator.transition(action.sourceClip,{clipTime:sourceTime,actionId:serial,blendDuration:0});enemy.animator.update(0);
  const clip=enemy.config.catalog.find(clip=>clip.name===action.sourceClip),x=sourceTime*clip.fps,i=Math.floor(x),j=Math.min(i+1,clip.rootTrack.length-1);enemy.lastRoot=clip.rootTrack[i].map((v,k)=>v+(clip.rootTrack[j][k]-v)*(x-i));enemy.lastSerial=serial;enemy.wolfClip=action.sourceClip;enemy.previousWolfTime=sourceTime;enemy.motionYaw=enemy.actor.rotation.y;enemy.alignPose();
 };
 if(t)t.after(()=>api.dispose());return api;
}
