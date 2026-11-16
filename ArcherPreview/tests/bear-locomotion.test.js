import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {bearContactFixture} from './helpers/bear-contact-fixture.js';
import {BEAR_SOURCE_GAIT_SPEED} from '../src/bear-locomotion.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {BEAR_V02_4_5M_REFERENCE} from '../src/bear-size.js';

test('actual approved low-foot stance travel matches the calibrated gait clocks; hip loops have zero net travel',async t=>{
 const f=await bearContactFixture(t),e=f.bear;e.actor.position.setAll(0);f.player.position.z=30;const measurements=[];
 for(const name of ['Walking','Running']){
  const clip=e.config.catalog.find(c=>c.name===name),feet=[[],[]];f.sample(name,0);
  for(let frame=0;frame<clip.frames;frame++){f.sample(name,frame/clip.fps);for(let side=0;side<2;side++){const p=e.nodes['mixamorig:'+(side?'RightFoot':'LeftFoot')].getAbsolutePosition();feet[side].push({y:p.y,z:p.z});}}
  let travel=0,seconds=0;for(const foot of feet){const low=Math.min(...foot.map(p=>p.y))+.08*e.config.scale/BEAR_V02_4_5M_REFERENCE.scale;for(let i=1;i<foot.length;i++)if(foot[i].y<=low&&foot[i-1].y<=low&&foot[i].z<foot[i-1].z){travel+=foot[i-1].z-foot[i].z;seconds+=1/clip.fps;}}
  const measured=travel/seconds,calibrated=BEAR_SOURCE_GAIT_SPEED[name]*e.config.scale;assert.ok(Math.abs(measured/calibrated-1)<.02,name+' stance '+measured+' / '+calibrated);
  assert.ok(Math.hypot(clip.rootTrack.at(-1)[0]-clip.rootTrack[0][0],clip.rootTrack.at(-1)[2]-clip.rootTrack[0][2])<1e-6);
  measurements.push({name,worldMetresPerSourceSecond:measured,calibrated});
 }
 const flip=e.config.catalog.find(c=>c.name==='Backflip'),arc=e.bearLocomotion.distanceAt(flip.duration)*e.config.scale;assert.ok(arc>1.4&&arc<1.55);t.diagnostic(JSON.stringify({measurements,backflipDistance:arc}));
});

test('walking/running source time follows accepted world distance at native and territory speeds, and freezes at a wall',async t=>{
 const f=await bearContactFixture(t),e=f.bear,original=e.brain.update.bind(e.brain);f.player.position.set(0,0,30);
 for(const state of ['Walking','Running'])for(const hz of [30,60])for(const speed of [1.2,state==='Running'?3.25:1.65]){
  e.actor.position.setAll(0);e.actor.rotation.y=0;e.bearLocomotion.reset();e.brain.start(state,'move');e.lastSerial=null;e.lastRoot=null;
  e.brain.update=dt=>{e.brain.time+=dt;return {events:[],speed};};e.movementPlan=()=>({target:f.player.position,stopDistance:0});
  for(let frame=0;frame<hz;frame++)e.update(1/hz,f.player);
  assert.ok(Math.abs(e.actor.position.z-speed)<1e-6);const expected=(speed/(BEAR_SOURCE_GAIT_SPEED[state]*e.config.scale))%e.brain.durations[state];assert.ok(Math.abs(e.brain.time-expected)<1e-8,state+' '+hz+' '+speed);
  const clock=e.brain.time;e.update(0,f.player);assert.equal(e.brain.time,clock);
 }
 const clock=e.brain.time;f.world.navigation={segmentClear:()=>true,steer:(_p,target)=>target,constrain:(p,old)=>p.copyFrom(old)};e.update(1/30,f.player);assert.equal(e.brain.time,clock,'a blocked step cannot keep running in place');e.brain.update=original;
});

test('Backflip has one backward displacement owner and the ordinary wall/cliff collider path stops it',async t=>{
 const f=await bearContactFixture(t),e=f.bear;f.player.position.set(0,0,20);
 for(const hz of [30,60]){
  f.world.navigation=null;e.actor.position.setAll(0);e.actor.rotation.y=0;e.bearLocomotion.reset();e.brain.start('Backflip','evade');e.lastSerial=null;e.lastRoot=null;
  e.update(0,f.player);assert.equal(e.actor.position.z,0);
  for(let frame=0;frame<180&&e.brain.mode==='evade';frame++)e.update(1/hz,f.player);
  assert.ok(e.actor.position.z < -1.4&&e.actor.position.z > -1.55,'natural backward travel '+e.actor.position.z);assert.ok(Math.abs(e.actor.position.x)<1e-7);
 }
 const obstacle={id:'cliff-band',shape:'box',x:0,z:-2,yaw:0,halfWidth:2,halfDepth:.2,radius:2.01,height:4};f.world.navigation=new VillageNavigation([obstacle]);e.actor.position.setAll(0);e.actor.rotation.y=0;e.bearLocomotion.reset();e.brain.start('Backflip','evade');e.lastSerial=null;e.lastRoot=null;
 for(let frame=0;frame<150&&e.brain.mode==='evade';frame++){e.update(1/60,f.player);assert.ok(f.world.navigation.free(e.actor.position,e.radius));}
 assert.ok(e.actor.position.z>-(1.8-e.radius)-.01&&e.actor.position.z<0,'nav prevents backward crossing of the collider band');
});
