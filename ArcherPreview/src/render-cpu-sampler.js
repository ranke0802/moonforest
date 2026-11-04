const methods={
 drawCommands:['drawElementsType','drawArraysType'],
 effectEnable:['enableEffect'],
 bufferBinding:['bindBuffers','bindVertexArrayObject'],
 textureSet:['setTexture'],
 bufferUpdate:['updateDynamicVertexBuffer','updateDynamicIndexBuffer'],
};

// One sampled scene render per second, only while diagnostics collect. These
// are inclusive engine-method CPU times (including cached/no-op calls), not GL
// command counts or GPU execution. Nested groups must never be added together.
export class RenderCpuSampler {
 constructor(scene,{now=()=>performance.now(),intervalMs=1000,staleMs=2500}={}){
  Object.assign(this,{scene,now,intervalMs,staleMs});this.engine=scene.getEngine();this.active=false;this.disposed=false;this.next=0;this.sequence=0;this.latest=null;this.pending=null;this.hooks=[];
  this.before=scene.onBeforeRenderObservable.add(()=>this.begin());
  this.after=scene.onAfterRenderObservable.add(()=>this.end());
  // A failed render may not reach onAfterRender; do not retain wrapped methods.
  this.engineEnd=this.engine.onEndFrameObservable.add(()=>this.cancel());
  this.lost=this.engine.onContextLostObservable?.add(()=>{this.contextLost=true;this.reset();});
  this.restored=this.engine.onContextRestoredObservable?.add(()=>{this.contextLost=false;this.reset();});
 }
 setActive(active){const next=Boolean(active)&&!this.disposed;if(this.active===next)return;this.active=next;if(!this.active)this.cancel();else this.next=0;}
 reset(){this.cancel();this.latest=null;this.next=0;}
 restore(){
  for(const {owner,name,wrapper,descriptor} of this.hooks){
   if(owner[name]!==wrapper)continue;
   if(descriptor)Object.defineProperty(owner,name,descriptor);else delete owner[name];
  }
  this.hooks.length=0;
 }
 cancel(){this.restore();this.pending=null;}
 begin(){
  if(this.disposed||!this.active||this.contextLost||this.pending||this.now()<this.next)return;
  const started=this.now();this.next=started+this.intervalMs;
  const pending=this.pending={sampleId:++this.sequence,sceneFrameId:this.scene.getFrameId(),startedAtMs:started,effectChanges:0,groups:{}};
  try{
   const probes=[...Object.entries(methods).map(([group,names])=>[this.engine,group,names]),[this.scene,'candidateSelection',['getActiveMeshCandidates']]];
   for(const [owner,group,names]of probes){
    const counter=pending.groups[group]={calls:0,ms:0};
    for(const name of names){
     const original=owner[name],descriptor=Object.getOwnPropertyDescriptor(owner,name);
     if(typeof original!=='function'||(descriptor&&!descriptor.configurable))continue;
     const sampler=this;
     function wrapper(...args){
      // An external wrapper can retain this function after disposal. Passthrough
      // without timing, and preserve the caller's receiver/return/exception.
      if(sampler.pending!==pending)return Reflect.apply(original,this,args);
      const start=sampler.now(),effect=this._currentEffect;counter.calls++;
      try{return Reflect.apply(original,this,args);}
      finally{counter.ms+=Math.max(0,sampler.now()-start);if(name==='enableEffect'&&this._currentEffect!==effect)pending.effectChanges++;}
     }
     Object.defineProperty(owner,name,{configurable:true,writable:true,value:wrapper});
     this.hooks.push({owner,name,wrapper,descriptor});
    }
   }
  }catch{this.cancel();}
 }
 end(){
  if(!this.pending)return;
  const completedAtMs=this.now(),sample=this.pending;this.restore();this.pending=null;
  sample.completedAtMs=completedAtMs;sample.sceneElapsedMs=Math.max(0,completedAtMs-sample.startedAtMs);this.latest=sample;
 }
 sample(){
  const ageMs=this.latest?Math.max(0,this.now()-this.latest.completedAtMs):null;
  const status=this.disposed?'disabled':this.contextLost?'context-lost':!this.active?'paused':!this.latest?'pending':ageMs>this.staleMs?'stale':'sampled';
  return {status,scope:'sampled-scene-engine-method-cpu',intervalMs:this.intervalMs,ageMs,pending:Boolean(this.pending),latest:status==='sampled'?this.latest:null,retained:status==='paused'?this.latest:null};
 }
 dispose(){if(this.disposed)return;this.cancel();this.disposed=true;this.active=false;this.latest=null;
  this.scene.onBeforeRenderObservable.remove(this.before);this.scene.onAfterRenderObservable.remove(this.after);this.engine.onEndFrameObservable.remove(this.engineEnd);this.engine.onContextLostObservable?.remove(this.lost);this.engine.onContextRestoredObservable?.remove(this.restored);}
}
