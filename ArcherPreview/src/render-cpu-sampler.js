const methods={
 drawCommands:['drawElementsType','drawArraysType'],
 effectEnable:['enableEffect'],
 bufferBinding:['bindBuffers','bindVertexArrayObject'],
 textureSet:['setTexture'],
 bufferUpdate:['updateDynamicVertexBuffer','updateDynamicIndexBuffer'],
 textureUpload:['_uploadDataToTextureDirectly','_uploadCompressedDataToTextureDirectly'],
 shaderPrepare:['createEffect','createShaderProgram','_preparePipelineContext'],
};
function shaderLabel(source){try{const label=typeof source==='string'?source:source?.vertex;return typeof label==='string'&&label.length<=128&&!/[\r\n]/.test(label)?label:null;}catch{return null;}}
// A slow PBR request otherwise has no clue whether it came from a fading
// skinned enemy or scenery. Read only the already-supplied, bounded defines;
// no material scan, extra hook/timer, GPU query or full shader text is added.
const variantFlags=['ALPHABLEND','ALPHATEST','UNLIT','FOG','INSTANCES','THIN_INSTANCES','MOONFOREST_CHARACTER_STYLE'];
function shaderVariant(args){
 try{
  const value=typeof args[1]==='object'?args[1]?.defines:args[4];if(typeof value!=='string')return null;
  const text=value.slice(0,16384),variant={};
  for(const flag of variantFlags)variant[flag]=new RegExp('(?:^|\\n)#define '+flag+'(?:\\s|$)').test(text);
  for(const name of ['NUM_BONE_INFLUENCERS','NUM_MORPH_INFLUENCERS']){const match=text.match(new RegExp('(?:^|\\n)#define '+name+' ([0-9]{1,4})(?:\\s|$)'));variant[name]=match?Math.min(4096,Number(match[1])):0;}
  return variant;
 }catch{return null;}
}

// Which mesh a slow shader request was for (phone recording 2026-11-20: 18-38 ms compiles
// in play with nothing to say what asked for them). Looked up once, at the end of a render
// in which a slow createEffect happened: the meshes active in that render (600 at most, 8
// sub-meshes each) are searched for the effect it returned. No work on any other frame, and
// the effects are let go as soon as they are named.
function nameShaderOwners(scene,owed){
 const active=scene.getActiveMeshes?.(),data=active?.data,count=Math.min(active?.length??0,600);let left=owed.length/2;
 for(let i=0;i<count&&left>0;i++){
  const mesh=data[i],subs=mesh?.subMeshes;if(!subs)continue;
  for(let s=0;s<subs.length&&s<8&&left>0;s++){
   const effect=subs[s].effect;if(!effect)continue;
   for(let k=0;k<owed.length;k+=2)if(owed[k]===effect){
    const call=owed[k+1];call.mesh=String(mesh.name??'').slice(0,64);call.material=String(subs[s].getMaterial?.()?.name??'').slice(0,64);owed[k]=null;left--;
   }
  }
 }
}

