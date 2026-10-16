import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTACK_TIMING, CharacterController, normalizedStick } from '../src/controller.js';

const releaseSeconds = 53 / 30;
const recoverySeconds = 57 / 30;
const attackSeconds = recoverySeconds + (8 / 3 - recoverySeconds) / 3;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);

test('moving attack uses the authored walking speed and resumes running after the shot', () => {
  const c = new CharacterController();
  c.toggleRun();
  assert.equal(c.update(.01, { x: 1 }).state, 'run');
  assert.equal(c.attack(), true);
  const attack = c.update(.1, { x: 1 });
  assert.equal(attack.state, 'moveAttack');
  assert.equal(attack.speed, c.speeds.moveAttack);
  c.update(attackSeconds, { x: 1 });
  assert.equal(c.update(.01, { x: 1 }).state, 'run');
});

test('attack movement changes retain normalized action progress', () => {
  const c = new CharacterController({ durations: { moveAttack: 1, attack: 1 } });
  c.attack(); c.update(.4, { y: 1 });
  const stationary = c.update(.1, {});
  assert.equal(stationary.state, 'attack');
  assert.equal(stationary.speed, 0);
  assert.equal(stationary.phase, .5, 'Returned phase must match the rendered end of this update');
  assert.equal(c.update(.1, { y: 1 }).state, 'moveAttack');
});

test('release uses authored frame 54 at 1x speed and emits only once across movement changes', () => {
  const c = new CharacterController();
  c.attack();
  const id = c.action.id;
  const before = c.update(releaseSeconds - .001, {});
  close(before.clipTime, releaseSeconds - .001);
  assert.equal(before.timeScale, 1);
  assert.equal(before.attackPhase, 'windup');
  assert.deepEqual(before.events, []);
  const shot = c.update(.002, { y: 1 });
  assert.equal(shot.state, 'moveAttack');
  assert.equal(shot.actionId, id);
  assert.equal(shot.attackPhase, 'followThrough');
  assert.equal(shot.events.length, 1);
  const event = shot.events[0];
  assert.equal(event.type, 'release'); assert.equal(event.release, true); assert.equal(event.actionId, id);
  close(event.clipTime, releaseSeconds); close(event.actionTime, releaseSeconds); close(event.phase, 53 / 80); close(event.timeInUpdate, .001);
  for (let i = 0; i < 10; i++) assert.deepEqual(c.update(.02, { y: i % 2 }).events, []);
});

test('only arrow-hidden recovery is accelerated; action ends at 2.15556 seconds', () => {
  const c = new CharacterController(); c.attack();
  const follow = c.update(recoverySeconds - .001);
  assert.equal(follow.timeScale, 1); close(follow.clipTime, recoverySeconds - .001);
  const recovery = c.update(.101);
  assert.equal(recovery.attackPhase, 'recovery'); assert.equal(recovery.timeScale, 3);
  close(recovery.clipTime, recoverySeconds + .3);
  const almost = c.update(attackSeconds - recoverySeconds - .1 - .001);
  assert.equal(almost.state, 'attack');
  const done = c.update(.002);
  assert.equal(done.state, 'idle'); assert.equal(done.actionId, null); assert.equal(done.clipTime, undefined);
  assert.equal(done.blendDuration, .08);
  assert.ok(attackSeconds < 2.16);
});

test('one buffered tap restarts even the same state and is consumed exactly once', () => {
  const c = new CharacterController(); assert.equal(c.attack(), true);
  const first = c.action.id;
  assert.equal(c.attack(), true); assert.equal(c.attack(), false); assert.equal(c.attack(), false);
  const next = c.update(attackSeconds + .1);
  assert.equal(next.state, 'attack'); assert.notEqual(next.actionId, first); close(next.clipTime, .1);
  assert.equal(next.attackQueued, false); assert.equal(next.events.length, 1); assert.equal(next.events[0].actionId, first);
  const done = c.update(attackSeconds);
  assert.equal(done.state, 'idle'); assert.equal(done.events.length, 1); assert.equal(done.events[0].actionId, next.actionId);
});

