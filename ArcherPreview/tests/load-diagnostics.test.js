import test from 'node:test';
import assert from 'node:assert/strict';
import {LoadDiagnostics,readDiagnosticMemory} from '../src/load-diagnostics.js';

test('cold startup and cached map visits have disjoint wall stages including release time',()=>{
  let now=0;const d=new LoadDiagnostics(()=>now);d.begin('마을');now=100;d.phase('download');d.download({total:80000000,cached:0});
  now=2100;d.phase('model');now=3100;d.phase('screen');now=3600;d.finish();
  const a=d.snapshot();assert.equal(a.setupMs,100);assert.equal(a.downloadMs,2000);assert.equal(a.modelMs,1000);assert.equal(a.screenMs,500);assert.equal(a.totalMs,3600);assert.equal(a.bytes,80000000);
  now=4000;d.begin('숲');now=4200;d.phase('download');d.download({total:0,cached:90000000});d.phase('model');now=4500;d.phase('screen');now=4600;d.finish();
  assert.equal(d.snapshot().downloadMs,0);assert.equal(d.snapshot().cachedBytes,90000000);assert.equal(d.snapshot().totalMs,600);assert.equal(d.history.length,2);
});
test('running and failed stages stay measurable and repeated visits retain at most eight records',()=>{
  let now=0;const d=new LoadDiagnostics(()=>now);d.begin('map');d.phase('model');now=700;assert.equal(d.snapshot().modelMs,700);assert.equal(d.snapshot().phase,'model');d.finish('decode failed');
  assert.equal(d.snapshot().phase,'error');assert.equal(d.snapshot().error,'decode failed');assert.equal(d.snapshot().totalMs,700);
  for(let i=0;i<30;i++){d.begin('map'+i);now+=10;d.phase('screen');now+=30;d.finish();}
  assert.equal(d.history.length,8);assert.equal(d.history[0].label,'map22');assert.equal(d.snapshot().totalMs,40);
});
test('memory metrics distinguish JS heap from the background texture estimate and unsupported values',()=>{
  const memory=readDiagnosticMemory({memory:{usedJSHeapSize:120000000,totalJSHeapSize:160000000,jsHeapSizeLimit:2000000000}}, {highTextureBytes:24*1048576,highTextureBudget:96*1048576,textures:20,meshes:100,geometries:8});
  assert.equal(memory.jsUsedBytes,120000000);assert.equal(memory.backgroundHighTextureEstimateBytes,24*1048576);assert.equal(memory.geometries,8);
  const absent=readDiagnosticMemory({},{});assert.equal(absent.jsUsedBytes,null);assert.equal(absent.backgroundHighTextureEstimateBytes,null);
});
