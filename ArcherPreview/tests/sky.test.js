import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { MovingSky, SKY_HORIZON } from '../src/sky.js';

test('moving sky stays camera-centered and behind geometry without extra targets or per-frame resources', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const camera = new FreeCamera('camera', new Vector3(20, 3, -12), scene);
    scene.activeCamera = camera;
    const sky = new MovingSky(scene);
    assert.equal(scene.meshes.length, 1);
    assert.ok(sky.mesh.getTotalIndices() / 3 < 1000);
    assert.equal(sky.mesh.isPickable, false);
    assert.equal(sky.mesh.receiveShadows, false);
    assert.equal(sky.material.disableDepthWrite, true);
    assert.equal(sky.material.needAlphaBlending(), true);
    assert.ok(sky.mesh.alphaIndex < 0, 'sky is drawn before other alpha-blended effects');
    assert.ok(SKY_HORIZON.b > .7);
    camera.getViewMatrix(true);
    assert.ok(sky.mesh.computeWorldMatrix(true).getTranslation().equals(camera.globalPosition));
    camera.position.x += 10; camera.getViewMatrix(true);
    assert.ok(sky.mesh.computeWorldMatrix(true).getTranslation().equals(camera.globalPosition));
    const resources = [scene.meshes.length, scene.materials.length, scene.textures.length, scene.customRenderTargets.length];
    const texture = sky.texture;
    for (let i = 0; i < 3600; i++) sky.tick(i / 30);
    assert.deepEqual([scene.meshes.length, scene.materials.length, scene.textures.length, scene.customRenderTargets.length], resources);
    assert.equal(sky.texture, texture);
    assert.ok(sky.drift.x > 0);
    assert.ok(sky.drift.x < .15, 'cloud motion stays slow');
  } finally { scene.dispose(); engine.dispose(); }
});

test('sky uses a small immutable content-addressed image compatible with the resource cache', async () => {
  const manifestUrl = new URL('../public/assets/sky.json', import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  const bytes = await readFile(new URL(manifest.texture, manifestUrl));
  assert.equal(manifest.width, 512); assert.equal(manifest.height, 512);
  assert.equal(bytes.length, manifest.bytes);
  assert.ok(bytes.length < 40000);
  assert.equal(manifest.texture, `content/${createHash('sha256').update(bytes).digest('hex')}.webp`);
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
});
