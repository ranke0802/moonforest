import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {BossBrain,BOSS_RECOVERY_READY_TIME,BOSS_RECOVERY_WAIT,BOSS_GRAB_APPROACH_DISTANCE} from '../src/boss-spec.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {PlayerStrikeSampler} from '../src/player-strikes.js';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {loadPoseAsset,loadPlayerPoseAsset} from './helpers/gltf-pose.js';
const config=JSON.parse(readFileSync(new URL('../public/assets/guardian-bear.json',import.meta.url)));
const durations=Object.fromEntries(config.catalog.map(c=>[c.name,c.duration]));
const source=loadPlayerPoseAsset(new URL('../public/assets/violet-warrior-v2.glb',import.meta.url));
const warriorNames=JSON.parse(readFileSync(new URL('../public/assets/warrior-v2.json',import.meta.url))).animations;
const warriorDurations=Object.fromEntries(Object.entries(warriorNames).map(([state,clip])=>[state,source.durations[clip]]));

test('grounded boss: actual slash, two-hit cut and three-hit judgment work at every down/recovery phase regardless of blade height',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),b=new BossEncounter({scene},()=>{}),player=new TransformNode('player',scene);
 b.active=true;b.config=config;b.actor=new TransformNode('boss',scene);b.carrier=new TransformNode('carrier',scene);b.carrier.parent=b.actor;
 b.nodes=Object.fromEntries(['Hips','Spine2','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'].map(n=>{
   const node=new TransformNode(n,scene);node.parent=b.carrier;node.position.y=.05;return [`mixamorig:${n}`,node];
 }));b.dt=1/60;b.groundHeight=0;
 for(const mode of ['down','recover'])for(const phase of [0,.5,1,2,3])for(const state of ['slash','attack','judgment'])for(const distance of [1.35,2.2,7]){
   b.brain=new BossBrain(durations);b.brain.start(mode==='down'?'Knock_Down_1':'Stand_Up3',mode);b.brain.time=phase;b.actor.position.set(0,0,distance);b.actor.rotation.y=Math.PI;b.gate.reset();
   const serial=b.brain.serial,c=new WarriorV2Controller({durations:warriorDurations}),sampler=new PlayerStrikeSampler();let matrix;
   const sword={computeWorldMatrix(){},getWorldMatrix:()=>matrix};c.startAttack(state);
   for(let t=0;t<3;t+=1/30){
     const result=c.update(1/30);matrix=source.pose(warriorNames[result.state],result.clipTime).Golden_Oathblade;
     c.pauseOnImpact(b.poseAndContacts(player,result,sampler.sample(result,sword,null),null)||0);
   }
   const expected=distance>3?0:state==='slash'?20:state==='attack'?38:64;
   assert.equal(900-b.brain.hp,expected,`${mode}/${phase}/${state}/${distance}`);
   assert.equal(b.brain.time,phase);assert.equal(b.brain.serial,serial);assert.equal(b.brain.stagger,0);
 }
 scene.dispose();engine.dispose();
});

test('recovery never pauses under repeated hits and next action begins within 0.5 seconds of standing',()=>{
 for(const dt of [1/60,1/20,.1])for(const distance of [1.8,5]){
   const b=new BossBrain(durations,()=>.37);b.start('Stand_Up3','recover');let time=0,actionAt;
   while(time<5){
     if(b.mode==='recover')b.hit({damage:1,heavy:true,stun:1.5});
     b.update(dt,distance);time+=dt;
     if(!['recover','idle'].includes(b.mode)){actionAt=time;break;}
   }
   assert.ok(actionAt>=BOSS_RECOVERY_READY_TIME);
   assert.ok(actionAt-BOSS_RECOVERY_READY_TIME<=.5+1e-8,`${dt}/${distance}: ${actionAt}`);
   assert.ok(b.hp<900);assert.equal(b.stagger,0);
 }
 assert.ok(BOSS_RECOVERY_WAIT<.5);
});

