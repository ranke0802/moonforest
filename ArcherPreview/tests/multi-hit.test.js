import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {PlayerStrikeSampler} from '../src/player-strikes.js';
import {MeleeContactGate} from '../src/melee-collision.js';
import {BossBrain} from '../src/boss-spec.js';
import {loadPoseAsset} from './helpers/gltf-pose.js';
const asset=loadPoseAsset(new URL('../public/assets/violet-warrior-v2.glb',import.meta.url));
const durations={idle:2,run:.8,slash:1.5,attack:3,judgment:4.33,shieldPush:2.37};
const clips={slash:'Right_Hand_Sword_Slash',attack:'Thrust_Slash',judgment:'Sword_Judgment'};
function exercise(kind,dt=.016,speed=1,{miss=false,cancelAfterHit=false}={}){
 const c=new WarriorV2Controller({durations}),sampler=new PlayerStrikeSampler(),gate=new MeleeContactGate(),hits=[];
 const boss=new BossBrain({Knock_Down_1:2});c.setAttackSpeed(speed);c.startAttack(kind);let matrix;
 const sword={computeWorldMatrix(){},getWorldMatrix(){return matrix;}};
 const capsule=kind==='judgment'?[[-.35,1,.75],[-.35,2,.75]]:kind==='slash'?[[0,0,.7],[0,2,.7]]:[[-.4,.5,1.5],[-.4,2,1.5]];
 if(miss)for(const p of capsule)p[0]+=20;
 let cancelled=false;
 for(let t=0;t<6;t+=dt){
  const result=c.update(dt,cancelled?{y:1}:{});matrix=asset.pose(clips[kind],result.clipTime).Golden_Oathblade;
  const sample=sampler.sample(result,sword,null);if(!sample)continue;
  const contact=gate.collect({...sample,capsule,radius:kind==='judgment'?.6:.75});
  for(const hit of contact.hits){hits.push({...hit,time:result.clipTime,elapsed:result.actionElapsed});boss.hit(hit);}
  c.pauseOnImpact(contact.hitStop);
  if(cancelAfterHit&&hits.length&&!cancelled){c.hit(.2,{force:true});cancelled=true;}
 }
 return {hits,boss,c};
}
test('actual blade: slash is one hit; thrust/slash has two independently deduplicated passes',()=>{
 for(const dt of [1/60,1/20,.1])for(const speed of [.5,1,2]){
  assert.equal(exercise('slash',dt,speed).hits.length,1);
  const {hits}=exercise('attack',dt,speed);assert.equal(hits.length,2,`${dt}/${speed}`);assert.deepEqual(hits.map(h=>h.id),['thrust','follow-cut']);assert.equal(hits.reduce((s,h)=>s+h.damage,0),38);
 }
});
test('judgment: physical contact produces three fast pulses at the held impact pose; only last knocks back',()=>{
 for(const dt of [1/144,1/60,1/20,.1])for(const speed of [.5,1,2]){
  const {hits,boss}=exercise('judgment',dt,speed);assert.equal(hits.length,3,`${dt}/${speed}`);
  assert.deepEqual(hits.map(h=>h.damage),[20,20,24]);assert.deepEqual(hits.map(h=>h.heavy),[false,false,true]);
  assert.ok(hits.every(h=>Math.abs(h.time-hits[0].time)<1e-8),'Do not deal delayed damage after the blade has moved away');
  assert.ok(hits[2].elapsed-hits[0].elapsed<=.11+dt+1e-8);assert.equal(boss.hp,836);assert.equal(boss.mode,'down');
 }
});
test('judgment miss creates no burst; a forced block-stagger after first impact cancels the remaining pulses',()=>{
 assert.equal(exercise('judgment',.016,1,{miss:true}).hits.length,0);
 const {hits,c}=exercise('judgment',.016,1,{cancelAfterHit:true});assert.equal(hits.length,1);assert.equal(hits[0].heavy,false);assert.equal(c.state,'run');
});
test('low frame-rate sample retains both normal strike windows instead of dropping the second',()=>{
 const sampler=new PlayerStrikeSampler(),gate=new MeleeContactGate();let matrix=asset.pose('Thrust_Slash',.5).Golden_Oathblade;
 const sword={computeWorldMatrix(){},getWorldMatrix(){return matrix;}};
 sampler.sample({state:'attack',actionId:1,clipTime:.5},sword,null);matrix=asset.pose('Thrust_Slash',1.7).Golden_Oathblade;
 const sample=sampler.sample({state:'attack',actionId:1,clipTime:1.7},sword,null);
 assert.equal(sample.contacts.length,2);
 assert.equal(gate.collect({...sample,capsule:[[0,0,1],[0,3,1]],radius:2}).hits.length,2);
 assert.equal(gate.collect({...sample,capsule:[[0,0,1],[0,3,1]],radius:2}).hits.length,0);
});
