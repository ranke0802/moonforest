import {runtimeTimers} from './runtime-timers.js';
const installations=new WeakMap();let diagnostics={status:'uninitialized'};
const failure=(message,code,stage,extra={})=>Object.assign(new Error(message),{code,meshoptStage:stage,...extra});
const copyError=error=>Object.assign(new Error(error.message),{name:error.name,code:error.code,meshoptStage:error.meshoptStage,timeoutMs:error.timeoutMs,detail:error.detail});

// The shipped decoder runs synchronously INSIDE this one owned worker. Its own
// useWorkers pool remains0; no Babylon singleton init promise or nested worker
// queue can retain a rejected/unanswered task across the user's explicit retry.
export function meshoptWorkerMain(){
 let decoder;
 self.onmessage=event=>{
  const data=event.data;
  if(data.action==='init'){
   Promise.resolve().then(()=>{importScripts(data.url);const value=self.MeshoptDecoder;if(!value?.supported)throw Error('Meshopt WASM is unavailable');return value.ready.then(()=>{value.useWorkers(0);decoder=value;});}).then(()=>self.postMessage({action:'ready'}),error=>self.postMessage({action:'init-error',message:String(error?.message??error)}));
  }else if(data.action==='decode'){
   try{if(!decoder)throw Error('Meshopt decoder is not ready');const value=new Uint8Array(data.count*data.stride);decoder.decodeGltfBuffer(value,data.count,data.stride,data.source,data.mode,data.filter);self.postMessage({action:'decoded',id:data.id,value},[value.buffer]);}
   catch(error){self.postMessage({action:'decode-error',id:data.id,message:String(error?.message??error)});}
  }
 };
}

