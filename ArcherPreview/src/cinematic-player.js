import {validateCinematicDocument,evaluateCinematic,cinematicEventsBetween,cinematicBackgroundAt} from './cinematic-document.js';

const aborted=()=>Object.assign(new Error('Cinematic operation cancelled'),{name:'AbortError'});
export class CinematicPlayer{
  constructor({host,references,onState=()=>{},retainOnComplete=false,travelBackground}){
    this.host=host;this.references=references;this.onState=onState;this.retainOnComplete=retainOnComplete===true;this.travelBackground=travelBackground;this.state='idle';this.time=0;this.loop=false;this.serial=0;this.loadRevision=0;this.operation=null;this.disposed=false;this.backgroundPromise=null;this.backgroundController=null;
  }
  publish(state,error=null){this.state=state;this.error=error;try{this.onState(this.inspect());}catch{/* UI observers never own the playback lease. */}}
  inspect(){return {state:this.state,time:this.time,duration:this.document?.duration??0,cutsceneId:this.document?.cutsceneId??null,loop:this.loop,retained:this.state==='completed'&&this.retainedCompletion(),error:this.error?.message??null,...(this.document?.tracks.backgrounds?.length?{backgroundMapId:this.host.getMapId?.()??cinematicBackgroundAt(this.document,this.time).mapId,transitioning:!!this.backgroundPromise}:{})};}
  current(op){return this.operation===op&&!op.controller.signal.aborted&&!this.disposed;}
  retainedCompletion(){const op=this.operation;return !!(this.retainOnComplete&&op?.retained&&!op.released&&this.current(op));}
  stopAudio(op=this.operation){if(!op||op.audioStopped)return;op.audioStopped=true;this.host.stopAudio?.({token:op.token,lease:op.lease});}
  async release(op,reason){
    op.reason??=reason;
    if(!op.acquired)return;
    if(op.released){
      if(op.prepared&&op.prepared!==op.releasedPrepared){op.releasedPrepared=op.prepared;op.releasePromise=Promise.resolve(op.releasePromise).then(()=>this.host.release?.({token:op.token,lease:op.lease,prepared:op.prepared,reason:'late-prepare',restore:false}));}
      return op.releasePromise;
    }
    op.released=true;op.releasedPrepared=op.prepared;
    return op.releasePromise=(async()=>{try{this.stopAudio(op);}finally{await this.host.release?.({token:op.token,lease:op.lease,prepared:op.prepared,reason:op.reason,restore:true});}})();
  }
  async load(input,{time=0}={}){
    if(this.disposed)throw new Error('Cinematic player disposed');
    const result=validateCinematicDocument(input,this.references);
    if(!result.valid)throw Object.assign(new Error('Invalid cinematic document'),{name:'CinematicValidationError',errors:result.errors});
    const request=++this.loadRevision,previous=this.operation,pending=this.backgroundPromise;await this.stop('replace');if(pending)await pending.catch(()=>{});
    if(this.disposed)throw new Error('Cinematic player disposed');if(request!==this.loadRevision)return false;if(previous?.cleanupError)throw previous.cleanupError;
    const op={token:{id:++this.serial},controller:new AbortController(),acquired:false,released:false,retained:false,audioStopped:false,lease:null,prepared:null,fired:new Set()};
    this.operation=op;this.document=result.document;this.time=Math.max(0,Math.min(this.document.duration,Number.isFinite(time)?time:0));this.publish('preparing');
    const target=cinematicBackgroundAt(this.document,this.time),options={token:op.token,signal:op.controller.signal,isCurrent:()=>this.current(op),time:this.time,mapId:target.mapId};
    try{
      if(this.host.getMapId?.()&&this.host.getMapId()!==target.mapId){if(!this.travelBackground)throw new Error('배경 전환 로더를 사용할 수 없습니다.');await this.travelBackground(target.mapId,{signal:op.controller.signal});if(!this.current(op))throw aborted();}
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
    const mapId=cinematicBackgroundAt(this.document,this.time).mapId;if(this.host.getMapId?.()&&this.host.getMapId()!==mapId){this.switchBackground();return false;}
    this.host.sample(evaluateCinematic(this.document,this.time),{token:op.token,lease:op.lease,prepared:op.prepared,seeking});return true;
  }
  waitReady(){return this.backgroundPromise??Promise.resolve();}
  switchBackground(){
    if(this.backgroundPromise)return this.backgroundPromise;
    const previous=this.operation,request=++this.loadRevision,controller=new AbortController(),fired=new Set(previous?.fired??[]);this.backgroundController=controller;this.backgroundResumeState=this.state==='playing'?'playing':'paused';this.publish('preparing');
    const valid=()=>!this.disposed&&!controller.signal.aborted&&request===this.loadRevision;
    const task=Promise.resolve().then(async()=>{
      if(!this.travelBackground)throw new Error('배경 전환 로더를 사용할 수 없습니다.');
      if(previous){previous.controller.abort(aborted());await this.release(previous,'background-transition');}
      while(valid()){
        const target=cinematicBackgroundAt(this.document,this.time);if(this.host.getMapId?.()!==target.mapId)await this.travelBackground(target.mapId,{signal:controller.signal});if(!valid())return false;
        if(cinematicBackgroundAt(this.document,this.time).mapId!==target.mapId)continue;
        const op={token:{id:++this.serial},controller:new AbortController(),acquired:false,released:false,retained:false,audioStopped:false,lease:null,prepared:null,fired};this.operation=op;
        const options={token:op.token,signal:op.controller.signal,isCurrent:()=>this.current(op)&&valid(),time:this.time,mapId:target.mapId};
        try{op.lease=await this.host.acquire(this.document,options);op.acquired=true;if(!valid())throw aborted();op.prepared=await this.host.prepare(this.document,{...options,lease:op.lease});if(!valid())throw aborted();if(cinematicBackgroundAt(this.document,this.time).mapId!==target.mapId){op.controller.abort(aborted());await this.release(op,'background-transition');continue;}
          this.host.sample(evaluateCinematic(this.document,this.time),{token:op.token,lease:op.lease,prepared:op.prepared,seeking:true});this.publish(this.backgroundResumeState);if(this.state==='playing'){this.sample(false);this.emit(this.time-1e-7,this.time);}return true;
        }catch(error){op.controller.abort(error);await this.release(op,'background-error');throw error;}
      }return false;
    }).catch(async error=>{if(valid())await this.fail(error);if(error.name!=='AbortError')throw error;return false;}).finally(()=>{if(this.backgroundPromise===task)this.backgroundPromise=null;if(this.backgroundController===controller)this.backgroundController=null;});
    this.backgroundPromise=task;task.catch(()=>{});return task;
  }
  emit(from,to){
    const op=this.operation;
    for(const cue of cinematicEventsBetween(this.document,from,to))if(!op.fired.has(cue.cueId)){
      op.fired.add(cue.cueId);if(cue.kind==='audio')op.audioStopped=false;this.host.emit?.(cue,{token:op.token,lease:op.lease,prepared:op.prepared});
    }
  }
  play(){
    const completed=this.state==='completed'&&this.retainedCompletion();if(!['ready','paused'].includes(this.state)&&!completed)return false;
    try{
      if(completed||this.retainOnComplete&&this.time>=this.document.duration){this.time=0;this.operation.fired.clear();this.sample(true);}
      this.operation.retained=false;this.operation.audioStopped=false;this.publish('playing');if(this.time===0)this.emit(-Number.EPSILON,0);return true;
    }catch(error){this.fail(error);return false;}
  }
  pause(){if(this.backgroundPromise){this.backgroundResumeState='paused';this.stopAudio();return true;}if(this.state!=='playing')return false;try{this.stopAudio();this.publish('paused');return true;}catch(error){this.fail(error);return false;}}
  resume(){return this.play();}
  setLoop(value){this.loop=!!value;return this.loop;}
  seek(seconds){
    const completed=this.state==='completed'&&this.retainedCompletion();if((!['ready','playing','paused'].includes(this.state)&&!completed&&!this.backgroundPromise)||!Number.isFinite(seconds))return false;
    this.time=Math.max(0,Math.min(this.document.duration,seconds));
    try{this.stopAudio();if(this.backgroundPromise){this.backgroundResumeState='paused';return true;}if(completed){this.operation.retained=false;this.operation.fired.clear();}const state=completed?'paused':this.state;if(this.sample(true))this.publish(state);return true;}catch(error){this.fail(error);return false;}
  }
  update(dt,{hidden=false,paused=false}={}){
    if(this.state!=='playing'||hidden||paused)return;
    const step=Number.isFinite(dt)?Math.max(0,Math.min(.25,dt)):0,previous=this.time;let next=Math.min(this.document.duration,previous+step);const boundary=this.document.tracks.backgrounds?.find(row=>row.time>previous&&row.time<=next&&row.mapId!==this.host.getMapId?.());if(boundary)next=boundary.time;
    try{
      this.time=next;if(!this.sample(false))return;this.emit(previous,next);
      if(next>=this.document.duration){
        if(this.loop){this.stopAudio();this.time=0;this.operation.fired.clear();if(this.sample(true))this.emit(-Number.EPSILON,0);}
        else if(this.retainOnComplete){this.stopAudio();this.operation.retained=true;this.publish('completed');}
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
    this.backgroundController?.abort(aborted());
    const op=this.operation;if(!op)return Promise.resolve();
    if(op.released||op.controller.signal.aborted)return this.release(op,reason);
    return this.finish(reason==='complete'?'completed':'cancelled',reason);
  }
  async dispose(){if(this.disposed)return;this.disposed=true;await this.stop('dispose');}
}
