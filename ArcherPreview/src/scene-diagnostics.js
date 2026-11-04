import {SceneInstrumentation} from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import {RenderCpuSampler} from './render-cpu-sampler.js';

// EngineInstrumentation's rolling counter does not expose pending/disjoint
// status and its capture toggle does not delete an in-flight timer query.
// Own one nonblocking elapsed query through the same WebGL extension instead.
export function gpuTimerDriver(engine){
  const extension=engine.getCaps?.().timerQuery,gl=engine._gl;
  if(!extension||!gl||!Number.isFinite(extension.TIME_ELAPSED_EXT)||!Number.isFinite(extension.GPU_DISJOINT_EXT))return null;
  const ext=typeof extension.createQueryEXT==='function';
  if((ext&&!extension.getQueryObjectEXT)||(!ext&&!gl.getQueryParameter))return null;
  return {
    lost:()=>Boolean(gl.isContextLost?.()),disjoint:()=>Boolean(gl.getParameter(extension.GPU_DISJOINT_EXT)),
    busy:()=>Boolean(engine._captureGPUFrameTime||engine._currentNonTimestampToken||(ext?extension.getQueryEXT?.(extension.TIME_ELAPSED_EXT,extension.CURRENT_QUERY_EXT):gl.getQuery?.(extension.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))),
    begin(){const query=ext?extension.createQueryEXT():gl.createQuery();if(!query)return null;
      try{if(ext)extension.beginQueryEXT(extension.TIME_ELAPSED_EXT,query);else gl.beginQuery(extension.TIME_ELAPSED_EXT,query);}catch(error){this.remove(query);throw error;}return query;},
    end(){if(ext)extension.endQueryEXT(extension.TIME_ELAPSED_EXT);else gl.endQuery(extension.TIME_ELAPSED_EXT);},
    available:query=>ext?extension.getQueryObjectEXT(query,extension.QUERY_RESULT_AVAILABLE_EXT):gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE),
    result:query=>ext?extension.getQueryObjectEXT(query,extension.QUERY_RESULT_EXT):gl.getQueryParameter(query,gl.QUERY_RESULT),
    remove(query){if(ext)extension.deleteQueryEXT(query);else gl.deleteQuery(query);},
  };
}
let gpuSession=0;
export class GpuFrameSampler {
  constructor(engine,{now=()=>performance.now(),driverFactory=gpuTimerDriver,intervalMs=250,staleMs=2000,timeoutMs=3000}={}){
    Object.assign(this,{engine,now,driverFactory,intervalMs,staleMs,timeoutMs});this.session=++gpuSession;this.epoch=0;this.sequence=0;this.active=false;this.disposed=false;this.contextLost=false;this.pending=null;this.next=0;this.state='pending';this.samples=[];this.invalidSamples=0;this.timeouts=0;this.disjoints=0;
    this.driver=this.createDriver();if(!this.driver&&this.state!=='error')this.state='unsupported';
    this.before=engine.onBeginFrameObservable.add(()=>this.begin());this.after=engine.onEndFrameObservable.add(()=>this.end());
    this.lostObserver=engine.onContextLostObservable?.add(()=>{this.contextLost=true;this.reset('context-lost',true);});
    this.restoredObserver=engine.onContextRestoredObservable?.add(()=>{this.contextLost=false;this.reset('pending',true);this.driver=this.createDriver();if(this.driver)this.state='pending';else if(this.state!=='error')this.state='unsupported';});
  }
  createDriver(){try{return this.driverFactory(this.engine);}catch{this.state='error';return null;}}
  cancel(skipGl=false){
    const pending=this.pending;this.pending=null;if(!pending)return;
    try{if(!skipGl&&!this.contextLost&&!this.driver?.lost()){try{if(!pending.ended)this.driver.end();}finally{this.driver.remove(pending.query);}}}catch{this.state='error';}
  }
  reset(reason='pending',skipGl=false){this.cancel(skipGl);this.samples.length=0;this.epoch++;this.next=0;this.state=this.contextLost?'context-lost':this.driver?reason:this.state==='error'?'error':'unsupported';}
  setActive(active){if(this.disposed||this.active===active)return;this.active=active;if(!active){this.cancel();this.pausedAtMs=this.now();if(this.driver&&!this.contextLost)this.state='paused';}else this.reset('pending');}
  reject(reason){const previous=this.state;this.cancel(this.contextLost);this.samples.length=0;this.state=reason;this.next=this.now()+this.intervalMs;if(reason==='disjoint'){if(previous!=='disjoint')this.disjoints++;}else if(reason==='timeout')this.timeouts++;else this.invalidSamples++;}
  poll(){
    if(!this.pending?.ended)return;
    if(this.now()-this.pending.startAtMs>this.timeoutMs){this.reject('timeout');return;}
    if(!this.driver.available(this.pending.query))return;
    const pending=this.pending,nanoseconds=this.driver.result(pending.query);this.driver.remove(pending.query);this.pending=null;
    if(!Number.isFinite(nanoseconds)||nanoseconds<0){this.reject('invalid');return;}
    this.samples.push({sampleId:`${this.session}:${this.epoch}:${++this.sequence}`,ms:nanoseconds/1e6,startAtMs:pending.startAtMs,endAtMs:pending.endAtMs,availableAtMs:this.now()});
    if(this.samples.length>64)this.samples.shift();this.state='valid';
  }
  begin(){
    if(this.disposed||!this.active||this.contextLost||!this.driver||this.state==='error')return;
    try{
      if(this.driver.lost()){this.contextLost=true;this.reset('context-lost',true);return;}
      if(this.driver.disjoint()){this.reject('disjoint');return;}
      this.poll();if(this.pending||this.now()<this.next)return;
      if(this.driver.busy?.()){if(!this.samples.length)this.state='busy';return;}
      const query=this.driver.begin();this.next=this.now()+this.intervalMs;
      if(query){this.pending={query,startAtMs:this.now(),ended:false};if(!this.samples.length)this.state='pending';}else this.reject('invalid');
    }catch{this.reject('error');}
  }
  end(){
    if(this.disposed||!this.active||this.contextLost||!this.driver||!this.pending)return;
    try{
      if(this.driver.lost()){this.contextLost=true;this.reset('context-lost',true);return;}
      if(!this.pending.ended){this.driver.end();this.pending.ended=true;this.pending.endAtMs=this.now();}
      if(this.driver.disjoint()){this.reject('disjoint');return;}this.poll();
    }catch{this.reject('error');}
  }
  sample(){
    const at=this.now(),latest=this.samples.at(-1),ageMs=latest?Math.max(0,at-latest.endAtMs):null;
    const valid=this.active&&!this.contextLost&&this.state==='valid'&&ageMs<=this.staleMs;
    const summaryAt=this.active?at:this.pausedAtMs??at,values=(valid||!this.active)?this.samples.filter(s=>summaryAt-s.endAtMs<=10000).map(s=>s.ms).sort((a,b)=>a-b):[];
    const meanMs=values.length?values.reduce((a,b)=>a+b,0)/values.length:null,p95Ms=values.length?values[Math.ceil(values.length*.95)-1]:null;
    const status=this.disposed?'disabled':this.contextLost?'context-lost':this.state==='error'?'error':!this.driver?'unsupported':!this.active?'paused':latest&&this.state==='valid'&&!valid?'stale':this.state;
    const retained=status==='paused'&&latest&&values.length?{meanMs,p95Ms,samples:values.length,latest:{...latest},ageMs,pausedAtMs:this.pausedAtMs,historical:true}:null;
    return {status,asynchronous:true,scope:'engine-frame',intervalMs:this.intervalMs,pending:Boolean(this.pending),ageMs,samples:valid?values.length:0,meanMs:valid?meanMs:null,p95Ms:valid?p95Ms:null,latest:valid?{...latest}:null,retained,disjointEvents:this.disjoints,invalidSamples:this.invalidSamples,timeouts:this.timeouts};
  }
  dispose(){if(this.disposed)return;this.cancel(this.contextLost);this.disposed=true;this.active=false;this.samples.length=0;
    this.engine.onBeginFrameObservable.remove(this.before);this.engine.onEndFrameObservable.remove(this.after);this.engine.onContextLostObservable?.remove(this.lostObserver);this.engine.onContextRestoredObservable?.remove(this.restoredObserver);}
}