// No engine/scene/texture references or caller AbortSignals are retained. A map
// may stop awaiting its result, but cannot cancel another map's shared healthy
// decode. Only this worker's own fault/deadline, idle or explicit dispose ends it.
export class MeshoptWorkerSupervisor{
 constructor({createWorker,decoderUrl,timeoutMs=45000,queueTimeoutMs=45000,initTimeoutMs=45000,decodeTimeoutMs=45000,idleMs=1000,timers={}}){
  Object.assign(this,{createWorker,decoderUrl,timeoutMs,queueTimeoutMs,initTimeoutMs,decodeTimeoutMs,idleMs});const clock=runtimeTimers(timers);this.now=clock.now;this.schedule=clock.setTimeout;this.unschedule=clock.clearTimeout;
  this.queue=[];this.active=null;this.lease=null;this.failed=null;this.disposed=false;this.sequence=0;
  this.counts={created:0,terminated:0,completed:0,failed:0,recoveries:0,workerFaults:0};
 }
 times(job){const now=this.now();return {queueMs:Math.max(0,(job.startedAt??now)-job.queuedAt),initMs:job.initAt==null?0:Math.max(0,(job.decodeAt??job.endedAt??now)-job.initAt),decodeMs:job.decodeAt==null?0:Math.max(0,(job.endedAt??now)-job.decodeAt),totalMs:Math.max(0,(job.endedAt??now)-job.queuedAt)};}
 decodeGltfBufferAsync(source,count,stride,mode,filter){
  if(this.disposed)return Promise.reject(failure('모델 디코더가 종료되었습니다.','MESHOPT_DISPOSED','queue'));
  if(this.failed)return Promise.reject(copyError(this.failed));
  if(!ArrayBuffer.isView(source)||!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(stride)||stride<=0||!Number.isSafeInteger(count*stride))return Promise.reject(failure('모델 압축 자료가 올바르지 않습니다.','MESHOPT_ARGUMENTS','queue'));
  return new Promise((resolve,reject)=>{
   const job={id:++this.sequence,source,count,stride,mode,filter,bytes:source.byteLength,queuedAt:this.now(),stage:'queue',resolve,reject,done:false};this.queue.push(job);
   job.queueTimer=this.schedule(()=>{if(job.stage==='queue'&&this.queue.includes(job))this.finish(job,failure('모델 디코더 대기 시간이 초과되었습니다.','MESHOPT_QUEUE_TIMEOUT','queue',{name:'TimeoutError',timeoutMs:this.queueTimeoutMs}));},this.queueTimeoutMs);
   // Queue/init/decode have separate diagnostics, but phase changes never
   // renew the enclosing45s budget. A legitimate slower job is failed too.
   job.totalTimer=this.schedule(()=>{if(job.done)return;const error=failure('모델 디코더 전체 준비 시간이 초과되었습니다.','MESHOPT_JOB_TIMEOUT',job.stage,{name:'TimeoutError',timeoutMs:this.timeoutMs});if(this.active===job)this.fail(error);else this.finish(job,error);},this.timeoutMs);this.pump();
  });
 }
 finish(job,error,value){
  if(job.done)return;job.done=true;job.endedAt=this.now();this.unschedule(job.queueTimer);this.unschedule(job.phaseTimer);this.unschedule(job.totalTimer);const index=this.queue.indexOf(job);if(index>=0)this.queue.splice(index,1);if(this.active===job)this.active=null;
  const record={id:job.id,stage:job.stage,bytes:job.bytes,...this.times(job)};job.source=null;
  if(error){this.counts.failed++;if(!this.failed)this.lastFailure={...record,name:error.name,code:error.code,meshoptStage:error.meshoptStage,message:String(error.message).slice(0,240)};job.reject(error);}else{this.counts.completed++;this.lastCompleted=record;job.resolve(value);}
  this.schedulePump();
 }
 schedulePump(){if(this.pumpQueued)return;this.pumpQueued=true;queueMicrotask(()=>{this.pumpQueued=false;this.pump();});}
 retire(){
  if(this.idleTimer!==undefined){this.unschedule(this.idleTimer);this.idleTimer=undefined;}
  const lease=this.lease;this.lease=null;if(!lease)return;
  for(const[type,fn]of lease.listeners)lease.worker.removeEventListener(type,fn);
  try{lease.worker.terminate();}catch(error){this.lastTerminationError=String(error?.message??error).slice(0,160);}this.counts.terminated++;
 }
 fail(error){
  if(this.failed||this.disposed)return;const job=this.active;
  // Keep the triggering stage/job, rather than overwriting it as each queued
  // waiter is rejected with the same shared worker failure.
  this.lastFailure={...(job?{id:job.id,bytes:job.bytes,...this.times(job)}:{}),stage:error.meshoptStage,name:error.name,code:error.code,detail:error.detail,message:String(error.message).slice(0,240)};
  this.failed=error;this.counts.workerFaults++;this.retire();
  if(this.active)this.finish(this.active,copyError(error));for(const job of [...this.queue])this.finish(job,copyError(error));
 }
 arm(job,stage,ms){job.stage=stage;this.unschedule(job.phaseTimer);job.phaseTimer=this.schedule(()=>{if(this.active===job&&job.stage===stage)this.fail(failure('모델 디코더 응답 시간이 초과되었습니다.','MESHOPT_WORKER_TIMEOUT',stage,{name:'TimeoutError',timeoutMs:ms}));},ms);}
 pump(){
  if(this.active||this.failed||this.disposed)return;
  const job=this.queue.shift();if(!job){if(this.lease&&this.idleTimer===undefined)this.idleTimer=this.schedule(()=>{this.idleTimer=undefined;if(!this.active&&!this.queue.length)this.retire();},this.idleMs);return;}
  this.unschedule(job.queueTimer);this.active=job;job.startedAt=this.now();if(this.idleTimer!==undefined){this.unschedule(this.idleTimer);this.idleTimer=undefined;}
  if(this.lease?.ready){this.send(job);return;}
  job.initAt=this.now();this.arm(job,'worker-init',this.initTimeoutMs);let lease;
  try{
   lease={worker:this.createWorker(),ready:false,listeners:[]};this.lease=lease;this.counts.created++;
   const health=event=>{if(this.lease!==lease)return;event.preventDefault?.();this.fail(failure('모델 디코더 작업자가 중단되었습니다.','MESHOPT_WORKER_ERROR',this.active?.stage??'idle',{detail:String(event.message??event.type??event).slice(0,160)}));};
   const message=event=>{
    if(this.lease!==lease)return;const data=event.data;
    if(data?.action==='ready'&&!lease.ready){lease.ready=true;if(this.active===job&&!job.done)this.send(job);return;}
    if(data?.action==='init-error'){this.fail(failure('모델 디코더 초기화에 실패했습니다.','MESHOPT_WORKER_INIT','worker-init',{detail:String(data.message).slice(0,160)}));return;}
    const current=this.active;if(!current||data?.id!==current.id)return;
    if(data.action==='decode-error'){this.fail(failure('모델 압축 해제에 실패했습니다.','MESHOPT_DECODE_ERROR','decode',{detail:String(data.message).slice(0,160)}));return;}
    if(data.action==='decoded'){
     if(!(data.value instanceof Uint8Array)||data.value.byteLength!==current.count*current.stride){this.fail(failure('모델 디코더 응답이 올바르지 않습니다.','MESHOPT_WORKER_RESPONSE','decode'));return;}
     this.finish(current,null,data.value);
    }
   };
   lease.listeners=[['message',message],['error',health],['messageerror',health]];for(const[type,fn]of lease.listeners)lease.worker.addEventListener(type,fn);
   lease.worker.postMessage({action:'init',url:this.decoderUrl});
  }catch(error){this.fail(failure('모델 디코더를 시작하지 못했습니다.','MESHOPT_WORKER_CREATE','worker-init',{detail:String(error?.message??error).slice(0,160)}));}
 }
 send(job){
  if(this.active!==job||job.done||!this.lease)return;job.decodeAt=this.now();this.arm(job,'decode',this.decodeTimeoutMs);
  try{const source=new Uint8Array(job.source.byteLength);source.set(new Uint8Array(job.source.buffer,job.source.byteOffset,job.source.byteLength));this.lease.worker.postMessage({action:'decode',id:job.id,source,count:job.count,stride:job.stride,mode:job.mode,filter:job.filter},[source.buffer]);job.source=null;}
  catch(error){this.fail(failure('모델 디코더로 자료를 전달하지 못했습니다.','MESHOPT_WORKER_POST','decode',{detail:String(error?.message??error).slice(0,160)}));}
 }
 recover(){if(this.disposed||!this.failed)return false;this.failed=null;this.counts.recoveries++;return true;}
 inspect(){return {status:this.disposed?'disposed':this.failed?'failed':this.active?.stage??(this.lease?'idle':'ready'),maxWorkers:1,totalAwaitTimeoutMs:this.timeoutMs,queueTimeoutMs:this.queueTimeoutMs,initTimeoutMs:this.initTimeoutMs,decodeTimeoutMs:this.decodeTimeoutMs,idleReleaseMs:this.idleMs,queued:this.queue.length,active:this.active?{id:this.active.id,stage:this.active.stage,bytes:this.active.bytes,...this.times(this.active)}:null,counts:{...this.counts},lastFailure:this.lastFailure?{...this.lastFailure}:null,lastCompleted:this.lastCompleted?{...this.lastCompleted}:null};}
 dispose(){if(this.disposed)return;this.disposed=true;this.retire();const error=failure('모델 디코더가 종료되었습니다.','MESHOPT_DISPOSED','dispose');if(this.active)this.finish(this.active,error);for(const job of [...this.queue])this.finish(job,error);this.releaseFactory?.();}
}

