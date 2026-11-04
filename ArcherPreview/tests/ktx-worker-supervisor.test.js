import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,Texture} from '@babylonjs/core';
import {InternalTexture} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import {KhronosTextureContainer2 as Ktx} from '@babylonjs/core/Misc/khronosTextureContainer2.js';
import {AutoReleaseWorkerPool} from '@babylonjs/core/Misc/workerPool.js';
import {applyConfig,workerFunction,initializeWebWorker} from '@babylonjs/core/Misc/khronosTextureContainer2Worker.js';
import {KtxWorkerSupervisor,KTX_WORKER_IDLE_MS,installKtxWorkerSupervisor,inspectKtxWorkerPool,recoverKtxWorkerPool} from '../src/ktx-worker-supervisor.js';
import {releaseMapTexture,installMapTextureLifetimeGuard} from '../src/map-texture-lifetime.js';
import {installKtxDecodeCache,inspectMapDecodeCache} from '../src/map-decode-cache.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0)),results=[];
function clock(){let time=0,id=0;const jobs=new Map();return {now:()=>time,setTimeout:(fn,ms)=>{jobs.set(++id,{at:time+ms,fn});return id;},clearTimeout:key=>jobs.delete(key),advance(ms){time+=ms;for(const [key,job]of [...jobs])if(job.at<=time){jobs.delete(key);job.fn();}},get size(){return jobs.size;},get pending(){return [...jobs.values()];}};}
const image={transcodedFormat:0x9278,isInGammaSpace:true,hasAlpha:false,mipmaps:[{width:4,height:4,data:new Uint8Array([1,2,3,4])}]};
class BoundaryWorker {
 constructor({init='ok'}={}){this.init=init;this.listeners=new Map();this.posts=[];this.terminated=0;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type,event){for(const fn of [...this.listeners.get(type)??[]])if(this.listeners.get(type)?.has(fn))fn(event);}
 postMessage(value){this.posts.push(value);if(value.action==='init'){if(this.init==='ok')queueMicrotask(()=>this.emit('message',{data:{action:'init'}}));else if(this.init==='error')queueMicrotask(()=>this.emit('error',{type:'error',message:'controlled init failure'}));}}
 decoded(value=image){this.emit('message',{data:{action:'decoded',success:true,decodedData:value}});}
 terminate(){this.terminated++;}
 get listenerCount(){return [...this.listeners.values()].reduce((sum,set)=>sum+set.size,0);}
}
function fixture(t,{plans=[],timeoutMs=45000,idleMs}={}){const timers=clock(),workers=[],pool=new KtxWorkerSupervisor({timers,timeoutMs,idleMs,urls:{jsDecoderModule:'https://local.test/decoder.js'},createWorker:()=>{const worker=new BoundaryWorker(plans.shift());workers.push(worker);return worker;}});t.after(()=>pool.dispose());return {timers,workers,pool};}
function owner(scene){const texture=new Texture(null,scene),internal=new InternalTexture(scene.getEngine(),1);texture._texture=internal;scene.addPendingData(internal);scene.getEngine().getLoadedTexturesCache().push(internal);return {texture,internal};}

test('normal jobs use one initialized worker, preserve exact caps/defaults/format/mips and serialize copies',async t=>{
 const {pool,workers,timers}=fixture(t),data=new Uint8Array([7,8,9]),caps={astc:true},options={forceR8:true},defaults={forceRGBA:false},a=pool.decode(data,caps,options,defaults),b=pool.decode(data,caps,options,defaults);await tick();assert.equal(workers.length,1);assert.equal(workers[0].posts.filter(p=>p.action==='decode').length,1);assert.equal(pool.inspect().queued,1);const sent=workers[0].posts.find(p=>p.action==='decode');assert.notEqual(sent.data,data);assert.deepEqual(sent.data,data);assert.equal(sent.caps,caps);assert.equal(sent.options,options);assert.equal(workers[0].posts[1].options,defaults);workers[0].decoded();assert.equal(await a,image);workers[0].decoded();assert.equal(await b,image);assert.equal(pool.inspect().counts.completed,2);timers.advance(KTX_WORKER_IDLE_MS);assert.equal(workers[0].terminated,1);assert.equal(workers[0].listenerCount,0);assert.equal(timers.size,0);results.push({case:'normal-serialization-byte-equivalence',passed:true});
});

