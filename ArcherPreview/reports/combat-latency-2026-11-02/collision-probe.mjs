import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import * as current from '../../src/melee-collision.js';
const source=execFileSync('git',['show','e9dcaf0:ArcherPreview/src/melee-collision.js'],{encoding:'utf8'});
const baseline=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let seed=0x71321;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32),point=()=>[rand()*4-2,rand()*3,rand()*4-2];
const rows=Array.from({length:12000},()=>({previous:[point(),point()],current:[point(),point()],capsule:[point(),point()],radius:.06+rand()*.4,lateral:rand()>.5?{axis:[1,0,0],halfWidth:.12}:null}));
let error=0;
for(const row of rows){
 const args=[row.previous,row.current,row.capsule,row.radius,row.lateral];assert.equal(current.bladeTouchesCapsule(...args),baseline.bladeTouchesCapsule(...args));
 const args2=[...row.previous,...row.capsule],a=current.segmentDistanceSquared(...args2),b=baseline.segmentDistanceSquared(...args2);error=Math.max(error,Math.abs(a-b));assert.ok(Math.abs(a-b)<1e-10);
}
const run=fn=>{let hits=0;const start=performance.now();for(const r of rows)hits+=Number(fn(r.previous,r.current,r.capsule,r.radius,r.lateral));return {ms:performance.now()-start,hits};};
run(current.bladeTouchesCapsule);run(baseline.bladeTouchesCapsule);
const before=[],after=[];for(let i=0;i<7;i++){if(i%2){after.push(run(current.bladeTouchesCapsule));before.push(run(baseline.bladeTouchesCapsule));}else{before.push(run(baseline.bladeTouchesCapsule));after.push(run(current.bladeTouchesCapsule));}}
const median=rows=>rows.map(r=>r.ms).sort((a,b)=>a-b)[3];
const report={scope:'Deterministic desktop Node collision microbenchmark, not device FPS/GPU/temperature. Same 12000 sweeps, seven alternating runs after warmup.',baselineCommit:'e9dcaf0',cases:rows.length,identicalHits:true,maxDistanceError:error,before,after,beforeMedianMs:median(before),afterMedianMs:median(after)};
writeFileSync(new URL('collision-comparison.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
