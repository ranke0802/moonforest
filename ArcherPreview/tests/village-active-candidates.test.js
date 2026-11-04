import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine, Scene, FreeCamera, Vector3, Mesh, MeshBuilder, StandardMaterial, TransformNode} from '@babylonjs/core';
import {VillageActiveCandidates} from '../src/village-active-candidates.js';
import {prepareMapMaterials} from '../src/map-shader-cache.js';

function setup() {
 const engine = new NullEngine(); engine.getCaps().instancedArrays = true;
 const scene = new Scene(engine);
 const camera = new FreeCamera('camera', new Vector3(0, 4, -20), scene); camera.setTarget(Vector3.Zero());
 const source = MeshBuilder.CreateBox('source', {}, scene); source.material = new StandardMaterial('material', scene); source.material.disableLighting = true; source.isVisible = false;
 return {engine, scene, source};
}
function makeInstance(source, name, enabled = true) {
 const root = new TransformNode(`${name}-root`, source.getScene());
 const mesh = source.createInstance(name); mesh.parent = root; mesh.computeWorldMatrix(true); mesh.freezeWorldMatrix(); root.setEnabled(enabled);
 return {root, mesh};
}
function names(list) { return list.data.slice(0, list.length).map(m => m.name); }

test('only registered frozen native disabled instances are omitted and reappear immediately', () => {
 const {engine, scene, source} = setup();
 const a = makeInstance(source, 'a', false), b = makeInstance(source, 'b', true), c = makeInstance(source, 'c', false);
 const dynamic = source.createInstance('dynamic'); dynamic.setEnabled(false);
 const previous = scene.getActiveMeshCandidates;
 const candidates = new VillageActiveCandidates(scene);
 for (const mesh of [a.mesh, b.mesh, c.mesh, dynamic, a.mesh, source]) candidates.add(mesh);
 assert.equal(candidates.stats.owned, 3);
 assert.deepEqual(names(scene.getActiveMeshCandidates()), ['source', 'b', 'dynamic']);
 assert.deepEqual(candidates.stats, {scanned: 5, submitted: 3, skipped: 2, owned: 3});
 a.root.setEnabled(true); b.root.setEnabled(false);
 assert.deepEqual(names(scene.getActiveMeshCandidates()), ['source', 'a', 'dynamic']);
 c.mesh.isReady = () => true;
 assert.deepEqual(names(scene.getActiveMeshCandidates()), ['source', 'a', 'c', 'dynamic']);
 c.mesh.isReady = Object.getPrototypeOf(c.mesh).isReady;
 assert.deepEqual(names(scene.getActiveMeshCandidates()), ['source', 'a', 'dynamic']);
 candidates.dispose(); assert.equal(scene.getActiveMeshCandidates, previous);
 scene.dispose(); engine.dispose();
});

test('custom subset and retained external wrapper preserve provider behavior across disposal', () => {
 const {engine, scene, source} = setup(); const {mesh} = makeInstance(source, 'disabled', false);
 const subset = {data: [mesh], length: 1}; const original = () => subset; scene.getActiveMeshCandidates = original;
 const candidates = new VillageActiveCandidates(scene); candidates.add(mesh);
 const inner = scene.getActiveMeshCandidates; const external = () => inner(); scene.getActiveMeshCandidates = external;
 assert.equal(scene.getActiveMeshCandidates(), subset); assert.equal(candidates.stats.skipped, 0);
 candidates.dispose(); assert.equal(scene.getActiveMeshCandidates, external); assert.equal(external(), subset);
 assert.equal(candidates.result.data.length, 0);
 scene.dispose(); engine.dispose();
});

test('only disabled owned empty clone roots are omitted and later attachments or overrides restore them', () => {
 const {engine, scene, source} = setup(), root = new TransformNode('placement', scene);
 const empty = new Mesh('empty', scene); empty.parent = root;
 const unowned = new Mesh('unowned', scene); unowned.setEnabled(false);
 const candidates = new VillageActiveCandidates(scene);
 candidates.addEmptyRoot(empty); candidates.addEmptyRoot(empty); candidates.addEmptyRoot(source);
 assert.equal(candidates.stats.owned, 1);
 assert.deepEqual(names(scene.getActiveMeshCandidates()), ['source', 'empty', 'unowned']);
 root.setEnabled(false);
 assert.deepEqual(names(scene.getActiveMeshCandidates()), ['source', 'unowned']);
 empty.material = new StandardMaterial('added-material', scene);
 assert.deepEqual(names(scene.getActiveMeshCandidates()), ['source', 'empty', 'unowned']);
 empty.material = null; empty.isReady = () => true;
 assert.deepEqual(names(scene.getActiveMeshCandidates()), ['source', 'empty', 'unowned']);
 delete empty.isReady;
 assert.deepEqual(names(scene.getActiveMeshCandidates()), ['source', 'unowned']);
 const geometry = MeshBuilder.CreateBox('new-geometry', {}, scene); geometry.geometry.applyToMesh(empty);
 assert.deepEqual(names(scene.getActiveMeshCandidates()), ['source', 'empty', 'unowned', 'new-geometry']);
 root.setEnabled(true);
 assert.deepEqual(names(scene.getActiveMeshCandidates()), ['source', 'empty', 'unowned', 'new-geometry']);
 candidates.dispose(); scene.dispose(); engine.dispose();
});

test('real SDK rendering preserves active instances and draw batches through repeated visibility changes', async () => {
 const {engine, scene, source} = setup(); const roots = [], emptyRoots = [];
 for (let i = 0; i < 32; i++) { const entry = makeInstance(source, `tree-${i}`, i % 4 === 0); entry.root.position.x = (i % 8) - 4; const empty = new Mesh(`empty-${i}`, scene); empty.parent = entry.root; emptyRoots.push(empty); roots.push(entry.root); }
 const dynamic = MeshBuilder.CreateBox('actor', {}, scene); dynamic.position.y = 1;
 const original = scene.getActiveMeshCandidates; const candidates = new VillageActiveCandidates(scene);
 for (const mesh of scene.meshes) candidates.add(mesh);
 for (const mesh of emptyRoots) candidates.addEmptyRoot(mesh);
 await prepareMapMaterials([source, dynamic]);
 const filtered = scene.getActiveMeshCandidates; const draws = []; const draw = engine.drawElementsType.bind(engine);
 engine.drawElementsType = (...args) => { draws.push(args.slice(0, 4)); return draw(...args); };
 for (let i = 0; i < 3; i++) scene.render();
 for (let i = 0; i < 8; i++) {
  roots[i].setEnabled(!roots[i].isEnabled()); dynamic.setEnabled(i !== 3);
  const snapshots = [];
  for (const provider of [original, filtered]) {
   scene.getActiveMeshCandidates = provider; draws.length = 0; scene.render();
   snapshots.push({active: names(scene.getActiveMeshes()), draws: structuredClone(draws)});
  }
  assert.ok(snapshots[0].draws.length > 0, `step ${i} must exercise real draws`);
  assert.deepEqual(snapshots[1], snapshots[0], `visibility step ${i}`);
 }
 scene.getActiveMeshCandidates = filtered; candidates.dispose(); scene.dispose(); engine.dispose();
});
