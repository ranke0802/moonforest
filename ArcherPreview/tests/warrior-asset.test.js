import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Animation, AnimationGroup, FreeCamera, Matrix, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from '../src/animation.js';
import { NativeWarriorController as CharacterController } from '../src/native-warrior.js';

// Exercise the shipped native Meshy hierarchy and all TRS channels without a browser texture decoder.
// The GLB remains read-only; these groups use exactly its animation data.
const asset = readFileSync(new URL('../public/assets/violet-warrior.glb', import.meta.url));
const jsonLength = asset.readUInt32LE(12);
const gltf = JSON.parse(asset.toString('utf8', 20, 20 + jsonLength));
const binaryOffset = 20 + jsonLength + 8;
const names = JSON.parse(readFileSync(new URL('../public/assets/warrior.json', import.meta.url))).animations;
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
  assert.ok(['STEP','LINEAR'].includes(sampler.interpolation || 'LINEAR'));
  return { ...channel.target, interpolation: sampler.interpolation || 'LINEAR', times: accessor(sampler.input).flat(), values: accessor(sampler.output) };
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
    const t = second === first || channel.interpolation === 'STEP' ? 0 : (seconds - times[first]) / (times[second] - times[first]);
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
      animation.setKeys(track.times.map((time, i) => ({ frame: time * 60, value: valueOf(track.path, track.values[i]), ...(track.interpolation === 'STEP' ? {interpolation: 1} : {}) })));
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


test('warrior GLB: all supplied clips and sword match exported hierarchy at sampled times', () => {
  const f=fixture();
  try {
    for(const [state,name] of Object.entries(names)) {
      for(const phase of [0,.25,.5,.75,1]) {
        const time=f.animator.durations[state]*phase;
        f.animator.transition(state,{clipTime:time,actionId:state+phase,loop:false});
        f.animator.update(.2);
        // Render is required for Babylon's weighted animation state to be applied.
        f.nodes[0].getScene().render();f.compare(name,time);
      }
    }
  } finally {f.dispose();}
});
test('warrior GLB: run, attack and ready synchronize body and equipment',()=>{
  const f=fixture();try{
    assert.equal(gltf.animations.length,3);
    for(const name of Object.values(names)) {
      const animatedNames=new Set(channels.get(name).map(c=>gltf.nodes[c.node].name));
      assert.ok(animatedNames.has('Golden_Oathblade'));assert.ok(animatedNames.has('mixamorig:RightHand'));
    }
    assert.ok(Math.abs(f.animator.durations.attack-3)<1e-6);
    assert.ok(Math.abs(f.animator.durations.run-.8)<1e-6);
    f.step(.2,{y:1});f.compare(names.run,.2);
    f.controller.attack();f.step(.2,{y:1});f.compare(names.attack,.2);
    f.step(3.1);f.compare(names.idle,0);
    f.step(.3,{x:1});f.compare(names.run,.3);
    f.step(.2);f.compare(names.idle,0);
  }finally{f.dispose();}
});
