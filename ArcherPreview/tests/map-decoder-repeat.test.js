import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,Texture} from '@babylonjs/core';
import {InternalTexture} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import {KtxWorkerSupervisor} from '../src/ktx-worker-supervisor.js';
import {MeshoptWorkerSupervisor} from '../src/meshopt-worker-supervisor.js';
import {releaseMapTexture} from '../src/map-texture-lifetime.js';
import {MapLoadLifetime} from '../src/map-load-lifetime.js';

const runtimeFiles=['ktx-worker-supervisor.js','meshopt-worker-supervisor.js','map-texture-lifetime.js','map-load-lifetime.js'];
const hashes=()=>Object.fromEntries(runtimeFiles.map(name=>[name,createHash('sha256').update(readFileSync(new URL('../src/'+name,import.meta.url))).digest('hex')]));
const report={base:'82b0d02',fixture:'Controlled WebWorker IPC with exact KTX SDK init-message protocol; production owned supervisor/lifetime code and actual Babylon texture/engine ownership. Fake deterministic clock, no repeated WASM or browser.',cyclesPerCodec:20,cases:{},sourceBefore:hashes(),limitations:['No physical worker scheduling, GPU texture uploads, device heap/temperature or real-network measurements.','Worker history is intentionally retained by the test fixture for listener audits; this is not a JS heap-retention benchmark.','Previous pinned WASM byte-identity evidence is not rerun here.']};
const tick=()=>new Promise(r=>setTimeout(r,0)),bytes=new Uint8Array([1,2,3,4]);
const image={transcodedFormat:0x9278,isInGammaSpace:true,hasAlpha:false,mipmaps:[{width:4,height:4,data:bytes}]};
function clock(){let now=0,id=0,peak=0;const timers=new Map();return {now:()=>now,setTimeout:(fn,ms)=>{timers.set(++id,{at:now+ms,fn});peak=Math.max(peak,timers.size);return id;},clearTimeout:key=>timers.delete(key),advance(ms){const target=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=target;},get size(){return timers.size;},get peak(){return peak;}};}
class RepeatWorker{
 constructor(kind,mode){this.kind=kind;this.mode=mode;this.events=new Map();this.posts=[];this.terminated=0;this.adds=0;this.removes=0;}
 addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());const set=this.events.get(type);if(!set.has(fn)){set.add(fn);this.adds++;}}
 removeEventListener(type,fn){if(this.events.get(type)?.delete(fn))this.removes++;}
 emit(type,event){for(const fn of [...this.events.get(type)??[]])if(this.events.get(type)?.has(fn))fn(type==='message'?{data:event}:{type,message:'controlled repeated worker fault'});}
 postMessage(data){this.posts.push(data);if(data.action==='init'&&this.mode!=='init-timeout')queueMicrotask(()=>this.emit('message',{action:this.kind==='ktx'?'init':'ready'}));}
 complete(){const job=this.posts.findLast(p=>p.action==='decode');assert.ok(job);this.emit('message',this.kind==='ktx'?{action:'decoded',success:true,decodedData:image}:{action:'decoded',id:job.id,value:new Uint8Array(job.count*job.stride)});}
 terminate(){this.terminated++;}
 get listenerCount(){return [...this.events.values()].reduce((sum,set)=>sum+set.size,0);}
}
function textureOwner(scene){const texture=new Texture(null,scene),internal=new InternalTexture(scene.getEngine(),1);texture._texture=internal;scene.addPendingData(internal);scene.getEngine().getLoadedTexturesCache().push(internal);return {texture,internal,released:false};}