test('eight-second idle grace reuses one worker at the two-second moving-texture cadence then expires exactly once',async t=>{
 const counts=[];
 for(const idleMs of [1000,KTX_WORKER_IDLE_MS]){
  const {pool,workers,timers}=fixture(t,{idleMs});
  for(let i=0;i<6;i++){
   if(i)timers.advance(2000);
   const pending=pool.decode(new Uint8Array([i]),{etc2:true},{forceRGBA:false},{forceRGBA:false});await tick();
   assert.equal(workers.filter(worker=>!worker.terminated).length,1,'one live worker');workers.at(-1).decoded();assert.equal(await pending,image);
  }
  counts.push({idleMs,created:pool.inspect().counts.created,completed:pool.inspect().counts.completed});
  timers.advance(idleMs-1);assert.equal(workers.at(-1).terminated,0);timers.advance(1);
  assert.equal(workers.at(-1).terminated,1);assert.equal(pool.lease,null);assert.equal(timers.size,0);assert.ok(workers.every(worker=>worker.listenerCount===0));
 }
 assert.deepEqual(counts,[{idleMs:1000,created:6,completed:6},{idleMs:8000,created:1,completed:6}]);
 results.push({case:'eight-second-idle-two-second-cadence',passed:true,counts,exactFinalIdleExpiry:true});
});

test('a cancelled stale idle callback cannot retire the worker before the newest idle deadline',async t=>{
 const {pool,workers,timers}=fixture(t),first=pool.decode(new Uint8Array(4),{},{});await tick();workers[0].decoded();await first;
 const stale=timers.pending[0].fn;timers.advance(2000);
 const second=pool.decode(new Uint8Array(4),{},{});await tick();workers[0].decoded();await second;
 stale();assert.equal(workers[0].terminated,0);assert.equal(timers.size,1);
 timers.advance(7999);assert.equal(workers[0].terminated,0);timers.advance(1);assert.equal(workers[0].terminated,1);assert.equal(timers.size,0);
 results.push({case:'stale-idle-callback-new-deadline-isolation',passed:true});
});

test('engine disposal immediately releases an idle retained worker and its observer and timer',async t=>{
 const engine=new NullEngine(),{pool,workers,timers}=fixture(t);t.after(()=>engine.dispose());
 const observerCount=()=>engine.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length,before=observerCount();
 const pending=pool.decode(new Uint8Array(4),{},{},{},{engine});await tick();workers[0].decoded();await pending;
 assert.equal(observerCount(),before+1,'one idle lease observer replaces the completed job observer');assert.equal(timers.size,1);
 engine.dispose();assert.equal(workers[0].terminated,1);assert.equal(workers[0].listenerCount,0);assert.equal(pool.lease,null);assert.equal(timers.size,0);assert.equal(pool.inspect().counts.cancelled,0);
 results.push({case:'idle-engine-dispose-immediate-release',passed:true,waitedForIdleDeadline:false});
});

test('idle reuse across map owners sends current defaults and disposing an old engine cannot cancel a different engine job',async t=>{
 const firstEngine=new NullEngine(),secondEngine=new NullEngine(),scene=new Scene(firstEngine),{pool,workers,timers}=fixture(t);t.after(()=>{firstEngine.dispose();secondEngine.dispose();});
 const previous=owner(scene),first=pool.decode(new Uint8Array(4),{etc2:true},{forceRGBA:false},{forceRGBA:false},{owner:previous.internal,engine:firstEngine});await tick();workers[0].decoded();await first;
 releaseMapTexture(previous.texture,scene);timers.advance(2000);assert.equal(workers[0].terminated,0,'completed old-map owner does not own the idle worker');
 const caps={astc:true},defaults={forceRGBA:true},second=pool.decode(new Uint8Array([9]),caps,{forceRGBA:true},defaults,{engine:secondEngine});await tick();
 assert.equal(workers.length,1);assert.equal(workers[0].posts.at(-1).caps,caps);assert.equal(workers[0].posts.at(-2).options,defaults);
 firstEngine.dispose();assert.equal(workers[0].terminated,0);assert.ok(pool.active,'new engine job remains active');workers[0].decoded();assert.equal(await second,image);
 secondEngine.dispose();assert.equal(workers[0].terminated,1);assert.equal(timers.size,0);assert.equal(workers[0].listenerCount,0);
 results.push({case:'idle-map-owner-reuse-and-cross-engine-disposal-isolation',passed:true,workers:1,currentCapsAndDefaults:true});
});