// Periodic and bounded event-requested renders, only while diagnostics collect. These
// are inclusive engine-method CPU times (including cached/no-op calls), not GL
// command counts or GPU execution. Upload/shader probes cover only calls made
// during a sampled render, not asynchronous preparation between renders.
// Nested groups must never be added together.
export class RenderCpuSampler {
 constructor(scene,{now=()=>performance.now(),intervalMs=1000,staleMs=2500}={}){
  Object.assign(this,{scene,now,intervalMs,staleMs});this.engine=scene.getEngine();this.active=false;this.disposed=false;this.next=0;this.sequence=0;this.latest=null;this.slowSamples=[];this.pending=null;this.hooks=[];this.owed=[];this.requested=null;this.eventAfter=0;
  this.before=scene.onBeforeRenderObservable.add(()=>this.begin());
  this.after=scene.onAfterRenderObservable.add(()=>this.end());
  // A failed render may not reach onAfterRender; do not retain wrapped methods.
  this.engineEnd=this.engine.onEndFrameObservable.add(()=>{if(this.pending)this.cancel();});
  this.lost=this.engine.onContextLostObservable?.add(()=>{this.contextLost=true;this.reset();});
  this.restored=this.engine.onContextRestoredObservable?.add(()=>{this.contextLost=false;this.reset();});
 }
 setActive(active){const next=Boolean(active)&&!this.disposed;if(this.active===next)return;this.active=next;if(!this.active){this.cancel();this.requested=null;}else this.next=0;}
 setContinuous(enabled){this.continuous=enabled===true;if(!this.continuous&&!this.pending)this.restore();}
 reset(){this.cancel();this.latest=null;this.slowSamples=[];this.next=0;this.requested=null;this.eventAfter=0;}
 requestCapture(reason){
  if(!this.active||this.disposed||this.contextLost)return false;
  // One coalesced request, never a queue. Event probes are opt-in just like
  // periodic probes, with at most four extra sampled frames per second.
  this.requested=String(reason??'event').slice(0,64);return true;
 }
 restore(){
  for(const {owner,name,wrapper,descriptor} of this.hooks){
   if(owner[name]!==wrapper)continue;
   if(descriptor)Object.defineProperty(owner,name,descriptor);else delete owner[name];
  }
  this.hooks.length=0;
 }
 cancel(){this.restore();this.pending=null;this.owed.length=0;}
 begin(){
  if(this.disposed||!this.active||this.contextLost||this.pending)return;
  const started=this.now(),eventReady=this.requested!==null&&started>=this.eventAfter;
  if(!this.continuous&&started<this.next&&!eventReady)return;
  const reason=this.continuous?'continuous':this.requested??'periodic';if(this.requested!==null)this.eventAfter=started+250;
  this.requested=null;this.next=started+this.intervalMs;
  const pending=this.pending={sampleId:++this.sequence,sceneFrameId:this.scene.getFrameId(),startedAtMs:started,reason,effectChanges:0,groups:{},slowCalls:[]};
  try{
   const probes=[...Object.entries(methods).map(([group,names])=>[this.engine,group,names]),[this.scene,'candidateSelection',['getActiveMeshCandidates']]];
   for(const [,group]of probes)pending.groups[group]={calls:0,ms:0};
   if(this.hooks.length)return;
   for(const [owner,group,names]of probes){
    for(const name of names){
     const original=owner[name],descriptor=Object.getOwnPropertyDescriptor(owner,name);
     if(typeof original!=='function'||(descriptor&&!descriptor.configurable))continue;
     const sampler=this;
     function wrapper(...args){
      // An external wrapper can retain this function after disposal. Passthrough
      // without timing, and preserve the caller's receiver/return/exception.
      const current=sampler.pending;if(!current)return Reflect.apply(original,this,args);
      const counter=current.groups[group];
      const start=sampler.now(),effect=this._currentEffect;counter.calls++;
      let result;
      try{result=Reflect.apply(original,this,args);return result;}
      finally{
       const elapsed=Math.max(0,sampler.now()-start);counter.ms+=elapsed;
       if(elapsed>=2&&current.slowCalls.length<8){
        const label=group==='shaderPrepare'?shaderLabel(args[0]):null;
        const variant=name==='createEffect'?shaderVariant(args):null;
        const call={group,method:name,ms:elapsed,shader:label,...(variant?{variant}:{})};current.slowCalls.push(call);
        if(name==='createEffect'&&result&&typeof result==='object')sampler.owed.push(result,call);
       }
       if(name==='enableEffect'&&this._currentEffect!==effect)current.effectChanges++;
      }
     }
     Object.defineProperty(owner,name,{configurable:true,writable:true,value:wrapper});
     this.hooks.push({owner,name,wrapper,descriptor});
    }
   }
  }catch{this.cancel();}
 }
 end(){
  if(!this.pending)return;
  const completedAtMs=this.now(),sample=this.pending;if(!this.continuous)this.restore();this.pending=null;
  if(this.owed.length){try{nameShaderOwners(this.scene,this.owed);}catch{/* names are optional */}this.owed.length=0;}
  sample.completedAtMs=completedAtMs;sample.sceneElapsedMs=Math.max(0,completedAtMs-sample.startedAtMs);this.latest=sample;
  if(sample.sceneElapsedMs>=50){this.slowSamples.push(sample);if(this.slowSamples.length>8)this.slowSamples.shift();}
 }
 sample(){
  const ageMs=this.latest?Math.max(0,this.now()-this.latest.completedAtMs):null;
  const status=this.disposed?'disabled':this.contextLost?'context-lost':!this.active?'paused':!this.latest?'pending':ageMs>this.staleMs?'stale':'sampled';
  return {status,scope:'sampled-scene-engine-method-cpu',intervalMs:this.intervalMs,ageMs,pending:Boolean(this.pending),latest:status==='sampled'?this.latest:null,retained:status==='paused'?this.latest:null,slowSamples:this.slowSamples.slice()};
 }
 dispose(){if(this.disposed)return;this.cancel();this.disposed=true;this.active=false;this.latest=null;this.slowSamples=[];this.requested=null;
  this.scene.onBeforeRenderObservable.remove(this.before);this.scene.onAfterRenderObservable.remove(this.after);this.engine.onEndFrameObservable.remove(this.engineEnd);this.engine.onContextLostObservable?.remove(this.lost);this.engine.onContextRestoredObservable?.remove(this.restored);}
}
