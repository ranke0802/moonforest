// A bounded opt-in investigation, not a GPU profiler. Keep one-second
// summaries and separate long-stall records so ordinary hitches cannot evict
// the evidence the user is investigating.
const renderFields=['drawCalls','submittedTriangles','sceneMs','activeMeshesMs','renderTargetsMs','drawSubmissionMs','gpu'];
function copyFrame(frame){return {...frame,render:{...frame.render},sections:{...frame.sections}};}
export class LongFrameRecording {
 constructor({now=()=>performance.now(),durationMs=600000,eventLimit=2048,criticalLimit=4096}={}){Object.assign(this,{now,durationMs,eventLimit,criticalLimit});this.state='idle';}
 start(metadata={}){const at=this.now();this.state='recording';this.startMs=at;this.endMs=null;this.startedAt=new Date().toISOString();this.metadata=metadata;this.events=[];this.critical=[];this.seconds=[];this.detailFrames=[];this.ktxUploads=[];this.lastUpload=-Infinity;this.dropped={events:0,critical:0,detailFrames:0,ktxUploads:0};this.previous=null;this.bucket=null;this.frames=0;this.detailBursts=[];}
 stop(reason='manual'){if(this.state!=='recording')return;this.flush();this.endMs=this.now();this.reason=reason;this.state='complete';}
 break(){this.previous=null;}
 flush(){if(this.bucket){this.seconds.push(this.bucket);this.bucket=null;}}
 record({startMs,intervalMs,workMs,targetFps,metrics,sections,context}){
  if(this.state!=='recording')return;
  const second=Math.floor((startMs-this.startMs)/1000);if(second<0)return;
  if(!this.bucket||this.bucket.second!==second){this.flush();this.bucket={second,frames:0,frameTotalMs:0,workTotalMs:0,maxIntervalMs:0,maxWorkMs:0};}
  const b=this.bucket;b.frames++;this.frames++;b.frameTotalMs+=intervalMs;b.workTotalMs+=workMs;b.maxIntervalMs=Math.max(b.maxIntervalMs,intervalMs);b.maxWorkMs=Math.max(b.maxWorkMs,workMs);
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
 snapshot(){return {format:'moonforest-frame-recording',version:1,state:this.state,startedAt:this.startedAt,startMs:this.startMs,endMs:this.endMs,reason:this.reason,durationLimitMs:this.durationMs,frames:this.frames,metadata:this.metadata,seconds:this.bucket?[...this.seconds,this.bucket]:this.seconds,events:this.events,critical:this.critical,detailBursts:this.detailBursts,detailFrames:this.detailFrames,ktxUploads:this.ktxUploads,dropped:this.dropped,measurement:'Basic CPU counters record every active frame. Optional detailed CPU hooks perturb performance and run briefly after a trigger using separate ordinary and critical per-minute reserves; triggering-frame detail can be missing. Previous interval ends at current start; previousFrame is its closest recorded work, not proof of causation. drawCpu matches current frame only, but its onBeforeRender/onAfterRender boundary excludes animation/contact callbacks that precede it; sceneCallMs and SDK sceneMs include different boundaries. GPU data is asynchronous or unsupported. Counters overlap, never sum. Critical and ordinary storage are independently bounded; dropped counts report loss. Paused/loading/hidden intervals are excluded. No GPU waits or fences.'};}
}