test('init failure rejects original and queued jobs, latches without retry, then explicit recovery creates a new worker',async t=>{
 const {pool,workers,timers}=fixture(t,{plans:[{init:'error'},{init:'ok'}]}),one=pool.decode(new Uint8Array(4),{},{}).catch(e=>e),two=pool.decode(new Uint8Array(4),{},{}).catch(e=>e);assert.equal((await one).code,'KTX_WORKER_INIT');assert.equal((await two).code,'KTX_WORKER_INIT');assert.equal(pool.inspect().status,'failed');assert.equal(pool.inspect().lastFailure.stage,'worker-init','a queued rejection must not replace the root worker failure');assert.equal(workers[0].terminated,1);assert.equal(workers[0].listenerCount,0);assert.equal(timers.size,0);assert.equal((await pool.decode(new Uint8Array(4),{},{}).catch(e=>e)).code,'KTX_WORKER_INIT');assert.equal(workers.length,1);assert.equal(pool.recover(),true);assert.equal(pool.inspect().lastFailure.recovered,true);const recovered=pool.decode(new Uint8Array(4),{},{});await tick();assert.equal(workers.length,2);workers[1].decoded();assert.equal(await recovered,image);assert.equal(pool.inspect().counts.recoveries,1);results.push({case:'initialization-failure-manual-recovery',passed:true,automaticRetries:0});
});

test('idle worker crashes are retired before reuse and active errors never recycle the dead worker',async t=>{
 const {pool,workers}=fixture(t),first=pool.decode(new Uint8Array(4),{},{});await tick();workers[0].decoded();await first;workers[0].emit('error',{message:'fatal idle worker'});assert.equal(pool.inspect().status,'failed');assert.equal(workers[0].terminated,1);assert.equal(workers[0].listenerCount,0);pool.recover();const next=pool.decode(new Uint8Array(4),{},{}).catch(e=>e);await tick();workers[1].emit('messageerror',{message:'broken message channel'});assert.equal((await next).code,'KTX_WORKER_ERROR');assert.equal(workers[1].terminated,1);assert.equal(pool.inspect().status,'failed');results.push({case:'idle-and-active-crash-not-reused',passed:true});
});

test('no-response initialization and decode have finite total await and separate queue/init/active timing',async t=>{
 const {pool,workers,timers}=fixture(t,{plans:[{init:'hold'},{init:'ok'}]}),pending=pool.decode(new Uint8Array(4),{},{}).catch(e=>e);await tick();timers.advance(45000);const error=await pending;assert.equal(error.name,'TimeoutError');assert.equal(error.ktxStage,'worker-init');assert.equal(error.timeoutMs,45000);assert.equal(workers[0].listenerCount,0);assert.equal(pool.inspect().lastFailure.initMs,45000);assert.equal(timers.size,0);pool.recover();const a=pool.decode(new Uint8Array(4),{},{}).catch(e=>e);await tick();timers.advance(30000);const b=pool.decode(new Uint8Array(4),{},{}).catch(e=>e);timers.advance(15000);assert.equal((await a).ktxStage,'decode');assert.equal((await b).name,'TimeoutError');assert.equal(pool.inspect().queued,0);assert.equal(pool.inspect().active,null);assert.equal(timers.size,0);results.push({case:'finite-queue-initialization-decode-await',passed:true,totalAwaitMs:45000});
});

test('queued owner cancellation preserves the active shared job and active cancellation ignores late worker output',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());const {pool,workers}=fixture(t),shared=owner(scene),queued=owner(scene);shared.internal.incrementReferences();const foreign=new Texture(null,scene);foreign._texture=shared.internal;
 const a=pool.decode(new Uint8Array(4),{},{},{},{owner:shared.internal,engine}),b=pool.decode(new Uint8Array(4),{},{},{},{owner:queued.internal,engine}).catch(e=>e);await tick();releaseMapTexture(queued.texture,scene);assert.equal((await b).name,'AbortError');assert.equal(pool.inspect().queued,0);releaseMapTexture(shared.texture,scene);assert.equal(workers[0].terminated,0);workers[0].decoded();assert.equal(await a,image);releaseMapTexture(foreign,scene);
 const active=owner(scene),old=pool.decode(new Uint8Array(4),{},{},{},{owner:active.internal,engine}).catch(e=>e);await tick();releaseMapTexture(active.texture,scene);assert.equal((await old).name,'AbortError');assert.equal(workers[0].terminated,1);const next=pool.decode(new Uint8Array(4),{},{});await tick();workers[0].decoded({transcodedFormat:123,mipmaps:[]});assert.equal(pool.inspect().active.id,4);workers[1].decoded();assert.equal(await next,image);assert.equal(scene.getWaitingItemsCount(),0);results.push({case:'owner-specific-queued-active-shared-cancel',passed:true,lateWorkerPublication:false});
});

