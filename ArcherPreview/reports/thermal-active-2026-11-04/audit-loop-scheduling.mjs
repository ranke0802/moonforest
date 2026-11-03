// Independent CPU/observer/RAF audit. No browser, GPU or phone benchmark.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,FreeCamera,Vector3} from '@babylonjs/core';
import {SceneDiagnostics} from '../../src/scene-diagnostics.js';
import {FrameDiagnostics,createFrameDiagnostics} from '../../src/frame-diagnostics.js';
import {FrameLoop} from '../../src/frame-loop.js';

const root=new URL('../../',import.meta.url),output=new URL('./',import.meta.url),base='1879954';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(ref,path)=>execFileSync('git',['show',ref+':ArcherPreview/'+path],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:32*1024*1024});
const diagnostic=readFileSync(process.argv[2]),data=JSON.parse(diagnostic.toString('utf8').replace(/^\uFEFF/,''));
const quantile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1]??null;
const stats=values=>({samples:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p95:quantile(values,.95),max:Math.max(...values)});
const groups=Object.groupBy(data.recentDelays,r=>r.texturePending?'texture-pending':r.geometryPending?'geometry-pending':'resident');
const eventGroups=Object.fromEntries(Object.entries(groups).map(([key,events])=>[key,{events:events.length,maps:[...new Set(events.map(e=>e.map))],
 currentWorkMs:stats(events.map(e=>e.jsSubmitMs)),activeMeshesMs:stats(events.map(e=>e.render.activeMeshesMs)),drawSubmissionMs:stats(events.map(e=>e.render.drawSubmissionMs)),
 note:'Only the bounded last 32 delay events, not an unbiased frame population; interval describes preceding frame, context describes current work.'}]));

// Actual pinned SDK observer registration: re-entry does not stack callbacks.
const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('audit',new Vector3(0,0,-4),scene);MeshBuilder.CreateBox('probe',{},scene);
const streams={beforeAnimations:scene.onBeforeAnimationsObservable,afterAnimations:scene.onAfterAnimationsObservable,beforeActive:scene.onBeforeActiveMeshesEvaluationObservable,
 afterActive:scene.onAfterActiveMeshesEvaluationObservable,beforeDraw:scene.onBeforeDrawPhaseObservable,afterDraw:scene.onAfterDrawPhaseObservable,afterRender:scene.onAfterRenderObservable,
 engineBegin:engine.onBeginFrameObservable,engineEnd:engine.onEndFrameObservable};
const counts=()=>Object.fromEntries(Object.entries(streams).map(([key,value])=>[key,value.observers.filter(o=>!o._willBeUnregistered).length]));
const initial=counts(),probe=new SceneDiagnostics({driverFactory:()=>null});probe.setEnabled(true,scene);probe.setActive(true);const enabled=counts();
for(let i=0;i<100;i++){probe.setEnabled(true,scene);probe.resetGpu();}assert.deepEqual(counts(),enabled);
scene.render();assert.equal(probe.sample().gpu.status,'unsupported');probe.setEnabled(false);assert.deepEqual(counts(),initial);probe.dispose();
engine.dispose();

// No synthetic 40 FPS limiter: feed the actual SDK cap with monotonic RAF times.
const caps={};
for(const hz of [60,90,120]){
 const e=new NullEngine();e.maxFPS=60;let accepted=0;const timestamps=[];
 for(let i=1;i<=hz*10;i++){const at=1000+i*1000/hz;if(!e._isOverFrameTime(at)){accepted++;timestamps.push(at);}}
 caps[hz]={rafCallbacks:hz*10,accepted,durationSeconds:10};assert.ok(Math.abs(accepted-600)<=1);e.dispose();
}
// FrameLoop shares Babylon's one registered frame callback and removes it paused.
const e=new NullEngine();e._queueNewFrameForRenderLoop=()=>{};const loop=new FrameLoop(e,()=>{},()=>0);
for(let i=0;i<50;i++){loop.setPaused(false);loop.restart();loop.recover();assert.equal(e._activeRenderLoops.length,1);loop.setPaused(true);assert.equal(e._activeRenderLoops.length,0);}
loop.invalidate();assert.equal(e._activeRenderLoops.length,1);e._renderFrame();assert.equal(e._activeRenderLoops.length,0);e.dispose();

