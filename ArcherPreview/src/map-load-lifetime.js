export const MAP_MODEL_TIMEOUT_MS=45000;
export const mapLoadAbortError=()=>Object.assign(new Error('맵 모델 준비가 취소되었습니다.'),{name:'AbortError',code:'MAP_MODEL_ABORTED'});
export const mapLoadTimeoutError=(timeoutMs,stage='model')=>Object.assign(new Error(`리소스 준비 시간이 초과되었습니다 (${Math.round(timeoutMs/1000)}초). 다시 시도해 주세요.`),{name:'TimeoutError',code:stage==='model'?'MAP_MODEL_TIMEOUT':'MAP_SETUP_TIMEOUT',timeoutMs,stage});

const identityKeys=['scene','terrain','ground','floorMaterial','placements','environmentManifest','groundManifest','mapId','villageLoadOwner'];
export const mapLoadSnapshot=(world,{loadOwner=true}={})=>Object.fromEntries(identityKeys.filter(key=>loadOwner||key!=='villageLoadOwner').map(key=>[key,world[key]]));
export function checkMapLoadSnapshot(world,snapshot,lifetime){
  if(snapshot.scene?.isDisposed||Object.keys(snapshot).some(key=>world[key]!==snapshot[key]))lifetime.abort(mapLoadAbortError());
  lifetime.check();
}

// A logical deadline, not a synchronous WASM/driver interrupt. Every abandoned
// promise still has rejection/late-result handlers, but its owner can stop now.
export class MapLoadLifetime {
  constructor({signal,timeoutMs=MAP_MODEL_TIMEOUT_MS,timers={},stage='model'}={}){
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new RangeError('Invalid map model timeout');
    this.timeoutMs=timeoutMs;this.stage=stage;this.controller=new AbortController();this.signal=this.controller.signal;
    this.now=timers.now??(()=>performance.now());this.cancelTimer=timers.clearTimeout??clearTimeout;this.scheduleTimer=timers.setTimeout??setTimeout;
    this.started=this.now();this.parent=signal;this.forward=()=>this.abort(signal.reason??mapLoadAbortError());
    if(signal?.aborted)this.forward();else signal?.addEventListener('abort',this.forward,{once:true});
    if(!this.signal.aborted)this.timer=this.scheduleTimer(()=>this.abort(mapLoadTimeoutError(timeoutMs,this.stage)),timeoutMs);
  }
  abort(reason=mapLoadAbortError()){if(!this.signal.aborted)this.controller.abort(reason);}
  // Opt-in idle deadline for byte/cache progress. Model deadlines never renew.
  renew(stage=this.stage){this.check();if(this.closed)return;this.stage=stage;this.started=this.now();if(this.timer!==undefined)this.cancelTimer(this.timer);this.timer=this.scheduleTimer(()=>this.abort(mapLoadTimeoutError(this.timeoutMs,this.stage)),this.timeoutMs);}
  noteCleanupError(error){
    this.cleanupFailures=(this.cleanupFailures??0)+1;this.lastCleanupError=String(error?.message??error).slice(0,240);
    const reason=this.signal.reason;if(reason instanceof Error)try{reason.cleanupFailures=this.cleanupFailures;reason.lastCleanupError=this.lastCleanupError;}catch{/* External abort reasons can be frozen; the local bounded record remains available. */}
  }
  check(){
    if(!this.closed&&!this.signal.aborted&&this.now()-this.started>=this.timeoutMs)this.abort(mapLoadTimeoutError(this.timeoutMs,this.stage));
    if(this.signal.aborted)throw this.signal.reason??mapLoadAbortError();
  }
  wait(promise,{onLate=()=>{}}={}){
    return new Promise((resolve,reject)=>{
      let settled=false;
      const late=value=>{try{onLate(value);}catch(error){this.noteCleanupError(error);}};
      const abort=()=>{if(settled)return;settled=true;this.signal.removeEventListener('abort',abort);reject(this.signal.reason??mapLoadAbortError());};
      this.signal.addEventListener('abort',abort,{once:true});if(this.signal.aborted)abort();
      Promise.resolve(promise).then(value=>{
        if(settled){late(value);return;}
        try{this.check();}catch(error){abort();late(value);return;}
        settled=true;this.signal.removeEventListener('abort',abort);resolve(value);
      },error=>{if(settled)return;settled=true;this.signal.removeEventListener('abort',abort);reject(error);});
    });
  }
  run(task,options){return this.wait(Promise.resolve().then(()=>{this.check();return task(this.signal);}),options);}
  finishDeadline(){this.closed=true;if(this.timer!==undefined){this.cancelTimer(this.timer);this.timer=undefined;}}
  close(){this.finishDeadline();this.parent?.removeEventListener('abort',this.forward);}
}