test('twenty queued old owners released in one turn create no replacement-worker churn',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());const {pool,workers}=fixture(t),old=Array.from({length:21},()=>owner(scene)),jobs=old.map(v=>pool.decode(new Uint8Array(4),{},{},{},{owner:v.internal,engine}).catch(e=>e));await tick();assert.equal(workers.length,1);for(const value of old)releaseMapTexture(value.texture,scene);await Promise.all(jobs);await tick();assert.equal(workers.length,1);assert.equal(pool.inspect().queued,0);assert.equal(pool.inspect().active,null);const next=pool.decode(new Uint8Array(4),{},{});await tick();assert.equal(workers.length,2);workers[1].decoded();await next;results.push({case:'coalesced-batch-release-no-worker-churn',passed:true,oldQueuedOwners:20,replacementWorkersDuringBatch:0});
});

test('engine disposal cancels only its jobs and complete/dispose leave no owner observers or timers',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine),{pool,workers,timers}=fixture(t),value=owner(scene),before=engine.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length;
 const pending=pool.decode(new Uint8Array(4),{},{},{},{owner:value.internal,engine}).catch(e=>e);await tick();assert.equal(engine.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length,before+1);engine.dispose();assert.equal((await pending).name,'AbortError');await tick();assert.equal(pool.inspect().active,null);assert.equal(timers.size,0);assert.equal(workers[0].listenerCount,0);results.push({case:'engine-dispose-and-observer-timer-lifetime',passed:true});
});

test('same-turn cancellation before the SDK init microtask cannot attach late listeners to the terminated worker',async t=>{
 const {pool,workers,timers}=fixture(t),pending=pool.decode(new Uint8Array(4),{},{}).catch(e=>e);pool.cancel(pool.active);assert.equal((await pending).name,'AbortError');await tick();assert.equal(workers[0].terminated,1);assert.equal(workers[0].listenerCount,0);assert.equal(workers[0].posts.length,0);assert.equal(pool.inspect().active,null);assert.equal(pool.inspect().queued,0);assert.equal(timers.size,0);results.push({case:'same-turn-cancel-before-init-listener-registration',passed:true,lateListeners:0,lateInitMessages:0});
});

test('an invalid image rejects that job but keeps the healthy worker for the next queued image',async t=>{
 const {pool,workers}=fixture(t),a=pool.decode(new Uint8Array(4),{},{}).catch(e=>e),b=pool.decode(new Uint8Array(4),{},{});await tick();workers[0].emit('message',{data:{action:'decoded',success:false,msg:'invalid source'}});assert.equal((await a).code,'KTX_TRANSCODE_ERROR');assert.equal(workers.length,1);workers[0].decoded();assert.equal(await b,image);assert.notEqual(pool.inspect().status,'failed');results.push({case:'image-error-does-not-poison-worker',passed:true});
});

