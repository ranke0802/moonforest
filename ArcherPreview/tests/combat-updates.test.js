import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix, Vector3, NullEngine, Scene, TransformNode } from '@babylonjs/core';
import { WarriorV2Controller } from '../src/warrior-v2.js';
import { BossBrain, BOSS_ADVANCING_COMBO, BOSS_DAMAGE } from '../src/boss-spec.js';
import { BossEncounter } from '../src/boss-encounter.js';
import { PlayerStrikeSampler } from '../src/player-strikes.js';
import { BossGrab } from '../src/boss-grab.js';
import { rearDamage } from '../src/combat-damage.js';

const durations={idle:2,run:1,attack:3,slash:1.5,judgment:4,shieldPush:2.4,dodge:2.4666667};
test('updated defaults accelerate thrust/slash and dodge without changing the other clips',()=>{
 const c=new WarriorV2Controller({durations});
 assert.equal(c.playbackRate('attack'),1.8*1.6);assert.equal(c.playbackRate('slash'),1.8);
 assert.equal(c.playbackRate('dodge'),1.7);assert.equal(c.playbackRate('idle'),1);
 c.dodge();assert.equal(c.update(.1).rollTo,.17);
});
test('blocking judgment overrides super armor, cancels queued damage and recoils without HP loss',()=>{
 const c=new WarriorV2Controller({durations}),b=new BossEncounter({},()=>{},()=>{},(duration,options)=>c.hit(duration,options));
 b.actor={position:new Vector3(0,0,2)};b.player={position:Vector3.Zero()};
 c.startAttack('judgment');assert.equal(c.hit(),false);
 b.gate.pending=[{}];b.playerBlocked();
 assert.equal(c.action,null);assert.equal(c.staggerRemaining,1);assert.equal(b.playerHp,500);assert.equal(b.gate.pending.length,0);
 b.playerReaction.update(.2,b.player);assert.ok(b.player.position.z<-.27);
 assert.ok(b.playerReaction.flashRemaining>0);assert.equal(c.update(.99).staggered,true);assert.equal(c.update(.02).state,'idle');
});
test('boss block reaction lasts one second and never resumes the interrupted attack',()=>{
 const b=new BossBrain({Right_Jab_from_Guard:2,Block6:2});b.start('Right_Jab_from_Guard','attack');b.time=.2;
 b.parry();assert.equal(b.stagger,1);assert.equal(b.hp,900);assert.ok(b.flash>0);
 assert.equal(b.update(.99,2).events.length,0);assert.equal(b.mode,'attack');
 assert.equal(b.update(.02,2).events.length,0);assert.equal(b.mode,'idle');
});
test('only one-hand slash extends the blade contact length by ten percent',()=>{
 const node={computeWorldMatrix(){},getWorldMatrix:()=>Matrix.Identity()},sampler=new PlayerStrikeSampler();
 const length=(state,time)=>{const sample=sampler.sample({state,actionId:state,clipTime:time},node,null);return Vector3.Distance(...sample.blade.map(p=>Vector3.FromArray(p)));};
 assert.ok(Math.abs(length('slash',.5)/length('attack',.7)-1.1)<1e-9);
});
test('boss advances into three distinct hits; staggering any hit cancels the remaining combo',()=>{
 const clips={Right_Jab_from_Guard:2,Left_Hook_from_Guard:1,Left_Uppercut_from_Guard:1.3333,Block6:2};
 const b=new BossBrain(clips),events=[];let travel=0;b.startCombo();
 for(let t=0;t<4;t+=.01){const step=b.update(.01,2);events.push(...step.events);travel+=step.speed*.01;}
 assert.deepEqual(events.map(e=>e.name),BOSS_ADVANCING_COMBO);assert.ok(travel>2);assert.equal(b.mode,'idle');
 b.startCombo();b.update(.1,2);b.hit();b.update(.21,2);assert.equal(b.comboStep,0);assert.equal(b.mode,'idle');
});
test('rear critical uses the target facing, preserves front/side damage and raises damage by 30 percent',()=>{
 const target=Vector3.Zero();
 assert.deepEqual(rearDamage(100,new Vector3(0,0,-2),target,0),{damage:130,critical:true});
 assert.equal(rearDamage(100,new Vector3(0,0,2),target,0).damage,100);
 assert.equal(rearDamage(100,new Vector3(2,0,0),target,0).damage,100);
 assert.equal(rearDamage(300,new Vector3(0,0,2),target,Math.PI).damage,390);
 assert.equal(BOSS_DAMAGE.Skill_02,300);
 assert.ok(Object.entries(BOSS_DAMAGE).filter(([name])=>name!=='Skill_02').every(([,damage])=>damage>=80&&damage<=180));
});
test('grab locks all actions through flight and landing; anchored foot follows the hand and impact occurs once',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),player=new TransformNode('player',scene),boss=new TransformNode('boss',scene);
 const node=(name,parent,p)=>{const n=new TransformNode(name,scene);n.parent=parent;n.position.copyFromFloats(...p);return n;};
 const nodes={'mixamorig:RightFoot':node('foot',player,[-.2,.1,0]),'mixamorig:Head':node('head',player,[0,1.7,0])};
 const hands={'mixamorig:RightHand':node('hand',boss,[0,1.5,.7]),'mixamorig:RightForeArm':node('elbow',boss,[0,1.5,.4])};
 player.position.z=1.7;const c=new WarriorV2Controller({durations}),impacts=[];c.startAttack('judgment');c.update(.1);
 const grab=new BossGrab(locked=>locked?c.capture():c.releaseCapture(),critical=>impacts.push(critical));
 assert.equal(grab.start(player,nodes,7,true),true);
 const step=(time,dt=1/60)=>grab.update(dt,{boss,nodes:hands,serial:7,state:'Skill_02',clipTime:time,duration:1.3});
 for(let i=0;i<60;i++){
   hands['mixamorig:RightHand'].position.x=Math.sin(i/60*Math.PI*2)*.7;
   step(i/60);assert.equal(c.captured,true);assert.equal(c.attack(),false);assert.equal(c.dodge(),false);assert.equal(c.shieldPush(),false);assert.equal(c.setAttackHeld(true),false);
   const result=c.update(.1,{x:1,y:1});assert.equal(result.moving,false);assert.equal(result.actionId,null);
   if(i>10){
     nodes['mixamorig:RightFoot'].computeWorldMatrix(true);
     const h=hands['mixamorig:RightHand'].getAbsolutePosition(),e=hands['mixamorig:RightForeArm'].getAbsolutePosition();
     const palm=h.add(h.subtract(e).normalize().scale(.06));
     assert.ok(Vector3.Distance(palm,nodes['mixamorig:RightFoot'].getAbsolutePosition())<1e-6);
   }
 }
 step(1.2);assert.equal(grab.phase,'flight');
 for(let i=0;i<40;i++){step(1.2);assert.equal(c.captured,true);}
 assert.deepEqual(impacts,[true]);assert.equal(grab.phase,'recover');
 for(let i=0;i<40;i++)step(1.2);
 assert.equal(grab.active,false);assert.equal(c.captured,false);assert.equal(player.rotationQuaternion,null);assert.equal(player.position.y,0);
 assert.deepEqual(impacts,[true]);assert.equal(c.dodge(),true);
 assert.equal(grab.start(player,nodes,8),true);grab.reset();assert.equal(c.captured,false);
 scene.dispose();engine.dispose();
});
test('throw landing deals exactly 300 or 390 rear-critical damage, bypassing the prior-hit cooldown',()=>{
 for(const critical of [false,true]){
   const feedback=[],b=new BossEncounter({},()=>{},(...args)=>feedback.push(args));
   b.active=true;b.player={position:Vector3.Zero()};b.playerInvulnerable=1;
   b.hitPlayer(300,new Vector3(0,0,2),{superArmor:true,critical,grabImpact:true});
   assert.equal(b.playerHp,critical?110:200);assert.equal(feedback.length,1);assert.equal(b.playerReaction.remaining,0);
 }
});
