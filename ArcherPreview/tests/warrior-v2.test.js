import test from 'node:test';
import assert from 'node:assert/strict';
import {WarriorV2Controller,V2_ATTACKS} from '../src/warrior-v2.js';
const durations={idle:56/30,run:.8,attack:3,slash:1.5,judgment:130/30,shieldPush:71/30};
const create=(random=()=>0)=>new WarriorV2Controller({durations,speeds:{run:4.4371},random});
test('v2: continuous attacks cycle slash, thrust, judgment in the requested fixed order',()=>{
 const c=create(),sequence=[];c.setAttackHeld(true);
 for(let i=0;i<15;i++){sequence.push(c.action.state);c.update(durations[c.action.state]-c.action.time+.001);}
 assert.equal(new Set(sequence).size,3);
 for(let i=1;i<sequence.length;i++)assert.notEqual(sequence[i],sequence[i-1]);
 assert.deepEqual(sequence,Array.from({length:15},(_,i)=>['slash','attack','judgment'][i%3]));
});

test('v2: releasing the chain resets to slash after idle or locomotion, at every attack speed',()=>{
 for(const speed of [.5,1,2])for(const input of [{},{y:1}]){
  const c=create();c.setAttackSpeed(speed);c.setAttackHeld(true);c.update((durations.slash+.2)/speed);
  assert.equal(c.action.state,'attack');c.setAttackHeld(false);c.update(durations.attack/speed,input);
  assert.equal(c.action,null);c.setAttackHeld(true);assert.equal(c.action.state,'slash');
 }
});

test('v2: quick second tap queues the next strike; no input after it resets the chain',()=>{
 const c=create();c.setAttackHeld(true);c.setAttackHeld(false);c.update(.4);
 c.setAttackHeld(true);c.setAttackHeld(false);c.update(1.11);assert.equal(c.action.state,'attack');
 c.update(3);c.attack();assert.equal(c.action.state,'slash');
});

test('v2: sword input during shield push starts a fresh slash',()=>{
 const c=create();c.shieldPush();c.update(.5);c.setAttackHeld(true);c.setAttackHeld(false);
 c.update(2);assert.equal(c.action.state,'slash');
});
test('v2: held sequential attacks respect different durations and release returns to moving idle',()=>{
 const c=create();c.setAttackHeld(true);c.update(1.75);assert.equal(c.action.state,'attack');assert.ok(Math.abs(c.action.time-.25)<1e-9);
 c.setAttackHeld(false);c.update(2.8);assert.equal(c.state,'idle');const t=c.time;c.update(.2);assert.ok(c.time>t);
});
test('v2: explicit attack selection and shield push, without interrupting a running attack',()=>{
 const c=create();c.setAttackChoice('judgment');c.attack();assert.equal(c.action.state,'judgment');assert.equal(c.shieldPush(),false);
 c.update(5);assert.equal(c.shieldPush(),true);c.setAttackSpeed(2);assert.equal(c.update(1).clipTime,1);
 assert.equal(c.update(2,{y:1}).state,'run');assert.equal(c.update(.1,{y:1}).speed,4.4371);
});
test('v2: source idle runs at normal speed, and run/attack choices remain available',()=>{
 const c=create();c.setAttackSpeed(2);assert.equal(c.update(.5).clipTime,.5);c.update(2);assert.ok(c.time<durations.idle);
 assert.equal(c.update(.2,{y:.5}).clipTime,.1);assert.equal(c.update(.1).state,'idle');
 for(const kind of V2_ATTACKS){c.setAttackChoice(kind);c.attack();assert.equal(c.action.state,kind);c.update(durations[kind]/2+.01);}
});