test('the real SDK upload boundary carries owner cancellation without cloning owner metadata or changing output options',async t=>{
 class ScopedKtx {}Object.assign(ScopedKtx.prototype,{_decodeAsync:Ktx.prototype._decodeAsync,_uploadAsync:Ktx.prototype._uploadAsync,_createTexture:Ktx.prototype._createTexture});ScopedKtx.DefaultDecoderOptions=Ktx.DefaultDecoderOptions;
 const engine=new NullEngine(),scene=new Scene(engine),workers=[],timers=clock();t.after(()=>engine.dispose());const installed=installKtxWorkerSupervisor(ScopedKtx,{timers,createWorker:()=>{const worker=new BoundaryWorker();workers.push(worker);return worker;}});t.after(()=>installed.pool.dispose());installKtxDecodeCache(ScopedKtx);installMapTextureLifetimeGuard(ScopedKtx);const ktx=Object.create(ScopedKtx.prototype);ktx._engine=engine;let uploads=0;t.mock.method(engine,'_bindTextureDirectly',()=>{});t.mock.method(engine,'_uploadCompressedDataToTextureDirectly',()=>uploads++);
 const abandoned=owner(scene),cancelled=ktx._uploadAsync(new Uint8Array(8),abandoned.internal,{forceRGBA:false}).catch(e=>e);await tick();releaseMapTexture(abandoned.texture,scene);assert.equal((await cancelled).name,'AbortError');assert.equal(uploads,0);assert.equal(workers[0].terminated,1);workers[0].decoded();assert.equal(uploads,0);
 const shared=owner(scene),other=new Texture(null,scene);shared.internal.incrementReferences();other._texture=shared.internal;const options={forceRGBA:false},live=ktx._uploadAsync(new Uint8Array(8),shared.internal,options);await tick();releaseMapTexture(shared.texture,scene);assert.equal(workers[1].terminated,0);const request=workers[1].posts.find(p=>p.action==='decode');assert.equal(Reflect.ownKeys(request.options).some(key=>typeof key==='symbol'),false);assert.deepEqual(request.options,{forceRGBA:false});workers[1].decoded(image);await live;assert.equal(uploads,1);assert.equal(options.transcodedFormat,image.transcodedFormat);assert.equal(options.isInGammaSpace,image.isInGammaSpace);assert.equal(options.hasAlpha,image.hasAlpha);assert.equal(Reflect.ownKeys(options).some(key=>typeof key==='symbol'),false);releaseMapTexture(other,scene);installed.pool.dispose();assert.equal(timers.size,0);results.push({case:'real-SDK-upload-owner-options-and-late-isolation',passed:true,ownerMetadataCloned:false,abandonedUploads:0,sharedUploads:1});
});

class VmCodecWorker extends BoundaryWorker {
 constructor(){super();const worker=this,context={console,WebAssembly,ArrayBuffer,Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,DataView,TextDecoder,TextEncoder,URL,Blob,performance,setTimeout,clearTimeout,atob,btoa,location:{href:'https://codec.test/worker.js'},postMessage:value=>queueMicrotask(()=>worker.emit('message',{data:value}))};context.self=context;context.globalThis=context;context.onmessage=null;context.fetch=async url=>new Response(readFileSync(new URL('../public/assets/content/'+new URL(url).pathname.split('/').at(-1),import.meta.url)),{headers:{'Content-Type':'application/wasm'}});this.context=vm.createContext(context);context.importScripts=(...urls)=>{for(const url of urls)vm.runInContext(readFileSync(new URL('../public/assets/content/'+new URL(url).pathname.split('/').at(-1),import.meta.url),'utf8'),this.context,{filename:new URL(url).pathname.split('/').at(-1)});};vm.runInContext(`${applyConfig}(${workerFunction})()`,this.context);}
 postMessage(value){this.posts.push(value);queueMicrotask(()=>{try{this.context.onmessage({data:value});}catch(error){this.emit('error',error);}});}
}

