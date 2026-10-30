import test from 'node:test';
import assert from 'node:assert/strict';
import {BossDiagnostics,FrameWindow,bossComparisonLines} from '../src/boss-diagnostics.js';
import {SceneDiagnostics} from '../src/scene-diagnostics.js';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
import {BossBattle} from '../src/boss-battle.js';

const frame=(frameMs=33,drawCalls=100)=>({frameMs,cpuMs:5,drawCalls,sceneMs:3,animationMs:1,bossUpdateMs:.5,contactsMs:.25,targetFps:30});
const mem=mb=>({jsUsedBytes:mb*1048576,textures:20,meshes:100});
test('comparison separates pre-spawn baseline, cold preparation and five seconds of visible play',()=>{
 const d=new BossDiagnostics();for(let t=0;t<=4000;t+=40)d.frame(t,frame(40),mem(100),()=>({}));
 d.event({type:'begin',label:'비탄의 마녀',mode:'cold'},4000,mem(100),{targetFps:30,position:[0,0]});
 d.event({type:'stage',stage:'model'},4200,mem(130));d.frame(4300,frame(300,120),mem(130),()=>({}));
 d.event({type:'stage',stage:'screen'},4500,mem(140));d.event({type:'stage',stage:'model'},4600,mem(150));
 d.event({type:'ready'},4700,mem(150));
 d.frame(4800,{...frame(500,140),intervalStart:4680},mem(155),()=>({}));
 for(let t=4850;t<=9800;t+=50)d.frame(t,{...frame(50,160),intervalStart:t-50},mem(160),()=>({position:[1,1]}));
 const s=d.snapshot();assert.equal(s.status,'complete');assert.equal(s.before.frameMs.mean,40);assert.equal(s.after.frameMs.mean,50);assert.equal(s.delta.frameMs,10);
 assert.equal(s.delta.drawCalls,60);assert.equal(s.delta.jsUsedBytes,60*1048576);assert.equal(s.during.frameMs.max,500);assert.equal(s.after.samples,100);
 assert.deepEqual(s.stageMs,{resource:200,model:400,screen:100});assert.equal(s.prepareMs,700);assert.equal(s.baselineReady,true);
 const frozen=s.after.samples;d.frame(9900,frame(99,999),mem(300),()=>({}));assert.equal(d.snapshot().after.samples,frozen);
 assert.match(bossComparisonLines(s).frame,/40.0 → 50.0/);assert.match(bossComparisonLines(s).memory,/100 → 160 MiB \(\+60\)/);
});
test('missing heap data stays unsupported, resets/cancellation and rolling windows are bounded',()=>{
 const d=new BossDiagnostics();for(let i=0;i<5000;i++)d.frame(i*20,frame(20),{},()=>({}));assert.equal(d.recent.count,2048);
 for(let i=0;i<12;i++){const t=100000+i*100;d.event({type:'begin',label:'성녀',mode:'reuse'},t,{jsUsedBytes:null});d.event({type:'error',error:'offline'},t+10,{});}
 const s=d.snapshot();assert.equal(d.history.length,3);assert.equal(s.status,'error');assert.equal(s.delta.jsUsedBytes,null);assert.match(bossComparisonLines(s).memory,/JS — → —/);
 d.event({type:'begin'},120000,{});d.event({type:'ready'},120001,{});d.suspend();assert.equal(d.recent.count,0);assert.equal(d.snapshot().pauses,1);
 d.interrupt('맵 이동');assert.equal(d.snapshot().status,'interrupted');d.reset();assert.equal(d.snapshot(),null);assert.equal(d.history.length,0);
});
test('FPS target changes and insufficient baseline remain visible instead of promising a controlled benchmark',()=>{
 const d=new BossDiagnostics();d.event({type:'begin',mode:'cached-model'},0,{}, {targetFps:30});d.event({type:'ready'},1,{});
 d.frame(20,{...frame(16),targetFps:60,intervalStart:4},{},()=>({}));const s=d.snapshot();assert.deepEqual(s.targets,[30,60]);
 assert.match(bossComparisonLines(s).note,/이전 표본 부족/);assert.match(bossComparisonLines(s).note,/목표 FPS 변경/);
 const w=new FrameWindow();w.add(0,frame(100));w.add(4000,frame(20));assert.equal(w.summary(1000).frameMs.mean,20);
});
test('scene probe reports completed-frame calls and releases all observers on repeated toggles and scene replacement',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.activeCamera=new FreeCamera('camera',new Vector3(0,0,-5),scene);
 const observables=[scene.onBeforeAnimationsObservable,scene.onAfterAnimationsObservable,scene.onAfterRenderObservable];
 const counts=()=>observables.map(o=>o.observers.length),before=counts(),probe=new SceneDiagnostics();
 const observer=scene.onBeforeDrawPhaseObservable.add(()=>engine._drawCalls.addCount(7,false));
 for(let i=0;i<30;i++){probe.setEnabled(true,scene);scene.render();const sample=probe.sample();assert.equal(sample.drawCalls,7);assert.ok(sample.sceneMs>=0);probe.setEnabled(false);await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(counts(),before);}
 probe.setEnabled(true,scene);const next=new Scene(engine);next.activeCamera=new FreeCamera('next',Vector3.Zero(),next);probe.setEnabled(true,next);await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(counts(),before);probe.dispose();
 scene.onBeforeDrawPhaseObservable.remove(observer);next.dispose();scene.dispose();engine.dispose();
});

test('production summon emits failure/cancellation and background preparation markers without a retry loop',async()=>{
 const events=[],world={cave:true,scene:{}},elenaModels={async load(){throw new Error('offline');}};
 const battle=new BossBattle(world,()=>{},()=>{},()=>{},{elenaModels,onDiagnosticEvent:e=>events.push(e)});
 await assert.rejects(battle.activateResident({}),/offline/);assert.deepEqual(events.map(e=>e.type),['begin','error']);assert.equal(battle.residentPending,null);
 events.length=0;elenaModels.load=async()=>{world.cave=false;};await battle.activateResident({});assert.deepEqual(events.map(e=>e.type),['begin','stage','cancel']);
 events.length=0;let loads=0;battle.mourningModels={async load(){loads++;}};battle.preloadMourning();battle.preloadMourning();await Promise.resolve();
 assert.equal(loads,1);assert.deepEqual(events.map(e=>e.type),['prefetch-start','prefetch-end']);
 const d=new BossDiagnostics();d.event(events[0],0,mem(100));d.event(events[1],200,mem(150));assert.equal(d.backgroundLoads[0].elapsedMs,200);assert.equal(d.snapshot(),null);
});
