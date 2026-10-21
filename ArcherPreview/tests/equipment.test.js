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