test('holding attack repeats; releasing stops future cycles without adding a buffered tap', () => {
  const c = new CharacterController(); assert.equal(c.setAttackHeld(true), true);
  const repeating = c.update(attackSeconds * 2 + .2);
  assert.equal(repeating.events.length, 2);
  assert.equal(new Set(repeating.events.map(event => event.actionId)).size, 2);
  assert.equal(repeating.attackHeld, true); assert.equal(repeating.attackQueued, false);
  const third = repeating.actionId;
  c.setAttackHeld(false);
  const finish = c.update(attackSeconds * 2);
  assert.equal(finish.events.length, 1); assert.equal(finish.events[0].actionId, third); assert.equal(finish.state, 'idle');
});

test('hit and death cancel held fire, buffered taps and an unreleased arrow', () => {
  for (const cancel of ['hit', 'die']) {
    const c = new CharacterController(); c.setAttackHeld(true); c.attack(); c.update(releaseSeconds - .01);
    c[cancel]();
    const result = c.update(10, { y: 1 });
    assert.deepEqual(result.events, []); assert.equal(result.attackHeld, false); assert.equal(result.attackQueued, false);
    assert.equal(result.state, cancel === 'die' ? 'death' : 'walk');
  }
});

test('held input cannot restart during hit/death and revive does not restore it', () => {
  const c = new CharacterController(); c.hit(); assert.equal(c.setAttackHeld(true), false);
  c.die(); assert.equal(c.setAttackHeld(true), false); c.revive();
  const result = c.update(1); assert.equal(result.state, 'idle'); assert.equal(result.attackHeld, false);
});

test('variable update steps preserve release time and canonical attack duration', () => {
  const c = new CharacterController({ durations: { attack: 8 / 3, moveAttack: 4 } });
  c.attack();
  let elapsed = 0, releases = [];
  for (const dt of [.31, .02, .7, .4, .5, .1]) {
    const result = c.update(dt, { y: elapsed > .5 ? 1 : 0 });
    for (const event of result.events) releases.push(elapsed + event.timeInUpdate);
    if (result.actionId) close(result.clipTime / c.durations[result.state], result.phase);
    elapsed += dt;
  }
  assert.equal(releases.length, 1); close(releases[0], releaseSeconds);
  assert.equal(c.update(attackSeconds - elapsed + .001).state, 'idle');
});

test('zero, negative and invalid dt cannot advance the action or duplicate its release', () => {
  const c = new CharacterController(); c.attack();
  for (const dt of [0, -1, NaN, Infinity]) { const result = c.update(dt); close(result.phase, 0); assert.deepEqual(result.events, []); }
  const result = c.update(releaseSeconds); assert.equal(result.events.length, 1);
  assert.deepEqual(c.update(0).events, []);
  assert.equal(ATTACK_TIMING.releasePhase, 53 / 80);
});

test('death prevents locomotion and all combat until explicit revive', () => {
  const c = new CharacterController();
  c.attack(); c.die();
  for (let i = 0; i < 500; i++) { const r = c.update(.016, { x: 1, y: 1, run: true }); assert.equal(r.state, 'death'); assert.equal(r.speed, 0); }
  assert.equal(c.attack(), false); assert.equal(c.hit(), false);
  c.toggleRun(); assert.equal(c.runToggled, false);
  c.revive(); assert.equal(c.update(.016, {}).state, 'idle'); assert.equal(c.attack(), true);
});

test('hit cancels an attack and temporarily stops world translation', () => {
  const c = new CharacterController({ durations: { hit: .2 } });
  c.attack(); c.hit();
  assert.equal(c.update(.1, { y: 1 }).speed, 0);
  c.update(.11, { y: 1 });
  assert.equal(c.update(.01, { y: 1 }).state, 'walk');
});

test('joystick has a dead zone and cannot exceed normalized diagonal speed', () => {
  assert.equal(normalizedStick(2, 1).x, 0);
  const stick = normalizedStick(500, -500);
  assert.ok(Math.abs(Math.hypot(stick.x, stick.y) - 1) < 1e-12);
  assert.ok(stick.y > 0); assert.ok(Math.abs(Math.hypot(stick.knobX, stick.knobY) - 54) < 1e-9);
});
