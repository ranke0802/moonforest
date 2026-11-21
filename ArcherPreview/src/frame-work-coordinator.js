// Cooperative accounting for preparation only. Gameplay, animation, contacts
// and rendering never enter this coordinator. An atomic SDK call cannot be
// interrupted; its overrun is counted before the next preparation boundary.
const coordinators=new WeakMap();let currentScene=null;
const clock=()=>performance.now();
export class FrameWorkCoordinator{
 constructor({now=clock,budgetMs=2}={}){this.now=now;this.budgetMs=budgetMs;this.active=false;this.generation=0;this.epoch=0;this.frameId=null;this.usedMs=0;this.totalMs=0;this.yields=0;this.overruns=0;this.worst=new Map();}
 begin({active=false,frameId=this.frameId,generation=this.generation,budgetMs=this.budgetMs}={}){
  if(this.frameId!==frameId||this.generation!==generation||this.active!==!!active){this.epoch++;this.usedMs=0;}
  this.frameId=frameId;this.generation=generation;this.active=!!active;this.budgetMs=Math.max(.25,Math.min(4,Number.isFinite(budgetMs)?budgetMs:2));
 }
 // label: which preparation step this was. Kept only for the steps that ran over the budget,
 // 48 labels at most, so a recording can say which atomic step makes the long frames.
 charge(milliseconds,label=null){
  if(!this.active)return;const value=Math.max(0,Number.isFinite(milliseconds)?milliseconds:0);this.usedMs+=value;this.totalMs+=value;
  if(value>this.budgetMs){
   this.overruns++;const key=typeof label==='string'&&label?label.slice(0,48):'unlabelled';let row=this.worst.get(key);
   if(!row){if(this.worst.size>=48)return;row={count:0,ms:0,maxMs:0};this.worst.set(key,row);}
   row.count++;row.ms+=value;if(value>row.maxMs)row.maxMs=value;
  }
 }
 opportunity(epoch){
  // A renderer hook normally advances the epoch. If rendering is paused/capped,
  // the existing awaited scheduling barrier still supplies one opportunity.
  // Concurrent waiters holding the same epoch reset the budget only once.
  if(this.epoch===epoch){this.epoch++;this.usedMs=0;}
 }
 snapshot(){return {active:this.active,budgetMs:this.budgetMs,usedMs:this.usedMs,generation:this.generation,frameId:this.frameId,totalPreparationMs:this.totalMs,sharedYields:this.yields,atomicOverruns:this.overruns,overrunsByStep:[...this.worst].sort((a,b)=>b[1].ms-a[1].ms).slice(0,20).map(([step,row])=>({step,count:row.count,ms:Math.round(row.ms*10)/10,maxMs:Math.round(row.maxMs*10)/10})),scope:'cooperative preparation accounting; callback CPU and conservative elapsed checkpoints, not frame/GPU time or a preemptive limit'};}
}
export function setFrameWorkContext(scene,options={}){
 if(!scene||typeof scene!=='object')return null;
 let coordinator=coordinators.get(scene);if(!coordinator){coordinator=new FrameWorkCoordinator();coordinators.set(scene,coordinator);}currentScene=scene;coordinator.begin(options);return coordinator;
}
export function frameWorkSnapshot(scene=currentScene){return coordinators.get(scene)?.snapshot()??null;}
export function createFrameWorkLease({scene=currentScene,coordinator=scene&&coordinators.get(scene),now=clock}={}){
 if(!coordinator)return null;
 const generation=coordinator.generation;let at=now(),epoch=coordinator.epoch,used=coordinator.usedMs;
 const valid=()=>coordinator.active&&coordinator.generation===generation;
 const reset=()=>{at=now();epoch=coordinator.epoch;used=coordinator.usedMs;};
 return {
  due(){return valid()&&coordinator.usedMs>=coordinator.budgetMs;},
  // The placement loop has existing before-item checkpoints rather than a
  // callback wrapper. Deduct work already charged by another preparation owner.
  checkpoint(label=null){const time=now();if(valid()&&epoch===coordinator.epoch)coordinator.charge(Math.max(0,time-at-Math.max(0,coordinator.usedMs-used)),label);reset();},
  charge(milliseconds,label=null){if(valid())coordinator.charge(milliseconds,label);reset();},
  beforeWait(){const token=coordinator.epoch;if(valid())coordinator.yields++;return token;},
  afterWait(token){if(valid())coordinator.opportunity(token);reset();},
  reset,
 };
}