// Summary algorithm delta: deterministic ring contents, CPU-only local timing.
const oldSource=git(base+'~1','src/frame-diagnostics.js'),oldClass=oldSource.slice(oldSource.indexOf('export class FrameDiagnostics'),oldSource.indexOf('export function gpuDiagnosticLine')).replace('export class','class');
const OldFrameDiagnostics=Function(oldClass+';return FrameDiagnostics;')();
const summaryCosts={};
for(const [name,Type]of [['previous',OldFrameDiagnostics],['current',FrameDiagnostics]]){
 const monitor=new Type();for(let i=0;i<=4000;i++){const at=i*21.8;monitor.begin(at,60);monitor.end(at+14.2);}
 for(let i=0;i<100;i++)monitor.summary();const batches=[];
 for(let j=0;j<25;j++){const start=performance.now();for(let i=0;i<100;i++)monitor.summary();batches.push((performance.now()-start)/100);}
 summaryCosts[name]={...stats(batches),unit:'local Node milliseconds per summary (paint is at most 2Hz)'};
}

// Complete collector pipeline with a deterministic DOM stub. This deliberately
// excludes browser style/layout/compositing; it checks calls and bounded work.
function collector(enabled,withBoss=false){
 let at=0,writes=0,clockCalls=0,memoryCalls=0,contextCalls=0;const nodes=new Map();
 const get=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},style:{removeProperty(){}},listeners:{},_text:'',get textContent(){return this._text;},set textContent(v){writes++;this._text=v;},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},querySelector(){return null;}});return nodes.get(id);};
 const diag=createFrameDiagnostics({doc:{getElementById:get},storage:{getItem:()=>enabled?'1':'0'},now:()=>{clockCalls++;return at;},
  memory:()=>{memoryCalls++;return {};},context:()=>{contextCalls++;return {position:[0,0],camera:[1,.8,17]};},renderMetrics:()=>({drawCalls:120,sceneMs:12,activeMeshesMs:6,animationMs:.3,gpu:{status:'unsupported'}})});
 const costs=[];for(let i=0;i<4000;i++){
  at=i*21.8;const started=performance.now();diag.beginFrame(true,60);
  if(withBoss&&i===180)diag.bossEvent({type:'begin',label:'audit boss',mode:'reuse'});
  if(withBoss&&i===190)diag.bossEvent({type:'ready'});
  for(const name of ['bossUpdateMs','contactsMs','worldUpdateMs','hudUpdateMs','hudUpdateMs']){const mark=diag.mark();diag.measure(name,mark);}
  at+=14.2;diag.endFrame();costs.push(performance.now()-started);
 }
 const snapshot=diag.snapshot();
 return {costMs:stats(costs),clockCalls,writes,memoryCalls,contextCalls,samples:snapshot.summary.samples,bossStatus:snapshot.bossComparison?.status??null,note:'Synthetic DOM with no style/layout. Measures fixture JavaScript only, not phone or browser rendering.'};
}

const qualityPaths=['src/world.js','src/world-limits.js','src/render-policy.js','src/frame-loop.js','src/village-layout.js','src/village-terrain.js','src/village-ground-layout.js',
 'src/great-plains-layout.js','src/great-plains-terrain.js','src/plains-view-distance.js','src/monster-forest-layout.js','src/monster-forest-terrain.js','src/witch-cave-layout.js',
 'src/witch-cave-terrain.js','src/village-lod.js','src/village-policy.js','src/camera-pitch.js','src/player-dimensions.js','src/chest-opening.js','src/loot-rarity.js'];
const quality=[];
for(const path of qualityPaths){try{const content=git(base,path);quality.push({path,sha256Lf:sha(content.replace(/\r\n/g,'\n'))});}catch{quality.push({path,absentAtBaseline:true});}}
const manifests=[];
for(const name of readdirSync(new URL('public/assets/',root)).filter(n=>n.endsWith('.json'))){
 const path='public/assets/'+name;try{const content=git(base,path);manifests.push({path,sha256Lf:sha(content.replace(/\r\n/g,'\n'))});}catch{/* locally untracked experiments are not the release graph */}
}
const guards={generatedAt:new Date().toISOString(),baselineCommit:base,source:quality,manifests,
 policy:['Player 8192 and background max4096 authored texture links remain exact.','Native geometry LOD files, thresholds, distances and plains 240% setting remain exact.','No collision/nav/terrain, combat shape/input, loot, chest or death pose changes.','No active mesh freeze that bypasses moving camera/frustum/native LOD switching.','Approved performance source changes must be enumerated separately; compare immutable public manifests byte-for-byte against baseline.']};
