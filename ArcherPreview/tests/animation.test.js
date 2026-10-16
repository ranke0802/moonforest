import test from 'node:test';
import assert from 'node:assert/strict';
import { Animation, AnimationGroup, FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from '../src/animation.js';

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
  assert.equal(death.isStarted, false, 'Finite death must finish rather than looping');
  animator.transition('idle', { loop: true });
  for (let i = 0; i < 30; i++) { animator.update(1 / 60); scene.render(); }
  assert.ok(Math.abs(target.position.y - 1) < 1e-7);
  scene.dispose(); engine.dispose();
});
