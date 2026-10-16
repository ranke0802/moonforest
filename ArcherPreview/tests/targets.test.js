import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createTrainingTargets } from '../src/targets.js';

function fixture() {
  const engine = new NullEngine(), scene = new Scene(engine), casters = new Set();
  scene.useRightHandedSystem = true;
  const shadows = { addShadowCaster(mesh) { casters.add(mesh); }, removeShadowCaster(mesh) { casters.delete(mesh); } };
  const training = createTrainingTargets(scene, shadows);
  return { engine, scene, training, casters, close() { training.dispose(); scene.dispose(); engine.dispose(); } };
}

test('nearest targets use horizontal metres, exact range boundaries, deterministic ties and stable identities', () => {
  const f = fixture(), t = f.training;
  assert.equal(t.targets.length, 3);
  assert.equal(t.selectNearest(Vector3.Zero()).id, 'dummy-south');
  assert.equal(t.selectNearest(new Vector3(0, 100, 0)), t.targets[2]);
  assert.equal(t.selectNearest(Vector3.Zero(), 4.12), null);
  assert.equal(t.selectNearest(Vector3.Zero(), Math.sqrt(17)), t.targets[2]);
  assert.equal(t.selectNearest(new Vector3(0, 0, 3.5)), t.targets[0], 'Exact west/east tie retains definition order');
  assert.equal(t.selectNearest(new Vector3(3, 0, 4), 0), t.targets[1]);
  assert.equal(t.selectNearest(new Vector3(0, 0, 100)), null);
  assert.equal(t.selectNearest(Vector3.Zero(), -1), null);
  assert.equal(t.selectNearest(new Vector3(NaN, 0, 0)), null);
  const target = t.targets[0], aimPoint = target.aimPoint;
  t.update(.016);
  assert.equal(t.targets[0], target); assert.equal(target.aimPoint, aimPoint);
  assert.ok(target.aimPoint.y > 1 && target.aimPoint.y < 1.2);
  f.close();
});

test('selection affects only the selected ground ring and clears invalid targets', () => {
  const f = fixture(), t = f.training;
  t.setSelected(t.targets[1]);
  for (const target of t.targets) assert.equal(f.scene.getMeshByName(`training-${target.id}-selection`).isVisible, target === t.targets[1]);
  assert.equal(t.setSelected({ id: t.targets[1].id }), null, 'Foreign lookalike objects are not owned targets');
  for (const target of t.targets) assert.equal(f.scene.getMeshByName(`training-${target.id}-selection`).isVisible, false);
  f.close();
});

test('a hit increments only the intended target, flashes and settles without moving its planted position', () => {
  const f = fixture(), t = f.training, target = t.targets[0];
  const planted = target.position.clone();
  const sway = f.scene.getTransformNodeByName(`training-${target.id}-sway`);
  const bullseye = f.scene.getMeshByName(`training-${target.id}-bullseye`);
  assert.equal(t.hit(target), true);
  assert.equal(target.hits, 1); assert.equal(t.targets[1].hits, 0);
  assert.ok(bullseye.material.emissiveColor.r > .9);
  t.update(.04);
  assert.ok(Math.abs(sway.rotation.z) > .01);
  assert.ok(target.position.equals(planted));
  for (let i = 0; i < 100; i++) t.update(.02);
  assert.ok(sway.rotation.equals(Vector3.Zero()));
  assert.ok(Math.abs(bullseye.material.emissiveColor.r - .12) < 1e-8);
  assert.equal(t.hit(null), false);
  f.close();
});

test('dispose releases owned meshes/materials/shadow casters and preserves unrelated scene content', () => {
  const f = fixture();
  const unrelated = MeshBuilder.CreateBox('unrelated-character-placeholder', {}, f.scene);
  assert.ok(f.casters.size > 0);
  f.training.dispose(); f.training.dispose();
  assert.equal(f.casters.size, 0);
  assert.equal(f.scene.getMeshByName(unrelated.name), unrelated);
  assert.equal(f.scene.meshes.length, 1);
  assert.equal(f.training.selectNearest(Vector3.Zero()), null);
  assert.equal(f.training.hit(f.training.targets[0]), false);
  f.scene.dispose(); f.engine.dispose();
});
