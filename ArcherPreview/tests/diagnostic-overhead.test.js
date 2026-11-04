import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene} from '@babylonjs/core';
import {SceneDiagnostics} from '../src/scene-diagnostics.js';
import {createFrameDiagnostics,DRAW_CPU_DIAGNOSTICS_KEY,readDrawCpuDiagnosticPreference} from '../src/frame-diagnostics.js';
import {setupSettingsPanel} from '../src/settings-panel.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const nativeNames=['drawElementsType','drawArraysType','enableEffect','bindBuffers','bindVertexArrayObject','setTexture','updateDynamicVertexBuffer','updateDynamicIndexBuffer'];
function fixture(t,{stored=new Map([['moonforest-frame-diagnostics-v1','1']]),storage,renderMetrics=()=>({drawCalls:123,sceneMs:7,animationMs:1}),memory=()=>({jsUsedBytes:64*1048576}),onEnabled,onDrawCpuEnabled,onCollecting}={}){
 const {document:doc,window}=parseHTML(html),previous=globalThis.document;globalThis.document=doc;setupSettingsPanel();globalThis.document=previous;
 let time=0,copied,memoryCalls=0,zoomCalls=0;
 const diagnostics=createFrameDiagnostics({doc,storage:storage??{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)},now:()=>time,onEnabled,onDrawCpuEnabled,onCollecting,
  renderMetrics:()=>renderMetrics({advance:ms=>time+=ms}),memory:()=>{memoryCalls++;return memory({advance:ms=>time+=ms});},zoom:()=>{zoomCalls++;return {factor:2,minEnabled:true,maxEnabled:true,minZoom:1,maxZoom:4};},clipboard:{writeText:async value=>copied=JSON.parse(value)}});
 const dialog=doc.getElementById('diagnostic-detail-dialog');dialog.open=false;dialog.showModal=()=>dialog.open=true;dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};
 const change=(id,value)=>{const node=doc.getElementById(id);node.checked=value;node.dispatchEvent(new window.Event('change'));};
 return {doc,window,diagnostics,dialog,stored,change,setTime:value=>time=value,frame(at,work=4){time=at;diagnostics.beginFrame(true,60);time=at+work;diagnostics.endFrame();},memoryCalls:()=>memoryCalls,zoomCalls:()=>zoomCalls,copy:async()=>{doc.getElementById('copy-frame-diagnostics').dispatchEvent(new window.Event('click'));await Promise.resolve();return copied;}};
}

test('basic real scene diagnostics keep all native methods and CPU/GPU counters while detailed calls default OFF',t=>{
 const engine=new NullEngine(),scene=new Scene(engine),probe=new SceneDiagnostics({driverFactory:()=>null});t.after(()=>{probe.dispose();scene.dispose();engine.dispose();});
 const native=new Map(nativeNames.map(name=>[name,engine[name]]));probe.setEnabled(true,scene);probe.setActive(true);
 for(let frame=0;frame<3;frame++){
  scene.onBeforeRenderObservable.notifyObservers(scene);for(const [name,method]of native)assert.equal(engine[name],method,name);scene.onAfterRenderObservable.notifyObservers(scene);
 }
 assert.equal(probe.cpu,null);const snapshot=probe.sample();assert.equal(snapshot.drawCpu.status,'disabled');assert.equal(snapshot.gpu.status,'unsupported');
 for(const key of ['sceneMs','animationMs','drawCalls','activeMeshesMs','renderTargetsMs','drawSubmissionMs'])assert.ok(Number.isFinite(snapshot[key]),key);
});

test('detailed call selection restores native methods immediately on OFF, pause, context loss, scene replacement and disposal',t=>{
 const engine=new NullEngine(),one=new Scene(engine),two=new Scene(engine),probe=new SceneDiagnostics({driverFactory:()=>null});t.after(()=>{probe.dispose();one.dispose();two.dispose();engine.dispose();});
 const native=engine.drawElementsType;probe.setEnabled(true,one);probe.setActive(true);probe.setDrawCpuEnabled(true);one.onBeforeRenderObservable.notifyObservers(one);assert.notEqual(engine.drawElementsType,native);
 probe.setDrawCpuEnabled(false);assert.equal(engine.drawElementsType,native);assert.equal(probe.cpu,null);assert.ok(probe.instrumentation);
 probe.setDrawCpuEnabled(true);one.onBeforeRenderObservable.notifyObservers(one);assert.notEqual(engine.drawElementsType,native);probe.setActive(false);assert.equal(engine.drawElementsType,native);
 probe.setActive(true);one.onBeforeRenderObservable.notifyObservers(one);assert.notEqual(engine.drawElementsType,native);engine.onContextLostObservable.notifyObservers(engine);assert.equal(engine.drawElementsType,native);
 one.onBeforeRenderObservable.notifyObservers(one);assert.equal(engine.drawElementsType,native);engine.onContextRestoredObservable.notifyObservers(engine);one.onBeforeRenderObservable.notifyObservers(one);assert.notEqual(engine.drawElementsType,native);
 probe.setEnabled(true,two);assert.equal(engine.drawElementsType,native);one.onBeforeRenderObservable.notifyObservers(one);assert.equal(engine.drawElementsType,native);
 two.onBeforeRenderObservable.notifyObservers(two);assert.notEqual(engine.drawElementsType,native);probe.dispose();assert.equal(engine.drawElementsType,native);assert.equal(probe.cpu,null);
});

