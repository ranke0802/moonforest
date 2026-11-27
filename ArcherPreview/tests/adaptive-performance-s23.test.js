// Replays the S23 record of 2026-11-27 (build 49b1682c) through the frame
// guard. That session started on level 4 (stored by the previous one) and
// stayed there for all 1,079 s, though the first 480 s ran at 58 fps.
// The record keeps per-frame intervals only inside detail bursts, so the
// full-session replay rebuilds each second from its recorded frame count,
// total and longest interval, filling the shape from the recorded calm
// bursts (enemy fades). See PERF2-1127.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AdaptivePerformance} from '../src/adaptive-performance.js';

const F=JSON.parse(readFileSync(new URL('./fixtures/s23-1127-frames.json',import.meta.url)));
const T=1000/60;
const calmBursts=F.bursts.filter(b=>b.reason==='enemy-fade');
const pool=calmBursts.flatMap(b=>b.intervalsMs);
function rebuilt(){
 const out=[];let k=0;
 for(const [n,total,max,covered] of F.seconds){
  // FrameLoop capped the guard's input at 100 ms in that build.
  const longest=Math.min(max,100);if(n<2){out.push([total,covered]);continue;}
  const rest=[];for(let j=0;j<n-1;j++)rest.push(pool[(k++)%pool.length]);
  const scale=(total-longest)/rest.reduce((a,b)=>a+b,0);for(const x of rest)out.push([x*scale,covered]);out.push([longest,covered]);
 }
 return out;
}

test('S23 record: the frame average alone allowed a step up (86 s calm stretch)',()=>{
 let streak=0,best=0;
 for(let i=0;i+1<F.seconds.length;i+=2){
  const [a,b]=[F.seconds[i],F.seconds[i+1]];if(a[3]||b[3])continue;
  const average=(a[1]+b[1])/(a[0]+b[0]);streak=average<T*1.04?streak+1:0;best=Math.max(best,streak);
 }
 assert.ok(best>=10,`longest run of 2 s windows under 1.04x the target: ${best}`);
});

test('S23 record: calm bursts had 5 % of frames over 20 ms, mostly late-then-early pairs',()=>{
 const slow=pool.filter(x=>x>T*1.2).length;
 assert.ok(slow/pool.length>=.05,`raw slow share ${slow}/${pool.length}`);
 const guard=new AdaptivePerformance({level:2});for(const x of pool)guard.sample(x);
 // The guard has not closed a window yet: read its running counters.
 assert.ok(guard.slow/guard.count<.05,`slow share after catch-up pairs ${guard.slow}/${guard.count}`);
});

test('S23 record rebuilt: the guard leaves level 4 during the healthy first 8 minutes',()=>{
 let clock=0;const guard=new AdaptivePerformance({now:()=>clock,level:4});let first=null;
 for(const [interval,covered] of rebuilt()){clock+=interval;guard.sample(interval,{active:!covered});if(first===null&&guard.level<4)first=clock/1000;}
 assert.ok(first!==null&&first<120,`first step up at ${first} s`);
 assert.ok(guard.inspect().windows.forgiven>0);
});
