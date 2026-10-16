import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterController, normalizedStick } from '../src/controller.js';

test('moving attack uses the authored walking speed and resumes running after the shot', () => {
  const c = new CharacterController({ durations: { moveAttack: .5 } });
  c.toggleRun();
  assert.equal(c.update(.01, { x: 1 }).state, 'run');
  assert.equal(c.attack(), true);
  const attack = c.update(.1, { x: 1 });
  assert.equal(attack.state, 'moveAttack');
  assert.equal(attack.speed, c.speeds.moveAttack);
  assert.equal(c.attack(), false);
  c.update(.5, { x: 1 });
  assert.equal(c.update(.01, { x: 1 }).state, 'run');
});

test('attack movement changes retain normalized action progress', () => {
  const c = new CharacterController({ durations: { moveAttack: 1, attack: 1 } });
  c.attack(); c.update(.4, { y: 1 });
  const stationary = c.update(.1, {});
  assert.equal(stationary.state, 'attack');
  assert.equal(stationary.speed, 0);
  assert.equal(stationary.phase, .4);
  assert.equal(c.update(.1, { y: 1 }).state, 'moveAttack');
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
