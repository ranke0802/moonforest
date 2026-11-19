import test from 'node:test';
import assert from 'node:assert/strict';
import {LongFrameRecording} from '../src/long-frame-recording.js';
import {runBeforePageReload,onBeforePageReload} from '../src/page-reload-hooks.js';

test('a recording carried across a reload continues on the new clock with its frames, events and gap',t=>{
 let clock=1000,wall=1_800_000_000_000;t.mock.method(Date,'now',()=>wall);
 const a=new LongFrameRecording({now:()=>clock});a.start({device:'phone'});
 const frame=(start,interval,work)=>({startMs:start,intervalMs:interval,workMs:work,targetFps:60,metrics:{drawCalls:1},sections:{bossUpdateMs:1},context:()=>({map:'great-plains'})});
 for(let i=0;i<120;i++){clock+=16;wall+=16;a.record(frame(clock,16,8));}
 clock+=300;wall+=300;a.record(frame(clock,300,250));// a critical stall at ~2.2 s
 const saved=structuredClone(a.exportState('page-reload'));
 // New document: performance.now restarts; 4 s pass during the reload.
 wall+=4000;clock=50;
 const offset=saved.critical[0].startMs-saved.startMs,wallStart=saved.wallStartMs;
 const b=new LongFrameRecording({now:()=>clock});assert.equal(b.importState(saved),true);
 assert.equal(b.state,'recording');
 assert.ok(Math.abs((b.critical[0].startMs-b.startMs)-offset)<1e-6,'old events keep their place on the timeline');
 assert.ok(Math.abs((clock-b.startMs)-(wall-wallStart))<1e-6,'the new clock continues from the original start');
 for(let i=0;i<60;i++){clock+=16;wall+=16;b.record(frame(clock,16,8));}
 b.stop('manual');const out=b.snapshot();
 assert.equal(out.frames,121+60);
 const seconds=out.seconds.map(s=>s.second);assert.ok(seconds.includes(0)&&seconds.includes(2)&&Math.max(...seconds)>=6,'the reload gap shows as missing seconds');
 assert.deepEqual(out.reloads.map(r=>r.reason),['page-reload']);assert.deepEqual(out.metadata,{device:'phone'});
});

test('page reload hooks are awaited but never block longer than the limit',async()=>{
 const seen=[];const off1=onBeforePageReload(async()=>{await new Promise(r=>setTimeout(r,10));seen.push('fast');});
 const off2=onBeforePageReload(()=>new Promise(()=>{}));
 const started=Date.now();await runBeforePageReload(100);const took=Date.now()-started;
 assert.deepEqual(seen,['fast']);assert.ok(took<1000);off1();off2();
});
