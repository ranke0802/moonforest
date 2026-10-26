import test from 'node:test';
import assert from 'node:assert/strict';
import {WarriorV2Controller,V2_ATTACKS,V2_ATTACK_BASE_RATE,V2_HOLD_SECONDS,V2_COMBO_GRACE} from '../src/warrior-v2.js';
const durations={idle:56/30,run:.8,attack:3,slash:1.5,judgment:130/30,shieldPush:71/30,dodge:74/30};
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
test('normal attacks lock movement; one buffered tap chains before held movement',()=>{
 for(const speed of [.5,1,2]){
  const c=create();c.setAttackSpeed(speed);tap(c);c.requestMovement();
  assert.equal(c.update(.05,{y:1}).state,'slash');
  for(let i=0;i<8;i++){c.setAttackHeld(true);c.setAttackHeld(false);}
  c.update(durations.slash/c.attackSpeed,{y:1});assert.equal(c.action.state,'attack');assert.equal(c.serial,2);
  assert.equal(c.update(durations.attack/c.attackSpeed+.01,{y:1}).state,'run');assert.equal(c.serial,2);
 }
});

test('fresh long press during judgment recovery is accepted and fires when recovery ends',()=>{
 for(const speed of [.5,1,2]){
  const c=create();c.setAttackSpeed(speed);c.setAttackHeld(true);c.update(.45);c.setAttackHeld(false);
  c.update(1.2/c.attackSpeed);assert.equal(c.setAttackHeld(true),true);
  c.update(.45);assert.equal(c.action.state,'judgment');assert.equal(c.serial,1);assert.equal(c.chargeProgress,1);
  c.setAttackHeld(false);const remaining=(durations.judgment-c.action.time)/c.attackSpeed;
  c.update(remaining+.01,{y:1});assert.equal(c.serial,2);assert.equal(c.action.state,'judgment');
  assert.ok(c.action.time<=.01*c.attackSpeed+1e-8);c.update(10);assert.equal(c.serial,2);
 }
});

test('shield push cancels a pending charge; a new hold during the cast is accepted',()=>{
 const c=create();c.setAttackHeld(true);c.update(.2);assert.equal(c.shieldPush(),true);assert.equal(c.held,false);
 assert.equal(c.setAttackHeld(true),true);c.update(.45);c.setAttackHeld(false);assert.equal(c.queuedAttack,'judgment');
 c.update(durations.shieldPush-.45+.01);assert.equal(c.action.state,'judgment');assert.equal(c.serial,2);
});

test('focus loss discards a queued tap or charged heavy without cancelling the current clip',()=>{
 for(const hold of [.05,.6]){
  const c=create();tap(c);c.setAttackHeld(true);c.update(hold);c.setAttackHeld(false);
  assert.ok(c.queuedAttack);c.cancelAttackInput();c.update(5);assert.equal(c.serial,1);assert.equal(c.action,null);
 }
 const c=create();c.setAttackHeld(true);c.update(.3);c.cancelAttackInput();c.setAttackHeld(false);
 assert.equal(c.update(3).state,'idle');assert.equal(c.serial,0);
});

test('movement cannot interrupt sword or shield clips; resumes only after completion',()=>{
 for(const kind of [...V2_ATTACKS,'shieldPush'])for(const phase of [.05,.3,.65,.95]){
  const c=create();c.startAttack(kind);c.update(durations[kind]*phase/c.playbackRate(kind));c.requestMovement();
  assert.equal(c.update(.001,{x:1}).state,kind,`${kind} ${phase}`);
  assert.equal(c.update(durations[kind],{x:1}).state,'run');assert.equal(c.action,null);
 }
 const c=create();tap(c);c.update(durations.slash);c.requestMovement();tap(c);assert.equal(c.action.state,'slash');
});

test('a new press during hit-stun charges without requiring another press after recovery',()=>{
 const c=create();c.attack();c.update(.45);c.hit(.26);
 const result=c.update(.1,{y:1});assert.equal(result.staggered,true);assert.equal(result.state,'slash');assert.equal(result.clipTime,.45);
 assert.equal(result.actionId,null);assert.equal(result.moving,false);
 assert.equal(c.setAttackHeld(true),true);c.update(.1,{y:1});
 assert.equal(c.update(.08,{y:1}).state,'idle');assert.equal(c.action,null);
 c.update(.27);assert.equal(c.action.state,'judgment');assert.equal(c.serial,2);
 c.hit(.2,{force:true});c.setAttackHeld(false);c.update(2);assert.equal(c.action,null);assert.equal(c.serial,2);
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

test('repeated dodge and shield push inputs cannot restart or queue the same defense',()=>{
 for(const kind of ['dodge','shieldPush'])for(const speed of [.5,1,2]){
  const c=create();c.setMotionSpeed(kind,speed);assert.equal(c[kind](),true);
  const action=c.action,step=durations[kind]/speed/30;
  for(let i=0;i<29;i++){
   c.update(step);const before={...action};
   for(let tap=0;tap<3;tap++)assert.equal(c[kind](),false);
   assert.equal(c.action,action);assert.deepEqual(c.action,before);assert.equal(c.serial,1);
  }
  assert.equal(c.update(step*1.01,{y:1}).state,'run');assert.equal(c.action,null);assert.equal(c.serial,1);
  assert.equal(c[kind](),true);assert.equal(c.serial,2);assert.equal(c.action.time,0);
 }
});

test('ignored repeat defense preserves an already buffered sword attack and impact pause',()=>{
 for(const kind of ['dodge','shieldPush']){
  const c=create();c[kind]();c.update(.1);c.attack();c.pauseOnImpact(.08);
  const before={...c.action};assert.equal(c[kind](),false);
  assert.deepEqual(c.action,before);assert.equal(c.queuedAttack,'normal');
 }
});

test('defense still interrupts other actions and accepts a different defense',()=>{
 const c=create();c.attack();c.update(.1);
 assert.equal(c.dodge(),true);assert.equal(c.action.state,'dodge');
 assert.equal(c.shieldPush(),true);assert.equal(c.action.state,'shieldPush');
 assert.equal(c.dodge(),true);assert.equal(c.action.state,'dodge');
});
