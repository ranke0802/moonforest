import test from 'node:test';
import assert from 'node:assert/strict';
import {LongFrameRecording} from '../src/long-frame-recording.js';
import {RenderCpuSampler} from '../src/render-cpu-sampler.js';
import {Observable} from '@babylonjs/core';

test('ten-minute capture keeps 200ms evidence after many ordinary stalls and reports truncation',()=>{
 let now=0;const r=new LongFrameRecording({now:()=>now,eventLimit:2,criticalLimit:2});r.start({map:'plains'});
 const frame=(interval,work,draw=0)=>{now+=interval;r.record({startMs:now,intervalMs:interval,workMs:work,targetFps:60,metrics:{drawSubmissionMs:draw,drawCpu:{latest:{sampleId:1,startedAtMs:now,completedAtMs:now+work}}},sections:{sceneCallMs:work},context:()=>({map:'plains'})});};
 frame(16,5);for(let i=0;i<5;i++)frame(55,6);frame(16,220,201);frame(225,5);frame(16,201);r.stop();const report=r.snapshot();
 assert.equal(report.events.length,2);assert.equal(report.dropped.events,3);assert.equal(report.critical.length,2);assert.equal(report.dropped.critical,1);assert.equal(report.critical[0].render.drawSubmissionMs,201);assert.ok(report.critical[1].previousFrame.workMs>=220);assert.equal(report.reason,'manual');assert.equal(report.frames,9);
});

test('stale draw samples are not attributed to another frame and a pause breaks the previous-frame link',()=>{
 let now=100;const r=new LongFrameRecording({now:()=>now});r.start();
 const call=(at,interval,draw)=>r.record({startMs:at,intervalMs:interval,workMs:8,targetFps:60,metrics:{drawCpu:{latest:draw}},sections:{},context:()=>({})});
 call(110,16,{startedAtMs:111,completedAtMs:115});r.break();call(400,250,{startedAtMs:112,completedAtMs:116});
 assert.equal(r.snapshot().critical[0].previousFrame,null);assert.equal(r.snapshot().critical[0].render.drawCpu,null);
});

test('continuous sampling covers every render and returns to throttled sampling when stopped',()=>{
 let now=0;const engine={onEndFrameObservable:new Observable(),onContextLostObservable:new Observable(),onContextRestoredObservable:new Observable(),drawElementsType(){now++;}};
 const scene={getEngine:()=>engine,getFrameId:()=>1,onBeforeRenderObservable:new Observable(),onAfterRenderObservable:new Observable()};
 const native=engine.drawElementsType,s=new RenderCpuSampler(scene,{now:()=>now});s.setActive(true);s.setContinuous(true);let wrapper;
 for(let i=0;i<5;i++){scene.onBeforeRenderObservable.notifyObservers();wrapper??=engine.drawElementsType;assert.equal(engine.drawElementsType,wrapper);engine.drawElementsType();scene.onAfterRenderObservable.notifyObservers();assert.equal(s.sample().latest.groups.drawCommands.ms,1);}
 assert.equal(s.sample().latest.sampleId,5);s.setContinuous(false);assert.equal(engine.drawElementsType,native);scene.onBeforeRenderObservable.notifyObservers();scene.onAfterRenderObservable.notifyObservers();assert.equal(s.sample().latest.sampleId,5);s.dispose();
});

test('ten minutes of ordinary frames stay compact while burst frames and KTX calls remain available',()=>{
 let now=0;const r=new LongFrameRecording({now:()=>now});r.start();
 for(let i=0;i<36000;i++){
  now=i*1000/60;const detailed=i>=1000&&i<1060;
  r.record({startMs:now,intervalMs:1000/60,workMs:5,targetFps:60,metrics:{drawCpu:{latest:detailed?{reason:'continuous',startedAtMs:now,completedAtMs:now+4,groups:{drawCommands:{ms:2,calls:10}}}:null,ktxUploads:i>=500?[{completedAtMs:8000,cpuMs:12}]:[]}},sections:{},context:()=>({})});
 }
 r.stop('duration-limit');const report=r.snapshot();assert.equal(report.frames,36000);assert.equal(report.seconds.length,600);assert.equal(report.detailFrames.length,60);assert.equal(report.ktxUploads.length,1);assert.ok(JSON.stringify(report).length<200000);
});
