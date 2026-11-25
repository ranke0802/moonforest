import test from 'node:test';
import assert from 'node:assert/strict';
import {Observable} from '@babylonjs/core/Misc/observable.js';
import {ThinEngine} from '@babylonjs/core/Engines/thinEngine.js';
import {createShaderBirthWatch} from '../src/shader-birth-watch.js';

function fixture(effects = {}) {
  const engine = {
    _compiledEffects: effects,
    onBeforeShaderCompilationObservable: new Observable(),
    onAfterShaderCompilationObservable: new Observable(),
    onDisposeObservable: new Observable(),
  };
  const compile = () => engine.onBeforeShaderCompilationObservable.notifyObservers(engine);
  return {engine, effects, compile};
}

test('count WebGL compile attempts independently of same-size replacement, retries and names', () => {
  let scans = 0, clockReads = 0;
  const table = new Proxy({a: {name: 'old'}}, {ownKeys(target) { scans++; return Reflect.ownKeys(target); }});
  const {engine, compile} = fixture(table);
  const watch = createShaderBirthWatch(() => engine, () => {clockReads++; return 200;});
  assert.equal(engine.onBeforeShaderCompilationObservable.hasObservers(), false);
  watch.beginFrame();
  watch.endFrame();
  for (let i = 0; i < 100; i++) {watch.beginFrame(); watch.endFrame();}
  assert.equal(scans, 1);
  assert.equal(clockReads, 0);
  watch.beginFrame();
  compile(); compile();
  delete table.a;
  table.b = {name: {vertex: 'wolf', fragment: 'fur'}, defines: 'x'.repeat(200)};
  watch.endFrame();
  assert.equal(watch.frameAttempts, 2);
  assert.equal(watch.betweenAttempts, 0);
  const hints = watch.recentEffects();
  assert.equal(hints[0].shader, 'wolf / fur');
  assert.equal(hints[0].observedAtMs, 200);
  assert.equal(hints[0].defines.length, 161);
  hints[0].shader = 'changed';
  assert.equal(watch.recentEffects()[0].shader, 'wolf / fur');
  assert.equal(clockReads, 1);

  compile(); compile();
  watch.beginFrame();
  compile();
  watch.endFrame();
  assert.equal(watch.frameAttempts, 1);
  assert.equal(watch.betweenAttempts, 2);
  assert.equal(watch.recentEffects().length, 1);
  assert.equal(clockReads, 1);
  watch.beginFrame();
  assert.equal(watch.frameAttempts, 0);
  assert.equal(watch.betweenAttempts, 0);
  watch.endFrame(); compile();
  watch.beginFrame(true); // A target-FPS change also resets the diagnostic interval.
  assert.equal(watch.betweenAttempts, 0);
  assert.deepEqual(watch.recentEffects(), []);
  watch.pause();
});

test('pause, scene collection breaks and engine replacement release observers and historic clues', () => {
  const a = fixture(), b = fixture();
  let current = a.engine;
  const watch = createShaderBirthWatch(() => current);
  watch.beginFrame();
  for (let i = 0; i < 18; i++) a.effects[i] = {name: 'shader-' + i};
  a.compile(); watch.endFrame();
  assert.deepEqual(watch.recentEffects().map(x => x.shader), Array.from({length: 12}, (_, i) => 'shader-' + (6 + i)));
  a.compile(); watch.pause(); a.compile();
  assert.equal(a.engine.onBeforeShaderCompilationObservable.hasObservers(), false);
  assert.equal(a.engine.onDisposeObservable.hasObservers(), false);
  assert.deepEqual(watch.recentEffects(), []);
  watch.beginFrame();
  assert.equal(watch.betweenAttempts, 0);
  a.compile(); watch.endFrame(); a.compile();
  current = b.engine; watch.beginFrame(); a.compile(); b.compile(); watch.endFrame();
  assert.equal(a.engine.onBeforeShaderCompilationObservable.hasObservers(), false);
  assert.equal(watch.betweenAttempts, 0);
  assert.equal(watch.frameAttempts, 1);
  b.engine.onDisposeObservable.notifyObservers(b.engine);
  assert.equal(b.engine.onBeforeShaderCompilationObservable.hasObservers(), false);
  assert.equal(watch.frameAttempts, 0);
  current = null; watch.beginFrame(); watch.endFrame();
  assert.deepEqual(watch.recentEffects(), []);
});

test('Babylon WebGL emits one attempt even when shader creation throws before a cached Effect exists', () => {
  const {engine} = fixture();
  engine._gl = {getExtension: () => null, createShader() {throw new Error('simulated compile failure');}};
  const watch = createShaderBirthWatch(() => engine);
  watch.beginFrame();
  assert.throws(() => ThinEngine.prototype.createShaderProgram.call(engine, {}, '', '', '', engine._gl), /simulated compile failure/);
  watch.endFrame();
  assert.equal(watch.frameAttempts, 1);
  assert.deepEqual(watch.recentEffects(), []);
  watch.pause();
});
