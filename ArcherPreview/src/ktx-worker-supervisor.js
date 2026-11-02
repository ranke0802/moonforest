import {applyConfig,workerFunction,initializeWebWorker} from '@babylonjs/core/Misc/khronosTextureContainer2Worker.js';
import {watchMapTextureRelease} from './map-texture-lifetime.js';
import {mapLoadAbortError} from './map-load-lifetime.js';
import {runtimeTimers} from './runtime-timers.js';

const ownerKey=Symbol('map KTX owner'),installations=new WeakMap();let diagnostics={status:'uninitialized'};
const resultKeys=['transcodedFormat','isInGammaSpace','hasAlpha','transcoderName'];
const errorFor=(message,code,stage,extra={})=>Object.assign(new Error(message),{code,ktxStage:stage,...extra});
const copyError=error=>Object.assign(new Error(error.message),{name:error.name,code:error.code,ktxStage:error.ktxStage,timeoutMs:error.timeoutMs});

// One worker, with explicit job ownership. SDK worker code, transcoders,
// messages, caps, options and decoded blocks are used without conversion.
export class KtxWorkerSupervisor {
  constructor({createWorker,initialize=initializeWebWorker,urls,timeoutMs=45000,idleMs=1000,timers={}}){
    Object.assign(this,{createWorker,initialize,urls,timeoutMs,idleMs});const clock=runtimeTimers(timers);this.now=clock.now;this.schedule=clock.setTimeout;this.unschedule=clock.clearTimeout;
    this.queue=[];this.active=null;this.lease=null;this.sequence=0;this.epoch=0;this.failed=null;this.disposed=false;
    this.counts={created:0,terminated:0,completed:0,failed:0,cancelled:0,recoveries:0,workerFaults:0};this.lastFailure=null;this.lastCompleted=null;
  }
  times(job){const now=this.now();return {queuedMs:Math.max(0,(job.startedAt??now)-job.queuedAt),initMs:job.initAt==null?0:Math.max(0,(job.decodeAt??now)-job.initAt),activeDecodeMs:job.decodeAt==null?0:Math.max(0,now-job.decodeAt),totalMs:Math.max(0,now-job.queuedAt)};}
  decode(data,caps,options,defaults,{owner,engine,transfer=false}={}){
    if(this.disposed)return Promise.reject(mapLoadAbortError());if(this.failed)return Promise.reject(copyError(this.failed));
    return new Promise((resolve,reject)=>{
      const job={id:++this.sequence,data,caps,options,defaults,resolve,reject,owner,engine,transfer,bytes:data.byteLength,stage:'queue',queuedAt:this.now(),done:false};
      this.queue.push(job);
      job.timer=this.schedule(()=>{
        const error=errorFor('텍스처 디코더 응답 시간이 초과되었습니다. 다시 시도해 주세요.','KTX_WORKER_TIMEOUT',job.stage,{name:'TimeoutError',timeoutMs:this.timeoutMs});
        if(this.active===job)this.fail(error);else this.finish(job,error);
      },this.timeoutMs);
      job.unwatch=watchMapTextureRelease(owner,()=>this.cancel(job));
      if(job.done)return;
      if(engine?.onDisposeObservable)job.engineObserver=engine.onDisposeObservable.addOnce(()=>this.cancel(job));
      if(engine?.isDisposed)this.cancel(job);this.pump();
    });
  }
  finish(job,error,value){
    if(job.done)return;job.done=true;this.unschedule(job.timer);job.unwatch?.();if(job.engineObserver)job.engine.onDisposeObservable.remove(job.engineObserver);
    const index=this.queue.indexOf(job);if(index>=0)this.queue.splice(index,1);if(this.active===job)this.active=null;
    const record={id:job.id,stage:job.stage,bytes:job.bytes,...this.times(job)};
    job.data=null;job.owner=null;job.engine=null;job.options=null;job.defaults=null;
    if(error){if(error.name==='AbortError')this.counts.cancelled++;else{this.counts.failed++;this.lastFailure={...record,name:error.name,code:error.code??'KTX_DECODE_ERROR',message:String(error.message??error).slice(0,240)};}job.reject(error);}
    else{this.counts.completed++;this.lastCompleted=record;job.resolve(value);}
  }
  detach(lease){if(!lease)return;for(const [type,fn]of lease.listeners??[])lease.worker.removeEventListener(type,fn);lease.listeners=[];}
  retire(){const lease=this.lease;this.lease=null;if(this.idleTimer!==undefined){this.unschedule(this.idleTimer);this.idleTimer=undefined;}if(lease){this.detach(lease);for(const [type,fn]of [...lease.health??[],...lease.initListeners??[]])lease.worker.removeEventListener(type,fn);lease.initListeners=[];try{lease.worker.terminate();}catch(error){this.lastTerminationError=String(error?.message??error).slice(0,160);}this.counts.terminated++;}}
  schedulePump(){if(this.pumpQueued)return;this.pumpQueued=true;queueMicrotask(()=>{this.pumpQueued=false;this.pump();});}
  cancel(job){if(job.done)return;if(this.active===job)this.retire();this.finish(job,mapLoadAbortError());this.schedulePump();}
  fail(error){
    if(this.failed||this.disposed)return;
    const rootFailure={...(this.active?{id:this.active.id,bytes:this.active.bytes,...this.times(this.active)}:{}),stage:error.ktxStage,name:error.name,code:error.code,message:String(error.message).slice(0,240),detail:error.detail??null,recovered:false};
    this.failed=error;this.counts.workerFaults++;this.retire();if(this.active)this.finish(this.active,copyError(error));for(const job of [...this.queue])this.finish(job,copyError(error));this.lastFailure=rootFailure;
  }
  pump(){
    if(this.pumpQueued||this.active||this.failed||this.disposed)return;
    const job=this.queue.shift();if(!job){if(this.lease&&this.idleTimer===undefined)this.idleTimer=this.schedule(()=>{this.idleTimer=undefined;if(!this.active&&!this.queue.length)this.retire();},this.idleMs);return;}
    this.active=job;job.startedAt=this.now();if(this.idleTimer!==undefined){this.unschedule(this.idleTimer);this.idleTimer=undefined;}
    if(this.lease?.ready){this.send(job,this.lease);return;}
    job.stage='worker-init';job.initAt=this.now();let lease;
    try{lease={worker:this.createWorker(),epoch:++this.epoch,ready:false,listeners:[],initListeners:[]};this.lease=lease;this.counts.created++;
      const health=event=>{if(this.lease!==lease)return;const stage=this.active?.stage??'idle';this.fail(errorFor('텍스처 디코더 작업자가 중단되었습니다.',stage==='worker-init'?'KTX_WORKER_INIT':'KTX_WORKER_ERROR',stage,{detail:String(event.message??event.type??event).slice(0,160)}));};
      lease.health=[['error',health],['messageerror',health]];for(const [type,fn]of lease.health)lease.worker.addEventListener(type,fn);
    }
    catch(error){this.fail(errorFor('텍스처 디코더를 시작하지 못했습니다.','KTX_WORKER_CREATE','worker-init',{detail:String(error?.message??error).slice(0,160)}));return;}
    const endpoint={addEventListener:(type,fn)=>{lease.initListeners.push([type,fn]);lease.worker.addEventListener(type,fn);},removeEventListener:(type,fn)=>{lease.initListeners=lease.initListeners.filter(v=>v[0]!==type||v[1]!==fn);lease.worker.removeEventListener(type,fn);},postMessage:(...args)=>lease.worker.postMessage(...args)};
    // Cancelling a lease removes our exact SDK init listeners and terminates
    // its worker. An SDK init promise with no response may remain physically
    // unresolved, but no job/queue slot waits for it and stale completion is inert.
    Promise.resolve().then(()=>{if(this.lease===lease&&this.active===job&&!job.done)return this.initialize(endpoint,undefined,this.urls);}).then(()=>{
      if(this.lease!==lease||this.active!==job||job.done)return;lease.ready=true;this.send(job,lease);
    },error=>{if(this.lease===lease&&!job.done)this.fail(errorFor('텍스처 디코더 초기화에 실패했습니다.','KTX_WORKER_INIT','worker-init',{detail:String(error?.message??error).slice(0,160)}));});
  }
  send(job,lease){
    job.stage='decode';job.decodeAt=this.now();
    const finish=(error,value)=>{if(this.lease!==lease||this.active!==job||job.done)return;this.detach(lease);this.finish(job,error,value);this.pump();};
    const message=event=>{if(event.data?.action!=='decoded')return;if(event.data.success)finish(null,event.data.decodedData);else finish(errorFor(String(event.data.msg??'텍스처 변환에 실패했습니다.'),'KTX_TRANSCODE_ERROR','decode'));};
    lease.worker.addEventListener('message',message);lease.listeners.push(['message',message]);
    try{
      lease.worker.postMessage({action:'setDefaultDecoderOptions',options:job.defaults});
      const bytes=job.transfer?job.data:new Uint8Array(job.data.byteLength);if(!job.transfer)bytes.set(new Uint8Array(job.data.buffer,job.data.byteOffset,job.data.byteLength));
      lease.worker.postMessage({action:'decode',data:bytes,caps:job.caps,options:job.options},[bytes.buffer]);job.data=null;
    }catch(error){this.fail(errorFor('텍스처 디코더로 자료를 전달하지 못했습니다.','KTX_WORKER_POST','decode',{detail:String(error?.message??error).slice(0,160)}));}
  }
  // Public Babylon WorkerPool bridge, for a retained native _decodeAsync caller.
  // Main application calls decode directly and allocates the copy only at send.
  push(action){
    const listeners=new Map();let defaults;
    const emit=(type,value)=>{for(const fn of [...(listeners.get(type)??[])])fn(value);};
    const worker={addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),postMessage:message=>{
      if(message.action==='setDefaultDecoderOptions'){defaults=message.options;return;}
      if(message.action==='decode')this.decode(message.data,message.caps,message.options,defaults,{transfer:true}).then(decodedData=>emit('message',{data:{action:'decoded',success:true,decodedData}}),error=>emit('error',error));
    }};
    try{action(worker,()=>listeners.clear());}catch(error){emit('error',error);}
  }
  recover(){if(this.disposed||!this.failed)return false;this.failed=null;this.counts.recoveries++;if(this.lastFailure)this.lastFailure={...this.lastFailure,recovered:true,recoveredAtMs:this.now()};return true;}
  inspect(){return {status:this.disposed?'disposed':this.failed?'failed':this.active?.stage??(this.lease?'idle':'ready'),maxWorkers:1,totalAwaitTimeoutMs:this.timeoutMs,idleReleaseMs:this.idleMs,queued:this.queue.length,active:this.active?{id:this.active.id,stage:this.active.stage,bytes:this.active.bytes,...this.times(this.active)}:null,counts:{...this.counts},lastFailure:this.lastFailure?{...this.lastFailure}:null,lastCompleted:this.lastCompleted?{...this.lastCompleted}:null};}
  dispose(){if(this.disposed)return;this.disposed=true;this.retire();if(this.active)this.finish(this.active,mapLoadAbortError());for(const job of [...this.queue])this.finish(job,mapLoadAbortError());this.releaseFactory?.();}
}

