import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {AutoReleaseWorkerPool} from '@babylonjs/core/Misc/workerPool.js';
import {KhronosTextureContainer2 as Ktx} from '@babylonjs/core/Misc/khronosTextureContainer2.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const original=Ktx._WorkerPoolPromise,unhandled=[];
const onUnhandled=error=>unhandled.push(String(error?.message??error));
process.on('unhandledRejection',onUnhandled);
const engine={getCaps:()=>({astc:true,etc2:true})},container=Object.create(Ktx.prototype);container._engine=engine;
const cases=[];
try{
 const initialized=deferred();let attempts=0;
 const pool=new AutoReleaseWorkerPool(1,()=>{attempts++;return initialized.promise;});Ktx._WorkerPoolPromise=Promise.resolve(pool);
 let originalSettled=false,retrySettled=false;
 container._decodeAsync(new Uint8Array(32)).then(()=>originalSettled=true,()=>originalSettled=true);
 await tick();assert.equal(attempts,1);initialized.reject(new Error('controlled worker initialization/import failure'));
 await tick();await tick();
 container._decodeAsync(new Uint8Array(32)).then(()=>retrySettled=true,()=>retrySettled=true);
 await tick();
 assert.equal(originalSettled,false);assert.equal(retrySettled,false);assert.equal(pool._workerInfos.length,1);assert.equal(pool._workerInfos[0].idle,false);assert.equal(pool._pendingActions.length,1);assert.equal(attempts,1);
 cases.push({case:'SDK worker initialization rejects',initialDecodeSettled:originalSettled,explicitRetrySettled:retrySettled,workerCreates:attempts,workerSlots:pool._workerInfos.length,workerIdle:pool._workerInfos[0].idle,queuedActions:pool._pendingActions.length,unhandledRejections:[...unhandled],verdict:'CONFIRMED: caller deadlines alone cannot recover the poisoned pool.'});
 pool.dispose();await tick();await tick();
 class WorkerBoundary extends EventTarget{constructor(){super();this.dead=false;this.posts=[];this.terminations=0;}postMessage(value){this.posts.push(value.action);if(this.dead)return;}terminate(){this.dead=true;this.terminations++;}}
 const worker=new WorkerBoundary();let creates=0;const healthy=new AutoReleaseWorkerPool(1,async()=>{creates++;return worker;});Ktx._WorkerPoolPromise=Promise.resolve(healthy);
 let firstError=null,secondSettled=false;
 container._decodeAsync(new Uint8Array(32)).catch(error=>{firstError=error.type;});await tick();worker.dead=true;worker.dispatchEvent(new Event('error'));await tick();assert.equal(firstError,'error');assert.equal(healthy._workerInfos[0].idle,true);
 container._decodeAsync(new Uint8Array(32)).then(()=>secondSettled=true,()=>secondSettled=true);await tick();
 assert.equal(creates,1);assert.equal(secondSettled,false);assert.equal(healthy._workerInfos[0].idle,false);
 cases.push({case:'SDK returns a worker that emitted error to idle pool',firstDecodeRejected:true,errorWorkerReused:creates===1,explicitRetrySettled:secondSettled,workerCreates:creates,posts:worker.posts,verdict:'CONFIRMED under injected fatal/no-response worker boundary: SDK has no replacement/health recovery.'});
 healthy.dispose();await tick();
}finally{Ktx._WorkerPoolPromise=original;await tick();process.removeListener('unhandledRejection',onUnhandled);}
const output={head:'1f881ac',mode:'READ_ONLY_SOURCE',sdk:'Babylon.js installed 9.31.0',cases,limitations:['No browser, real worker process, KTX transcode or GPU ran. Real installed SDK _decodeAsync and AutoReleaseWorkerPool exercised against controlled worker IPC/initialization boundaries.','These are deterministic reachable failure mechanisms. Whether the user device hit one requires actual failure-stage/decoder logs.'],runtimeSourceChanges:0};
mkdirSync(new URL('.',import.meta.url),{recursive:true});writeFileSync(new URL('ktx-pool-readonly.json',import.meta.url),JSON.stringify(output,null,2)+'\n');process.stdout.write(JSON.stringify(output,null,2));
