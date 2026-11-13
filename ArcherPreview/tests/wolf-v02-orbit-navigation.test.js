import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {wolfHuntFixture,stepWolfHunt} from './helpers/wolf-hunt-fixture.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
import {WOLF_V02_ORBIT,WOLF_V02_GAIT} from '../src/wolf-v02-spec.js';
import {playerDimensions} from '../src/player-dimensions.js';

async function stalk(f,distance=3.1){
 await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;f.player.position.set(0,0,distance);
 e.brain.random=()=>.5;e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.behavior='observe';e.brain.observation=5;
 for(let i=0;i<20;i++)stepWolfHunt(f,e,1/60);
 e.brain.flankSide=-1;e.brain.beginStalk();return e;
}

test('an obstructed player-centered stride tries the opposite gait while preserving the full observation before a reachable attack',async t=>{
 const f=await wolfHuntFixture(t);let e=await stalk(f,5);
 f.world.navigation={segmentClear:(from,to,radius,sight)=>sight||to.x<=from.x+.00001,constrain(){},steer:(from,to)=>to};
 stepWolfHunt(f,e,1/60);assert.equal(e.brain.stalkBlocked,true);assert.equal(e.brain.time,0,'rejected root travel cannot advance support feet');assert.ok(e.actor.position.equalsWithEpsilon(Vector3.Zero(),1e-7));
 stepWolfHunt(f,e,1/60);assert.equal(e.brain.state,WOLF_V02_ORBIT.left);assert.equal(e.brain.flankReversed,true);assert.ok(e.actor.position.x<0,'left support motion must actually travel left');
 const radius=Vector3.Distance(e.actor.position,f.player.position);for(let i=0;i<20;i++)stepWolfHunt(f,e,1/60);assert.ok(Math.abs(Vector3.Distance(e.actor.position,f.player.position)-radius)<1e-6);
 f.world.navigation=null;e=await stalk(f);const before=e.actor.position.clone();
 f.world.navigation={segmentClear:(from,to,radius,sight)=>!!sight,constrain(){},steer:(from,to)=>to};
 const target=e.brain.circleTarget;let frames=0;
 for(;frames<8;frames++)stepWolfHunt(f,e,1/60);
 assert.equal(e.brain.behavior,'flank');assert.equal(e.brain.attackCount,0,'blocked steps cannot skip the requested observation');assert.equal(e.brain.flankReversed,true);
 for(;frames<Math.ceil((target+.1)*60)&&e.brain.mode!=='attack';frames++){
  stepWolfHunt(f,e,1/60);assert.equal(e.brain.circleTarget,target,'retries preserve the original observation budget');
  if(e.brain.circleElapsed<target-1e-8)assert.equal(e.brain.attackCount,0);
 }
 assert.equal(e.brain.mode,'attack','after the full budget, two blocked orbit directions still permit a visible reachable bite');assert.ok(e.brain.circleElapsed>=target-1e-8);assert.ok(e.actor.position.equalsWithEpsilon(before,1e-7));
 f.world.navigation=null;e=await stalk(f);const wallOrigin=e.actor.position.clone();
 f.world.navigation={segmentClear:()=>false,constrain:(position,previous)=>position.copyFrom(previous),steer:from=>from};
 for(let i=0;i<210;i++)stepWolfHunt(f,e,1/60);
 assert.equal(e.brain.attackCount,0,'a blocked line of sight must use navigation instead of attacking through the wall');assert.equal(e.playerHp,500);assert.ok(e.actor.position.equalsWithEpsilon(wallOrigin,1e-7));
 f.world.navigation=null;
});

test('a player leaving the orbit is pursued by the actual run rather than dragging a planted circle or retreating',async t=>{
 const f=await wolfHuntFixture(t),e=await stalk(f,3.1),target=e.brain.circleTarget;
 let pursued=false,maximumStep=0,previous=e.actor.position.clone();
 for(let i=0;i<Math.ceil((target+1)*60);i++){
  f.player.position.x+=3.6/60;stepWolfHunt(f,e,1/60);const step=Vector3.Distance(e.actor.position,previous);maximumStep=Math.max(maximumStep,step);previous.copyFrom(e.actor.position);
  const allowedSpeed=e.brain.mode==='move'?e.brain.approachSpeed:WOLF_V02_GAIT.runSpeed;
  assert.ok(step<=allowedSpeed/60+1e-6,'each tick stays within its current configured movement speed');
  assert.equal(e.brain.circleTarget,target,'a moving player cannot reset the observation into a new delay');
  if(e.brain.mode==='move'){
   assert.equal(e.brain.state,WOLF_CLIPS.run);assert.ok(e.brain.circleElapsed>=target-1e-8,'pursuit follows the completed observation');pursued=true;break;
  }
 }
 assert.ok(pursued,'large centre displacement exits the small-step gait and runs after the player');
 assert.ok(maximumStep<=WOLF_V02_GAIT.farRunSpeed/60+1e-6,'re-centering never exceeds the configured fast run distance per tick');
 for(const node of Object.values(e.nodes))if(node.scaling)assert.ok(Math.max(...node.scaling.asArray().map(v=>Math.abs(v-1)))<1e-5,'support adaptation cannot stretch the rig');
});

