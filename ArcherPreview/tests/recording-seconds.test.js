import test from 'node:test';
import assert from 'node:assert/strict';
import {LongFrameRecording} from '../src/long-frame-recording.js';
import {calibrationMs,createRefreshMeter} from '../src/display-refresh.js';
test('every frame feeds per-second section and render totals; the probe runs once per second',()=>{
 let t=0,probes=0;const r=new LongFrameRecording({now:()=>t});r.probe=()=>({n:++probes});r.start();
 for(let i=0;i<120;i++){t=i*16.7;r.record({startMs:t,intervalMs:16.7,workMs:4,targetFps:60,metrics:{sceneMs:3,drawCalls:80,submittedTriangles:5e5},sections:{bossUpdateMs:i===5?30:1,playerAnimationMs:0},context:()=>({})});}
 r.stop();
 const [first,second]=r.seconds;
 assert.equal(probes,r.seconds.length);assert.deepEqual(first.probe,{n:1});
 assert.equal(first.frames,60);assert.ok(Math.abs(first.sum.bossUpdateMs-(59+30))<1e-9);assert.equal(first.max.bossUpdateMs,30);
 assert.ok(!('playerAnimationMs' in first.sum),'zero sections are not stored');
 assert.ok(Math.abs(first.render.sceneMs-180)<1e-9);assert.equal(first.render.drawCalls,4800);assert.equal(second.frames,60);
});
test('calibration is a positive, repeatable measure; the refresh meter counts frames',()=>{
 const a=calibrationMs(),b=calibrationMs();assert.ok(a>0&&b>0);
 const queue=[];const meter=createRefreshMeter({requestAnimationFrame:cb=>queue.push(cb)});
 for(let i=0;i<=240;i++){const cb=queue.shift();cb(i*1000/120);}
 assert.equal(meter.hz,120);meter.stop();
});
