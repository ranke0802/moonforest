import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameDiagnostics,createFrameDiagnostics} from '../src/frame-diagnostics.js';
import {FrameLoop} from '../src/frame-loop.js';

const draw=(monitor,time,limit=30,work=4,context)=>{monitor.begin(time,limit);monitor.end(time+work,context);};
test('normal mobile pacing is 30 FPS / 33ms and is never counted as a delayed frame',()=>{
 const m=new FrameDiagnostics();for(let i=0;i<=90;i++)draw(m,i*1000/30);
 const s=m.summary();assert.ok(Math.abs(s.fps-30)<1e-8);assert.ok(Math.abs(s.frameMs-1000/30)<1e-8);
 assert.equal(s.slowFrames,0);assert.equal(s.thresholdMs,50);assert.equal(s.samples,90);assert.equal(m.events.length,0);
});
test('raw stalls are not capped at simulation delta; reports retain location and bounded event history',()=>{
 const m=new FrameDiagnostics();let contexts=0;
 const context=()=>{contexts++;return {position:[12.3,-8.2],camera:[1.2,.9,13],activity:'이동 · 모델 준비'};};
 draw(m,0);draw(m,33);draw(m,453,30,7,context);
 const s=m.summary();assert.equal(s.frameMs,420);assert.equal(s.maxMs,420);assert.equal(s.p95Ms,420);assert.equal(s.maxWorkMs,7);assert.equal(s.slowFrames,1);
 assert.equal(contexts,1);assert.equal(m.events[0].frameMs,420);assert.deepEqual(m.events[0].position,[12.3,-8.2]);
 for(let i=1;i<=60;i++)draw(m,453+i*100,30,2,context);
 assert.equal(m.events.length,32);assert.equal(contexts,61);
});
test('only recent ten seconds affect peaks and slow counts and storage remains bounded',()=>{
 const m=new FrameDiagnostics();draw(m,0);draw(m,250);
 for(let i=1;i<=4000;i++)draw(m,250+i*1000/30);
 const s=m.summary();assert.ok(s.samples<=301);assert.equal(s.slowFrames,0);assert.ok(s.maxMs<34);
 assert.equal(m.count,2048);assert.equal(m.times.length,2048);assert.equal(m.events.length,1);
});
test('paused/hidden time and FPS cap changes are not reported as gameplay stalls',()=>{
 const m=new FrameDiagnostics();draw(m,0);draw(m,34);m.suspend();
 draw(m,60000);draw(m,60034);assert.equal(m.summary().slowFrames,0);assert.equal(m.events.length,0);
 draw(m,61000,60);draw(m,61000+1000/60,60);const s=m.summary();
 assert.equal(s.samples,1);assert.equal(s.targetFps,60);assert.ok(Math.abs(s.fps-60)<1e-7);assert.equal(m.events.length,0);
 m.reset();assert.equal(m.summary().samples,0);assert.equal(m.summary().frameMs,null);assert.equal(m.events.length,0);
});