test('grab approaches at running speed, then attempts capture only after closing distance',()=>{
 const b=new BossBrain(durations);b.wait=0;b.bag=['Skill_02'];b.update(.016,2.6);
 assert.equal(b.mode,'approach');assert.equal(b.state,'Running');let distance=5;
 for(let t=0;t<2&&b.mode==='approach';t+=.016){const step=b.update(.016,distance);distance-=step.speed*.016;if(b.mode==='approach')assert.equal(step.speed,3.25);}
 assert.ok(distance<=BOSS_GRAB_APPROACH_DISTANCE);assert.equal(b.state,'Skill_02');assert.equal(b.mode,'attack');
 assert.equal(b.update(.01,distance).events.length,0);
 assert.equal(b.update(.2,distance).events[0]?.kind,'grab');
 b.start('Running','approach');b.hit({heavy:true});assert.equal(b.mode,'down');
});

test('grab bypasses dodge, shield casting and physical shield contact, but cannot catch outside its cast range',()=>{
 for(const state of ['idle','dodge','shieldPush','judgment']){
   const b=new BossEncounter({},()=>{});b.brain=new BossBrain(durations);b.player={position:Vector3.Zero()};b.actor={position:new Vector3(0,0,1.8)};
   let captures=0;b.grab.start=()=>{captures++;return true;};
   assert.equal(b.receiveBossHit({damage:300,grab:true,action:{state,actionId:1}}),false);
   assert.equal(b.receiveBossHit({damage:300,grab:true,shieldContact:true,action:{state,actionId:1}}),false);
   assert.equal(b.receiveBossHit({damage:300,grab:true,bodyContact:true,shieldContact:true,action:{state,actionId:1}}),true);
   assert.equal(captures,1);assert.equal(b.brain.stagger,0);assert.equal(b.playerHp,500);
 }
});

test('warrior knockdown uses the supplied clip, then authored recovery; input and further hits cannot restart it',()=>{
 for(const landed of [false,true]){
   const c=new WarriorV2Controller({durations:warriorDurations});c.startAttack('judgment');
   assert.equal(c.knockdown({landed}),true);assert.equal(c.action.state,'knockdown');
   assert.equal(c.action.time,landed?warriorDurations.knockdown*.55:0);
   const serial=c.serial;assert.equal(c.knockdown(),false);assert.equal(c.serial,serial);
   for(const method of ['attack','dodge','shieldPush'])assert.equal(c[method](),false);
   assert.equal(c.setAttackHeld(true),false);assert.equal(c.hit(1,{force:true}),false);
   const phases=new Set();let t=0;
   while(c.knockedDown&&t<5){const r=c.update(.016,{x:1});phases.add(r.state);if(r.knockedDown){assert.equal(r.moving,false);assert.equal(r.actionId,null);}t+=.016;}
   assert.ok(phases.has('getUp'));assert.equal(c.knockedDown,false);assert.equal(c.update(.1,{y:1}).state,'run');
   assert.ok(t<=warriorDurations.knockdown+warriorDurations.getUp+.02);
 }
});

test('heavy boss hits knock down, light hits stagger, dodge/block still avoid ordinary attacks',()=>{
 const c=new WarriorV2Controller({durations:warriorDurations}),b=new BossEncounter({},()=>{},()=>{},(duration,options={})=>options.knockdown?c.knockdown(options):c.hit(duration,options));
 b.brain=new BossBrain(durations);b.player={position:Vector3.Zero()};b.actor={position:new Vector3(0,0,2)};
 for(const state of ['dodge','shieldPush']){
   b.receiveBossHit({damage:180,heavy:true,bodyContact:true,action:{state,actionId:1}});assert.equal(c.knockedDown,false);assert.equal(b.playerHp,500);
 }
 b.receiveBossHit({damage:80,bodyContact:true,action:{state:'idle'}});assert.equal(c.knockedDown,false);assert.equal(c.staggerRemaining,.2);
 b.playerInvulnerable=0;c.startAttack('judgment');
 b.receiveBossHit({damage:180,heavy:true,bodyContact:true,action:{state:'judgment',actionId:1}});assert.equal(c.knockedDown,true);assert.ok(b.playerReaction.flashRemaining>0);
});
