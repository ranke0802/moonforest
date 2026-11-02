import test from 'node:test';
import assert from 'node:assert/strict';
import {MapLoadLifetime} from '../src/map-load-lifetime.js';
import {KtxWorkerSupervisor} from '../src/ktx-worker-supervisor.js';
import {MeshoptWorkerSupervisor} from '../src/meshopt-worker-supervisor.js';
import {runtimeTimers} from '../src/runtime-timers.js';

const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function browserClock(t){
 let time=0,id=0,sets=0,clears=0;const jobs=new Map();
 t.mock.method(globalThis,'setTimeout',function(fn,delay){if(this!==globalThis)throw TypeError('Illegal invocation');sets++;jobs.set(++id,{fn,at:time+delay});return id;});
 t.mock.method(globalThis,'clearTimeout',function(key){if(this!==globalThis)throw TypeError('Illegal invocation');clears++;jobs.delete(key);});
 t.mock.method(performance,'now',function(){assert.equal(this,performance);return time;});
 return {get size(){return jobs.size;},get sets(){return sets;},get clears(){return clears;},advance(ms){const until=time+ms;for(;;){const next=[...jobs].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;jobs.delete(next[0]);next[1].fn();}time=until;}};
}
class Worker{
 constructor(kind){this.kind=kind;this.listeners=new Map();this.terminated=false;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(data){for(const fn of [...this.listeners.get('message')??[]])fn({data});}
 postMessage(data){if(data.action==='init')queueMicrotask(()=>this.emit({action:this.kind==='ktx'?'init':'ready'}));if(data.action==='decode')this.job=data;}
 complete(){this.emit(this.kind==='ktx'?{action:'decoded',success:true,decodedData:{mipmaps:[]}}:{action:'decoded',id:this.job.id,value:new Uint8Array(this.job.count*this.job.stride)});}
 terminate(){this.terminated=true;}
}

test('browser-branded default timers preserve host receiver through construction renewal timeout and cleanup',async t=>{
 const clock=browserClock(t),old={scheduleTimer:globalThis.setTimeout};assert.throws(()=>old.scheduleTimer(()=>{},1),/Illegal invocation/);
 const one=new MapLoadLifetime();assert.equal(await one.run(()=>42),42);one.renew('next');one.close();assert.equal(clock.size,0);
 const timed=new MapLoadLifetime({timeoutMs:45}),failure=timed.wait(new Promise(()=>{})).catch(e=>e);clock.advance(45);assert.equal((await failure).code,'MAP_MODEL_TIMEOUT');timed.close();assert.equal(clock.size,0);
 const abort=new AbortController(),cancelled=new MapLoadLifetime({signal:abort.signal}),pending=cancelled.wait(new Promise(()=>{})).catch(e=>e);abort.abort();assert.equal((await pending).name,'AbortError');cancelled.close();assert.equal(clock.size,0);assert.ok(clock.sets>=4&&clock.clears>=4);
});

for(const kind of ['ktx','meshopt'])test(`${kind} default browser timers survive normal completion timeout manual recovery and idle disposal`,async t=>{
 const clock=browserClock(t),workers=[],createWorker=()=>{const worker=new Worker(kind);workers.push(worker);return worker;};
 const pool=kind==='ktx'?new KtxWorkerSupervisor({createWorker,urls:{}}):new MeshoptWorkerSupervisor({createWorker,decoderUrl:'https://pinned.test/decoder.js'});
 const submit=()=>kind==='ktx'?pool.decode(new Uint8Array(4),{},{}):pool.decodeGltfBufferAsync(new Uint8Array(4),1,4,'ATTRIBUTES','NONE');
 const normal=submit();await flush();workers.at(-1).complete();await normal;await flush();clock.advance(1000);assert.equal(clock.size,0);assert.equal(workers.at(-1).terminated,true);
 const failure=submit().catch(e=>e);await flush();clock.advance(45000);assert.equal((await failure).name,'TimeoutError');assert.equal(pool.inspect().status,'failed');assert.equal(clock.size,0);assert.equal(pool.recover(),true);
 const retry=submit();await flush();workers.at(-1).complete();await retry;await flush();pool.dispose();await flush();assert.equal(clock.size,0);assert.equal(pool.inspect().queued,0);assert.equal(pool.inspect().active,null);assert.ok(workers.every(w=>w.terminated));
});

test('injected clock methods keep their own receiver instead of the runtime instance',()=>{
 const source={value:9,now(){assert.equal(this,source);return this.value;},setTimeout(fn,ms){assert.equal(this,source);this.job={fn,ms};return 7;},clearTimeout(id){assert.equal(this,source);assert.equal(id,7);this.job=null;}};
 const wrapped=runtimeTimers(source),owner={...wrapped};assert.equal(owner.now(),9);const id=owner.setTimeout(()=>{},15);assert.equal(source.job.ms,15);owner.clearTimeout(id);assert.equal(source.job,null);
});