function ui({stored='0',clipboard={writeText:async()=>{}},metadata=()=>({character:'warrior-v3'}),loads,memory}={}){
 let time=0,clockCalls=0,contextCalls=0,writes=0;
 const ids=['frame-diagnostics','frame-diagnostics-toggle','copy-frame-diagnostics','reset-frame-diagnostics','frame-diagnostics-status','frame-diagnostics-export','diagnostic-fps','diagnostic-frame','diagnostic-stalls','diagnostic-detail','diagnostic-load','diagnostic-load-phases','diagnostic-memory','diagnostic-textures'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{dataset:{},hidden:false,disabled:false,checked:false,value:'',listeners:{},_text:'',
  get textContent(){return this._text;},set textContent(v){writes++;this._text=v;},
  addEventListener(type,listener){this.listeners[type]=listener;},focus(){this.focused=true;},select(){this.selected=true;}}]));
 const storage={getItem:()=>stored,setItem:(_,v)=>stored=v};
 const diagnostic=createFrameDiagnostics({doc:{getElementById:id=>nodes[id]},storage,now:()=>{clockCalls++;return time;},clipboard,metadata,loads,memory,
  context:()=>{contextCalls++;return {position:[3,-5],activity:'회전/시점 조작'};}});
 const frame=(at,active=true)=>{time=at;diagnostic.beginFrame(active,30);time=at+4;diagnostic.endFrame();};
 const toggle=on=>{nodes['frame-diagnostics-toggle'].checked=on;nodes['frame-diagnostics-toggle'].listeners.change();};
 return {diagnostic,nodes,frame,toggle,counts:()=>({clockCalls,contextCalls,writes,stored}),setTime:t=>time=t};
}
test('disabled diagnostics perform no timing, context collection or HUD updates; choice persists',()=>{
 const f=ui(),initial=f.counts().writes;
 for(let i=0;i<100;i++)f.frame(i*33);
 assert.equal(f.counts().clockCalls,0);assert.equal(f.counts().contextCalls,0);assert.equal(f.counts().writes,initial);
 assert.equal(f.nodes['frame-diagnostics'].hidden,true);assert.equal(f.nodes['copy-frame-diagnostics'].disabled,true);
 f.toggle(true);assert.equal(f.nodes['frame-diagnostics'].hidden,false);assert.equal(f.counts().stored,'1');
 f.frame(0);f.frame(100);assert.equal(f.counts().contextCalls,1);
 f.toggle(false);const calls=f.counts().clockCalls;f.frame(1000);assert.equal(f.counts().clockCalls,calls);
});
test('load timings survive late HUD enable, memory samples are bounded and exported with clear labels',async()=>{
 let calls=0,report;const loading={label:'마을',phase:'complete',totalMs:3500,downloadMs:2000,modelMs:1000,screenMs:400};
 const f=ui({loads:{snapshot:()=>loading,history:[loading]},memory:()=>{calls++;return {jsUsedBytes:64*1048576,jsLimitBytes:2048*1048576,backgroundHighTextureEstimateBytes:32*1048576,backgroundHighTextureBudgetBytes:96*1048576};},clipboard:{writeText:async value=>report=JSON.parse(value)}});
 f.frame(0);assert.equal(calls,0);f.toggle(true);assert.match(f.nodes['diagnostic-load-phases'].textContent,/다운로드 2.0초 · 모델 1.0초 · 화면 0.4초/);
 assert.match(f.nodes['diagnostic-memory'].textContent,/JS 메모리 64 \/ 2048 MiB/);
 assert.match(f.nodes['diagnostic-textures'].textContent,/추정 32 \/ 96 MiB/);
 for(let i=0;i<30;i++)f.frame(i*33);assert.equal(calls,1);
 f.frame(1100);assert.equal(calls,2);await f.nodes['copy-frame-diagnostics'].listeners.click();assert.equal(calls,2);
 assert.deepEqual(report.loading,loading);assert.equal(report.loadHistory.length,1);assert.equal(report.memory.jsUsedBytes,64*1048576);assert.match(report.measurement,/not total device/);
 f.toggle(false);for(let i=0;i<40;i++)f.frame(2000+i*33);assert.equal(calls,2);
});
test('HUD throttles updates, explains mobile pacing, and exports measured delays without sending them',async()=>{
 let copied;const f=ui({stored:'1',clipboard:{writeText:async value=>{copied=JSON.parse(value);}}});
 const before=f.counts().writes;for(let i=0;i<=30;i++)f.frame(i*1000/30);
 assert.ok(f.counts().writes-before<20,'no per-frame DOM updates');assert.match(f.nodes['diagnostic-fps'].textContent,/30 FPS/);
 f.frame(1420);f.frame(1530);assert.equal(f.nodes['frame-diagnostics'].dataset.delayed,'true');
 assert.match(f.nodes['diagnostic-frame'].textContent,/최대 420 ms/);
 f.diagnostic.suspend();assert.match(f.nodes['diagnostic-detail'].textContent,/측정 대기/);
 await f.nodes['copy-frame-diagnostics'].listeners.click();
 assert.equal(copied.character,'warrior-v3');assert.equal(copied.summary.maxMs,420);assert.deepEqual(copied.recentDelays[0].position,[3,-5]);
 assert.match(f.nodes['frame-diagnostics-status'].textContent,/복사했습니다/);
 f.nodes['reset-frame-diagnostics'].listeners.click();await f.nodes['copy-frame-diagnostics'].listeners.click();assert.equal(copied.recentDelays.length,0);
});
test('clipboard refusal offers a selectable local report instead of losing the diagnostic',async()=>{
 const f=ui({stored:'1',clipboard:{writeText:async()=>{throw new Error('denied');}}});f.frame(0);f.frame(120);
 await f.nodes['copy-frame-diagnostics'].listeners.click();const box=f.nodes['frame-diagnostics-export'];
 assert.equal(box.hidden,false);assert.equal(box.selected,true);assert.equal(JSON.parse(box.value).summary.maxMs,120);
});
test('real FrameLoop keeps 100ms simulation cap while diagnostics see a 400ms stall, excluding suspension',async()=>{
 let report;const f=ui({stored:'1',clipboard:{writeText:async v=>report=JSON.parse(v)}}),callbacks=new Set(),simulation=[];let time=0;
 const engine={runRenderLoop:cb=>callbacks.add(cb),stopRenderLoop:cb=>callbacks.delete(cb)};
 const loop=new FrameLoop(engine,dt=>{simulation.push(dt);f.frame(time,loop.running);},()=>time);
 const tick=at=>{time=at;for(const cb of [...callbacks])cb();};
 loop.setPaused(false);tick(0);tick(33);tick(433);assert.equal(simulation.at(-1),.1);
 loop.setPaused(true);f.diagnostic.suspend();time=60000;loop.invalidate();tick(60000);
 loop.setPaused(false);tick(60033);tick(60066);
 await f.nodes['copy-frame-diagnostics'].listeners.click();assert.deepEqual(report.recentDelays.map(e=>e.frameMs),[400]);assert.equal(report.summary.slowFrames,0);
});