export function installKtxWorkerSupervisor(Ktx,{urls,WorkerClass=globalThis.Worker,createWorker,timers,timeoutMs,idleMs}={}){
  const existing=installations.get(Ktx);if(existing){diagnostics=existing;return existing;}
  if(typeof WorkerClass!=='function'&&!createWorker){diagnostics={status:'workerless'};return diagnostics;}
  if(Ktx.WorkerPool||Ktx._WorkerPoolPromise||Ktx._DecoderModulePromise){diagnostics={status:'external-pool',code:'KTX_EXTERNAL_POOL_PRESERVED'};return diagnostics;}
  let blobUrl;
  const factory=createWorker??(()=>{blobUrl??=URL.createObjectURL(new Blob([`${applyConfig}(${workerFunction})()`],{type:'application/javascript'}));return new WorkerClass(blobUrl);});
  const pool=new KtxWorkerSupervisor({createWorker:factory,urls,timers,timeoutMs,idleMs});pool.releaseFactory=()=>{if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=undefined;}};
  const decode=Ktx.prototype._decodeAsync,upload=Ktx.prototype._uploadAsync;
  Ktx.WorkerPool=pool;
  Ktx.prototype._decodeAsync=function(data,options){
    const caps=this._engine.getCaps(),format=Object.fromEntries(['astc','bptc','s3tc','pvrtc','etc2','etc1'].map(key=>[key,!!caps[key]]));
    return pool.decode(data,format,options?Object.fromEntries(Object.entries(options)):undefined,Ktx.DefaultDecoderOptions._getKTX2DecoderOptions(),{owner:options?.[ownerKey],engine:this._engine});
  };
  Ktx.prototype._uploadAsync=function(data,internal,options){
    const scoped={...options};Object.defineProperty(scoped,ownerKey,{value:internal});
    return upload.call(this,data,internal,scoped).then(value=>{if(options)for(const key of resultKeys)if(Object.hasOwn(scoped,key))options[key]=scoped[key];return value;});
  };
  const installed={status:'installed',pool,nativeDecode:decode};installations.set(Ktx,installed);diagnostics=installed;return installed;
}
export function recoverKtxWorkerPool(){return diagnostics.pool?.recover()??false;}
export function inspectKtxWorkerPool(){return diagnostics.pool?.inspect()??{...diagnostics};}
