import test from 'node:test';
import assert from 'node:assert/strict';
import {readFrameRate,defaultFrameRate,FRAME_RATE_KEY} from '../src/frame-rate-settings.js';
import {RenderActivity} from '../src/render-policy.js';
const store=value=>({getItem:key=>key===FRAME_RATE_KEY?value:null});
test('PC defaults to 120 FPS, touch devices to 60; a saved choice wins',()=>{
 assert.equal(defaultFrameRate(false),120);assert.equal(defaultFrameRate(true),60);
 assert.equal(readFrameRate(store(null),false),120);assert.equal(readFrameRate(store(null),true),60);
 assert.equal(readFrameRate(store('30'),false),30);assert.equal(readFrameRate(store('120'),true),120);assert.equal(readFrameRate(store('75'),true),60);
});
test('render activity accepts 30, 60 and 120',()=>{
 const pc=new RenderActivity(false),phone=new RenderActivity(true);
 assert.equal(pc.limit(),120);assert.equal(phone.limit(),60);
 assert.equal(pc.setTargetFps('120'),120);assert.equal(pc.setTargetFps(30),30);assert.equal(pc.setTargetFps(90),60);
});
