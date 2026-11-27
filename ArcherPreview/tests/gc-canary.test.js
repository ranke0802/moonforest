import test from 'node:test';
import assert from 'node:assert/strict';
import {setFlagsFromString} from 'node:v8';
import {runInNewContext} from 'node:vm';
import {tickGcCanary,gcCanarySnapshot,observerKinds} from '../src/gc-canary.js';

test('observerKinds groups observers by callback source, most frequent first',()=>{
  const a=()=>1,b=()=>2,observable={observers:[{callback:a},{callback:b},{callback:a}]};
  const kinds=observerKinds(observable);
  assert.deepEqual(kinds.map(k=>k.count),[2,1]);
  assert.match(kinds[0].source,/1/);
  assert.equal(observerKinds(null),null);
});

test('the canary reports a full collection after its hold time',async()=>{
  setFlagsFromString('--expose-gc');const gc=runInNewContext('gc');
  const start=tickGcCanary(0).finalized;
  tickGcCanary(1e12);           // hold time passed: canary dropped
  for(let i=0;i<3;i++){gc();await new Promise(r=>setTimeout(r,20));}
  const snapshot=gcCanarySnapshot({getCaps:()=>({parallelShaderCompile:{}})});
  assert.ok(snapshot.finalized>start,'finalized after gc');
  assert.equal(snapshot.parallelShaderCompile,true);
  assert.ok(snapshot.recentFinalizedAtMs.length>=1);
});
