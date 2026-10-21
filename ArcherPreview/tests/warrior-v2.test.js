import test from 'node:test';
import assert from 'node:assert/strict';
import {WarriorV2Controller,V2_ATTACKS,V2_ATTACK_BASE_RATE} from '../src/warrior-v2.js';
const durations={idle:56/30,run:.8,attack:3,slash:1.5,judgment:130/30,shieldPush:71/30};
// Exercise the action clock at authored speed; the production default is tested below.
const create=(random=()=>0)=>{const c=new WarriorV2Controller({durations,speeds:{run:4.4371},random});c.setAttackSpeed(1/V2_ATTACK_BASE_RATE);return c;};
test('v2: continuous attacks cycle slash, thrust, judgment in the requested fixed order',()=>{
 const c=create(),sequence=[];c.setAttackHeld(true);
 for(let i=0;i<15;i++){sequence.push(c.action.state);c.update(durations[c.action.state]-c.action.time+.001);}
 assert.equal(new Set(sequence).size,3);
 for(let i=1;i<sequence.length;i++)assert.notEqual(sequence[i],sequence[i-1]);
 assert.deepEqual(sequence,Array.from({length:15},(_,i)=>['slash','attack','slash','attack','judgment'][i%5]));
});

test('v2: releasing the chain resets to slash after idle or locomotion, at every attack speed',()=>{
 for(const speed of [.5,1,2])for(const input of [{},{y:1}]){
  const c=create();c.setAttackSpeed(speed);const rate=speed*V2_ATTACK_BASE_RATE;c.setAttackHeld(true);c.update((durations.slash+.2)/rate);
  assert.equal(c.action.state,'attack');c.setAttackHeld(false);c.update(durations.attack/rate,input);
  assert.equal(c.action,null);c.setAttackHeld(true);assert.equal(c.action.state,'slash');
 }
});

test('v2: quick second tap is never queued after release',()=>{
 const c=create();c.setAttackHeld(true);c.setAttackHeld(false);c.update(.4);
 assert.equal(c.attack(),false);c.setAttackHeld(true);c.setAttackHeld(false);
 c.update(1.11);assert.equal(c.action,null);c.attack();assert.equal(c.action.state,'slash');
});
test('v2: only an actively held sword input chains after shield push',()=>{
 const c=create();c.shieldPush();c.update(.5);c.setAttackHeld(true);c.setAttackHeld(false);
 c.update(2);assert.equal(c.action,null);
 c.shieldPush();c.setAttackHeld(true);c.update(durations.shieldPush+.01);assert.equal(c.action.state,'slash');
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
 for(const kind of V2_ATTACKS){c.setAttackChoice(kind);c.attack();assert.equal(c.action.state,kind);c.update(durations[kind]/(2*V2_ATTACK_BASE_RATE)+.01);}
});

test('v2: movement cancels every sword/shield phase immediately, clears held chain and resets to slash',()=>{
 for(const kind of [...V2_ATTACKS,'shieldPush'])for(const phase of [.05,.3,.65,.95]){
  const c=create();c.startAttack(kind);c.setAttackHeld(true);c.update(durations[kind]*phase);
  const result=c.update(1/60,{x:.7,y:.7});
  assert.equal(result.state,'run',`${kind} ${phase}`);assert.ok(result.speed>0);assert.equal(result.actionId,null);
  assert.equal(result.cancelled,true);assert.equal(c.action,null);assert.equal(c.held,false);
  for(let i=0;i<100;i++)assert.equal(c.update(.05).state,'idle','Cancelled hold cannot restart after movement stops');
  c.setAttackHeld(false);c.setAttackHeld(true);assert.equal(c.action.state,'slash');
 }
});
test('v2: stagger freezes the current pose, cancels damage/queued attacks, then resumes held movement',()=>{
 const c=create();c.setAttackHeld(true);c.update(.45);c.hit(.26);
 const result=c.update(.1,{y:1});assert.equal(result.staggered,true);assert.equal(result.state,'slash');assert.equal(result.clipTime,.45);
 assert.equal(result.actionId,null);assert.equal(result.moving,false);assert.equal(c.attack(),false);assert.equal(c.shieldPush(),false);assert.equal(c.setAttackHeld(true),false);
 assert.equal(c.update(.1,{y:1}).clipTime,.45);
 const recovered=c.update(.08,{y:1});assert.equal(recovered.state,'run');assert.equal(recovered.speed,4.4371);assert.equal(c.action,null);
 c.update(.1);c.attack();assert.equal(c.action.state,'slash');
});
test('v2: default/new 1x equals original 1.8x, new 2x equals 3.6x; idle/run/shield stay authored',()=>{
 const c=new WarriorV2Controller({durations});
 assert.equal(c.attackSpeed,1.8);c.attack();assert.ok(Math.abs(c.update(.2).clipTime-.36)<1e-9);
 c.cancelAttack();c.setAttackSpeed(2);c.attack();assert.ok(Math.abs(c.update(.2).clipTime-.72)<1e-9);
 c.cancelAttack();assert.equal(c.update(.2).clipTime,.2);assert.equal(c.update(.2,{y:1}).clipTime,.2);
 c.shieldPush();assert.equal(c.update(.2).clipTime,.2);
});