for(const kind of ['ktx','meshopt'])test(`${kind}:20mixed failure/manual-recovery/normal/drain cycles leave no worker listeners timers or queues`,async t=>{
 const timers=clock(),workers=[],rows=[],jobRefs=[];let mode='normal',peakWorkers=0;
 const factory=()=>{const worker=new RepeatWorker(kind,mode);workers.push(worker);peakWorkers=Math.max(peakWorkers,workers.filter(w=>!w.terminated).length);return worker;};
 const pool=kind==='ktx'?new KtxWorkerSupervisor({createWorker:factory,urls:{jsDecoderModule:'https://pinned.test/decoder.js'},timers}):new MeshoptWorkerSupervisor({createWorker:factory,decoderUrl:'https://pinned.test/meshopt.js',timers});
 const engine=kind==='ktx'?new NullEngine():null,scene=engine?new Scene(engine):null;
 const liveObservers=()=>engine?.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length??0,observerBaseline=liveObservers();
 const value={kind,cycles:rows,passed:false};report.cases[kind]=value;t.after(()=>{pool.dispose();engine?.dispose();});
 const release=owner=>{if(owner&&!owner.released){owner.released=true;releaseMapTexture(owner.texture,scene);}};
 const submit=(owned=true)=>{const owner=kind==='ktx'&&owned?textureOwner(scene):null;const raw=kind==='ktx'?pool.decode(bytes,{astc:true},{forceRGBA:false},{forceRGBA:false},{owner:owner?.internal,engine}):pool.decodeGltfBufferAsync(bytes,1,4,'ATTRIBUTES','NONE');const id=pool.sequence,job=pool.active?.id===id?pool.active:pool.queue.find(j=>j.id===id);if(job)jobRefs.push(job);return {id,owner,raw,outcome:raw.then(result=>({result}),error=>({error}))};};
 const drain=async()=>{await tick();timers.advance(pool.inspect().idleReleaseMs);await tick();};
 const cleanSnapshot=()=>({liveWorkers:workers.filter(w=>!w.terminated).length,listeners:workers.reduce((n,w)=>n+w.listenerCount,0),timers:timers.size,queued:pool.queue.length,active:pool.active?1:0,engineObservers:liveObservers()-observerBaseline,pendingSceneTokens:scene?.getWaitingItemsCount()??0,retainedInputRefs:jobRefs.filter(j=>(j.data??j.source)!=null).length});
 for(let cycle=0;cycle<20;cycle++){
  const scenario=['normal-queue','init-timeout','fatal-active','decode-timeout','abandon-drain'][cycle%5],startCreated=workers.length,startCompleted=pool.counts.completed;mode=scenario==='init-timeout'?'init-timeout':'normal';
  const owned=[];const make=()=>{const job=submit();owned.push(job);return job;};
  if(scenario==='normal-queue'){
   const jobs=[make(),make(),make()];await tick();assert.equal(workers.length,startCreated+1);
   for(const job of jobs){workers.at(-1).complete();assert.ok((await job.outcome).result);release(job.owner);await tick();}
   assert.equal(pool.counts.completed-startCompleted,3);
  }else if(['init-timeout','fatal-active','decode-timeout'].includes(scenario)){
   const first=make(),queued=make();await tick();const old=workers.at(-1);
   if(scenario==='fatal-active')old.emit('error');else timers.advance(45000);
   const a=await first.outcome,b=await queued.outcome;assert.ok(a.error);assert.ok(b.error);release(first.owner);release(queued.owner);await tick();
   assert.equal(pool.inspect().status,'failed');assert.equal(pool.inspect().lastFailure.id,first.id);assert.equal(old.listenerCount,0);assert.equal(old.terminated,1);
   const beforeRetry=workers.length;const rejected=submit(false);assert.ok((await rejected.outcome).error);assert.equal(workers.length,beforeRetry,'failed job cannot silently create/retry a worker');
   assert.equal(pool.recover(),true);mode='normal';const retry=make();await tick();if(scenario==='init-timeout')old.emit('message',{action:kind==='ktx'?'init':'ready'});else old.complete();assert.equal(pool.counts.completed,startCompleted,'late old result is inert');workers.at(-1).complete();assert.ok((await retry.outcome).result);release(retry.owner);assert.equal(pool.counts.completed-startCompleted,1);
  }else if(kind==='ktx'){
   const jobs=[make(),make(),make()];await tick();const old=workers.at(-1);release(jobs[1].owner);release(jobs[2].owner);release(jobs[0].owner);
   for(const job of jobs)assert.equal((await job.outcome).error.name,'AbortError');await tick();assert.equal(workers.length,startCreated+1,'same-turn drain must not churn replacement workers');assert.equal(old.listenerCount,0);old.complete();assert.equal(pool.counts.completed,startCompleted);
   const retry=make();await tick();workers.at(-1).complete();assert.ok((await retry.outcome).result);release(retry.owner);assert.equal(pool.counts.completed-startCompleted,1);
  }else{
   const first=make(),queued=make(),controller=new AbortController(),lifetime=new MapLoadLifetime({signal:controller.signal,timers}),abandoned=lifetime.wait(first.raw).catch(e=>e);await tick();const worker=workers.at(-1);controller.abort();assert.equal((await abandoned).name,'AbortError');lifetime.close();assert.equal(worker.terminated,0);
   worker.complete();assert.ok((await first.outcome).result);await tick();worker.complete();assert.ok((await queued.outcome).result);assert.equal(pool.counts.completed-startCompleted,2,'other healthy waiters must drain normally');
  }
  for(const job of owned)release(job.owner);await drain();const snapshot=cleanSnapshot();
  assert.deepEqual(snapshot,{liveWorkers:0,listeners:0,timers:0,queued:0,active:0,engineObservers:0,pendingSceneTokens:0,retainedInputRefs:0});assert.ok(workers.every(w=>w.adds===w.removes));assert.equal(pool.counts.created,pool.counts.terminated);assert.ok(peakWorkers<=1);
  rows.push({cycle:cycle+1,scenario,snapshot,counts:{...pool.counts},workersCreatedThisCycle:workers.length-startCreated,virtualTimeMs:timers.now()});jobRefs.length=0;
 }
 pool.dispose();await tick();value.passed=true;value.final=cleanSnapshot();value.counts={...pool.counts};value.peakWorkers=peakWorkers;value.peakTimers=timers.peak;value.allRetiredWorkerListenersBalanced=workers.every(w=>w.adds===w.removes);value.noWasmRepetition=true;
});

test.after(()=>{report.sourceAfter=hashes();report.runtimeSourceUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.passed=Object.values(report.cases).length===2&&Object.values(report.cases).every(c=>c.passed)&&report.runtimeSourceUnchanged;const dir=new URL('../reports/map-warm-repeat-2026-11-02/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('decoder-repeat-validation.json',dir),JSON.stringify(report,null,2));});
