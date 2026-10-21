import test from 'node:test';
import assert from 'node:assert/strict';
import {WarriorV2Controller,V2_ATTACKS} from '../src/warrior-v2.js';
const durations={idle:56/30,run:.8,attack:3,slash:1.5,judgment:130/30,shieldPush:71/30};
const create=(random=()=>0)=>new WarriorV2Controller({durations,speeds:{run:4.4371},random});
test('v2: attacks cycle slash, thrust, judgment in the requested fixed order',()=>{
 let n=0;const c=create(()=>[.1,.1,.9,.9,.1][n++%5]);let sequence=[];
 for(let i=0;i<15;i++){c.attack();sequence.push(c.action.state);c.update(durations[c.action.state]+.001);}
 assert.equal(new Set(sequence).size,3);
 for(let i=1;i<sequence.length;i++)assert.notEqual(sequence[i],sequence[i-1]);
 assert.deepEqual(sequence,Array.from({length:15},(_,i)=>['slash','attack','judgment'][i%3]));
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
