import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from '@babylonjs/core';
import {animationCompaction,compactAnimationGroup,compactChannel,compactionExtension,setAnimationCompaction} from '../src/animation-compaction.js';

const channel=keys=>({getKeys:()=>keys});
const vectors=(count,make)=>Array.from({length:count},(_,i)=>({frame:i*2,value:make(i)}));

test('a steady vector channel keeps its first and last frame and one value',()=>{
  const keys=vectors(40,i=>new Vector3(1,1+(i%2)*4e-6,1)),same=keys,last=keys[39];
  assert.equal(compactChannel(channel(keys)),38);
  assert.equal(keys,same);assert.equal(keys.length,2);
  assert.deepEqual(keys.map(k=>k.frame),[0,78]);assert.equal(keys[1],last);
  assert.ok(keys[1].value.equals(keys[0].value));assert.notEqual(keys[1].value,keys[0].value);
});

test('a moving channel is untouched',()=>{
  const keys=vectors(40,i=>new Vector3(0,i===17?2e-5:0,0));
  assert.equal(compactChannel(channel(keys)),0);assert.equal(keys.length,40);assert.equal(keys[17].value.y,2e-5);
});

test('quaternions compare all four parts, scalars compare as numbers',()=>{
  const turning=vectors(5,i=>new Quaternion(0,0,0,i===4?.9:1));
  assert.equal(compactChannel(channel(turning)),0);
  const still=vectors(5,()=>new Quaternion(0,.5,0,.5));
  assert.equal(compactChannel(channel(still)),3);assert.equal(still.length,2);
  const weights=[0,1,2,3].map(frame=>({frame,value:.25}));
  assert.equal(compactChannel(channel(weights)),2);assert.deepEqual(weights,[{frame:0,value:.25},{frame:3,value:.25}]);
});

test('tangents, easing, short channels and other value types are left alone',()=>{
  const spline=vectors(4,()=>new Vector3(1,1,1));spline[2].inTangent=new Vector3(0,1,0);
  assert.equal(compactChannel(channel(spline)),0);assert.equal(spline.length,4);
  const two=vectors(2,()=>new Vector3(1,1,1));assert.equal(compactChannel(channel(two)),0);
  const colors=[0,1,2].map(frame=>({frame,value:{r:1,g:1,b:1}}));assert.equal(compactChannel(channel(colors)),0);assert.equal(colors.length,3);
  const flat=[0,1,2].map(frame=>({frame,value:{x:1,y:1}}));assert.equal(compactChannel(channel(flat)),0);
  assert.equal(compactChannel(null),0);assert.equal(compactChannel({getKeys:()=>null}),0);
});

test('a group reports what it dropped and the loader hook wraps the stock load',async()=>{
  const before={...animationCompaction};
  const group={targetedAnimations:[{animation:channel(vectors(10,()=>new Vector3(1,1,1)))},{animation:channel(vectors(10,i=>new Vector3(i,0,0)))},{animation:channel(vectors(6,()=>new Quaternion(0,0,0,1)))}]};
  const calls=[],loader={loadAnimationAsync:(context,animation)=>{calls.push([context,animation]);return Promise.resolve(group);}};
  setAnimationCompaction(true);
  const extension=compactionExtension(loader);
  assert.equal(extension.enabled,true);assert.equal(extension.name,'MOONFOREST_compact_animation');
  assert.equal(await extension.loadAnimationAsync('/animations/0',{index:0}),group);
  assert.deepEqual(calls,[['/animations/0',{index:0}]]);
  assert.deepEqual(group.targetedAnimations.map(t=>t.animation.getKeys().length),[2,10,2]);
  assert.equal(animationCompaction.keys-before.keys,12);assert.equal(animationCompaction.channels-before.channels,2);
  setAnimationCompaction(false);assert.equal(compactionExtension(loader).enabled,false);
  assert.equal(compactAnimationGroup(null),0);
});
