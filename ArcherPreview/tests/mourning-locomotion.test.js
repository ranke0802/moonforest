import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {MourningLocomotion,MOURNING_ROUTE_POLICY} from '../src/mourning-locomotion.js';
import {ElenaBrain,ELENA_HOME,MOURNING_SIZE,MOURNING_MOVEMENT,MOURNING_CAST_LEAD_IN} from '../src/elena-spec.js';
import {MourningCaveNavigation} from '../src/mourning-cave-navigation.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {mourningCaveClearance} from '../src/mourning-cave-clearance.js';

function fixture(navigation={free:()=>true,segmentClear:()=>true}){
  const e={actor:{position:new Vector3(25.5,6,-24.125)},brain:new ElenaBrain({idle:6,walk:2.4,cast:3,dead:2.4},{mourning:true}),home:ELENA_HOME,radius:MOURNING_SIZE.radius,stopDistance:MOURNING_SIZE.stopDistance,movementNavigation:navigation,world:{terrain:{heightAt:()=>6}},animator:{gaitRate:0},spell:{resets:0,reset(){this.resets++;}}};
  const player={position:new Vector3(31.5,6,-24.125)},motion=new MourningLocomotion();
  return {e,player,motion};
}
function tick(f,dt,{freeze=false}={}){
  const {e,player,motion}=f;e.dt=dt;
  const result=e.brain.update(dt,Vector3.Distance(e.actor.position,player.position),true),plan=motion.plan(e,player,result);
  if(result.speed&&!freeze){const delta=plan.target.subtract?plan.target.subtract(e.actor.position):new Vector3(plan.target.x-e.actor.position.x,0,plan.target.z-e.actor.position.z),d=delta.length();if(d>plan.stopDistance)e.actor.position.addInPlace(delta.scale(Math.min(result.speed*dt,d-plan.stopDistance)/d));}
  return {result,plan};
}

test('a concave full-pose corner cannot be accepted between coarse route samples',()=>{
  // The former corner was opened by the rear apparatus regrouping. This
  // actual new boundary still dips below the required 8 cm root reserve
  // between the old 40 cm sample locations, despite both endpoints being free.
  const nav=new MourningCaveNavigation(caveObstacles()),a={x:35.299301327206194,z:-31.264836706686765},b={x:33.907096239738166,z:-30.257714561885223},r=MOURNING_SIZE.radius;
  assert.ok(nav.free(a,r,80));assert.ok(nav.free(b,r,80));
  assert.ok(mourningCaveClearance(35.17539507442154,-31.17520283579943)<.08,'actual interior point fails the mandatory root reserve');
  assert.equal(CaveNavigation.prototype.segmentClear.call(nav,a,b,r),true,'reproduces the old coarse acceptance');
  assert.equal(nav.segmentClear(a,b,r),false,'the whole segment must be certified, not only its sampled points');
  assert.equal(nav.segmentClear({x:25.5,z:-24.125},{x:31.8,z:-24.125},r),true,'the useful charge corridor remains open');
});

for(const fps of [30,60])test(`a newly blocked charge warning cancels without an old path or inherited cast clock at ${fps}fps`,()=>{
  let blocked=false,queries=0;const f=fixture({free:()=>true,segmentClear(){queries++;return !blocked;}});
  f.e.brain.movementTurn=3;f.e.brain.reposition();
  const origin=f.e.actor.position.clone();let elapsed=0;
  while(elapsed<.35){tick(f,1/fps);elapsed+=1/fps;assert.equal(Vector3.Distance(origin,f.e.actor.position),0);}
  assert.ok(f.e.chargeOrigin);const serial=f.e.brain.serial;blocked=true;let recovery=0;
  while(f.e.brain.mode!=='attack'&&recovery<1){tick(f,1/fps);recovery+=1/fps;}
  assert.ok(recovery<=MOURNING_ROUTE_POLICY.chargeCheckInterval+1/fps+1e-6);
  assert.equal(f.e.chargeOrigin,null);assert.equal(f.e.repositionTarget,null);assert.ok(f.e.brain.serial>serial);
  assert.equal(f.e.brain.time,0);assert.equal(f.e.brain.castLeadInRemaining,MOURNING_CAST_LEAD_IN);assert.ok(f.e.spell.resets>0);
  const calls=queries;for(let i=0;i<fps;i++)tick(f,1/fps);assert.equal(queries,calls,'a fallback cast cannot replan every frame');
});

