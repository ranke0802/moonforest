import test from 'node:test';
import assert from 'node:assert/strict';
import {BossDiagnostics} from '../src/boss-diagnostics.js';

test('foreground success, error and cancellation retain independent bounded CPU preparation snapshots',()=>{
  for(const type of ['ready','error','cancel']){
    const diagnostic=new BossDiagnostics();
    diagnostic.event({type:'begin',label:'boss',mode:'cold'},100,{});
    const stats={yields:8,slices:12,blocks:40,maxSliceMs:2.5,steps:Array.from({length:100},(_,i)=>({name:'stage-'+i,ms:i+1}))};
    diagnostic.event({type,preparationStats:stats,error:type==='error'?'offline':undefined,reason:type==='cancel'?'map':undefined},350,{});
    stats.steps[0].ms=999;stats.steps.length=0;stats.yields=999;
    const record=diagnostic.snapshot();
    assert.equal(record.prepareMs,250);
    assert.equal(record.preparation.yields,8);
    assert.equal(record.preparation.maxSliceMs,2.5);
    assert.equal(record.preparation.steps.length,32);
    assert.deepEqual(record.preparation.steps[0],{name:'stage-0',ms:1});
    assert.equal(record.during.gpuMs.samples,0);
    assert.equal(record.during.gpuMs.mean,null);
    diagnostic.event({type:'begin',label:'next'},400,{});
    assert.equal(diagnostic.history[0].preparation.steps[0].ms,1);
    assert.equal(diagnostic.snapshot().preparation,undefined);
    diagnostic.reset();assert.equal(diagnostic.history.length,0);
  }
});

test('missing and invalid preparation values cannot invent zero GPU or CPU measurements',()=>{
  const diagnostic=new BossDiagnostics();
  diagnostic.event({type:'begin'},0,{});diagnostic.event({type:'ready'},20,{});
  assert.equal(diagnostic.snapshot().preparation,undefined);
  diagnostic.event({type:'begin'},30,{});
  diagnostic.event({type:'error',preparationStats:{maxSliceMs:NaN,steps:[{name:'x'.repeat(150),ms:Infinity}]}},40,{});
  const record=diagnostic.snapshot();
  assert.equal(record.preparation.maxSliceMs,null);
  assert.equal(record.preparation.steps[0].ms,null);
  assert.equal(record.preparation.steps[0].name.length,100);
  assert.equal(record.during.cpuMs.mean,null);
  assert.equal(record.during.gpuMs.mean,null);
});