test('real settings save a separate opt-in, preserve it while basic collection is OFF, and restore it on recreation',async t=>{
 const changes=[],f=fixture(t,{onDrawCpuEnabled:value=>changes.push(value)}),toggle=f.doc.getElementById('draw-cpu-diagnostics-toggle'),quality=f.doc.getElementById('quality-select');
 const qualityBefore=[...quality.options].map(option=>option.value);assert.equal(toggle.checked,false);assert.equal(toggle.disabled,false);assert.match(toggle.closest('label').textContent,/상세 CPU 호출 계측/);assert.equal(toggle.getAttribute('aria-describedby'),'draw-cpu-diagnostics-help');
 assert.deepEqual(changes,[false]);f.change(toggle.id,true);assert.equal(f.stored.get(DRAW_CPU_DIAGNOSTICS_KEY),'1');assert.equal(changes.at(-1),true);
 f.change('frame-diagnostics-toggle',false);assert.equal(changes.at(-1),false);assert.equal(toggle.checked,true);assert.equal(toggle.disabled,true);
 f.change('frame-diagnostics-toggle',true);assert.equal(changes.at(-1),true);assert.equal(toggle.checked,true);assert.deepEqual([...quality.options].map(option=>option.value),qualityBefore);
 const restored=[];fixture(t,{stored:f.stored,onDrawCpuEnabled:value=>restored.push(value)});assert.deepEqual(restored,[true]);
 const report=await f.copy();assert.equal(report.diagnosticOptions.drawCpuEnabled,true);assert.match(report.measurement,/separately opt-in and defaults off/);
 assert.match(readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),/onDrawCpuEnabled:enabled=>sceneDiagnostics\.setDrawCpuEnabled\(enabled\)/);
});

test('missing, malformed and denied storage default detailed calls OFF; failed writes retain the session choice',t=>{
 for(const raw of [null,'0','true','{"enabled":true}','bad',''])assert.equal(readDrawCpuDiagnosticPreference({getItem:()=>raw}),false);
 assert.equal(readDrawCpuDiagnosticPreference({getItem:()=> '1'}),true);assert.equal(readDrawCpuDiagnosticPreference({getItem(){throw Error('denied');}}),false);
 const changes=[],f=fixture(t,{storage:{getItem:()=>null,setItem(){throw Error('denied');}},onDrawCpuEnabled:value=>changes.push(value)});
 f.change('frame-diagnostics-toggle',true);f.change('draw-cpu-diagnostics-toggle',true);assert.equal(changes.at(-1),true);assert.equal(f.doc.getElementById('draw-cpu-diagnostics-toggle').checked,true);
});

test('closed detail dialog receives no paint while compact HUD, memory, counters and copy snapshot keep collecting',async t=>{
 const f=fixture(t),detailIds=['diagnostic-render','diagnostic-gpu','diagnostic-load','diagnostic-memory','diagnostic-zoom','diagnostic-boss-frame'];
 for(const id of detailIds)f.doc.getElementById(id).textContent='untouched detail';
 for(let i=0;i<=90;i++)f.frame(i*1000/60);
 for(const id of detailIds)assert.equal(f.doc.getElementById(id).textContent,'untouched detail',id);
 assert.match(f.doc.getElementById('diagnostic-fps').textContent,/60 FPS/);assert.ok(f.memoryCalls()>=2);assert.equal(f.zoomCalls(),0);
 const report=await f.copy();assert.equal(report.renderMetrics.drawCalls,123);assert.equal(report.renderMetrics.sceneMs,7);assert.equal(report.memory.jsUsedBytes,64*1048576);assert.equal(report.summary.samples,90);assert.equal(report.cameraZoom.factor,2);
 for(const id of detailIds)assert.equal(f.doc.getElementById(id).textContent,'untouched detail',id+' remains untouched even on copy');
 f.doc.getElementById('diagnostic-expand').dispatchEvent(new f.window.Event('click'));assert.equal(f.dialog.open,true);assert.match(f.doc.getElementById('diagnostic-render').textContent,/드로콜 123/);assert.match(f.doc.getElementById('diagnostic-zoom').textContent,/2.00/);
});

test('endFrame collection cost has its own scalar summary and never changes game submission timing or counts copy work',async t=>{
 const f=fixture(t,{renderMetrics:({advance})=>{advance(3);return {drawCalls:123,sceneMs:1};},memory:({advance})=>{advance(2);return {jsUsedBytes:1};}});
 for(let i=0;i<3;i++)f.frame(i*20,4);const report=await f.copy();
 assert.equal(report.summary.meanWorkMs,4);assert.equal(report.diagnosticCpuMs.samples,3);assert.equal(report.diagnosticCpuMs.meanMs,11/3);assert.equal(report.diagnosticCpuMs.maxMs,5);assert.equal(report.diagnosticCpuMs.latestMs,3);
 assert.equal(report.diagnosticCpuMs.scope,'synchronous-endFrame-collection-only');assert.equal(report.diagnosticCpuMs.window,'since-diagnostic-reset');assert.match(report.measurement,/not attributed to any preceding frame interval/);
 const again=await f.copy();assert.deepEqual(again.diagnosticCpuMs,report.diagnosticCpuMs,'copy/snapshot overhead never becomes a frame collector sample');
 f.doc.getElementById('reset-frame-diagnostics').dispatchEvent(new f.window.Event('click'));const reset=await f.copy();assert.equal(reset.diagnosticCpuMs.samples,0);assert.equal(reset.diagnosticCpuMs.meanMs,null);
});
