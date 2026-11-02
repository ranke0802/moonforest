import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {Worker as NodeWorker} from 'node:worker_threads';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {MeshoptWorkerSupervisor,meshoptWorkerMain,installMeshoptWorkerSupervisor,recoverMeshoptWorkerPool,inspectMeshoptWorkerPool} from '../src/meshopt-worker-supervisor.js';
import {MapLoadLifetime} from '../src/map-load-lifetime.js';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';

const tick=()=>new Promise(r=>setTimeout(r,0)),input=new Uint8Array([1,2,3,4]);
function clock(){let now=0,id=0;const timers=new Map();return {now:()=>now,setTimeout:(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id;},clearTimeout:key=>timers.delete(key),advance(ms){now+=ms;for(const[key,t]of [...timers])if(t.at<=now&&timers.has(key)){timers.delete(key);t.fn();}},get size(){return timers.size;}};}
class FakeWorker{
 constructor(){this.events=new Map();this.messages=[];this.terminated=0;}
 addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
 removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
 postMessage(data){this.messages.push(data);}
 terminate(){this.terminated++;}
 emit(type,data){for(const fn of [...this.events.get(type)??[]])fn(type==='message'?{data}:{type,message:'injected fault'});}
 ready(){this.emit('message',{action:'ready'});}
 complete(){const job=this.messages.findLast(m=>m.action==='decode');this.emit('message',{action:'decoded',id:job.id,value:new Uint8Array(job.count*job.stride)});}
}
function fixture(t,options={}){const timers=clock(),workers=[],pool=new MeshoptWorkerSupervisor({createWorker:()=>{const w=new FakeWorker();workers.push(w);return w;},decoderUrl:'https://pinned.test/decoder.js',timers,...options});t.after(()=>pool.dispose());return {pool,timers,workers,decode:()=>pool.decodeGltfBufferAsync(input,1,4,'ATTRIBUTES','NONE')};}

