import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeWarriorController } from '../src/native-warrior.js';
const create=()=>new NativeWarriorController({durations:{idle:1,run:.8,attack:3},speeds:{run:4.4371}});
test('native warrior: input runs, release holds ready, analog input scales gait and distance together',()=>{
 const c=create();assert.equal(c.update(.1).state,'idle');
 const run=c.update(.2,{y:.5});assert.equal(run.state,'run');assert.equal(run.clipTime,.1);assert.equal(run.speed,4.4371*.5);
 assert.equal(c.update(.1).state,'idle');assert.equal(c.update(.1).speed,0);
 assert.equal(c.update(1,{y:1}).state,'run');assert.ok(c.time<.8);
});
test('native warrior: attack suspends movement and then resumes held movement',()=>{
 const c=create();c.update(.2,{y:1});c.attack();
 const a=c.update(.2,{y:1});assert.equal(a.state,'attack');assert.equal(a.speed,0);assert.equal(a.clipTime,.2);
 assert.equal(c.update(2.9,{y:1}).state,'run');
});
test('native warrior: held attack repeats but releasing does not restart or cancel the current clip',()=>{
 const c=create();c.setAttackHeld(true);const first=c.update(1).actionId;
 c.update(2.2);assert.ok(c.action.id>first);assert.ok(Math.abs(c.action.time-.2)<1e-8);
 c.setAttackHeld(false);assert.equal(c.update(1).state,'attack');assert.equal(c.update(2).state,'idle');
});
test('native warrior: speed changes do not rewind an attack or change run playback',()=>{
 const c=create();c.attack();c.update(.5);c.setAttackSpeed(2);assert.equal(c.update(.25).clipTime,1);
 c.update(1.1);assert.equal(c.update(.2,{y:1}).clipTime,.2);
});