// CPU scene counters and asynchronous GPU samples remain separate. All
// observers/queries exist only while the diagnostic HUD is enabled.
export class SceneDiagnostics {
  constructor(options={}){this.options=options;this.scene=null;this.instrumentation=null;this.gpu=null;this.active=false;this.result={};}
  setEnabled(enabled,scene){
    if(!enabled)this.setActive(false);
    if(this.instrumentation&&(!enabled||scene!==this.scene)){this.gpu.dispose();this.gpu=null;this.cpu.dispose();this.cpu=null;this.scene.onDisposeObservable.remove(this.sceneDispose);this.instrumentation.dispose();this.instrumentation=null;this.scene=null;this.result={};}
    if(enabled&&scene&&!this.instrumentation){this.scene=scene;const i=this.instrumentation=new SceneInstrumentation(scene);i.captureFrameTime=true;i.captureAnimationsTime=true;i.captureActiveMeshesEvaluationTime=true;i.captureRenderTargetsRenderTime=true;i.captureRenderTime=true;this.gpu=new GpuFrameSampler(scene.getEngine(),this.options);this.gpu.setActive(this.active);this.cpu=new RenderCpuSampler(scene,{now:this.options.now});this.cpu.setActive(this.active);this.sceneDispose=scene.onDisposeObservable.addOnce(()=>this.dispose());}
  }
  setActive(active){this.active=Boolean(active);this.gpu?.setActive(this.active);this.cpu?.setActive(this.active);}
  resetGpu(){this.gpu?.reset(this.active?'pending':'paused');this.cpu?.reset();}
  sample(){const i=this.instrumentation;if(!i)return {};
    this.result.drawCalls=i.drawCallsCounter.current;this.result.sceneMs=i.frameTimeCounter.current;this.result.animationMs=i.animationsTimeCounter.current;
    // CPU submission counters can overlap (draw submission also occurs inside
    // shadow/render targets). They are never a substitute for GPU elapsed time.
    this.result.activeMeshesMs=i.activeMeshesEvaluationTimeCounter.current;this.result.renderTargetsMs=i.renderTargetsRenderTimeCounter.current;this.result.drawSubmissionMs=i.renderTimeCounter.current;
    this.result.gpu=this.gpu.sample();this.result.drawCpu=this.cpu.sample();return this.result;}
  dispose(){this.active=false;this.setEnabled(false);}
}