test('one owned worker serializes shared jobs, keeps source bytes attached and retires only when truly idle',async t=>{
 const f=fixture(t),a=f.decode(),b=f.decode();assert.equal(f.workers.length,1);f.workers[0].ready();assert.notStrictEqual(f.workers[0].messages[1].source.buffer,input.buffer);assert.equal(input.byteLength,4);
 f.workers[0].complete();await a;await tick();assert.equal(f.workers.length,1);f.workers[0].complete();await b;await tick();f.timers.advance(999);assert.equal(f.workers[0].terminated,0);
 const c=f.decode();f.timers.advance(1001);assert.equal(f.workers[0].terminated,0,'old idle timer cannot kill a new active job');f.workers[0].complete();await c;await tick();f.timers.advance(1000);assert.equal(f.workers[0].terminated,1);assert.equal(f.pool.inspect().counts.completed,3);assert.equal(f.timers.size,0);
});
for(const kind of ['error','messageerror','init-error','decode-error'])test('worker '+kind+' latches first failure and queued jobs never auto-retry; explicit recovery creates a clean worker',async t=>{
 const f=fixture(t),a=f.decode().catch(e=>e),b=f.decode().catch(e=>e),old=f.workers[0];
 if(kind==='decode-error'){old.ready();old.emit('message',{action:kind,id:1,message:'bad compressed bytes'});}else if(kind==='init-error')old.emit('message',{action:kind,message:'blocked import/WASM'});else old.emit(kind);
 const error=await a;assert.ok(error.code.startsWith('MESHOPT_'));assert.equal((await b).code,error.code);assert.equal(f.pool.inspect().lastFailure.id,1);assert.notEqual(f.pool.inspect().lastFailure.stage,'queue');assert.equal(old.terminated,1);assert.equal(f.timers.size,0);
 await assert.rejects(f.decode());assert.equal(f.workers.length,1);assert.equal(f.pool.recover(),true);const next=f.decode();f.workers[1].ready();old.emit('message',{action:'decoded',id:1,value:new Uint8Array(4)});f.workers[1].complete();await next;assert.equal(f.pool.inspect().counts.completed,1);assert.equal(f.pool.inspect().counts.recoveries,1);
});
for(const stage of ['worker-init','decode'])test('missing '+stage+' response releases its slot within its own stage deadline',async t=>{
 const f=fixture(t,{initTimeoutMs:40,decodeTimeoutMs:50}),pending=f.decode().catch(e=>e);if(stage==='decode')f.workers[0].ready();f.timers.advance(stage==='decode'?50:40);const error=await pending;
 assert.equal(error.meshoptStage,stage);assert.equal(error.code,'MESHOPT_WORKER_TIMEOUT');assert.equal(f.pool.inspect().status,'failed');assert.equal(f.workers[0].terminated,1);assert.equal(f.timers.size,0);
});
test('queue+init+decode share a nonrenewing45s total cap instead of allowing44s+44s',async t=>{
 const f=fixture(t),pending=f.decode().catch(e=>e);f.timers.advance(44000);f.workers[0].ready();f.timers.advance(999);assert.equal(f.pool.inspect().status,'decode');f.timers.advance(1);const error=await pending;
 assert.equal(error.code,'MESHOPT_JOB_TIMEOUT');assert.equal(error.meshoptStage,'decode');assert.equal(f.pool.inspect().lastFailure.totalMs,45000);assert.equal(f.pool.inspect().lastFailure.initMs,44000);assert.equal(f.workers[0].terminated,1);
});
test('an expired queued waiter never terminates another healthy shared decode',async t=>{
 const f=fixture(t,{queueTimeoutMs:20}),active=f.decode(),queued=f.decode().catch(e=>e);f.workers[0].ready();f.timers.advance(20);assert.equal((await queued).code,'MESHOPT_QUEUE_TIMEOUT');assert.equal(f.workers[0].terminated,0);assert.equal(f.pool.failed,null);f.workers[0].complete();await active;assert.equal(f.pool.inspect().counts.completed,1);
});
test('one abandoned map waiter does not cancel the healthy shared decoder job or another waiter',async t=>{
 const f=fixture(t),controller=new AbortController(),lifetime=new MapLoadLifetime({signal:controller.signal,timers:f.timers}),shared=f.decode(),abandoned=lifetime.wait(shared).catch(e=>e);f.workers[0].ready();controller.abort();assert.equal((await abandoned).name,'AbortError');assert.equal(f.workers[0].terminated,0);assert.equal(f.pool.inspect().status,'decode');f.workers[0].complete();assert.equal((await shared).byteLength,4);lifetime.close();assert.equal(f.pool.inspect().counts.completed,1);
});
test('external SDK default is preserved without dispose, cancellation or recovery',()=>{
 const external={decodeGltfBufferAsync(){},dispose(){assert.fail('external singleton must not be disposed');}},SDK={_Default:external};
 const result=installMeshoptWorkerSupervisor(SDK,{decoderUrl:'x',createWorker:()=>assert.fail('no worker')});assert.equal(result.status,'external');assert.strictEqual(SDK._Default,external);assert.equal(recoverMeshoptWorkerPool(),false);assert.equal(inspectMeshoptWorkerPool().status,'external');
});
test('owned SDK adapter stays failure-latched until explicit initializer-style recovery',async t=>{
 const workers=[],timers=clock(),SDK={_Default:null},entry=installMeshoptWorkerSupervisor(SDK,{decoderUrl:'x',timers,createWorker:()=>{const worker=new FakeWorker();workers.push(worker);return worker;}});t.after(()=>entry.adapter.dispose());
 const first=SDK._Default.decodeGltfBufferAsync(input,1,4,'ATTRIBUTES','NONE').catch(e=>e);workers[0].emit('error');await first;await assert.rejects(SDK._Default.decodeGltfBufferAsync(input,1,4,'ATTRIBUTES','NONE'));assert.equal(workers.length,1);
 assert.equal(recoverMeshoptWorkerPool(),true);const second=SDK._Default.decodeGltfBufferAsync(input,1,4,'ATTRIBUTES','NONE');workers[1].ready();workers[1].complete();await second;assert.equal(inspectMeshoptWorkerPool().counts.completed,1);
});

test('actual initializeVillageMeshopt re-entry alone recovers the failed owned adapter, without automatic job replay',async t=>{
 const previous={location:globalThis.location,Worker:globalThis.Worker,default:MeshoptCompression._Default,configuration:MeshoptCompression.Configuration},workers=[];
 globalThis.location={href:'https://meshopt-supervisor-manual.test/game/'};globalThis.Worker=class extends FakeWorker{constructor(){super();workers.push(this);}};MeshoptCompression._Default=null;
 t.after(()=>{if(MeshoptCompression._Default!==previous.default)MeshoptCompression._Default?.dispose();MeshoptCompression._Default=previous.default;MeshoptCompression.Configuration=previous.configuration;globalThis.location=previous.location;globalThis.Worker=previous.Worker;});
 const config=JSON.parse(readFileSync(new URL('../public/assets/meshopt-decoder.json',import.meta.url),'utf8'));t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(config)));
 const {initializeVillageMeshopt}=await import('../src/village-meshopt.js?supervisor-manual-reentry');await initializeVillageMeshopt();const adapter=MeshoptCompression._Default;
 const first=adapter.decodeGltfBufferAsync(input,1,4,'ATTRIBUTES','NONE').catch(e=>e);workers[0].emit('message',{action:'init-error',message:'first attempt failed'});await first;await assert.rejects(adapter.decodeGltfBufferAsync(input,1,4,'ATTRIBUTES','NONE'));assert.equal(workers.length,1);
 await initializeVillageMeshopt();assert.strictEqual(MeshoptCompression._Default,adapter);const retry=adapter.decodeGltfBufferAsync(input,1,4,'ATTRIBUTES','NONE');workers[1].ready();workers[1].complete();await retry;assert.equal(workers.length,2);assert.equal(inspectMeshoptWorkerPool().counts.completed,1);assert.equal(inspectMeshoptWorkerPool().counts.recoveries,1);
});

