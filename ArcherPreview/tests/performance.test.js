import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { FrameLoop } from '../src/frame-loop.js';
import { orderPoseNodes, refreshPoseMatrices } from '../src/pose-matrices.js';

test('suspended rendering stops all frames, resumes without advancing hidden time, and repaints resize once',()=>{
  const callbacks=new Set(),steps=[];let time=0;
  const loop=new FrameLoop({runRenderLoop:f=>callbacks.add(f),stopRenderLoop:f=>callbacks.delete(f)},dt=>steps.push(dt),()=>time);
  const tick=()=>{time+=16;for(const f of [...callbacks])f();};
  loop.setPaused(false);tick();tick();assert.deepEqual(steps,[0,.016]);
  loop.setPaused(true);time+=10000;tick();assert.equal(steps.length,2);assert.equal(callbacks.size,0);
  loop.invalidate();tick();assert.equal(steps.at(-1),0);assert.equal(callbacks.size,0);
  loop.setPaused(false);tick();tick();assert.deepEqual(steps.slice(-2),[0,.016]);
});

test('ordered pose refresh preserves same-frame root corrections with no recursive forced computation',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('root',scene),hip=new TransformNode('hip',scene),arm=new TransformNode('arm',scene),hand=new TransformNode('hand',scene);
 hip.parent=root;arm.parent=hip;hand.parent=arm;hip.position.set(0,1,0);arm.position.set(1,0,0);hand.position.set(1,0,0);
 hand.computeWorldMatrix(true);const ordered=orderPoseNodes([hand,hip,arm]);assert.deepEqual(ordered,[hip,arm,hand]);
 root.position.set(3,0,2);root.rotation.y=Math.PI/2;root.computeWorldMatrix(true);
 refreshPoseMatrices(ordered);const optimized=hand.getAbsolutePosition().clone();hand.computeWorldMatrix(true);
 assert.ok(Vector3.Distance(optimized,hand.getAbsolutePosition())<1e-7);assert.ok(Vector3.Distance(optimized,new Vector3(3,1,0))<1e-7);
 scene.dispose();engine.dispose();
});
