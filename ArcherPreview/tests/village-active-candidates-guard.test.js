import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine, Scene, FreeCamera, Vector3, Mesh, MeshBuilder, StandardMaterial, TransformNode} from '@babylonjs/core';
import {VillageActiveCandidates, candidateGuardFromLocation} from '../src/village-active-candidates.js';

// 2026-11-24: the event guard modes (?candidates=events|verify) must select
// exactly what the default full guard selects on every query, while checking
// only a bounded slice of the owned records per query.
function fixture(t, guard, count = 40, roots = 20) {
 const engine = new NullEngine(); engine.getCaps().instancedArrays = true;
 const scene = new Scene(engine), camera = new FreeCamera('camera', new Vector3(0, 3, -6), scene);
 camera.setTarget(Vector3.Zero());
 const source = MeshBuilder.CreateBox('source', {}, scene); source.isVisible = false;
 source.material = new StandardMaterial('material', scene);
 const candidates = new VillageActiveCandidates(scene, {guard});
 const items = [];
 for (let i = 0; i < count; i++) {
  const root = new TransformNode('r' + i, scene), mesh = source.createInstance('i' + i);
  mesh.parent = root; mesh.computeWorldMatrix(true); mesh.freezeWorldMatrix(); root.setEnabled(i % 3 === 0);
  candidates.add(mesh); items.push({root, mesh});
 }
 const empties = [];
 for (let i = 0; i < roots; i++) { const empty = new Mesh('e' + i, scene); candidates.addEmptyRoot(empty); empties.push(empty); }
 t.after(() => { candidates.dispose(); scene.dispose(); engine.dispose(); });
 return {scene, candidates, items, empties, source};
}
const selected = scene => { const list = scene.getActiveMeshCandidates(); return list.data.slice(0, list.length).map(mesh => mesh.name); };

test('the URL flag picks the guard; anything else keeps the full guard', () => {
 const saved = globalThis.location;
 try {
  for (const [search, guard] of [['', 'full'], ['?candidates=events', 'events'], ['?candidates=verify', 'verify'], ['?candidates=fast', 'full'], ['?x=1&candidates=events', 'events']]) {
   globalThis.location = {search};
   assert.equal(candidateGuardFromLocation(), guard, search);
  }
  globalThis.location = undefined;
  assert.equal(candidateGuardFromLocation(), 'full');
  assert.equal(candidateGuardFromLocation('events'), 'events');
  globalThis.location = {search:'?candidates=full'};
  assert.equal(candidateGuardFromLocation('events'), 'full');
 } finally { globalThis.location = saved; }
});

test('event guard selects exactly what the full guard selects through random toggles', t => {
 const full = fixture(t, 'full'), events = fixture(t, 'events');
 assert.equal(events.candidates.stats.guard, 'events');
 assert.equal('guard' in full.candidates.stats, false, 'the default stats keep their shape');
 let seed = 7; const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
 for (let step = 0; step < 300; step++) {
  const i = Math.floor(random() * full.items.length), enabled = random() < .5;
  full.items[i].root.setEnabled(enabled); events.items[i].root.setEnabled(enabled);
  if (step % 37 === 0) { const j = Math.floor(random() * full.items.length); full.items[j].mesh.parent = null; events.items[j].mesh.parent = null; }
  assert.deepEqual(selected(events.scene), selected(full.scene), 'step ' + step);
 }
});

test('event guard checks a bounded slice per query instead of every record', t => {
 const full = fixture(t, 'full', 64, 32), events = fixture(t, 'events', 64, 32);
 selected(full.scene); selected(events.scene);
 const disabled = full.candidates.disabled.length;
 assert.equal(full.candidates.stats.registryChecks, disabled + 32);
 assert.equal(events.candidates.stats.registryChecks, Math.ceil(events.candidates.disabled.length / 32) + 1);
 assert.ok(events.candidates.stats.registryChecks < full.candidates.stats.registryChecks / 10);
});

test('only marked dormant reward meshes are omitted and the first enabled frame admits them', t => {
 for(const guard of ['full','events','verify']){
  const {scene,candidates}=fixture(t,guard,2,0);
  const pulse=MeshBuilder.CreateBox('reward-pulse',{},scene),plain=MeshBuilder.CreateBox('arbitrary-pulse',{},scene);
  pulse.metadata={moonforestRewardFx:true};
  pulse.setEnabled(false);plain.setEnabled(false);
  assert.equal(selected(scene).includes(pulse.name),false);
  assert.equal(selected(scene).includes(plain.name),true);
  assert.ok(scene.meshes.includes(pulse),'the resource remains prepared in the scene');
  pulse.setEnabled(true);
  assert.equal(selected(scene).includes(pulse.name),true);
  pulse.setEnabled(false);
  assert.equal(selected(scene).includes(pulse.name),false);
  pulse.dispose();
  assert.ok(!candidates.result.data.slice(0,selected(scene).length).includes(pulse));
 }
});

test('an overridden method on a disabled instance is still picked up by the sweep', t => {
 const events = fixture(t, 'events');
 const target = events.items.find((item, i) => i % 3 !== 0).mesh;
 assert.equal(selected(events.scene).includes(target.name), false);
 target.isReady = () => true;
 let queries = 0;
 while (!selected(events.scene).includes(target.name)) { queries++; assert.ok(queries <= 32, 'picked up within the sweep period'); }
 target.isReady = Object.getPrototypeOf(target).isReady;
 queries = 0;
 while (selected(events.scene).includes(target.name)) { queries++; assert.ok(queries <= 32); }
});

test('an empty root that gains geometry is submitted again within the sweep period', t => {
 const events = fixture(t, 'events');
 const root = events.empties[19];
 assert.equal(selected(events.scene).includes(root.name), false);
 root.material = events.source.material;
 let queries = 0;
 while (!selected(events.scene).includes(root.name)) { queries++; assert.ok(queries <= 32); }
});

test('verify guard counts and fixes what the event path missed on the same query', t => {
 const verify = fixture(t, 'verify');
 selected(verify.scene);
 assert.equal(verify.candidates.stats.mismatches, 0);
 // The last disabled record is outside the first sweep slice.
 const record = verify.candidates.disabled[verify.candidates.disabled.length - 1];
 record.mesh.isReady = () => true;
 assert.equal(selected(verify.scene).includes(record.mesh.name), true, 'submitted on the very next query');
 assert.equal(verify.candidates.stats.mismatches, 1);
 // Ordinary enable/disable notifications are never mismatches.
 for (const item of verify.items) item.root.setEnabled(!item.root.isEnabled(false));
 selected(verify.scene);
 assert.equal(verify.candidates.stats.mismatches, 1);
});
