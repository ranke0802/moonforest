import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine, Scene, FreeCamera, Vector3, Mesh, MeshBuilder, StandardMaterial, TransformNode, DirectionalLight, ShadowGenerator, Node} from '@babylonjs/core';
import {VillageActiveCandidates} from '../src/village-active-candidates.js';
import {prepareMapMaterials} from '../src/map-shader-cache.js';

function fixture(t) {
 const engine = new NullEngine(); engine.getCaps().instancedArrays = true;
 const scene = new Scene(engine), camera = new FreeCamera('camera', new Vector3(0, 3, -6), scene);
 camera.setTarget(Vector3.Zero());
 const source = MeshBuilder.CreateBox('source', {}, scene); source.isVisible = false;
 source.material = new StandardMaterial('material', scene);
 const candidates = new VillageActiveCandidates(scene);
 t.after(() => { candidates.dispose(); scene.dispose(); engine.dispose(); });
 const instance = (name, enabled = false) => {
  const root = new TransformNode(name + '-root', scene), mesh = source.createInstance(name), empty = new Mesh(name + '-empty', scene);
  mesh.parent = empty; empty.parent = root; mesh.computeWorldMatrix(true); mesh.freezeWorldMatrix(); root.setEnabled(enabled);
  candidates.add(mesh); candidates.addEmptyRoot(empty);
  return {root, mesh, empty};
 };
 return {engine, scene, camera, source, candidates, instance};
}
const names = list => list.data.slice(0, list.length).map(mesh => mesh.name);
const selected = f => names(f.scene.getActiveMeshCandidates());

test('stationary queries reuse scene order and guard only disabled registered nodes', t => {
 const f = fixture(t), disabled = f.instance('disabled'), active = f.instance('active', true);
 const dynamic = MeshBuilder.CreateBox('dynamic', {}, f.scene);
 assert.deepEqual(selected(f), ['source', 'active', 'active-empty', 'dynamic']);
 assert.equal(f.candidates.stats.sceneScans, 6);
 for (let i = 0; i < 20; i++) {
  assert.deepEqual(selected(f), ['source', 'active', 'active-empty', 'dynamic']);
  assert.equal(f.candidates.stats.sceneScans, 0);
  assert.equal(f.candidates.stats.registryChecks, 2);
 }
 assert.equal(f.candidates.stats.cacheHits, 20);
 disabled.root.setEnabled(true); active.root.setEnabled(false);
 assert.deepEqual(selected(f), ['source', 'disabled', 'disabled-empty', 'dynamic']);
 assert.equal(f.candidates.stats.sceneScans, 6);
 selected(f); assert.equal(f.candidates.stats.sceneScans, 0);
 // Reparenting changes effective enabled state without setEnabled on the mesh.
 const off = new TransformNode('off', f.scene); off.setEnabled(false);
 disabled.empty.parent = off;
 assert.deepEqual(selected(f), ['source', 'dynamic']);
 disabled.empty.parent = null;
 assert.deepEqual(selected(f), ['source', 'disabled', 'disabled-empty', 'dynamic']);
});

test('Babylon add/remove swap order, late registration and disposal invalidate cached membership', t => {
 const f = fixture(t), a = f.instance('a', true), b = f.instance('b', true), off = f.instance('off');
 selected(f);
 f.scene.removeMesh(a.mesh);
 assert.deepEqual(selected(f), f.scene.meshes.filter(mesh => mesh !== off.mesh && mesh !== off.empty).map(mesh => mesh.name));
 f.scene.addMesh(a.mesh);
 assert.deepEqual(selected(f), f.scene.meshes.filter(mesh => mesh !== off.mesh && mesh !== off.empty).map(mesh => mesh.name));
 // Removed registered objects keep ownership if re-added without disposal.
 f.scene.removeMesh(off.mesh); f.scene.addMesh(off.mesh);
 assert.ok(!selected(f).includes('off'));
 const later = f.source.createInstance('later'); later.computeWorldMatrix(true); later.freezeWorldMatrix(); later.setEnabled(false);
 assert.ok(selected(f).includes('later'));
 f.candidates.add(later); assert.ok(!selected(f).includes('later'));
 assert.equal(f.candidates.records.size, 7);
 b.root.dispose(); later.dispose();
 assert.equal(f.candidates.records.size, 4);
 assert.deepEqual(selected(f), f.scene.meshes.filter(mesh => mesh !== off.mesh && mesh !== off.empty).map(mesh => mesh.name));
 // Foreign direct array edits have an explicit invalidation escape hatch.
 f.scene.meshes.reverse(); f.candidates.invalidate();
 assert.deepEqual(selected(f), f.scene.meshes.filter(mesh => mesh !== off.mesh && mesh !== off.empty).map(mesh => mesh.name));
});

test('mutable empty roots fail open immediately, including in-place attachments', t => {
 const f = fixture(t), {empty} = f.instance('off');
 for (const field of ['material', 'subMeshes', 'skeleton', 'morphTargetManager', 'actionManager', 'isReady', 'isEnabled', 'getTotalVertices']) {
  assert.ok(!selected(f).includes(empty.name));
  const descriptor = Object.getOwnPropertyDescriptor(empty, field), previous = empty[field];
  empty[field] = field === 'subMeshes' ? [{}] : typeof previous === 'function' ? () => false : {};
  assert.ok(selected(f).includes(empty.name), field);
  if (descriptor) Object.defineProperty(empty, field, descriptor); else if (Object.hasOwn(empty, field)) delete empty[field];
  // Material/skeleton/morph setters update native storage, not an own value.
  if (empty[field] !== previous) empty[field] = previous;
 }
 empty.subMeshes ??= [];
 empty.subMeshes.push({}); assert.ok(selected(f).includes(empty.name)); empty.subMeshes.pop();
 assert.ok(!selected(f).includes(empty.name));
 f.source.geometry.applyToMesh(empty); assert.ok(selected(f).includes(empty.name));
});

