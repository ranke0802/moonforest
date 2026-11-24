import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine, Vector3} from '@babylonjs/core';
import {prepareFixedLayouts} from '../src/fixed-layouts.js';
import {createWorld} from '../src/world.js';
import {PLAINS_MONSTER_SPAWNS} from '../src/plains-monster-spawns.js';
import {ACTOR_DEFINITIONS, validateActorSpawn} from '../src/actor-definitions.js';
import {safeMonsterSceneryHome} from '../src/monster-scenery-space.js';
import {QUESTS} from '../src/v03/data/chapter1.js';

// 2026-11-24 (user report 19:19): the chapter-one hill bear never appeared.
// The plains residents are validated against the 0.2 obstacles, but 0.3 adds
// settlement scenery and fits outdoor rock bodies to their models
// (mapNavigation gameplayV03). From ea973b14 until 93d209f3 the bear's home at
// (-25,-16) lay inside a fitted rock, safeMonsterSceneryHome found no home and
// the M04 step "defeat the bear" could never be completed. This test runs the
// actual spawn-home search on the 0.3 plains world.
globalThis.matchMedia ??= () => ({matches: true});
{
 const ctx = new Proxy({}, {get: (t, k) => k === 'measureText' ? () => ({width: 10}) : k === 'getImageData' ? (x, y, w, h) => ({data: new Uint8ClampedArray(w * h * 4), width: w, height: h}) : typeof k === 'string' ? (t[k] ?? (() => {})) : undefined, set: (t, k, v) => { t[k] = v; return true; }});
 globalThis.OffscreenCanvas ??= class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctx; } };
}

async function plainsWorld(t) {
 await prepareFixedLayouts(['village', 'great-plains']);
 const engine = new NullEngine(), world = createWorld(engine, {plains: true, village: true, gameplayV03: true, touchDevice: true});
 t.after(() => engine.dispose());
 return world;
}
function home(world, row) {
 const definition = ACTOR_DEFINITIONS[row.definitionId];
 const requested = new Vector3(row.x, world.terrain.heightAt(row.x, row.z), row.z);
 return safeMonsterSceneryHome(world, row, requested, position => validateActorSpawn(definition, world, {position, player: null, occupied: []}).valid);
}

test('every default plains resident has a safe home on the 0.3 plains (settlement scenery and fitted rocks)', async t => {
 const world = await plainsWorld(t), rows = PLAINS_MONSTER_SPAWNS.maps['great-plains'];
 assert.ok(rows.length >= 19);
 const missing = rows.filter(row => !home(world, row)).map(row => `${row.id} (${row.x},${row.z})`);
 assert.deepEqual(missing, [], 'residents that would never appear');
});

test('a chapter-one defeat step fought against a placed resident has that resident inside its circle', async t => {
 const world = await plainsWorld(t), rows = PLAINS_MONSTER_SPAWNS.maps['great-plains'];
 const steps = QUESTS.flatMap(quest => quest.steps.map(step => ({quest: quest.id, ...step})))
  .filter(step => step.type === 'defeat' && step.map === 'great-plains' && step.at && !step.summon && step.kind === 'bear');
 assert.ok(steps.length >= 1, 'M04 hill bear step');
 for (const step of steps) {
  const residents = rows.filter(row => row.definitionId.includes(step.kind)).map(row => ({row, at: home(world, row)}))
   .filter(({at}) => at && Math.hypot(at.x - step.at.x, at.z - step.at.z) <= step.at.radius);
  assert.ok(residents.length >= 1, `${step.quest}/${step.id}: no spawnable ${step.kind} inside (${step.at.x},${step.at.z}) r${step.at.radius}`);
  // The authored summit, not a far-away fallback ring.
  assert.ok(residents.some(({row, at}) => Math.hypot(at.x - row.x, at.z - row.z) <= 1), `${step.quest}/${step.id}: resident moved off its authored home`);
 }
});
