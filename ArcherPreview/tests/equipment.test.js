import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, NullEngine, PBRMaterial, Scene, Texture, TransformNode } from '@babylonjs/core';
import { EQUIPMENT_STYLES, WarriorEquipment, readEquipmentChoices, saveEquipmentChoices } from '../src/equipment.js';

test('equipment selections are independent and never change geometry, mounts or shared body materials', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const mount = new TransformNode('original-hand-mount', scene);
  const source = new PBRMaterial('original-painted-material', scene);
  source.emissiveTexture = new Texture(null, scene);
  const body = MeshBuilder.CreateBox('Violet_Vanguard_Restored', {}, scene);
  const sword = MeshBuilder.CreateBox('Golden_Oathblade', {}, scene);
  const shield = MeshBuilder.CreateBox('Bunnyguard_Shield', {}, scene);
  for (const mesh of [body, sword, shield]) { mesh.material = source; mesh.parent = mount; mesh.position.set(1, 2, 3); }
  const snapshot = [body, sword, shield].map(mesh => ({ geometry: mesh.geometry, parent: mesh.parent, transform: mesh.computeWorldMatrix(true).asArray().slice() }));
  const equipment = new WarriorEquipment({ meshes: [body, sword, shield] });
  try {
    assert.notEqual(sword.material, shield.material);
    for (const swordStyle of EQUIPMENT_STYLES) for (const shieldStyle of EQUIPMENT_STYLES) {
      equipment.select('sword', swordStyle.id); equipment.select('shield', shieldStyle.id);
      assert.deepEqual(equipment.inspect(), { sword: swordStyle.id, shield: shieldStyle.id });
      assert.equal(body.material, source);
      for (const [i, mesh] of [body, sword, shield].entries()) {
        assert.equal(mesh.geometry, snapshot[i].geometry);
        assert.equal(mesh.parent, snapshot[i].parent);
        assert.deepEqual(mesh.computeWorldMatrix(true).asArray(), snapshot[i].transform);
        assert.ok(mesh.material.emissiveTexture === source.emissiveTexture, 'texture must remain shared with the original asset');
      }
    }
    equipment.dispose();
    assert.equal(sword.material, source); assert.equal(shield.material, source);
    assert.ok(scene.textures.includes(source.emissiveTexture));
  } finally { scene.dispose(); engine.dispose(); }
});

test('equipment preferences survive reloading and gracefully handle invalid or unavailable storage', () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  saveEquipmentChoices(storage, { sword: 'violet-silver', shield: 'teal-bronze' });
  assert.deepEqual(readEquipmentChoices(storage), { sword: 'violet-silver', shield: 'teal-bronze' });
  saved = '{broken'; assert.deepEqual(readEquipmentChoices(storage), { sword: 'original', shield: 'original' });
  saved = JSON.stringify({ sword: 'removed-style', shield: 'teal-bronze' });
  assert.deepEqual(readEquipmentChoices(storage), { sword: 'original', shield: 'teal-bronze' });
  saved = 'null'; assert.deepEqual(readEquipmentChoices(storage), { sword: 'original', shield: 'original' });
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => saveEquipmentChoices(blocked, { sword: 'original', shield: 'original' }));
  assert.deepEqual(readEquipmentChoices(blocked), { sword: 'original', shield: 'original' });
});

test('a sword with a shape of its own swaps geometry and painting on the same mount, shell included, and goes back', async () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const mount = new TransformNode('hand', scene), source = new PBRMaterial('painted', scene); source.emissiveTexture = new Texture(null, scene);
  const sword = MeshBuilder.CreateBox('Golden_Oathblade', {}, scene), shield = MeshBuilder.CreateBox('Bunnyguard_Shield', {}, scene);
  for (const mesh of [sword, shield]) { mesh.material = source; mesh.parent = mount; }
  const shell = sword.clone('Golden_Oathblade / silhouette'); shell.parent = sword;
  const standard = sword.geometry; assert.equal(shell.geometry, standard, 'the outline shell shares the sword geometry');
  // The model the loader hands over: one mesh with its own geometry and painting.
  const made = [];
  const loadModel = async (url, target) => {
    assert.match(String(url), /soldier-sword\.glb$/); assert.equal(target, scene);
    const mesh = MeshBuilder.CreateCylinder('Soldier_Sword', {}, scene), material = new PBRMaterial('soldier', scene); material.albedoTexture = new Texture(null, scene); mesh.material = material; mesh.setEnabled(false);
    const container = { meshes: [mesh], disposed: false, dispose() { this.disposed = true; mesh.dispose(false, true); } }; made.push(container); return container;
  };
  const equipment = new WarriorEquipment({ meshes: [sword, shield] }, {}, { loadModel });
  try {
    assert.equal(equipment.select('sword', 'soldier-sword'), 'soldier-sword');
    assert.equal(sword.geometry, standard, 'unchanged until the model has arrived');
    await new Promise(resolve => setTimeout(resolve, 0));
    const worn = made[0].meshes[0].geometry;
    assert.equal(sword.geometry, worn); assert.equal(shell.geometry, worn, 'the shell follows');
    assert.equal(sword.material.emissiveTexture, made[0].meshes[0].material.albedoTexture);
    assert.equal(sword.parent, mount); assert.equal(shield.geometry !== worn, true);
    // A colour variant of the standard sword puts everything back; choosing the model again does not load twice.
    equipment.select('sword', 'violet-silver');
    assert.equal(sword.geometry, standard); assert.equal(shell.geometry, standard); assert.equal(sword.material.emissiveTexture, source.emissiveTexture);
    equipment.select('sword', 'soldier-sword'); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(made.length, 1); assert.equal(sword.geometry, worn);
    // The shield slot has no such choice.
    assert.equal(equipment.select('shield', 'soldier-sword'), 'original');
    equipment.dispose(); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(sword.geometry, standard); assert.equal(shell.geometry, standard); assert.equal(sword.material, source); assert.equal(made[0].disposed, true);
  } finally { scene.dispose(); engine.dispose(); }
});
