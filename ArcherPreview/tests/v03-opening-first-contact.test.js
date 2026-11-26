import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine, Scene, FreeCamera, TransformNode, Vector3} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossBattle} from '../src/boss-battle.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {PlayerStrikeSampler} from '../src/player-strikes.js';
import {createSwordTrail} from '../src/sword-trail.js';
import {AMBUSH} from '../src/v03/boot.js';

// Use the shipped geometry, PBR material, bones and clips. Only the texture
// bytes are a stand-in: NullEngine cannot exercise a phone's native KTX upload.
async function loadLocalWolf(scene, manifest) {
  const assets = new URL('../public/assets/', import.meta.url);
  const config = JSON.parse(readFileSync(new URL(manifest + '.json', assets)));
  const {gltf, files} = await readRuntimeGltf(new URL(config.model, assets));
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    gltf[key] = (gltf[key] ?? []).filter(name => !['EXT_meshopt_compression','KHR_texture_basisu'].includes(name));
  }
  for (const buffer of gltf.buffers) {
    if (buffer.uri) buffer.uri = 'data:application/octet-stream;base64,' + files.get(buffer.uri).data.toString('base64');
  }
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=';
  for (const image of gltf.images) Object.assign(image, {uri:pixel, mimeType:'image/png'});
  for (const texture of gltf.textures) {
    const basis = texture.extensions?.KHR_texture_basisu;
    if (basis) { texture.source = basis.source; delete texture.extensions.KHR_texture_basisu; }
  }
  const loader = new GLTFFileLoader();
  const container = await loader.loadAssetContainerAsync(scene, {json:gltf}, '');
  loader.dispose();
  for (const group of container.animationGroups) group.stop();
  return {config,container};
}

test('the prepared prologue gray wolf takes the first sword hit without a new model, material, texture or shader variant', async t => {
  const engine = new NullEngine(), scene = new Scene(engine);
  t.after(() => {scene.dispose(); engine.dispose();});
  // NullEngine creates the raw texture object but never sets its ready bit
  // (in WebGL that happens after the upload), including the neutral fog texel.
  const createRaw = engine.createRawTexture.bind(engine);
  let rawCreates = 0;
  engine.createRawTexture = (...args) => {
    rawCreates++;
    const texture = createRaw(...args);
    texture.isReady = true;
    return texture;
  };
  const shaderPrograms = t.mock.method(engine, 'createShaderProgram');
  const textureCreates = t.mock.method(engine, 'createTexture');
  scene.useRightHandedSystem = true;
  Object.assign(engine.getCaps(), {maxVertexUniformVectors:256, maxVertexTextureImageUnits:16, textureFloat:true});
  const camera = new FreeCamera('camera',new Vector3(0,3,-7),scene);
  camera.setTarget(new Vector3(0,1,0));
  const world = {scene, release:'moonforest-0.2', gameplayV03:true, mapId:'great-plains',
    terrain:{place(v){v.y=0;}, heightAt(){return 0;}}, shadows:{addShadowCaster(){}, removeShadowCaster(){}}};
  const damage = [];
  const battle = new BossBattle(world, () => {}, (...args) => damage.push(args));
  const models = battle.regularWolves[AMBUSH.kind].models;
  assert.ok(models instanceof BossModelLibrary);
  let sourceLoads = 0, modelRequests = 0;
  models.load = async () => {
    modelRequests++;
    if (!models.container) {
      sourceLoads++;
      Object.assign(models, await loadLocalWolf(scene, models.manifest));
    }
  };
  const player = new TransformNode('warrior',scene);
  player.metadata = {playerDimensions:WARRIOR_DIMENSIONS};
  const blade = new TransformNode('test-blade',scene);
  const sampler = new PlayerStrikeSampler();
  const trail = createSwordTrail(scene);
  battle.preparationOptions = {frame:async()=>{}};
  assert.equal(await battle.summon(player, AMBUSH.count, AMBUSH.kind), true);
  const [wolf] = battle.encounters;
  assert.equal(wolf.assetPrepared, true);
  assert.equal(battle.lastSummon.status, 'ready');
  assert.equal(sourceLoads, 1);
  wolf.actor.position.setAll(0);
  player.position.set(0,0,12);
  for (let i=0; i<100 && !trail.inspect().prepared; i++) {
    scene.render();
    await new Promise(resolve => setTimeout(resolve,10));
  }
  scene.render();
  assert.equal(trail.inspect().prepared, true);
  const snapshot = () => ({
    modelRequests, sourceLoads, rawCreates, shaderRequests:shaderPrograms.mock.callCount(),
    textureCreates:textureCreates.mock.callCount(), effects:Object.keys(engine._compiledEffects).sort(),
    textures:engine.getLoadedTexturesCache().map(texture => texture.uniqueId).sort(),
    meshes:scene.meshes.length, materials:scene.materials.length, geometry:scene.geometries.length
  });
  // Use the same strike sampler and contact path as main.js. Supply a short
  // deterministic sword sweep through the shipped posed body.
  const idle = {state:'idle',actionId:null};
  const tick = () => {
    battle.update(1/60,player);
    battle.poseAndContacts(player,idle,null,null);
    scene.render();
  };
  for (let frame=0;frame<120;frame++) tick();
  const before = snapshot(), hp = wolf.brain.hp;
  assert.ok(before.effects.length > 0);
  assert.ok(before.textures.length > 0);
  assert.ok(before.textureCreates > 0);
  player.position.copyFrom(wolf.actor.position);
  player.position.z += 1.6;
  tick();
  const chest = wolf.nodes.chest.getAbsolutePosition();
  blade.position.copyFrom(chest);
  blade.position.x -= .12;
  const swing = {state:'attack', actionId:1, clipTime:.54};
  sampler.sample(swing,blade,null);
  blade.position.x += .12;
  swing.clipTime = .57;
  const sample = sampler.sample(swing,blade,null);
  trail.update(sample,'attack',2);
  assert.ok(trail.inspect().activeSegments > 0);
  battle.poseAndContacts(player,swing,sample,null);
  assert.ok(wolf.brain.hp < hp);
  assert.equal(damage.filter(args => args[3] === 'enemy' && args[6] === wolf).length,1);
  for (let frame=0;frame<120;frame++) {
    trail.update(null,'idle',2+(frame+1)/60);
    tick();
  }
  const after = snapshot();
  assert.deepEqual(after,before);
  t.diagnostic(`Wolf HP ${hp} → ${wolf.brain.hp}. Model source loads ${after.sourceLoads}, cached effects ${after.effects.length}, sampled textures ${after.textureCreates}, raw texture allocations ${after.rawCreates}. All counts held through impact and the following 120 simulated ticks.`);
});
