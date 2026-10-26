import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { followTarget, combatFocus } from '../src/camera-follow.js';

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

test('distant enemies cannot drag the player off screen in the expanded arena',()=>{
 const center=new Vector3(20,1,0),enemy=new Vector3(-20,0,0);
 assert.ok(Vector3.Distance(center,combatFocus(center,enemy))<=2.000001);
 const near=new Vector3(18,0,0);assert.ok(combatFocus(center,near).equalsWithEpsilon(Vector3.Lerp(center,near.add(new Vector3(0,1.1,0)),.35)));
 assert.equal(combatFocus(center,null),center);
});
