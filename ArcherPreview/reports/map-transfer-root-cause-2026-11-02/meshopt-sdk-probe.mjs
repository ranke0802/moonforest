import vm from 'node:vm';
import {Worker as NodeWorker} from 'node:worker_threads';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MeshoptEncoder} from 'meshoptimizer';
const sdkPath=new URL('../../node_modules/@babylonjs/core/Meshes/Compression/meshoptCompression.js',import.meta.url),manifest=JSON.parse(readFileSync(new URL('../../public/assets/meshopt-decoder.json',import.meta.url),'utf8'));
const decoderPath=new URL('../../public/assets/'+manifest.url,import.meta.url),sdk=readFileSync(sdkPath,'utf8'),decoder=readFileSync(decoderPath,'utf8');
await MeshoptEncoder.ready;const source=Uint8Array.from({length:64},(_,i)=>(i*7)%256),encoded=MeshoptEncoder.encodeVertexBuffer(source,16,4);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),digest=x=>createHash('sha256').update(x).digest('hex');
async function status(promise,ms=80){return Promise.race([Promise.resolve(promise).then(value=>({state:'resolved',bytes:Array.from(value)}),e=>({state:'rejected',message:e.message})),sleep(ms).then(()=>({state:'pending'}))]);}
async function until(check,timeout=2000){const start=performance.now();while(!check()){if(performance.now()-start>timeout)throw Error('Probe setup gate did not arrive');await sleep(3);}}