test('actual pinned decoder in the owned worker produces byte-identical generated and shipped model views with no nested workers',async t=>{
 const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('meshopt-decoder.json',base),'utf8')),decoderSource=readFileSync(new URL(config.url,base),'utf8'),nodes=[],stats={nested:0};
 const bootstrap=`const{parentPort,workerData}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);globalThis.importScripts=url=>{if(url!==workerData.decoderUrl)throw Error('Unpinned import');(0,eval)(workerData.decoderSource);};globalThis.Worker=function(){throw Error('Nested worker forbidden');};(${meshoptWorkerMain})();parentPort.on('message',data=>self.onmessage({data}));`;
 function factory(){const worker=new NodeWorker(bootstrap,{eval:true,workerData:{decoderSource,decoderUrl:'https://pinned.test/meshopt.js'}}),events=new Map();nodes.push(worker);worker.on('message',data=>{for(const fn of events.get('message')??[])fn({data});});worker.on('error',error=>{for(const fn of events.get('error')??[])fn(error);});return {addEventListener(type,fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn);},removeEventListener:(type,fn)=>events.get(type)?.delete(fn),postMessage:(...args)=>worker.postMessage(...args),terminate:()=>worker.terminate()};}
 const pool=new MeshoptWorkerSupervisor({decoderUrl:'https://pinned.test/meshopt.js',createWorker:factory});t.after(async()=>{pool.dispose();for(const worker of nodes)await worker.terminate();});await MeshoptEncoder.ready;await MeshoptDecoder.ready;
 const original=Uint8Array.from({length:256},(_,i)=>(i*17)%255),encoded=MeshoptEncoder.encodeVertexBuffer(original,64,4);assert.deepEqual(await pool.decodeGltfBufferAsync(encoded,64,4,'ATTRIBUTES','NONE'),original);
 const village=JSON.parse(readFileSync(new URL('village.json',base),'utf8')),warrior=JSON.parse(readFileSync(new URL('warrior-v3.json',base),'utf8')),paths=[village.assets['house-01-cottage'].lods[0].model,village.assets['house-01-cottage'].lods[2].model,warrior.model];let views=0;
 for(const model of paths){const url=new URL(model,base),gltf=JSON.parse(readFileSync(url,'utf8')),buffers=gltf.buffers.map(b=>b.uri?readFileSync(new URL(b.uri,url)):null);
  for(const view of gltf.bufferViews.filter(v=>v.extensions?.EXT_meshopt_compression).slice(0,16)){const e=view.extensions.EXT_meshopt_compression,bytes=new Uint8Array(buffers[e.buffer].buffer,buffers[e.buffer].byteOffset+(e.byteOffset??0),e.byteLength),expected=new Uint8Array(e.count*e.byteStride);MeshoptDecoder.decodeGltfBuffer(expected,e.count,e.byteStride,bytes,e.mode,e.filter);assert.deepEqual(await pool.decodeGltfBufferAsync(bytes,e.count,e.byteStride,e.mode,e.filter),expected);views++;}
 }
 assert.equal(nodes.length,1);assert.equal(pool.inspect().counts.completed,views+1);assert.equal(stats.nested,0);
 const dir=new URL('../reports/map-transfer-root-cause-2026-11-02/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('meshopt-owned-worker-validation.json',dir),JSON.stringify({scope:'Actual pinned decoder worker body+WASM over Node WebWorker API adapter, no browser/device/GPU claim.',shippedModelViews:views,models:paths,generatedViewByteIdentical:true,allShippedViewsByteIdentical:true,physicalWorkersCreated:nodes.length,nestedWorkers:0,diagnostics:pool.inspect()},null,2));
});