test('actual shipped ETC1S WASM output, all mip bytes, metadata and options equal native SDK through the adapter/cache',async t=>{
 const saved={decode:Ktx.prototype._decodeAsync,upload:Ktx.prototype._uploadAsync,pool:Ktx.WorkerPool,promise:Ktx._WorkerPoolPromise,module:Ktx._DecoderModulePromise},config=JSON.parse(readFileSync(new URL('../public/assets/ktx2-decoder.json',import.meta.url))),urls=Object.fromEntries(Object.entries(config.urls).map(([key,value])=>[key,new URL(value,'https://codec.test/assets/').href])),ground=JSON.parse(readFileSync(new URL('../public/assets/witch-cave-ground.json',import.meta.url))),data=readFileSync(new URL('../public/assets/'+ground.detail.url.replace('./',''),import.meta.url)),engine=new NullEngine();engine.getCaps().etc2=true;engine.getCaps().astc=true;
 const nativePool=new AutoReleaseWorkerPool(1,async()=>initializeWebWorker(new VmCodecWorker(),undefined,urls)),native=Object.create(Ktx.prototype);native._engine=engine;Ktx._WorkerPoolPromise=Promise.resolve(nativePool);let installed;
 t.after(()=>{nativePool.dispose();installed?.pool.dispose();Ktx.prototype._decodeAsync=saved.decode;Ktx.prototype._uploadAsync=saved.upload;Ktx.WorkerPool=saved.pool;Ktx._WorkerPoolPromise=saved.promise;Ktx._DecoderModulePromise=saved.module;engine.dispose();});
 const baseline=await native._decodeAsync(data);nativePool.dispose();Ktx._WorkerPoolPromise=undefined;Ktx.WorkerPool=undefined;Ktx._DecoderModulePromise=undefined;
 installed=installKtxWorkerSupervisor(Ktx,{urls,createWorker:()=>new VmCodecWorker()});assert.equal(installed.status,'installed');assert.equal(installKtxWorkerSupervisor(Ktx,{urls}),installed);installKtxDecodeCache(Ktx);const adapter=Object.create(Ktx.prototype);adapter._engine=engine;
 const after=await adapter._decodeAsync(data);assert.equal(after.transcodedFormat,baseline.transcodedFormat);assert.equal(after.isInGammaSpace,baseline.isInGammaSpace);assert.equal(after.hasAlpha,baseline.hasAlpha);assert.equal(after.mipmaps.length,baseline.mipmaps.length);for(let i=0;i<after.mipmaps.length;i++){assert.equal(after.mipmaps[i].width,baseline.mipmaps[i].width);assert.equal(after.mipmaps[i].height,baseline.mipmaps[i].height);assert.deepEqual(Buffer.from(after.mipmaps[i].data),Buffer.from(baseline.mipmaps[i].data));}
 const count=installed.pool.inspect().counts.completed,again=await adapter._decodeAsync(data);assert.equal(installed.pool.inspect().counts.completed,count);assert.deepEqual(Buffer.from(again.mipmaps[0].data),Buffer.from(after.mipmaps[0].data));assert.ok(inspectMapDecodeCache(engine).textures.hits>=1);assert.equal(inspectKtxWorkerPool().maxWorkers,1);assert.equal(recoverKtxWorkerPool(),false);
 results.push({case:'real-ETC1S-WASM-native-adapter-byte-equivalence',passed:true,transcodedFormat:after.transcodedFormat,mips:after.mipmaps.length,mipSha256:after.mipmaps.map(m=>createHash('sha256').update(m.data).digest('hex')),cacheHit:true,actualCodec:true,workerSimulation:'official SDK worker script in isolated VM, not a browser/physical worker/GPU'});
});

test('pre-existing pools and workerless runtimes are preserved without installing or disposing another owner',()=>{
 class Existing {static WorkerPool={disposed:false,dispose(){this.disposed=true;}};}const pool=Existing.WorkerPool;assert.equal(installKtxWorkerSupervisor(Existing,{createWorker:()=>new BoundaryWorker()}).status,'external-pool');assert.equal(Existing.WorkerPool,pool);assert.equal(pool.disposed,false);class Workerless {}assert.equal(installKtxWorkerSupervisor(Workerless,{WorkerClass:undefined}).status,'workerless');results.push({case:'external-pool-and-workerless-preservation',passed:true});
});

test.after(()=>{const path=new URL('../reports/map-transfer-root-cause-2026-11-02/',import.meta.url);mkdirSync(path,{recursive:true});writeFileSync(new URL('ktx-supervisor-validation.json',path),JSON.stringify({expectedCases:16,completedCases:results.length,passed:results.length===16,cases:results,limitations:['No browser automation, actual browser worker scheduling, GPU or phone temperature measurement.','Faults use controlled IPC boundaries with the installed SDK init protocol. The normal ETC1S comparison runs the shipped decoder JavaScript and actual WebAssembly against an existing texture.','Total per-decode await is 45s including queue/init; a legitimately slower 8K decode can also hit this ceiling. Timers cannot preempt synchronous execution.','The eight-second idle timer bounds warm retention time, not exact WASM heap size or OS memory reclamation time.'],sourceHashes:Object.fromEntries(['ktx-worker-supervisor.js','village-ktx2.js','map-texture-lifetime.js'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../src/'+name,import.meta.url))).digest('hex')])),browserAutomation:false},null,2)+'\n');});