function fixture({loadFails=false,readyFails=false,workerMode='normal'}={}){
 const blobs=new Map(),workers=[],timers=new Map(),stats={scriptLoads:0,workerCreated:0,workerError:0,workerExit:0,decodeMessages:0,closeMessages:0,hardTerminate:0},gate=new Int32Array(new SharedArrayBuffer(8));let id=0;
 const bootstrap=`const{parentPort,workerData}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=(value,transfer)=>parentPort.postMessage(value,transfer);self.close=()=>parentPort.close();const gate=new Int32Array(workerData.gate);(0,eval)(workerData.source);parentPort.on('message',data=>{if(data.id){if(workerData.mode==='fatal')throw Error('injected Meshopt worker fatal');if(workerData.mode==='silent')return;if(Atomics.load(gate,0)===1){Atomics.store(gate,1,1);Atomics.wait(gate,0,1);}}self.onmessage({data});});`;
 class ProbeWorker{
  constructor(url){stats.workerCreated++;this.thread=new NodeWorker(bootstrap,{eval:true,workerData:{source:blobs.get(url),mode:workerMode,gate:gate.buffer}});workers.push(this);this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>{stats.workerError++;this.onerror?.({error,message:error.message});});this.thread.on('exit',()=>stats.workerExit++);}
  postMessage(data,transfer){if(data.id)stats.decodeMessages++;else stats.closeMessages++;this.thread.postMessage(data,transfer);}
  terminate(){stats.hardTerminate++;return this.thread.terminate();}
 }
 const wasm=readyFails?{validate:WebAssembly.validate,instantiate:()=>Promise.reject(Error('injected actual decoder WASM ready rejection'))}:WebAssembly;
 const context=vm.createContext({console,WebAssembly:wasm,Uint8Array,ArrayBuffer,Blob:class{constructor(parts){this.source=parts.join('');}},URL:{createObjectURL:b=>{const name='blob:probe-'+(++id);blobs.set(name,b.source);return name;},revokeObjectURL:u=>blobs.delete(u)},Worker:ProbeWorker,setTimeout:(callback,ms)=>{const n=++id;timers.set(n,{callback,ms});return n;},clearTimeout:n=>timers.delete(n)});
 context.Tools={_DefaultCdnUrl:'https://isolated.invalid',LoadBabylonScriptAsync:async()=>{stats.scriptLoads++;if(loadFails)throw Error('injected script fetch rejection');vm.runInContext(decoder,context,{filename:'actual-pinned-decoder.js'});}};
 vm.runInContext(sdk.replace(/^import .*;\r?\n/,'').replace('export class MeshoptCompression','class MeshoptCompression')+'\nglobalThis.MeshoptCompression=MeshoptCompression;',context,{filename:'actual-babylon9.31-meshoptCompression.js'});
 const api=context.MeshoptCompression;api.Configuration={decoder:{url:'https://isolated.invalid/pinned-decoder.js'}};
 return {api,context,stats,gate,timers,decode:()=>api.Default.decodeGltfBufferAsync(encoded,16,4,'ATTRIBUTES','NONE'),fireIdle:()=>{for(const[n,t]of [...timers])if(t.ms===1000){timers.delete(n);t.callback();}},cleanup:async()=>{Atomics.store(gate,0,0);Atomics.notify(gate,0);for(const w of workers)await w.thread.terminate();}};
}
const results={sdkSha256:digest(sdk),pinnedDecoderSha256:digest(decoder),manifest,scope:'Isolated VM executes actual SDK9.31logic and shipped Meshopt1.3.0 WASM/worker body; Nodeworker adapter only supplies WebWorker/Blob surface. Injected faults do not touch live app/global workers.'};
{
 const f=fixture({readyFails:true}),first=f.api.Default;const a=await status(f.decode()),b=await status(f.decode());results.wasmReadyReject={first:a,retry:b,sameDefault:f.api.Default===first,stats:{...f.stats},finding:'The shipped decoder ready rejection also remains cached in SDK singleton._decoderModulePromise.'};await f.cleanup();
}
{
 const f=fixture({loadFails:true}),first=f.api.Default;
 const a=await status(f.decode());const b=await status(f.decode());results.initReject={first:a,retry:b,sameDefault:f.api.Default===first,stats:{...f.stats},finding:'Rejected singleton initializer is reused; no new script request on manual decode retry.'};await f.cleanup();
}
{
 const f=fixture({workerMode:'fatal'}),a=f.decode();await until(()=>f.stats.workerError===1);const first=await status(a),second=await status(f.decode());results.fatalWorker={first,retry:second,stats:{...f.stats},finding:'Pinned worker owner registers only onmessage, not onerror/exit. Both old request and manual retry remain unresolved in the same dead worker.'};await f.cleanup();
}
{
 const f=fixture({workerMode:'silent'}),a=f.decode();await until(()=>f.stats.decodeMessages===1);const first=await status(a),second=await status(f.decode());results.silentWorker={first,retry:second,stats:{...f.stats},finding:'No decoder-job timeout or health reset; no response survives manual decode retry.'};await f.cleanup();
}
{
 const f=fixture();const first=await status(f.decode(),2000);if(first.state!=='resolved')throw Error('Real baseline decode did not resolve');
 Atomics.store(f.gate,0,1);const pending=f.decode();await until(()=>Atomics.load(f.gate,1)===1);f.fireIdle();const during={...f.stats};const newer=f.decode();await until(()=>f.stats.workerCreated===2);const overlapping={...f.stats};
 Atomics.store(f.gate,0,0);Atomics.notify(f.gate,0);const completed=await status(pending,2000),newCompleted=await status(newer,2000);results.idleWithPending={firstDecodedExactly:JSON.stringify(first.bytes)===JSON.stringify(Array.from(source)),afterIdleBeforeRelease:during,newRequestDuringOldClose:overlapping,pendingJob:completed,newerJob:newCompleted,decodedExactly:JSON.stringify(completed.bytes)===JSON.stringify(Array.from(source))&&JSON.stringify(newCompleted.bytes)===JSON.stringify(Array.from(source)),stats:{...f.stats},finding:'SDK idle timer can fire while a later request waits, but useWorkers(0) posts an empty close message AFTER queued decode. It does not call terminate and both requests complete exactly. A new request before the closing worker drains can temporarily create a second physical worker.'};await f.cleanup();
}
mkdirSync(new URL('./',import.meta.url),{recursive:true});writeFileSync(new URL('meshopt-sdk-probe.json',import.meta.url),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
