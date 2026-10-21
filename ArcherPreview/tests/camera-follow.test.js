import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { followTarget } from '../src/camera-follow.js';

test('following a moving character preserves wheel radius and drag angles before rendering',()=>{
  const engine=new NullEngine(); const scene=new Scene(engine);
  const camera=new ArcRotateCamera('review',1,1,5,Vector3.Zero(),scene);
  scene.render();
  camera.radius=3;camera.alpha=.5;camera.beta=.8;
  followTarget(camera,new Vector3(1,1,0),1/60);
  scene.render();
  assert.equal(camera.radius,3);assert.equal(camera.alpha,.5);assert.equal(camera.beta,.8);
  assert.ok(camera.target.x>0);
  scene.dispose();engine.dispose();
});
