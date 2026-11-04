import {validateCinematicDocument,evaluateCinematic,cinematicEventsBetween} from './cinematic-document.js';

const aborted=()=>Object.assign(new Error('Cinematic operation cancelled'),{name:'AbortError'});
export class CinematicPlayer{
  constructor({host,references,onState=()=>{}}){
    this.host=host;this.references=references;this.onState=onState;this.state='idle';this.time=0;this.loop=false;this.serial=0;this.loadRevision=0;this.operation=null;this.disposed=false;
  }
  publish(state,error=null){this.state=state;this.error=error;try{this.onState(this.inspect());}catch{/* UI observers never own the playback lease. */}}
  inspect(){return {state:this.state,time:this.time,duration:this.document?.duration??0,cutsceneId:this.document?.cutsceneId??null,loop:this.loop,error:this.error?.message??null};}
  current(op){return this.operation===op&&!op.controller.signal.aborted&&!this.disposed;}
  async release(op,reason){
    op.reason??=reason;
    if(!op.acquired)return;
    if(op.released){
      if(op.prepared&&op.prepared!==op.releasedPrepared){op.releasedPrepared=op.prepared;op.releasePromise=Promise.resolve(op.releasePromise).then(()=>this.host.release?.({token:op.token,lease:op.lease,prepared:op.prepared,reason:'late-prepare',restore:false}));}
      return op.releasePromise;
    }
    op.released=true;op.releasedPrepared=op.prepared;
    return op.releasePromise=(async()=>{try{this.host.stopAudio?.({token:op.token,lease:op.lease});}finally{await this.host.release?.({token:op.token,lease:op.lease,prepared:op.prepared,reason:op.reason,restore:true});}})();
  }
  async load(input){
    if(this.disposed)throw new Error('Cinematic player disposed');
    const result=validateCinematicDocument(input,this.references);
    if(!result.valid)throw Object.assign(new Error('Invalid cinematic document'),{name:'CinematicValidationError',errors:result.errors});
    const request=++this.loadRevision,previous=this.operation;await this.stop('replace');
    if(this.disposed)throw new Error('Cinematic player disposed');if(request!==this.loadRevision)return false;if(previous?.cleanupError)throw previous.cleanupError;
    const op={token:{id:++this.serial},controller:new AbortController(),acquired:false,released:false,lease:null,prepared:null,fired:new Set()};
    this.operation=op;this.document=result.document;this.time=0;this.publish('preparing');
    const options={token:op.token,signal:op.controller.signal,isCurrent:()=>this.current(op)};
    try{
      op.lease=await this.host.acquire(this.document,options);op.acquired=true;
      if(!this.current(op))throw aborted();
      op.prepared=await this.host.prepare(this.document,{...options,lease:op.lease});
      if(!this.current(op))throw aborted();
      this.sample(true);this.publish('ready');return true;
    }catch(error){
      op.controller.abort(error);
      if(this.operation===op)this.publish(error.name==='AbortError'?'cancelled':'error',error.name==='AbortError'?null:error);
      try{await this.release(op,error.name==='AbortError'?'cancel':'error');}catch(cleanupError){op.cleanupError=cleanupError;if(this.operation===op)this.publish('error',cleanupError);throw cleanupError;}
      if(error.name==='AbortError')return false;throw error;
    }
  }
  sample(seeking=false){
    const op=this.operation;if(!op||!this.current(op)||op.released)return false;
    this.host.sample(evaluateCinematic(this.document,this.time),{token:op.token,lease:op.lease,prepared:op.prepared,seeking});return true;
  }
  emit(from,to){
    const op=this.operation;
    for(const cue of cinematicEventsBetween(this.document,from,to))if(!op.fired.has(cue.cueId)){
      op.fired.add(cue.cueId);this.host.emit?.(cue,{token:op.token,lease:op.lease,prepared:op.prepared});
    }
  }
  play(){
    if(!['ready','paused'].includes(this.state))return false;
    try{this.publish('playing');if(this.time===0)this.emit(-Number.EPSILON,0);return true;}catch(error){this.fail(error);return false;}
  }
  pause(){if(this.state!=='playing')return false;try{this.host.stopAudio?.({token:this.operation.token,lease:this.operation.lease});this.publish('paused');return true;}catch(error){this.fail(error);return false;}}
  resume(){return this.play();}
  setLoop(value){this.loop=!!value;return this.loop;}
  seek(seconds){
    if(!['ready','playing','paused'].includes(this.state)||!Number.isFinite(seconds))return false;
    this.time=Math.max(0,Math.min(this.document.duration,seconds));
    try{this.host.stopAudio?.({token:this.operation.token,lease:this.operation.lease});this.sample(true);this.publish(this.state);return true;}catch(error){this.fail(error);return false;}
  }
  update(dt,{hidden=false,paused=false}={}){
    if(this.state!=='playing'||hidden||paused)return;
    const step=Number.isFinite(dt)?Math.max(0,Math.min(.25,dt)):0,previous=this.time,next=Math.min(this.document.duration,previous+step);
    try{
      this.time=next;this.sample(false);this.emit(previous,next);
      if(next>=this.document.duration){
        if(this.loop){this.host.stopAudio?.({token:this.operation.token,lease:this.operation.lease});this.time=0;this.operation.fired.clear();this.sample(true);this.emit(-Number.EPSILON,0);}
        else this.finish('completed','complete');
      }
    }catch(error){this.fail(error);}
  }
  finish(state,reason,error=null){
    const op=this.operation;if(!op)return Promise.resolve();op.controller.abort(error??aborted());this.publish(state,error);
    return this.release(op,reason).catch(releaseError=>{op.cleanupError=releaseError;if(this.operation===op)this.publish('error',releaseError);});
  }
  fail(error){return this.finish('error','error',error);}
  stop(reason='cancel'){
    if(reason!=='replace')this.loadRevision++;
    const op=this.operation;if(!op)return Promise.resolve();
    if(op.released||op.controller.signal.aborted)return this.release(op,reason);
    return this.finish(reason==='complete'?'completed':'cancelled',reason);
  }
  async dispose(){if(this.disposed)return;this.disposed=true;await this.stop('dispose');}
}
