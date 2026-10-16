import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createProjectiles } from '../src/projectiles.js';

test('a released arrow hits its locked target once on arrival, then cleans up', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const hits = [], target = { id: 'dummy' };
  const projectiles = createProjectiles(scene, t => hits.push(t));
  projectiles.fire(new Vector3(0, 1.5, 0), new Vector3(0, 1.5, 7), target);
  projectiles.update(.25); assert.equal(hits.length, 0);
  projectiles.update(.25); assert.deepEqual(hits, [target]);
  projectiles.update(.2); assert.equal(hits.length, 1);
  projectiles.update(.6); assert.equal(projectiles.count, 0);
  projectiles.fire(Vector3.Zero(), new Vector3(1, 0, 0));
  projectiles.update(1); assert.equal(hits.length, 1);
  projectiles.dispose(); scene.dispose(); engine.dispose();
});
