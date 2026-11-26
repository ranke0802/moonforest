import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeCamera, NullEngine, Scene, TransformNode, Vector3, VertexBuffer} from '@babylonjs/core';
import {createRidingGallopTrail} from '../src/v03/riding-gallop-trail.js';
import {setupAccessibility,disposeAccessibility} from '../src/v03/accessibility.js';

function setup(t, reduced = false) {
  const engine = new NullEngine(), scene = new Scene(engine);
  const camera = new FreeCamera('camera', new Vector3(0, 1.8, -7), scene);
  camera.setTarget(new Vector3(0, .75, 0));
  const horse = new TransformNode('horse', scene);
  const preference = new EventTarget();
  preference.matches = reduced;
  const view = {matchMedia(query) { assert.equal(query, '(prefers-reduced-motion: reduce)'); return preference; }};
  // The device setting reaches the trail through accessibility.js (2026-11-26).
  setupAccessibility({doc:{documentElement:{dataset:{},style:{setProperty(){},removeProperty(){}}}},view});
  const trail = createRidingGallopTrail(horse);
  const mesh = scene.getMeshByName('v03-riding-gallop-trail');
  t.after(() => { trail.dispose(); scene.dispose(); engine.dispose(); disposeAccessibility(); });
  return {engine, scene, horse, trail, mesh, setReduced(matches) {
    preference.matches = matches;
    preference.dispatchEvent(Object.assign(new Event('change'), {matches}));
  }};
}

async function startGallop(trail, mesh) {
  const deadline = performance.now() + 2000;
  while (!mesh.isEnabled(false) && performance.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
    trail.update(.016, .7);
  }
  assert.equal(mesh.isEnabled(false), true, 'prepared shader can draw on the existing game frame');
}

test('the mounted gallop uses a single transparent draw with static geometry, and zero draws at rest', async t => {
  const {trail, mesh, engine, scene, horse} = setup(t);
  assert.equal(mesh.parent, horse);
  assert.equal(mesh.isEnabled(), false);
  assert.equal(mesh.isPickable, false);
  assert.equal(mesh.material.disableDepthWrite, true);
  assert.equal(mesh.material.getActiveTextures().length, 0);
  assert.equal(mesh.getTotalVertices(), 70);
  assert.equal(mesh.getTotalIndices()/3, 60);
  assert.equal(mesh.subMeshes.length, 1);
  const buffer = mesh.getVertexBuffer(VertexBuffer.PositionKind);
  assert.equal(buffer.isUpdatable(), false);

  const draws = t.mock.method(engine, 'drawElementsType');
  trail.update(1/60, 0);
  scene.render();
  assert.equal(draws.mock.callCount(), 0);
  await startGallop(trail, mesh);
  await scene.whenReadyAsync();
  scene.render();
  assert.equal(draws.mock.callCount(), 1);
  for (let i = 0; i < 30; i++) trail.update(1/60, 1);
  assert.equal(mesh.getVertexBuffer(VertexBuffer.PositionKind), buffer);
  trail.update(1/60, 0);
  scene.render();
  assert.equal(draws.mock.callCount(), 1);
  const material = mesh.material;
  trail.dispose();
  trail.update(1/60, 1);
  assert.equal(scene.meshes.includes(mesh), false);
  assert.equal(scene.materials.includes(material), false);
});

test('wind stays on the flanks and low dust behind the hind hooves throughout the shader travel', () => {
  const engine = new NullEngine(), scene = new Scene(engine), horse = new TransformNode('horse', scene);
  const trail = createRidingGallopTrail(horse), mesh = horse.getChildMeshes()[0];
  try {
    const position = mesh.getVerticesData('position'), uv = mesh.getVerticesData('uv'), colors = mesh.getVerticesData('color');
    const box = mesh.getBoundingInfo().boundingBox;
    const flanks = new Set();
    for (let i = 0; i < mesh.getTotalVertices(); i++) {
      const x = position[3*i], y = position[3*i+1], z = position[3*i+2], dust = uv[2*i+1] === 1;
      if (dust) { assert.ok(y < .23); assert.ok(z < -.62); }
      else { assert.ok(Math.abs(x) > .46); assert.ok(y < 1.2); flanks.add(Math.sign(x)); }
      assert.ok(colors[4*i+3] <= .53);
      for (const age of [0, .5, 1]) {
        const point = new Vector3(x + Math.sign(x)*age*(dust ? .24 : .10),
          y + (dust ? age*(.5-.28*age) : 0), z-age*(dust ? 1.38 : .78));
        assert.ok(box.intersectsPoint(point), 'all animated vertices fit their culling bounds');
      }
    }
    assert.equal(flanks.size, 2);
  } finally { trail.dispose(); scene.dispose(); engine.dispose(); }
});

test('reduced motion takes effect at mount and mid-run; disposing the horse releases the trail', async t => {
  const {trail, mesh, horse, scene, setReduced} = setup(t, true);
  trail.update(.016, 1);
  assert.equal(mesh.isEnabled(), false);
  setReduced(false);
  await startGallop(trail, mesh);
  setReduced(true);
  assert.equal(mesh.isEnabled(), false);
  const material = mesh.material;
  horse.dispose();
  setReduced(false);
  trail.update(.016, 1);
  trail.dispose();
  assert.equal(mesh.isDisposed(), true);
  assert.equal(scene.materials.includes(material), false);
});
