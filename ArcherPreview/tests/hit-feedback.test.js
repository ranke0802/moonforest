import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core';
import { applyHitFlash,PlayerHitReaction,PLAYER_STAGGER } from '../src/hit-feedback.js';
import { BossEncounter } from '../src/boss-encounter.js';
import { WarriorV2Controller } from '../src/warrior-v2.js';
import { BossBrain } from '../src/boss-spec.js';
import { PlayerStrikeSampler } from '../src/player-strikes.js';
import { loadPoseAsset,loadPlayerPoseAsset } from './helpers/gltf-pose.js';

test('heavy boss hit: white immediately on impact, fades during knockdown and clears',()=>{
 const b=new BossBrain({Knock_Down_1:2}),meshes=[{}];
 b.hit({heavy:true});applyHitFlash(meshes,b.flash);
 assert.equal(b.mode,'down');assert.equal(meshes[0].overlayAlpha,.72);assert.equal(meshes[0].renderOverlay,true);
 b.update(.1,2);applyHitFlash(meshes,b.flash);assert.equal(b.mode,'down');assert.ok(meshes[0].overlayAlpha>0&&meshes[0].overlayAlpha<.72);
 b.update(.13,2);applyHitFlash(meshes,b.flash);assert.equal(meshes[0].renderOverlay,false);
});

test('player recoil: 28 cm away from impact, no vertical displacement, frame-rate independent',()=>{
 for(const dt of [1/144,1/60,1/20,.1]){
  const r=new PlayerHitReaction(),actor={position:Vector3.Zero()};r.start(new Vector3(3,10,4));
  assert.equal(r.remaining,PLAYER_STAGGER);
  for(let t=0;t<1;t+=dt)r.update(dt,actor);
  assert.ok(Math.abs(actor.position.length()-.28)<1e-10);assert.equal(actor.position.y,0);assert.ok(actor.position.x>0&&actor.position.z>0);
  assert.equal(r.remaining,0);const previous=actor.position.clone();r.update(1,actor);assert.ok(previous.equals(actor.position));
  r.start(Vector3.Zero());r.reset();assert.equal(r.update(.1,actor),0);
 }
});

test('boss contact: actual damage flashes/staggers warrior and cancels attack; blocked/cooldown hits do not',()=>{
 const durations={idle:2,run:1,slash:1.5,attack:3,judgment:4,shieldPush:2.4},c=new WarriorV2Controller({durations}),meshes=[{}];let reactions=0;
 const b=new BossEncounter({},()=>{},()=>{},duration=>{reactions++;c.hit(duration);applyHitFlash(meshes,duration,PLAYER_STAGGER);});
 b.active=true;b.brain=new BossBrain({});b.player={position:Vector3.Zero()};b.actor={position:new Vector3(0,0,2),setEnabled(){}};
 c.attack();c.update(.1);
 b.receiveBossHit({damage:14,bodyContact:true,action:{state:'shieldPush',actionId:3}});assert.equal(reactions,0);assert.equal(b.playerHp,500);
 b.receiveBossHit({damage:14,bodyContact:true,action:{state:'slash',actionId:1}});
 assert.equal(b.playerHp,486);assert.equal(reactions,1);assert.equal(meshes[0].renderOverlay,true);assert.equal(c.action,null);assert.ok(c.staggerRemaining>0);
 b.receiveBossHit({damage:14,bodyContact:true});assert.equal(reactions,1);
 b.playerReaction.update(.1,b.player);assert.ok(b.player.position.z<0);
 b.hide();assert.equal(b.playerReaction.remaining,0);
});

test('actual GLB: judgment has no damage in wind-up, landing/recovery or after cancellation',()=>{
 const source=loadPlayerPoseAsset(new URL('../public/assets/violet-warrior-v2.glb',import.meta.url));let matrix;
 const sword={computeWorldMatrix(){},getWorldMatrix(){return matrix;}};
 for(const t of [.4,.8,1.3,2.55,3.3,4.1]){
  matrix=source.pose('Sword_Judgment',t).Golden_Oathblade;
  assert.equal(new PlayerStrikeSampler().sample({state:'judgment',clipTime:t,actionId:1},sword,null).window,undefined,`No hit at ${t}`);
 }
 for(const step of [1/60*1.8,1/30*3.6,.1*3.6]){
  const sampler=new PlayerStrikeSampler();let active=0;
  for(let t=0;t<4.33;t+=step){
   matrix=source.pose('Sword_Judgment',t).Golden_Oathblade;
   const sample=sampler.sample({state:'judgment',clipTime:t,actionId:1},sword,null);
   if(sample.window){active++;assert.ok(t>=.94&&t<=1.12+step+1e-8);}
  }
  assert.ok(active>0,'Low-FPS crossing must still sample the downstroke');
 }
 const sampler=new PlayerStrikeSampler();matrix=source.pose('Sword_Judgment',1).Golden_Oathblade;
 assert.ok(sampler.sample({state:'judgment',clipTime:1,actionId:1},sword,null).window);
 assert.equal(sampler.sample({state:'judgment',clipTime:1,actionId:null,staggered:true},sword,null),null);
 assert.equal(sampler.sample({state:'run',clipTime:.1,actionId:null},sword,null),null);
});
