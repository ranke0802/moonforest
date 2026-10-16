import test from 'node:test';
import assert from 'node:assert/strict';
import { Animation, AnimationGroup, FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from '../src/animation.js';
import { CharacterController } from '../src/controller.js';

test('Babylon 9.31 NullEngine: non-loop death retains final pose, then revive starts idle', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera('camera', new Vector3(0, 2, -5), scene);
  scene.useConstantAnimationDeltaTime = true;
  const target = new TransformNode('authored-root', scene);
  function clip(name, start, end) {
    const animation = new Animation(name, 'position.y', 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
    animation.setKeys([{ frame: 0, value: start }, { frame: 12, value: end }]);
    const group = new AnimationGroup(name, scene); group.addTargetedAnimation(animation, target); return group;
  }
  const death = clip('Death', 1, .1), idle = clip('Idle', 1, 1);
  const animator = new CharacterAnimator([death, idle], { death: 'Death', idle: 'Idle' });
  animator.transition('death', { loop: false });
  for (let i = 0; i < 180; i++) { animator.update(1 / 60); scene.render(); }
  assert.ok(Math.abs(target.position.y - .1) < 1e-7, `Final death value ${target.position.y} must remain, not return to rest`);
  assert.equal(death.loopAnimation, false);
  assert.equal(death.isPlaying, false, 'The sampled terminal pose must not run on a second scene clock');
  assert.equal(death.getCurrentFrame(), death.to, 'Finite death holds the final frame rather than looping');
  animator.transition('idle', { loop: true });
  for (let i = 0; i < 30; i++) { animator.update(1 / 60); scene.render(); }
  assert.ok(Math.abs(target.position.y - 1) < 1e-7);
  scene.dispose(); engine.dispose();
});

function attackScene() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera('camera', new Vector3(0, 2, -5), scene);
  // Deliberately different from the controller dt: Babylon must not double-advance the clip.
  scene.useConstantAnimationDeltaTime = true;
  const target = new TransformNode('clip-time-seconds', scene);
  const names = { idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'Standing', moveAttack: 'Moving', hit: 'Hit', death: 'Death' };
  const groups = Object.entries(names).map(([state, name]) => {
    const duration = state === 'attack' || state === 'moveAttack' ? 8 / 3 : 1;
    const animation = new Animation(name, 'position.y', 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
    animation.setKeys([{ frame: 0, value: 0 }, { frame: duration * 60, value: duration }]);
    const group = new AnimationGroup(name, scene); group.addTargetedAnimation(animation, target); return group;
  });
  const animator = new CharacterAnimator(groups, names);
  const controller = new CharacterController({ durations: animator.durations });
  const step = (dt, input) => { const result = controller.update(dt, input); animator.transition(result.state, result); animator.update(dt); scene.render(); return result; };
  return { engine, scene, target, animator, controller, step, dispose() { animator.dispose(); scene.dispose(); engine.dispose(); } };
}

test('Babylon rendered attack time equals controller time before/after release and at 3x recovery', () => {
  const testScene = attackScene();
  const { controller, animator, target, step } = testScene;
  try {
    controller.attack();
    let elapsed = 0, releases = 0;
    for (let i = 0; i < 126; i++) {
      const dt = i % 2 ? .02 : 1 / 75;
      const result = step(dt); elapsed += dt; releases += result.events.length;
      assert.equal(result.state, 'attack');
      assert.ok(Math.abs(target.position.y - result.clipTime) < 1e-7, `render=${target.position.y}, controller=${result.clipTime}, real=${elapsed}`);
      assert.equal(animator.clips.attack.speedRatio, result.timeScale);
      assert.ok(Math.abs(animator.clips.attack.getCurrentFrame() / 60 - result.clipTime) < 1e-7);
      if (elapsed < 1.9) assert.ok(Math.abs(target.position.y - elapsed) < 1e-7, 'Draw and release must remain at 1x');
    }
    assert.equal(releases, 1);
    assert.equal(animator.clips.attack.speedRatio, 3);
  } finally { testScene.dispose(); }
});

test('rendered attack stays synchronized when speed changes while alternating standing and moving', () => {
  const testScene = attackScene(); const { controller, target, step } = testScene;
  try {
    controller.attack(); let releases = 0;
    for (let i = 0; i < 160; i++) {
      if (i === 25) controller.setAttackSpeed(2);
      if (i === 65) controller.setAttackSpeed(.5);
      const result = step(1 / 60, { y: Math.floor(i / 7) % 2 });
      releases += result.events.length;
      if (result.actionId) assert.ok(Math.abs(target.position.y - result.clipTime) < 1e-7, 'Renderer and release events must use one speed-adjusted clock');
    }
    assert.equal(releases, 1);
  } finally { testScene.dispose(); }
});

test('standing/moving swaps preserve sampled phase, blend weights and single release', () => {
  const testScene = attackScene(); const { controller, animator, target, step } = testScene;
  try {
    controller.attack(); let events = [];
    for (let i = 0; i < 120; i++) {
      const result = step(1 / 60, { y: Math.floor(i / 3) % 2 }); events.push(...result.events);
      assert.ok(Math.abs(target.position.y - result.clipTime) < 1e-7, 'Both variants should sample the same authored instant');
      const totalWeight = [...animator.active.values()].reduce((sum, entry) => sum + entry.weight, 0);
      assert.ok(Math.abs(totalWeight - 1) < 1e-7);
    }
    assert.equal(events.length, 1);
  } finally { testScene.dispose(); }
});

test('buffered same-state attack rewinds to new action time, not the previous final pose', () => {
  const testScene = attackScene(); const { controller, target, step } = testScene;
  try {
    controller.attack(); controller.attack();
    const first = step(2.1); const second = step(.1);
    assert.equal(first.state, 'attack'); assert.equal(second.state, 'attack');
    assert.notEqual(first.actionId, second.actionId);
    assert.ok(second.clipTime < .1);
    assert.ok(Math.abs(target.position.y - second.clipTime) < 1e-7);
    assert.equal(second.events.length, 0);
  } finally { testScene.dispose(); }
});

test('cancelling the shot removes its animation and keeps the replacement on its own clock', () => {
  const testScene = attackScene(); const { controller, animator, target, step } = testScene;
  try {
    controller.attack(); step(1.7); controller.hit();
    const result = step(.2);
    assert.equal(result.state, 'hit'); assert.deepEqual(result.events, []);
    assert.equal(animator.active.has('attack'), false);
    assert.ok(Math.abs(target.position.y - .2) < 1e-7);
    controller.die(); step(2);
    assert.equal(target.position.y, 1);
    step(20); assert.equal(target.position.y, 1);
    controller.revive(); step(.2);
    assert.equal(animator.active.has('death'), false);
    assert.ok(Math.abs(target.position.y - .2) < 1e-7);
  } finally { testScene.dispose(); }
});