writeFileSync(new URL('audit-loop-quality-guard.json',output),JSON.stringify(guards,null,2)+'\n');
const report={generatedAt:new Date().toISOString(),baselineCommit:base,sourceSampleSha256:sha(diagnostic),summary:data.summary,renderMetrics:data.renderMetrics,eventGroups,
 sdkObserverCounts:{initial,enabled,after100SameSceneReentries:enabled,afterDisable:initial,callbacksAdded:Object.fromEntries(Object.keys(initial).map(k=>[k,enabled[k]-initial[k]])),gpuDriver:'unsupported; no GL query methods called'},
 actualSdkCapReplay:caps,frameLoop:{roundTrips:50,maxRegisteredRenderLoops:1,pausedRenderLoops:0,invalidatedOnceRemovesItself:true},summaryCosts,
 collector:{disabled:collector(false),enabled:collector(true),enabledWithCompletedBoss:collector(true,true)},
 findings:[
 {severity:'evidence',claim:'Persistent slow frames also occur with no texture/geometry preparation, no bosses and low HUD/world update cost. The 125.2s texture event is a separate transient submission spike, not a complete explanation of sustained 40–45FPS.'},
 {severity:'not-reproduced',claim:'Recent three patches do not alter FrameLoop or the SDK RAF/maxFPS cap. At a 60 target, ideal 60/90/120Hz monotonic RAF feeds accept about 600 renders in 10s; no intrinsic 40/45 cap or duplicate loop was found.'},
 {severity:'scope',claim:'activeMeshesMs brackets native _evaluateActiveMeshes candidate scan/readiness/world matrix/LOD/frustum/activation/submesh classification. It is CPU work, not a GPU time. There are no application before/after-active-evaluation observable subscribers in baseline source.'},
 {severity:'scope',claim:'drawSubmissionMs is the pinned SDK renderTimeCounter, refreshed again on onAfterRender; draw/shadow/after-draw callback work can overlap. It cannot isolate upload, shader compilation, driver wait or GPU execution.'},
 {severity:'not-reproduced',claim:'New diagnostic PerfCounter callbacks are bounded scalar observers; enabling same scene does not stack them and disable removes them. Unsupported GPU path does not issue query/GL polling. Local Node timing is not a phone speed bound.'},
 {severity:'limitation',claim:'Diagnostic endFrame itself runs after the recorded work timestamp, so its summary/DOM cost can affect the next interval but is not in jsSubmitMs. Browser layout/compositing/GPU/temperature cannot be excluded by this CPU-only audit.'}
 ],
 scenarios:[
 'Each of village, plains, forest, cave: identical saved camera/position, quality high, 60FPS target, resolution1664x768, same LOD and plains240%; wait geometry/texture pending0 and observe 15s idle + 15s orbit + 15s movement, diagnostics off/on separately. Do not compare phone thermal state across unmatched runs.',
 'Cold texture promotion separately: approach village at z37.9→30.1, record current-work spike and next interval independently; compare first promotion and fully resident replay with unchanged texture URL/dimensions.',
 'Traverse village→plains→forest→cave→forest→plains→village twice; native LOD near/mid/far/frustum, tier outlines, open chest state, cave fog/material isolation and health/equipment remain unchanged; diagnostic observers/render loops plateau.',
 'Pause using settings/HUD editor/minimap, background/pagehide, foreground/pageshow/context restore: active render callbacks0 while paused/hidden, one after resume; timer queries cancelled and stale GPU samples not reported as live.',
 'Any active-candidate optimization must compare actual production visible mesh/instance/submesh IDs plus LOD and shadow eligibility at boundary cameras and all four maps; counters alone do not prove equal imagery.'
 ]};
writeFileSync(new URL('audit-loop-scheduling.json',output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sdkObserverCounts:report.sdkObserverCounts,actualSdkCapReplay:caps,summaryCosts,collector:report.collector,eventGroups},null,2));
