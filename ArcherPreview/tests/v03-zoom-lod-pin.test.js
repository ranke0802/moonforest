import test from 'node:test';
import assert from 'node:assert/strict';
import {pinScreenArea,unpinScreenArea} from '../src/v03/zoom-lod-pin.js';

class Camera{constructor(){this.fov=.65;this.minZ=.05;}get screenArea(){const h=2*this.minZ*Math.tan(this.fov/2);return h*h*1.7;}}

test('a pinned camera keeps the un-zoomed screen area while the field of view narrows',()=>{
  const camera=new Camera(),before=camera.screenArea;
  assert.equal(pinScreenArea(camera),true);camera.fov=.65*.68;
  assert.equal(camera.screenArea,before);
  assert.equal(pinScreenArea(camera),false,'a second pin must not capture the zoomed value');
  assert.equal(unpinScreenArea(camera),true);
  assert.ok(camera.screenArea<before,'the live value returns after the push-in');
  camera.fov=.65;assert.equal(camera.screenArea,before);
  assert.equal(unpinScreenArea(camera),false);
});
test('missing cameras and cameras without a screen area are left alone',()=>{
  assert.equal(pinScreenArea(null),false);assert.equal(unpinScreenArea(undefined),false);
  const plain={};assert.equal(pinScreenArea(plain),false);assert.equal('screenArea' in plain,false);
});