test('a walking player does not spin standing recovery feet and observation starts a real step before attention runs out',async t=>{
 const f=await wolfHuntFixture(t),e=await stalk(f,5);
 e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.behavior='observe';e.brain.observation=5;
 for(let i=0;i<20;i++)stepWolfHunt(f,e,1/60);
 e.brain.behavior='recovery';e.brain.recoveryRemaining=e.brain.recoveryFull=.65;e.brain.recoveryElapsed=0;e.brain.followupId=null;
 stepWolfHunt(f,e,1/60);
 const feet=['fore.L.paw','fore.R.paw','hind.L.paw','hind.R.paw'],positions=feet.map(n=>e.nodes[n].getAbsolutePosition().clone()),yaw=e.actor.rotation.y;
 for(let i=1;i<37;i++){
  const angle=3.6/5*i/60;f.player.position.set(Math.sin(angle)*5,0,Math.cos(angle)*5);stepWolfHunt(f,e,1/60);
  assert.equal(e.brain.behavior,'recovery');assert.ok(Math.abs(e.actor.rotation.y-yaw)<1e-9);
  for(let n=0;n<feet.length;n++)assert.ok(Vector3.Distance(positions[n],e.nodes[feet[n]].getAbsolutePosition())<1e-5,'standing support cannot rotate around the actor');
  const head=e.nodes.head,forward=Vector3.TransformNormal(Vector3.Up(),head.getWorldMatrix()).normalize(),target=f.player.position.add(new Vector3(0,playerDimensions(f.player).bodyAimHeight,0)).subtract(head.getAbsolutePosition()).normalize();
  assert.ok(Math.acos(Math.max(-1,Math.min(1,Vector3.Dot(forward,target))))<.18,'bounded 3D attention follows the walking player throughout the retained recovery');
 }
 e.brain.behavior='observe';e.brain.observation=5;stepWolfHunt(f,e,1/60);assert.equal(e.brain.behavior,'flank');assert.ok(Object.values(WOLF_V02_ORBIT).includes(e.brain.state),'a large observation turn uses the authored support step');
});

test('support and attention refresh only cached affected branches with bounded matrix work and identical poses',async t=>{
 const f=await wolfHuntFixture(t),e=await stalk(f,5);
 for(let i=0;i<12;i++)stepWolfHunt(f,e,1/60);
 assert.equal(e.brain.behavior,'flank');
 const pose=e.v02Pose,branches=[...pose.slots.values()].map(slot=>slot.branch),rig=e.animator.nodes;
 const expected=rig.map(node=>({node,position:node.getAbsolutePosition().clone(),rotation:node.rotationQuaternion?.clone()}));
 // Compare the optimized path to the previous full-rig refresh, using the
 // same authored pose, actual planted anchors and bounded correction maths.
 const optimized=pose.refresh;let legacyRefreshes=0;pose.refresh=()=>{legacyRefreshes++;e.animator.ensurePoseCurrent();};
 pose.restore();e.animator.ensurePoseCurrent();pose.plantOrbit(e.brain.state===WOLF_V02_ORBIT.left);pose.aim();
 const reference=rig.map(node=>({node,position:node.getAbsolutePosition().clone(),rotation:node.rotationQuaternion?.clone()}));
 pose.refresh=optimized;
 for(const sample of reference){const first=expected.find(row=>row.node===sample.node);assert.ok(Vector3.Distance(first.position,sample.position)<1e-5,'full refresh reference must reproduce the actual corrected game pose');}
 const marks=new Map(rig.map(node=>[node,0])),originals=new Map(rig.map(node=>[node,node.markAsDirty])),ensure=e.animator.ensurePoseCurrent;
 let fullRefreshes=0;
 try{
  pose.restore();e.animator.ensurePoseCurrent();
  for(const node of rig)node.markAsDirty=function(...args){marks.set(node,marks.get(node)+1);return originals.get(node).apply(this,args);};
  e.animator.ensurePoseCurrent=function(...args){fullRefreshes++;return ensure.apply(this,args);};
  pose.plantOrbit(e.brain.state===WOLF_V02_ORBIT.left);pose.aim();
  const visits=[...marks.values()].reduce((a,b)=>a+b,0);
  assert.ok(legacyRefreshes>=10,'the same physical pose exercises both leg solvers and both attention joints');
  assert.equal(fullRefreshes,0,'joint corrections cannot request a whole-rig refresh');
  assert.ok(visits>0&&visits<=rig.length,`two support legs and attention use at most one rig-sized amount of dirty work (${visits}/${rig.length}), rather than repeated full passes: ${JSON.stringify([...marks].filter(([,count])=>count).map(([node,count])=>[node.name,count]))}`);
  for(const name of ['root','pelvis','spine','chest'])assert.equal(marks.get(e.nodes[name]),0,`a corrected foot/head cannot dirty unrelated ${name}`);
  for(const sample of reference){
   assert.ok(Vector3.Distance(sample.position,sample.node.getAbsolutePosition())<1e-5,'branch refresh preserves each corrected world position');
   if(sample.rotation)assert.ok(Math.abs(Math.abs(sample.rotation.dot(sample.node.rotationQuaternion))-sample.rotation.lengthSquared())<1e-6,'branch refresh preserves each corrected joint rotation');
  }
  let index=0;for(const slot of pose.slots.values())assert.equal(slot.branch,branches[index++],'refresh reuses the preparation-time branch tables');
 }finally{
  for(const node of rig)node.markAsDirty=originals.get(node);
  e.animator.ensurePoseCurrent=ensure;pose.refresh=optimized;
 }
});
