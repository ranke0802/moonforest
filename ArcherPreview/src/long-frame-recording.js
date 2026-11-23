// A bounded opt-in investigation, not a GPU profiler. Keep one-second
// summaries and separate long-stall records so ordinary hitches cannot evict
// the evidence the user is investigating.
const renderFields=['drawCalls','submittedTriangles','sceneMs','activeMeshesMs','renderTargetsMs','drawSubmissionMs','gpu'];
function copyFrame(frame){return {...frame,render:{...frame.render},sections:{...frame.sections}};}
export class LongFrameRecording {
 // Twenty minutes (2026-11-23, user): room for four map round trips and fights in one file.
 constructor({now=()=>performance.now(),durationMs=1200000,eventLimit=4096,criticalLimit=8192}={}){Object.assign(this,{now,durationMs,eventLimit,criticalLimit});this.state='idle';}
 start(metadata={}){const at=this.now();this.state='recording';this.startMs=at;this.endMs=null;this.startedAt=new Date().toISOString();this.metadata=metadata;this.events=[];this.critical=[];this.seconds=[];this.detailFrames=[];this.ktxUploads=[];this.lastUpload=-Infinity;this.dropped={events:0,critical:0,detailFrames:0,ktxUploads:0};this.previous=null;this.bucket=null;this.frames=0;this.detailBursts=[];this.wallStartMs=Date.now();this.reloads=[];}
 stop(reason='manual'){if(this.state!=='recording')return;this.flush();this.endMs=this.now();this.reason=reason;this.state='complete';}
 break(){this.previous=null;}
 flush(){if(this.bucket){this.seconds.push(this.bucket);this.bucket=null;}}
 record({startMs,intervalMs,workMs,targetFps,metrics,sections,context}){
  if(this.state!=='recording')return;
  const second=Math.floor((startMs-this.startMs)/1000);if(second<0)return;
  if(!this.bucket||this.bucket.second!==second){
   this.flush();this.bucket={second,frames:0,frameTotalMs:0,workTotalMs:0,maxIntervalMs:0,maxWorkMs:0,sum:{},max:{},render:{sceneMs:0,activeMeshesMs:0,drawSubmissionMs:0,renderTargetsMs:0,drawCalls:0,submittedTriangles:0},renderMax:{sceneMs:0}};
   // Once a second: scene counts, a fixed CPU reference and the browser's
   // refresh rate (see main.js recordingProbe). One call, not per frame.
   if(this.probe){try{this.bucket.probe=this.probe();}catch(error){this.bucket.probe={error:String(error?.message??error)};}}
  }
  const b=this.bucket;b.frames++;this.frames++;b.frameTotalMs+=intervalMs;b.workTotalMs+=workMs;b.maxIntervalMs=Math.max(b.maxIntervalMs,intervalMs);b.maxWorkMs=Math.max(b.maxWorkMs,workMs);
  // Every frame, not only slow ones: section and render totals per second, so
  // averages are not biased toward the frames that happened to be slow.
  for(const key in sections){const value=sections[key];if(!value)continue;b.sum[key]=(b.sum[key]??0)+value;if(value>(b.max[key]??0))b.max[key]=value;}
  if(metrics){const r=b.render;for(const key in r){const value=metrics[key];if(Number.isFinite(value))r[key]+=value;}if(metrics.sceneMs>b.renderMax.sceneMs)b.renderMax.sceneMs=metrics.sceneMs;}
  const draw=metrics?.drawCpu?.latest;
  // Match the original scene render to this JS frame. A stale sampled value
  // must never be attributed to an unrelated frame interval.
  const same=draw&&draw.startedAtMs>=startMs&&draw.completedAtMs<=startMs+workMs?draw:null;
  const slow=intervalMs>50||workMs>50||metrics?.drawSubmissionMs>50;
  // Ordinary frames only need scalar totals and the closest preceding work.
  // Keep one scratch record instead of allocating three objects at 60 Hz.
  // Retained events/bursts receive independent snapshots before it is reused.
  const previous=slow&&intervalMs>50&&this.previous?copyFrame(this.previous):null;
  const current=this.previous??{render:{},sections:{}};
  current.startMs=startMs;current.intervalMs=intervalMs;current.workMs=workMs;current.targetFps=targetFps;
  for(const key of renderFields)current.render[key]=metrics?.[key];current.render.drawCpu=same;
  for(const key in current.sections)if(!(key in sections))delete current.sections[key];
  Object.assign(current.sections,sections);
  let retained=null;
  if(same?.reason==='continuous'){if(this.detailFrames.length<2048)this.detailFrames.push(retained=copyFrame(current));else this.dropped.detailFrames++;}
  for(const upload of metrics?.drawCpu?.ktxUploads??[]){if(upload.completedAtMs<this.startMs||upload.completedAtMs<=this.lastUpload)continue;this.lastUpload=upload.completedAtMs;if(this.ktxUploads.length<1024)this.ktxUploads.push(upload);else this.dropped.ktxUploads++;}
  if(slow){
   const critical=intervalMs>=200||workMs>=200||metrics?.drawSubmissionMs>=200,entry={...(retained??copyFrame(current)),previousFrame:previous,context:context()};
   entry.ktxUploads=metrics?.drawCpu?.ktxUploads??[];
   const list=critical?this.critical:this.events,limit=critical?this.criticalLimit:this.eventLimit,key=critical?'critical':'events';
   if(list.length<limit)list.push(entry);else this.dropped[key]++;
  }
  this.previous=current;
 }
 // A recording survives a page reload (0.3 new game / load / language): the
 // state is stored with the wall clock, and on the next document every frame
 // time is moved onto the new performance clock so the timeline continues
 // (the reload gap shows as seconds without frames). Records can share
 // objects (a retained frame and its event), so each is moved once.
 exportState(reason='page-reload'){
  if(this.state!=='recording')return null;this.flush();
  return {version:1,wallStartMs:this.wallStartMs??Date.now()-(this.now()-this.startMs),savedAtWallMs:Date.now(),startMs:this.startMs,startedAt:this.startedAt,metadata:this.metadata,events:this.events,critical:this.critical,seconds:this.seconds,detailFrames:this.detailFrames,ktxUploads:this.ktxUploads,lastUpload:this.lastUpload,dropped:this.dropped,frames:this.frames,detailBursts:this.detailBursts,reloads:[...(this.reloads??[]),{atSecond:Math.round((this.now()-this.startMs)/100)/10,reason}]};
 }
 importState(saved){
  if(!saved||saved.version!==1)return false;
  const newStart=this.now()-(Date.now()-saved.wallStartMs),shift=newStart-saved.startMs,keys=['startMs','startedAtMs','completedAtMs','triggerAtMs','plannedEndMs','endedAtMs'];
  const seen=new WeakSet(),move=value=>{if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);if(Array.isArray(value)){for(const item of value)move(item);return;}for(const key of Object.keys(value)){const v=value[key];if(keys.includes(key)&&typeof v==='number')value[key]=v+shift;else if(v&&typeof v==='object')move(v);}};
  for(const list of [saved.events,saved.critical,saved.detailFrames,saved.ktxUploads,saved.detailBursts])move(list);
  Object.assign(this,{state:'recording',startMs:newStart,endMs:null,startedAt:saved.startedAt,metadata:saved.metadata,events:saved.events,critical:saved.critical,seconds:saved.seconds,detailFrames:saved.detailFrames,ktxUploads:saved.ktxUploads,lastUpload:Number.isFinite(saved.lastUpload)?saved.lastUpload+shift:-Infinity,dropped:saved.dropped,frames:saved.frames,detailBursts:saved.detailBursts,previous:null,bucket:null,wallStartMs:saved.wallStartMs,reloads:saved.reloads});
  return true;
 }
 snapshot(){return {format:'moonforest-frame-recording',version:1,state:this.state,startedAt:this.startedAt,startMs:this.startMs,endMs:this.endMs,reason:this.reason,durationLimitMs:this.durationMs,frames:this.frames,reloads:this.reloads??[],metadata:this.metadata,seconds:this.bucket?[...this.seconds,this.bucket]:this.seconds,events:this.events,critical:this.critical,detailBursts:this.detailBursts,detailFrames:this.detailFrames,ktxUploads:this.ktxUploads,dropped:this.dropped,measurement:'Basic CPU counters record every active frame. Optional detailed CPU hooks perturb performance and run briefly after a trigger using separate ordinary and critical per-minute reserves; triggering-frame detail can be missing. Previous interval ends at current start; previousFrame is its closest recorded work, not proof of causation. drawCpu matches current frame only, but its onBeforeRender/onAfterRender boundary excludes animation/contact callbacks that precede it; sceneCallMs and SDK sceneMs include different boundaries. GPU data is asynchronous or unsupported. Counters overlap, never sum. Critical and ordinary storage are independently bounded; dropped counts report loss. Paused/loading/hidden intervals are excluded. No GPU waits or fences.'};}
}
