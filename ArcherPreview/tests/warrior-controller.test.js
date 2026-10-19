import test from 'node:test';
import assert from 'node:assert/strict';
import { WarriorController } from '../src/warrior-controller.js';

test('held combo uses all three authored directions, one contact per attack', () => {
  const c = new WarriorController(); c.setAttackHeld(true); const events=[];
  for(let i=0;i<420;i++) events.push(...c.update(.01).events);
  assert.deepEqual(events.map(e=>e.state),['slashDown','slashReturn','thrust']);
  assert.equal(new Set(events.map(e=>e.actionId)).size,3);
});
test('release stops auto-repeat; interruption clears queued actions', () => {
  const c = new WarriorController(); c.setAttackHeld(true); c.update(.6); c.setAttackHeld(false); c.update(1);
  assert.equal(c.state,'idle'); c.attack(); c.attack(); c.hit(); c.update(1); assert.equal(c.state,'idle');
});
test('defense is stationary; movement exits it; death persists until revive', () => {
  const c = new WarriorController(); c.toggleGuard(); assert.equal(c.update(.2).state,'guard');
  assert.equal(c.update(.2,{x:1}).state,'walk'); c.die(); assert.equal(c.update(10,{x:1}).speed,0);
  assert.equal(c.state,'death'); assert.equal(c.update(10).clipTime,2.5); assert.equal(c.attack(),false);
  c.revive(); assert.equal(c.update(.1).state,'idle');
});
test('speed changes preserve strike progress and do not duplicate contacts', () => {
  const c=new WarriorController(); c.attack(); c.update(.3); c.setAttackSpeed(2);
  assert.equal(c.update(.2).events.length,1); c.setAttackSpeed(.5); assert.equal(c.update(.3).events.length,0);
});
