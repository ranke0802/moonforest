import test from 'node:test';
import assert from 'node:assert/strict';
import {WarriorV2Controller,V2_ATTACKS,V2_ATTACK_BASE_RATE,V2_HOLD_SECONDS,V2_COMBO_GRACE} from '../src/warrior-v2.js';
const durations={idle:56/30,run:.8,attack:3,slash:1.5,judgment:130/30,shieldPush:71/30};
const create=()=>{const c=new WarriorV2Controller({durations,speeds:{run:4.4371}});c.setAttackSpeed(1/V2_ATTACK_BASE_RATE);return c;};
const tap=c=>{c.setAttackHeld(true);c.update(.05);c.setAttackHeld(false);};

test('short presses alternate only slash and thrust/slash, across all attack speeds',()=>{
 for(const speed of [.5,1,2]){
  const c=create();c.setAttackSpeed(speed);const sequence=[];
  for(let i=0;i<10;i++){
   c.setAttackHeld(true);assert.equal(c.action,null,'No premature normal attack on press');c.update(.05);c.setAttackHeld(false);
   sequence.push(c.action.state);c.update(durations[c.action.state]/c.attackSpeed+.1);
  }
  assert.deepEqual(sequence,Array.from({length:10},(_,i)=>i%2?'attack':'slash'));
 }
});
test('a pause after completion resets normal attacks to slash',()=>{
 const c=create();tap(c);c.update(durations.slash+.1);tap(c);assert.equal(c.action.state,'attack');
 c.update(durations.attack+V2_COMBO_GRACE+.01);tap(c);assert.equal(c.action.state,'slash');
});
test('long press fires judgment at 0.45 seconds, with no preceding or release normal attack',()=>{
 const c=create();c.setAttackHeld(true);const preparing=c.update(V2_HOLD_SECONDS-.01);
 assert.equal(c.action,null);assert.ok(preparing.chargeProgress>.95);assert.equal(preparing.actionId,null);
 const charged=c.update(.01);assert.equal(charged.state,'judgment');assert.equal(charged.chargeProgress,0);assert.equal(c.serial,1);
 c.setAttackHeld(false);assert.equal(c.action.state,'judgment');c.update(5);assert.equal(c.action,null);assert.equal(c.serial,1);
 tap(c);assert.equal(c.action.state,'slash');
});
test('continuing to hold fires judgment once, and a new press is required to repeat',()=>{
 const c=create();c.setAttackHeld(true);c.update(8);assert.equal(c.action,null);assert.equal(c.serial,1);
 c.setAttackHeld(true);c.update(10);assert.equal(c.action,null);assert.equal(c.serial,1);
 c.setAttackHeld(false);c.setAttackHeld(true);c.update(V2_HOLD_SECONDS);assert.equal(c.action.state,'judgment');assert.equal(c.serial,2);
});
test('charge duration is independent of attack speed; only time after threshold advances the clip',()=>{
 for(const speed of [.5,1,2])for(const frames of [1,27,90]){
  const c=create();c.setAttackSpeed(speed);c.setAttackHeld(true);
  for(let i=0;i<frames;i++)c.update(V2_HOLD_SECONDS/frames);
  assert.equal(c.action.state,'judgment');assert.ok(c.action.time<1e-8);
  c.update(.1);assert.ok(Math.abs(c.action.time-.1*speed*V2_ATTACK_BASE_RATE)<1e-8);
 }
 const c=create();c.setAttackHeld(true);c.update(.6);assert.ok(Math.abs(c.action.time-.15)<1e-9);
});
test('a tap or long press begun during an attack is ignored, never queued',()=>{
 for(const hold of [.05,2]){
  const c=create();tap(c);assert.equal(c.setAttackHeld(true),false);assert.equal(c.attack(),false);
  c.update(hold);c.setAttackHeld(false);c.update(5);assert.equal(c.action,null);assert.equal(c.serial,1);
 }
});
test('shield push cancels pending charge; attack input during shield push cannot queue an attack',()=>{
 const c=create();c.setAttackHeld(true);c.update(.2);assert.equal(c.shieldPush(),true);assert.equal(c.held,false);
 assert.equal(c.setAttackHeld(true),false);c.update(durations.shieldPush+.1);c.setAttackHeld(false);assert.equal(c.action,null);assert.equal(c.serial,1);
 tap(c);assert.equal(c.action.state,'slash');
});
test('cancelled input is discarded instead of firing a short press on release',()=>{
 const c=create();c.setAttackHeld(true);c.update(.3);c.cancelAttackInput();c.setAttackHeld(false);
 assert.equal(c.update(3).state,'idle');assert.equal(c.serial,0);
 c.setAttackHeld(true);c.update(.1);c.requestMovement();const result=c.update(.01,{y:1});assert.equal(result.cancelled,true);assert.equal(result.state,'run');
 c.setAttackHeld(false);assert.equal(c.update(2).state,'idle');assert.equal(c.serial,0);
});
test('movement cancels every sword/shield phase immediately and resets normal combo',()=>{
 for(const kind of [...V2_ATTACKS,'shieldPush'])for(const phase of [.05,.3,.65,.95]){
  const c=create();c.startAttack(kind);c.update(durations[kind]*phase);
  c.requestMovement();const result=c.update(1/60,{x:.7,y:.7});
  assert.equal(result.state,'run',`${kind} ${phase}`);assert.ok(result.speed>0);assert.equal(result.actionId,null);
  assert.equal(result.cancelled,true);assert.equal(c.action,null);assert.equal(c.held,false);
  for(let i=0;i<100;i++)assert.equal(c.update(.05).state,'idle');
  tap(c);assert.equal(c.action.state,'slash');
 }
 const c=create();tap(c);c.update(durations.slash);c.requestMovement();c.update(.01,{x:1});tap(c);assert.equal(c.action.state,'slash');
});
test('stagger freezes current pose, cancels damage and charge, then resumes movement',()=>{
 const c=create();c.attack();c.update(.45);c.hit(.26);
 const result=c.update(.1,{y:1});assert.equal(result.staggered,true);assert.equal(result.state,'slash');assert.equal(result.clipTime,.45);
 assert.equal(result.actionId,null);assert.equal(result.moving,false);assert.equal(c.attack(),false);assert.equal(c.shieldPush(),false);assert.equal(c.setAttackHeld(true),false);
 assert.equal(c.update(.1,{y:1}).clipTime,.45);
 const recovered=c.update(.08,{y:1});assert.equal(recovered.state,'run');assert.equal(recovered.speed,4.4371);assert.equal(c.action,null);
 c.setAttackHeld(true);c.update(.2);c.hit();c.setAttackHeld(false);c.update(1);assert.equal(c.action,null);assert.equal(c.serial,1);
 tap(c);assert.equal(c.action.state,'slash');
});
test('idle and run remain at authored speed; all source attacks remain playable',()=>{
 const c=create();c.setAttackSpeed(2);assert.equal(c.update(.5).clipTime,.5);c.update(2);assert.ok(c.time<durations.idle);
 assert.equal(c.update(.2,{y:.5}).clipTime,.1);assert.equal(c.update(.1).state,'idle');
 for(const kind of V2_ATTACKS){c.startAttack(kind);assert.equal(c.action.state,kind);c.update(durations[kind]/c.attackSpeed+.01);}
});
test('default 1x equals source 1.8x, new 2x equals 3.6x; shield speed is unchanged',()=>{
 const c=new WarriorV2Controller({durations});
 assert.equal(c.attackSpeed,1.8);c.attack();assert.ok(Math.abs(c.update(.2).clipTime-.36)<1e-9);
 c.cancelAttack();c.setAttackSpeed(2);c.attack();assert.ok(Math.abs(c.update(.2).clipTime-.72)<1e-9);
 c.cancelAttack();assert.equal(c.update(.2).clipTime,.2);assert.equal(c.update(.2,{y:1}).clipTime,.2);
 c.shieldPush();assert.equal(c.update(.2).clipTime,.2);
});