for(const fps of [30,60])test(`a physically stalled step tries one alternate then casts with bounded work at ${fps}fps`,()=>{
  const f=fixture();f.e.brain.reposition();const start=f.e.actor.position.clone();let elapsed=0;
  while(f.e.brain.mode!=='attack'&&elapsed<2){tick(f,1/fps,{freeze:true});elapsed+=1/fps;}
  assert.equal(f.e.brain.mode,'attack');assert.ok(elapsed<.7);assert.equal(Vector3.Distance(start,f.e.actor.position),0);
  assert.equal(f.motion.redirects,1);assert.equal(f.motion.blockedRecoveries,2);assert.equal(f.motion.selections,2);assert.equal(f.motion.magicFallbacks,1);
  assert.equal(f.e.brain.time,0);assert.equal(f.e.brain.castLeadInRemaining,MOURNING_CAST_LEAD_IN);
});

for(const fps of [30,60])test(`a step that initially progresses then stops gets one rolling ${MOURNING_ROUTE_POLICY.progressWindow}s recovery window at ${fps}fps`,()=>{
  const f=fixture();f.e.brain.reposition();tick(f,1/fps);tick(f,1/fps);const stopped=f.e.actor.position.clone(),serial=f.e.brain.serial;let stalled=0;
  // This models a real collision/separation after a little successful movement.
  // A batch-aligned watchdog counts that early movement at the end of its first
  // window, then waits a second full window before recognizing the stoppage.
  while(f.e.brain.serial===serial&&stalled<.5){tick(f,1/fps,{freeze:true});stalled+=1/fps;}
  assert.ok(f.e.brain.serial>serial,'a stopped action must actually hand off');assert.ok(stalled<=MOURNING_ROUTE_POLICY.progressWindow+2/fps+1e-8,`${stalled}s after the last net progress`);assert.ok(stalled<=.45);assert.ok(f.e.actor.position.equals(stopped));assert.equal(f.e.brain.moveKind,'walk');assert.equal(f.e.chargeOrigin,null);
});

test('a rejected fast charge switches to ordinary walk speed in the same frame',()=>{
  const f=fixture({free:()=>true,segmentClear:(a,b)=>Math.abs(b.z-a.z)>.5});
  f.e.brain.movementTurn=3;f.e.brain.reposition();f.e.brain.time=1.1;
  const before=f.e.actor.position.clone(),{result}=tick(f,1/60);
  assert.equal(f.e.brain.moveKind,'walk');assert.equal(result.speed,MOURNING_MOVEMENT.walkSpeed);
  assert.equal(f.e.brain.time,0);assert.equal(f.e.chargeOrigin,null);assert.ok(Vector3.Distance(before,f.e.actor.position)<=MOURNING_MOVEMENT.walkSpeed/60+1e-8);
});

test('route choice is cached between actions and six recent places are reused rather than retained indefinitely',()=>{
  let queries=0;const f=fixture({free(){queries++;return true;},segmentClear(){queries++;return true;}});
  f.e.brain.reposition();tick(f,0);const target=f.e.repositionTarget,calls=queries;
  for(let i=0;i<120;i++){f.e.dt=0;const result={speed:MOURNING_MOVEMENT.walkSpeed};assert.strictEqual(f.motion.plan(f.e,f.player,result).target,target);}
  assert.equal(queries,calls);
  for(let i=0;i<30;i++)f.motion.remember({x:i,z:i/2});
  assert.equal(f.motion.recent.length,MOURNING_ROUTE_POLICY.historyLimit);
  const history=f.motion.recent;f.motion.reset();assert.strictEqual(f.motion.recent,history);assert.equal(history.length,0);
});
