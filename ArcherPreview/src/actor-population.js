import {createBossPreparation,bossPreparationCancelled} from './boss-preparation.js';

const MIB=1024*1024;
const nonnegative=(value,fallback)=>Number.isFinite(value)&&value>=0?value:fallback;
const whole=(value,fallback)=>Math.floor(nonnegative(value,fallback));
const LIVE=new Set(['active','dying','corpse']);
export const MAX_DEVELOPMENT_ACTORS=20;

export class ActorPopulationLimitError extends Error {
 constructor(reason){super(`Actor population limit: ${reason}`);this.name='ActorPopulationLimitError';this.code='ACTOR_POPULATION_LIMIT';this.reason=reason;}
}

// This owner schedules existing encounter adapters. Combat/contact/animation
// order remains with BossBattle; combat adapters deliberately have no-op update.
export class ActorPopulation {
 constructor({definitions,createAdapter,validateSpawn=()=>true,preparationFactory,limits={},onDeath=()=>{},onReward=()=>{},onRespawn=()=>{},onError=()=>{}}={}){
  if(typeof createAdapter!=='function')throw new TypeError('createAdapter is required');
  this.definitions=definitions instanceof Map?definitions:new Map(Object.entries(definitions??{}));
  this.createAdapter=createAdapter;this.validateSpawn=validateSpawn;
  this.preparationFactory=preparationFactory??(options=>createBossPreparation(options));
  this.limits={total:Math.min(MAX_DEVELOPMENT_ACTORS,whole(limits.total,20)),active:Math.min(MAX_DEVELOPMENT_ACTORS,whole(limits.active,20)),perDefinition:limits.perDefinition??20,perType:limits.perType??{monster:20,boss:20,npc:20},estimatedMemoryBytes:nonnegative(limits.estimatedMemoryBytes,512*MIB),concurrentPreparations:Math.max(1,whole(limits.concurrentPreparations,1)),idleSeconds:nonnegative(limits.idleSeconds,120)};
  this.onDeath=onDeath;this.onReward=onReward;this.onRespawn=onRespawn;this.onError=onError;
  this.records=new Map();this.tasks=new Set();this.queue=[];this.running=0;this.generation=0;this.generationRevision=0;this.serial=0;this.clock=0;this.paused=false;this.disposed=false;
  this.stats={created:0,reused:0,activated:0,disposed:0,cancelled:0,deaths:0,rewardsObserved:0,respawns:0,decisionUpdates:0,farDecisionSkips:0,errors:0,peakEntries:0,peakEstimatedBytes:0};
 }
 definition(id){const definition=this.definitions.get(id);if(!definition)throw new RangeError(`Unknown actorDefinitionId: ${id}`);return definition;}
 get entries(){return [...this.records.values()];}
 get estimatedBytes(){let bytes=0;for(const record of this.records.values())bytes+=record.estimatedBytes;return bytes;}
 _limit(value,key,fallback){return typeof value==='number'?whole(value,fallback):whole(value?.[key],fallback);}
 _reservation(definition){return nonnegative(definition.population?.estimatedBytes,16*MIB);}
 _capacity(definition,extraBytes,activate){
  const entries=this.entries,id=definition.actorDefinitionId,category=definition.category??'monster';
  if(entries.length>=this.limits.total)return 'total';
  if(entries.filter(record=>record.definitionId===id).length>=Math.min(this._limit(this.limits.perDefinition,id,this.limits.total),whole(definition.population?.maxPooled,this.limits.total)))return 'definition';
  if(entries.filter(record=>record.category===category).length>=this._limit(this.limits.perType,category,this.limits.total))return 'type';
  if(this.estimatedBytes+extraBytes>this.limits.estimatedMemoryBytes)return 'estimated-memory';
  if(activate&&this._activeCount()>=this.limits.active)return 'active';
  return null;
 }
 _activeCount(){let count=0;for(const record of this.records.values())if(LIVE.has(record.state)||record.operation?.activate&&!record.operation.cancelled)count++;return count;}
 _emit(callback,...args){try{callback(...args);}catch(error){this._error(error);}}
 _error(error){this.stats.errors++;try{this.onError(error);}catch{}}
 _peak(){this.stats.peakEntries=Math.max(this.stats.peakEntries,this.records.size);this.stats.peakEstimatedBytes=Math.max(this.stats.peakEstimatedBytes,this.estimatedBytes);}
 _checkSpawn(definition,context){
  if(this.disposed)throw bossPreparationCancelled();
  if(!context||typeof context!=='object'||Array.isArray(context))throw new TypeError('Actor spawn context must be an object');
  const allowed=this.validateSpawn(definition,context);
  if(allowed===false||allowed?.allowed===false||allowed?.valid===false)throw new RangeError(allowed?.reason??'Actor spawn position is not allowed');
 }
 spawn(id,context={}){
  try{
   const definition=this.definition(id);this._checkSpawn(definition,context);
   if(this._activeCount()>=this.limits.active)throw new ActorPopulationLimitError('active');
   const record=this.entries.find(entry=>entry.definitionId===id&&entry.generation===this.generation&&entry.state==='dormant'&&!entry.operation&&entry.respawnRemaining===null);
   if(record){this.stats.reused++;return this._schedule(record,true,context);}
   return this._schedule(this._reserve(definition,true),true,context);
  }catch(error){return Promise.reject(error);}
 }
 async prewarm(id,count=1,context={}){
  const definition=this.definition(id);if(this.disposed)throw bossPreparationCancelled();
  if(!Number.isInteger(count)||count<0)throw new RangeError('prewarm count must be a nonnegative integer');
  const available=this.entries.filter(record=>record.definitionId===id&&record.generation===this.generation&&record.state==='dormant'&&!record.operation&&record.respawnRemaining===null),selected=available.slice(0,count),protectedRecords=new Set(selected),reserved=[];
  // Reserve every requested slot synchronously; overlapping calls cannot pass
  // caps using the same not-yet-created resources.
  try{for(let i=available.length;i<count;i++)reserved.push(this._reserve(definition,false,protectedRecords));}
  catch(error){for(const record of reserved)this._disposeEntry(record);throw error;}
  return Promise.all([...selected.map(record=>Promise.resolve(record)),...reserved.map(record=>this._schedule(record,false,context))]);
 }
 _reserve(definition,activate,protectedRecords){
  const bytes=this._reservation(definition);let reason=this._capacity(definition,bytes,activate);
  if(reason){
   const idle=this.entries.filter(record=>record.state==='dormant'&&!record.operation&&record.respawnRemaining===null&&!protectedRecords?.has(record)).sort((a,b)=>a.idleSince-b.idleSince);
   for(const record of idle){this._disposeEntry(record);reason=this._capacity(definition,bytes,activate);if(!reason)break;}
  }
  if(reason)throw new ActorPopulationLimitError(reason);
  const record={id:`actor-${++this.serial}`,definitionId:definition.actorDefinitionId,definition,category:definition.category??'monster',generation:this.generation,state:'preparing',adapter:null,estimatedBytes:bytes,estimateKind:'definition-reservation',warmed:false,lifeId:0,flags:{death:false,reward:false,respawn:false},respawnRemaining:null,spawnContext:null,idleSince:this.clock,decisionElapsed:0,operation:null,disposeStarted:false};
  this.records.set(record.id,record);this._peak();return record;
 }
 _schedule(record,activate,context,respawn=false){
  const task={record,activate,context,respawn,generation:this.generation,cancelled:false,running:false,slotReleased:false,preparation:null};
  task.promise=new Promise((resolve,reject)=>{task.resolve=resolve;task.reject=reject;});
  record.operation=task;record.state='preparing';record.respawnRemaining=null;this.tasks.add(task);this.queue.push(task);this._pump();return task.promise;
 }
 _current(task){return !this.disposed&&!task.cancelled&&task.generation===this.generation&&task.record.operation===task;}
 _pump(){
  while(!this.disposed&&this.running<this.limits.concurrentPreparations&&this.queue.length){
   const task=this.queue.shift();if(task.cancelled)continue;
   task.running=true;this.running++;
   const isCurrent=()=>this._current(task);
   try{task.preparation=this.preparationFactory({isCurrent,generation:task.generation,definition:task.record.definition});}
   catch(error){task.reject(error);this._disposeEntry(task.record);this._finish(task);continue;}
   const operation=this._prepare(task,isCurrent);task.raw=operation;
   // wait() owns timeout/cancel rejection. Keep the underlying operation alive
   // solely to reclaim its late adapter; reservations remain charged until then.
   task.preparation.wait(operation).then(task.resolve,error=>this._cancel(task,error));
   operation.then(()=>this._finish(task),()=>this._finish(task));
  }
 }
 async _prepare(task,isCurrent){
  const {record,preparation}=task,definition=record.definition;
  try{
   preparation.check();
   if(!record.adapter){
    // The adapter may retain its ownership check through many warm lives.
    // Preparation/activation checks below are shorter, per-operation leases.
    const ownerCurrent=()=>!this.disposed&&record.generation===this.generation&&this.records.get(record.id)===record&&!record.disposeStarted&&!record.operation?.cancelled;
    record.adapter=await this.createAdapter(definition,{generation:task.generation,isCurrent:ownerCurrent,preparation});this.stats.created++;
   }
   preparation.check();
   if(!record.warmed){await record.adapter.warm?.({preparation,isCurrent});preparation.check();record.warmed=true;}
   const estimate=record.adapter.estimate?.()??{},bytes=nonnegative(estimate.estimatedBytes??estimate.totalBytes,record.estimatedBytes);
   if(this.estimatedBytes-record.estimatedBytes+bytes>this.limits.estimatedMemoryBytes)throw new ActorPopulationLimitError('estimated-memory-after-warm');
   record.estimatedBytes=bytes;record.estimateKind='adapter-estimate';record.estimate=estimate;this._peak();
   if(task.activate){
    preparation.check();await record.adapter.reset?.(task.context);preparation.check();
    await record.adapter.activate(task.context,{preparation,isCurrent});preparation.check();
    record.lifeId++;record.flags={death:false,reward:false,respawn:false};record.spawnContext=task.context;record.decisionElapsed=0;record.state='active';this.stats.activated++;
    if(task.respawn){this.stats.respawns++;this._emit(this.onRespawn,record);}
   }else{record.adapter.hide?.();record.state='dormant';record.idleSince=this.clock;}
   return record;
  }catch(error){this._disposeEntry(record);throw error;}
 }
 _releaseSlot(task){if(task.running&&!task.slotReleased){task.slotReleased=true;this.running--;}}
 _finish(task){
  if(task.cancelled)this._disposeEntry(task.record);
  this._releaseSlot(task);this.tasks.delete(task);
  if(task.record.operation===task)task.record.operation=null;
  this._pump();
 }
 _cancel(task,error=bossPreparationCancelled()){
  if(task.cancelled)return;
  task.cancelled=true;this.stats.cancelled++;task.preparation?.cancel?.(error);task.reject(error);
  task.record.state='cancelled';task.record.respawnRemaining=null;
  try{task.record.adapter?.hide?.();}catch(hideError){this._error(hideError);}
  if(!task.running){this._disposeEntry(task.record);this.tasks.delete(task);if(task.record.operation===task)task.record.operation=null;}
  this._releaseSlot(task);this._pump();
 }
 _resolve(record){return typeof record==='string'?this.records.get(record):record;}
 recycle(value,{respawn=false}={}){
  const record=this._resolve(value);if(!record||!this.records.has(record.id)||record.disposeStarted)return false;
  if(record.operation){this._cancel(record.operation);return true;}
  record.adapter?.hide?.();record.state='recycle';record.decisionElapsed=0;record.idleSince=this.clock;
  if(respawn&&record.definition.respawn?.enabled&&record.flags.death&&!record.flags.respawn){record.flags.respawn=true;record.respawnRemaining=nonnegative(record.definition.respawn.delaySeconds,0);}
  else if(!respawn)record.respawnRemaining=null;
  record.state='dormant';return true;
 }
 clear({dispose=false}={}){
  for(const record of this.entries){
   if(record.operation)this._cancel(record.operation);
   else if(dispose)this._disposeEntry(record);
   else this.recycle(record);
  }
 }
 setPaused(value){this.paused=Boolean(value);}
 update(dt,context={}){
  if(this.disposed||this.paused)return;
  dt=nonnegative(dt,0);this.clock+=dt;
  for(const record of this.entries){
   if(record.state==='dormant'&&record.respawnRemaining!==null){
    record.respawnRemaining=Math.max(0,record.respawnRemaining-dt);
    if(record.respawnRemaining===0&&!record.operation&&this._activeCount()<this.limits.active){
     const spawn={...record.spawnContext,...context};
     try{this._checkSpawn(record.definition,spawn);this._schedule(record,true,spawn,true).catch(error=>{if(error.name!=='AbortError')this._error(error);});}
     // A player temporarily occupying the spawn point must not erase the one
     // respawn ticket. Retry that ticket at a bounded cadence without moving it.
     catch(error){record.respawnRemaining=Math.max(.1,nonnegative(record.definition.respawn?.retrySeconds,1));this._error(error);}
    }
   }
   if(!LIVE.has(record.state))continue;
   record.adapter.update?.(dt,context);
   if(record.category!=='npc'||record.state!=='active'||typeof record.adapter.decide!=='function')continue;
   const snapshot=record.adapter.snapshot?.()??{},position=snapshot.position,player=context.player?.position;
   const distance=position&&player?Math.hypot(position.x-player.x,position.z-player.z):0;
   const full=snapshot.combat||snapshot.incoming||snapshot.projectile||snapshot.questRelevant||distance<=nonnegative(record.definition.scheduling?.nearDistance,18);
   record.decisionElapsed+=dt;
   if(full||record.decisionElapsed>=nonnegative(record.definition.scheduling?.farDecisionSeconds,.5)){
    record.adapter.decide(record.decisionElapsed,context);record.decisionElapsed=0;this.stats.decisionUpdates++;
   }else this.stats.farDecisionSkips++;
  }
  this.evictIdle();
 }
 // Call after the existing battle update, never in place of its combat work.
 observe(context={}){
  if(this.disposed)return;
  for(const record of this.entries){
   if(!LIVE.has(record.state))continue;
   const snapshot=record.adapter.snapshot?.()??{};
   if(snapshot.dead&&!record.flags.death){record.flags.death=true;this.stats.deaths++;this._emit(this.onDeath,record,snapshot,context);}
   // This acknowledges the existing adapter/battle reward; it grants nothing.
   if(snapshot.rewardGranted&&!record.flags.reward){record.flags.reward=true;this.stats.rewardsObserved++;this._emit(this.onReward,record,snapshot,context);}
   if(snapshot.dead){
    record.state=snapshot.dying?'dying':'corpse';
    if(snapshot.corpseGone)this.recycle(record,{respawn:true});
   }else if(snapshot.active===false)this.recycle(record);
  }
 }
 evictIdle(){
  for(const record of this.entries)if(record.state==='dormant'&&!record.operation&&record.respawnRemaining===null&&this.clock-record.idleSince>=nonnegative(record.definition.population?.idleSeconds,this.limits.idleSeconds))this._disposeEntry(record);
 }
 _disposeEntry(record){
  if(record.disposeStarted)return;
  record.disposeStarted=true;record.state='disposing';record.respawnRemaining=null;
  const finish=()=>{this.records.delete(record.id);record.adapter=null;record.state='disposed';this.stats.disposed++;};
  try{
   const pending=record.adapter?.dispose?.();
   if(pending?.then){Promise.resolve(pending).then(finish,error=>{this._error(error);finish();});return;}
  }catch(error){this._error(error);}
  finish();
 }
 setGeneration(value){
  if(value===this.generation)return;
  this.generation=value;
  for(const record of this.entries)if(record.operation)this._cancel(record.operation);else this._disposeEntry(record);
 }
 leaveMap(){this.setGeneration({revision:++this.generationRevision});}
 diagnostics(){
  const states={};for(const record of this.records.values())states[record.state]=(states[record.state]??0)+1;
  return {generation:this.generation,paused:this.paused,clockSeconds:this.clock,entries:this.records.size,states,estimatedBytes:this.estimatedBytes,memoryMeaning:'Conservative definition reservations followed by adapter estimates; not measured GPU/process residency.',pending:this.tasks.size,queued:this.queue.filter(task=>!task.cancelled).length,currentPreparations:this.running,limits:{...this.limits},stats:{...this.stats},actors:this.entries.map(record=>({id:record.id,actorDefinitionId:record.definitionId,category:record.category,state:record.state,lifeId:record.lifeId,flags:{...record.flags},respawnRemaining:record.respawnRemaining,estimatedBytes:record.estimatedBytes,estimateKind:record.estimateKind}))};
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.clear({dispose:true});}
}
