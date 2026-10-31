import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, MeshBuilder, TransformNode, Skeleton, Bone, Matrix, Quaternion, VertexBuffer, Vector3 } from '@babylonjs/core';
import { attachCharacterOutlines, isRuntimeOutline } from '../src/character-outlines.js';
import { applyHitFlash } from '../src/hit-feedback.js';

for (const useTexture of [false, true]) test(`consecutive cached outline draws bind each monster's own ${useTexture ? 'bone texture' : 'bone matrices'}`, t => {
  const engine = new NullEngine(), scene = new Scene(engine);
  t.after(() => { scene.dispose(); engine.dispose(); });
  engine.getCaps().textureFloat = true;
  engine.getCaps().maxVertexTextureImageUnits = 16;
  const actors = Array.from({length:5}, (_, i) => {
    const body = MeshBuilder.CreateBox(`bear-${i}`, {}, scene), count = body.getTotalVertices();
    body.position.x = i * 3;
    body.setVerticesData(VertexBuffer.MatricesIndicesKind, new Float32Array(count * 4));
    body.setVerticesData(VertexBuffer.MatricesWeightsKind, Array.from({length:count * 4}, (_, j) => j % 4 === 0 ? 1 : 0));
    body.skeleton = new Skeleton(`rig-${i}`, `rig-${i}`, scene);
    body.skeleton.useTextureToStoreBoneMatrices = useTexture;
    const bone = new Bone('root', body.skeleton, null, Matrix.Identity());
    bone.setPosition(new Vector3(i + .25, i * .2, 0));
    body.skeleton.prepare(true);
    const shell = attachCharacterOutlines({meshes:[body]}, 'bear')[0];
    return {body,bone,shell};
  });
  const bound = {};
  const effect = {
    isReady:()=>true,
    setMatrix() {}, setFloat() {}, setFloat2() {}, setColor3() {},
    getUniformIndex: () => useTexture ? 0 : -1,
    setTexture: (name, texture) => { bound[name] = texture; },
    setMatrices: (name, matrices) => { bound[name] = Array.from(matrices); },
  };
  const draw = shell => shell.material.bind(shell.computeWorldMatrix(true), shell, effect, shell.subMeshes[0]);
  // Warm every submesh, then reproduce Babylon's material-sorted render queue.
  for (const {shell} of actors) draw(shell);
  for (let frame=0; frame<3; frame++) {
    scene.resetCachedMaterial();
    for (const [i,{body,bone,shell}] of actors.entries()) {
      bone.setPosition(new Vector3(i + frame + .5, i * .2, 0));
      body.skeleton.prepare(true);
      draw(shell);
      if (useTexture) assert.ok(bound.boneSampler === body.skeleton.getTransformMatrixTexture(shell), `frame ${frame}, actor ${i}: wrong skeleton texture`);
      else assert.deepEqual(bound.mBones, Array.from(body.skeleton.getTransformMatrices(shell)), `frame ${frame}, actor ${i}: wrong skeleton matrices`);
    }
  }
});

test('equipment silhouettes follow mounted transforms without copying buffers or changing the skin', t => {
  const engine = new NullEngine(), scene = new Scene(engine);
  t.after(() => { scene.dispose(); engine.dispose(); });
  const actor = new TransformNode('actor', scene); actor.scaling.setAll(1.8146);
  const meshes = ['Golden_Oathblade', 'Bunnyguard_Shield', 'Warrior_Body', 'Warrior_Body_Outline']
    .map(name => { const mesh = MeshBuilder.CreateBox(name, {}, scene); mesh.parent = actor; return mesh; });
  const skeleton = new Skeleton('rig', 'rig', scene);
  meshes[0].skeleton = skeleton; meshes[0].numBoneInfluencers = 8;
  const asset = { meshes }, geometries = scene.geometries.length;
  const shells = attachCharacterOutlines(asset, 'warrior');
  assert.equal(shells.length, 2); assert.equal(scene.geometries.length, geometries);
  assert.deepEqual(attachCharacterOutlines(asset, 'warrior'), [], 'repeated setup must not stack outlines');
  for (const shell of shells) {
    const source = shell.parent;
    assert.equal(shell.geometry, source.geometry);
    assert.equal(shell.skeleton, source.skeleton);
    assert.equal(shell.numBoneInfluencers, source.numBoneInfluencers);
    assert.equal(shell.isPickable, false); assert.equal(shell.checkCollisions, false);
    assert.equal(shell.receiveShadows, false);
    for (const angle of [0, .8, -1.4]) {
      source.position.set(.15, 1.1, -.2); source.scaling.setAll(.3);
      source.rotationQuaternion = Quaternion.RotationYawPitchRoll(angle, .4, -.3);
      const a = source.computeWorldMatrix(true), b = shell.computeWorldMatrix(true);
      for (let i = 0; i < 16; i++) assert.ok(Math.abs(a.m[i] - b.m[i]) < 1e-6);
    }
  }
});

test('monster shells share a material, keep independent skins and inherit fade, flash and disposal', t => {
  const engine = new NullEngine(), scene = new Scene(engine);
  t.after(() => { scene.dispose(); engine.dispose(); });
  const assets = ['bear', 'goblin'].map(kind => {
    const body = MeshBuilder.CreateSphere(kind, { segments: 8 }, scene);
    body.skeleton = new Skeleton(kind, kind, scene);
    const asset = { meshes: [body] };
    return { body, asset, shell: attachCharacterOutlines(asset, kind)[0] };
  });
  const [bear, goblin] = assets;
  assert.equal(bear.shell.material, goblin.shell.material);
  assert.notEqual(bear.shell.skeleton, goblin.shell.skeleton);
  assert.equal(bear.shell.skeleton, bear.body.skeleton);
  const values = {}, material = bear.shell.material;
  material.getEffect = () => ({ isReady:()=>true,setTexture(){},setFloat: (key, value) => { values[key] = value; }, setFloat2:(key,x,y)=>{values[key]=[x,y];} });
  bear.shell.visibility = .5;
  applyHitFlash(bear.asset.meshes, .22);
  material.onBindObservable.notifyObservers(bear.shell);
  assert.equal(values.outlineOpacity, .5); assert.equal(values.hitFlash, .72);
  assert.equal(values.outlinePixels,0,'bear retains its existing world-width outline');
  assert.equal(values.outlineWidth,.006,'neutral boss preferences preserve the approved bear width');
  assert.deepEqual(values.outlineViewport,[engine.getRenderWidth(),engine.getRenderHeight()]);
  assert.equal(bear.shell.renderOverlay, false, 'flash must stay in the same outline pass');
  material.onBindObservable.notifyObservers(goblin.shell);
  assert.equal(values.outlineOpacity, 1); assert.equal(values.hitFlash, 0);
  bear.body.setEnabled(false); assert.equal(bear.shell.isEnabled(), false);
  bear.body.dispose(); assert.equal(bear.shell.isDisposed(), true);
  assert.equal(goblin.shell.isDisposed(), false);
  assert.ok(isRuntimeOutline(goblin.shell));
});