test('native state is checked when an overridden isEnabled suppresses effective notifications', t => {
 const f = fixture(t), {mesh} = f.instance('off');
 assert.ok(!selected(f).includes(mesh.name));
 mesh.isEnabled = () => false;
 mesh.setEnabled(true); // Own enabled flag was already true, so use the parent.
 mesh.parent.parent.setEnabled(true);
 assert.ok(selected(f).includes(mesh.name));
 delete mesh.isEnabled;
 assert.equal(mesh.isEnabled, Node.prototype.isEnabled);
 assert.ok(selected(f).includes(mesh.name));
 mesh.parent.parent.setEnabled(false);
 assert.ok(!selected(f).includes(mesh.name));
});

test('custom lists, multi-camera and frameGraph preserve the previous provider and release every observer', t => {
 const f = fixture(t), {mesh, empty} = f.instance('off'); selected(f);
 f.scene.activeCameras = [f.camera, f.camera];
 assert.equal(f.scene.getActiveMeshCandidates().data, f.scene.meshes);
 f.scene.activeCameras = null; f.scene.frameGraph = {};
 assert.equal(f.scene.getActiveMeshCandidates().data, f.scene.meshes);
 f.scene.frameGraph = undefined;
 const full = f.candidates.previous, subset = {data: [mesh], length: 1}; let calls = 0;
 f.candidates.previous = () => { calls++; return subset; };
 assert.equal(f.scene.getActiveMeshCandidates(), subset); assert.equal(calls, 1);
 f.candidates.previous = full;
 const retained = f.candidates.provider, wrapper = () => retained(); f.scene.getActiveMeshCandidates = wrapper;
 assert.ok(mesh.onEffectiveEnabledStateChangedObservable.hasObservers());
 assert.ok(empty.onEffectiveEnabledStateChangedObservable.hasObservers());
 f.candidates.dispose();
 assert.equal(f.scene.getActiveMeshCandidates, wrapper); assert.equal(retained().data, f.scene.meshes);
 assert.equal(f.candidates.records.size, 0); assert.equal(f.candidates.disabled.length, 0);
 assert.ok(!mesh.onEffectiveEnabledStateChangedObservable.hasObservers());
 assert.ok(!empty.onEffectiveEnabledStateChangedObservable.hasObservers());
});

test('cached candidates preserve native LOD preparation and all main/shadow instance batches', async t => {
 const f = fixture(t), {scene, source, camera} = f;
 const mid = MeshBuilder.CreateSphere('mid', {segments: 6}, scene), far = MeshBuilder.CreateBox('far', {size: .7}, scene);
 for (const mesh of [mid, far]) { mesh.material = source.material; mesh.isVisible = false; }
 source.addLODLevel(10, mid); source.addLODLevel(20, far);
 const light = new DirectionalLight('light', new Vector3(-.2, -1, .3), scene), shadow = new ShadowGenerator(256, light);
 const entries = Array.from({length: 24}, (_, i) => {
  const entry = f.instance('tree-' + i, true); entry.root.position.set((i % 6 - 2.5) * 1.3, 0, Math.floor(i / 6) * 1.4);
  shadow.addShadowCaster(entry.mesh, false); return entry;
 });
 const actor = MeshBuilder.CreateBox('actor', {size: .4}, scene); actor.material = source.material;
 const draws = [], preparation = [];
 for (const mesh of [source, mid, far, actor]) {
  mesh._instanceDataStorage.useMonoDataStorageRenderPass = false;
  const pre = mesh._preActivate, process = mesh._processRendering;
  mesh._preActivate = function(...args) { preparation.push(mesh.name); return pre.apply(this, args); };
  mesh._processRendering = function(renderMesh, sub, effect, mode, batch, ...rest) {
   draws.push({source: mesh.name, pass: scene._isInIntermediateRendering() ? 'shadow' : 'main', self: !!batch.renderSelf[sub._id], instances: (batch.visibleInstances?.[sub._id] ?? []).map(instance => instance.name)});
   return process.call(this, renderMesh, sub, effect, mode, batch, ...rest);
  };
 }
 await prepareMapMaterials([source, mid, far, actor]); await shadow.forceCompilationAsync({useInstances: true});
 const original = f.candidates.previous, filtered = f.candidates.provider;
 for (const [step, radius] of [6, 16, 28, 7, 7, 16, 6].entries()) {
  for (const [i, entry] of entries.entries()) entry.root.setEnabled(step !== 3 && (step !== 1 && step !== 5 || i % (step === 1 ? 2 : 3) === 0));
  camera.position.set(0, 3, -radius); camera.setTarget(new Vector3(0, 0, 2));
  const snapshots = [];
  for (const provider of [original, filtered, original]) {
   scene.getActiveMeshCandidates = provider; draws.length = 0; preparation.length = 0; scene.render();
   snapshots.push({active: names(scene.getActiveMeshes()), draws: structuredClone(draws), preparation: preparation.slice(), lod: entries.filter(entry => entry.mesh.isEnabled()).map(entry => entry.mesh._currentLOD?.name)});
  }
  assert.ok(snapshots[0].draws.some(draw => draw.pass === 'main'), 'main draws at step ' + step);
  assert.deepEqual(snapshots[1], snapshots[0], 'native batch/LOD/source preparation at step ' + step);
  assert.deepEqual(snapshots[2], snapshots[0], 'stable native oracle at step ' + step);
 }
 scene.getActiveMeshCandidates = filtered;
});
