import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Animation, AnimationGroup, FreeCamera, Matrix, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from '../src/animation.js';
import { WarriorV2Controller as CharacterController } from '../src/warrior-v2.js';
import { splitGlb } from '../scripts/resource-pack.js';
import { readAccessor } from '../scripts/web-geometry.js';

// Exercise the old V2 source and the actual V3 deployment buffers without a browser.
for (const version of ['v2','v3']) {
const manifestUrl=new URL(`../public/assets/warrior-${version}.json`,import.meta.url);
const config=JSON.parse(readFileSync(manifestUrl));
let gltf,files;
if(version==='v2')({gltf,files}=splitGlb(readFileSync(new URL('../public/assets/violet-warrior-v2.glb',import.meta.url))));
else {
  const url=new URL(config.model,manifestUrl);gltf=JSON.parse(readFileSync(url));
  files=new Map(gltf.buffers.map(b=>[b.uri,{data:readFileSync(new URL(b.uri,url))}]));
}
const names = config.animations;
const channels = new Map();
function accessor(index) {
  const a = gltf.accessors[index];
  assert.equal(a.componentType, 5126);
  const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const values=readAccessor(gltf,files,index);
  return Array.from({ length: a.count }, (_, i) => Array.from(values.subarray(i*width,(i+1)*width)));
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


test(`warrior ${version}: all supplied clips and sword match exported hierarchy at sampled times`, () => {
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
test(`warrior ${version}: shield mount stays rigid within all nine clips after transitions`,()=>{
 const f=fixture();try{
  assert.equal(gltf.animations.length,9);
  const shield=f.nodes.find(n=>n.name==='Bunnyguard_Shield');
  const forearm=f.nodes.find(n=>n.name==='mixamorig:LeftForeArm');
  const sword=f.nodes.find(n=>n.name==='Golden_Oathblade');
  const hand=f.nodes.find(n=>n.name==='mixamorig:RightHand');
  assert.ok(sword.parent===hand,'Sword must be parented directly to the hand for stable transitions');
  let baseline;
  for(const state of ['idle','run','attack','slash','judgment','shieldPush','dodge','knockdown','getUp','idle']){
   baseline=null;f.animator.transition(state,{clipTime:0,actionId:state,loop:false});f.animator.update(.25);f.nodes[0].getScene().render();
   for(let i=0;i<20;i++){
    f.animator.transition(state,{clipTime:i*.017,actionId:state,loop:false});f.animator.update(.017);f.nodes[0].getScene().render();
    const local=shield.computeWorldMatrix(true).multiply(Matrix.Invert(forearm.computeWorldMatrix(true))).asArray();
    baseline ||= [...local];
    const drift=Math.max(...local.map((v,k)=>Math.abs(v-baseline[k])));
    assert.ok(drift<2e-5,`${state} forearm mount drift ${drift}`);
   }
  }
 }finally{f.dispose();}
});
test(`warrior ${version}: idle loop joins without an equipment snap`,()=>{
 const start=referencePose(names.idle,0),end=referencePose(names.idle,1.8666666667);
 for(const name of ['Golden_Oathblade','Bunnyguard_Shield']){
  const idx=gltf.nodes.findIndex(n=>n.name===name);
  const error=Math.max(...start[idx].asArray().map((v,k)=>Math.abs(v-end[idx].asArray()[k])));
  assert.ok(error<.002,`${name} loop seam ${error}`);
 }
});
}