export function installMeshoptWorkerSupervisor(Meshopt,{decoderUrl,WorkerClass=globalThis.Worker,createWorker,timers,timeoutMs,queueTimeoutMs,initTimeoutMs,decodeTimeoutMs,idleMs}={}){
 const current=installations.get(Meshopt);
 if(current&&Meshopt._Default===current.adapter&&!current.pool.disposed){diagnostics=current;return current;}
 // Never dispose/reset somebody else's healthy SDK singleton or shared jobs.
 if(Meshopt._Default){diagnostics={status:'external',code:'MESHOPT_EXTERNAL_DEFAULT_PRESERVED'};return diagnostics;}
 if(!createWorker&&typeof WorkerClass!=='function'){diagnostics={status:'workerless'};return diagnostics;}
 let blobUrl;const factory=createWorker??(()=>{blobUrl??=URL.createObjectURL(new Blob([`(${meshoptWorkerMain})()`],{type:'application/javascript'}));return new WorkerClass(blobUrl);});
 const pool=new MeshoptWorkerSupervisor({createWorker:factory,decoderUrl,timers,timeoutMs,queueTimeoutMs,initTimeoutMs,decodeTimeoutMs,idleMs});pool.releaseFactory=()=>{if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=undefined;}};
 const adapter={decodeGltfBufferAsync:(...args)=>pool.decodeGltfBufferAsync(...args),dispose:()=>{pool.dispose();if(Meshopt._Default===adapter)Meshopt._Default=null;installations.delete(Meshopt);}};
 const installed={status:'installed',pool,adapter,owner:Meshopt};Meshopt._Default=adapter;installations.set(Meshopt,installed);diagnostics=installed;return installed;
}
// Only called by an explicit initializeVillageMeshopt re-entry. No failed job
// is silently retried, and map cancellation never calls this or pool.dispose.
export function recoverMeshoptWorkerPool(){return diagnostics.pool&&diagnostics.owner?._Default===diagnostics.adapter?diagnostics.pool.recover():false;}
export function inspectMeshoptWorkerPool(){return diagnostics.pool?.inspect()??{...diagnostics};}
