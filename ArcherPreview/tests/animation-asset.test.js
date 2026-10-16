import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Animation, AnimationGroup, FreeCamera, Matrix, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from '../src/animation.js';
import { CharacterController } from '../src/controller.js';

// Exercise the shipped 101-bone hierarchy and all TRS channels without a browser texture decoder.
// The GLB remains read-only; these groups use exactly its animation data.
const asset = readFileSync(new URL('../public/assets/azure-elf.glb', import.meta.url));
const jsonLength = asset.readUInt32LE(12);
const gltf = JSON.parse(asset.toString('utf8', 20, 20 + jsonLength));
const binaryOffset = 20 + jsonLength + 8;
const names = JSON.parse(readFileSync(new URL('../public/assets/character.json', import.meta.url))).animations;
const channels = new Map();
function accessor(index) {
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
  assert.equal(a.componentType, 5126);
  const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const offset = binaryOffset + (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || width * 4;
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, k) => asset.readFloatLE(offset + i * stride + k * 4)));
}
for (const clip of gltf.animations) channels.set(clip.name, clip.channels.map(channel => {
  const sampler = clip.samplers[channel.sampler];
  assert.equal(sampler.interpolation || 'LINEAR', 'LINEAR');
  return { ...channel.target, times: accessor(sampler.input).flat(), values: accessor(sampler.output) };
}));
const property = { translation: 'position', rotation: 'rotationQuaternion', scale: 'scaling' };
const valueOf = (path, array) => path === 'rotation' ? Quaternion.FromArray(array) : Vector3.FromArray(array);
function referencePose(clipName, seconds) {
  const transforms = gltf.nodes.map(n => ({ translation: n.translation || [0, 0, 0], rotation: n.rotation || [0, 0, 0, 1], scale: n.scale || [1, 1, 1] }));
  for (const channel of channels.get(clipName)) {
    const { times, values, path } = channel;
    let first = 0;
    while (first + 1 < times.length && times[first + 1] <= seconds) first++;
    const second = Math.min(first + 1, times.length - 1);
    const t = second === first ? 0 : (seconds - times[first]) / (times[second] - times[first]);
    transforms[channel.node][path] = path === 'rotation'
      ? Quaternion.Slerp(Quaternion.FromArray(values[first]), Quaternion.FromArray(values[second]), t).asArray()
      : values[first].map((value, axis) => value + (values[second][axis] - value) * t);
  }
  const parents = new Map(); gltf.nodes.forEach((node, index) => (node.children || []).forEach(child => parents.set(child, index)));
  const matrices = new Map();
  function world(index) {
    if (matrices.has(index)) return matrices.get(index);
    const t = transforms[index];
    const local = Matrix.Compose(Vector3.FromArray(t.scale), Quaternion.FromArray(t.rotation), Vector3.FromArray(t.translation));
    const result = parents.has(index) ? local.multiply(world(parents.get(index))) : local;
    matrices.set(index, result); return result;
  }
  return gltf.nodes.map((_, index) => world(index));
}
function fixture() {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true; scene.useConstantAnimationDeltaTime = true;
  new FreeCamera('camera', new Vector3(0, 2, -5), scene);
  const nodes = gltf.nodes.map((data, index) => {
    const node = new TransformNode(data.name || `node-${index}`, scene);
    node.position = Vector3.FromArray(data.translation || [0, 0, 0]);
    node.rotationQuaternion = Quaternion.FromArray(data.rotation || [0, 0, 0, 1]);
    node.scaling = Vector3.FromArray(data.scale || [1, 1, 1]);
    return node;
  });
  gltf.nodes.forEach((data, index) => (data.children || []).forEach(child => { nodes[child].parent = nodes[index]; }));
  const groups = [...channels.entries()].map(([name, tracks]) => {
    const group = new AnimationGroup(name, scene);
    for (const track of tracks) {
      const animation = new Animation(`${name}-${track.node}-${track.path}`, property[track.path], 60, track.path === 'rotation' ? Animation.ANIMATIONTYPE_QUATERNION : Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CYCLE);
      animation.setKeys(track.times.map((time, i) => ({ frame: time * 60, value: valueOf(track.path, track.values[i]) })));
      group.addTargetedAnimation(animation, nodes[track.node]);
    }
    return group;
  });
  const animator = new CharacterAnimator(groups, names);
  const controller = new CharacterController({ durations: animator.durations });
  const step = (dt, input) => { const result = controller.update(dt, input); animator.transition(result.state, result); animator.update(dt); scene.render(); return result; };
  function compare(clipName, time) {
    const expected = referencePose(clipName, time);
    nodes.forEach((node, i) => {
      const matrix = node.computeWorldMatrix(true);
      const error = Math.max(...matrix.asArray().map((value, k) => Math.abs(value - expected[i].asArray()[k])));
      assert.ok(error < 2e-5, `${clipName} ${node.name} at ${time}: world-matrix error ${error}`);
    });
  }
  return { animator, controller, nodes, step, compare, dispose() { animator.dispose(); scene.dispose(); engine.dispose(); } };
}

test('shipped GLB: Walk and Run loop at authored seconds with no second-engine drift', () => {
  const f = fixture();
  try {
    f.step(f.animator.durations.walk * 3 + .25, { y: 1 }); f.compare(names.walk, .25);
    f.controller.toggleRun(); f.step(f.animator.durations.run * 4 + .25, { y: 1 }); f.compare(names.run, .25);
  } finally { f.dispose(); }
});

test('shipped GLB: draw/release/recovery sample the real hierarchy, including hidden-arrow scale', () => {
  const f = fixture();
  try {
    f.controller.attack();
    let result = f.step(53 / 30 + .001); f.compare(names.attack, result.clipTime);
    assert.equal(result.events.length, 1);
    result = f.step(.2); f.compare(names.attack, result.clipTime);
    const arrow = f.nodes.find(node => node.name === 'arrow');
    assert.ok(arrow.scaling.length() < .001, 'Authored hidden-arrow scale must survive manual sampling');
    result = f.step(.1, { y: 1 }); f.compare(names.moveAttack, result.clipTime);
    assert.equal(result.events.length, 0);
  } finally { f.dispose(); }
});

test('shipped GLB: interrupted multi-clip fades stay normalized; death holds and revive restores idle', () => {
  const f = fixture();
  try {
    f.step(.01); f.step(.03, { y: 1 }); f.controller.toggleRun(); f.step(.03, { y: 1 }); f.controller.attack(); f.step(.03);
    const total = [...f.animator.active.values()].reduce((sum, entry) => sum + entry.weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
    for (const node of f.nodes) assert.ok(node.computeWorldMatrix(true).asArray().every(Number.isFinite));
    f.controller.die(); f.step(20); f.compare(names.death, f.animator.durations.death);
    f.step(20); f.compare(names.death, f.animator.durations.death);
    f.controller.revive(); f.step(.2); f.compare(names.idle, .2);
  } finally { f.dispose(); }
});
