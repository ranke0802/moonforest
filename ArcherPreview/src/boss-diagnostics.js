// GPU timer results are a separate asynchronous sample stream. Never weight a
// repeated latest result once per CPU frame or add GPU time to CPU counters.
const FIELDS=['frameMs','cpuMs','drawCalls','sceneMs','animationMs','bossUpdateMs','contactsMs'];
const valid=n=>Number.isFinite(n)&&n>=0;
const preparationSummary=stats=>stats?{yields:valid(stats.yields)?stats.yields:0,slices:valid(stats.slices)?stats.slices:0,blocks:valid(stats.blocks)?stats.blocks:0,maxSliceMs:valid(stats.maxSliceMs)?stats.maxSliceMs:null,steps:(stats.steps??[]).slice(0,32).map(step=>({name:String(step.name).slice(0,100),ms:valid(step.ms)?step.ms:null}))}:null;
const gpuSample=gpu=>gpu?.status==='valid'&&gpu.latest&&typeof gpu.latest.sampleId==='string'&&valid(gpu.latest.ms)&&Number.isFinite(gpu.latest.startAtMs)&&Number.isFinite(gpu.latest.endAtMs)&&gpu.latest.endAtMs>=gpu.latest.startAtMs?gpu.latest:null;
export class FrameWindow {
  constructor(){this.times=new Float64Array(2048);this.values=Object.fromEntries(FIELDS.map(k=>[k,new Float64Array(2048)]));this.gpuStarts=new Float64Array(128);this.gpuEnds=new Float64Array(128);this.gpuValues=new Float64Array(128);this.gpuIds=new Array(128);this.clear();}
  clear(){this.count=0;this.cursor=0;this.durationMs=0;this.gpuCount=0;this.gpuCursor=0;this.gpuSeen=new Set();this.gpuStatus='pending';}
  addGpu(gpu,{since=-Infinity,until=Infinity}={}){
    if(gpu?.status)this.gpuStatus=gpu.status;const sample=gpuSample(gpu);
    if(!sample||this.gpuSeen.has(sample.sampleId)||sample.startAtMs<since||sample.endAtMs>until)return false;
    const i=this.gpuCursor;if(this.gpuCount===128)this.gpuSeen.delete(this.gpuIds[i]);
    this.gpuStarts[i]=sample.startAtMs;this.gpuEnds[i]=sample.endAtMs;this.gpuValues[i]=sample.ms;this.gpuIds[i]=sample.sampleId;this.gpuSeen.add(sample.sampleId);this.gpuCursor=(i+1)%128;this.gpuCount=Math.min(128,this.gpuCount+1);return true;
  }
  add(at,frame){const i=this.cursor;this.times[i]=at;for(const k of FIELDS)this.values[k][i]=valid(frame[k])?frame[k]:NaN;this.cursor=(i+1)%2048;this.count=Math.min(2048,this.count+1);this.durationMs+=frame.frameMs;this.addGpu(frame.gpu);}
  summary(since=-Infinity){
    const result={samples:0,durationMs:0};
    for(const k of FIELDS){const values=[];for(let i=0;i<this.count;i++)if(this.times[i]>=since&&valid(this.values[k][i]))values.push(this.values[k][i]);values.sort((a,b)=>a-b);
      const sum=values.reduce((a,b)=>a+b,0);result[k]={mean:values.length?sum/values.length:null,p95:values.length?values[Math.ceil(values.length*.95)-1]:null,max:values.at(-1)??null};
      if(k==='frameMs'){result.samples=values.length;result.durationMs=sum;}}
    const gpu=[];for(let i=0;i<this.gpuCount;i++)if(this.gpuStarts[i]>=since)gpu.push(this.gpuValues[i]);gpu.sort((a,b)=>a-b);
    result.gpuMs={mean:gpu.length?gpu.reduce((a,b)=>a+b,0)/gpu.length:null,p95:gpu.length?gpu[Math.ceil(gpu.length*.95)-1]:null,max:gpu.at(-1)??null,samples:gpu.length,asynchronous:true};result.gpuStatus=this.gpuStatus;
    return result;
  }
}

export class BossDiagnostics {
  constructor(){this.recent=new FrameWindow();this.during=new FrameWindow();this.after=new FrameWindow();this.reset();}
  reset(){this.recent.clear();this.during.clear();this.after.clear();this.current=null;this.history=[];this.backgroundLoads=[];this.serial=0;this.frozenBaseline=null;this.gpuStageIds=new Set();}
  clearBaseline(){this.recent.clear();this.frozenBaseline=null;}
  interrupt(reason){if(this.current&&['preparing','sampling'].includes(this.current.status)){this.current.status='interrupted';this.current.reason=reason;}}
  event(event,at,memory,context={}){
    if(event.type==='prefetch-start'){this.backgroundLoads.push({label:event.label,...(event.jobId!=null?{jobId:event.jobId}:{}),status:'loading',started:at,memoryBefore:{...memory}});if(this.backgroundLoads.length>8)this.backgroundLoads.shift();return;}
    if(event.type==='prefetch-end'){const pending=this.backgroundLoads.findLast(r=>r.status==='loading'&&r.label===event.label&&(event.jobId!=null?r.jobId===event.jobId:r.jobId==null));if(pending){pending.status=event.error?'error':event.status==='cancelled'?'cancelled':'complete';pending.elapsedMs=Math.max(0,at-pending.started);pending.memoryAfter={...memory};pending.error=event.error??null;if(event.preparationStats)pending.preparation=preparationSummary(event.preparationStats);}return;}
    if(event.type==='begin'){
      this.interrupt('다음 소환');if(this.current){this.history.push(this.snapshot());if(this.history.length>3)this.history.shift();}
      this.during.clear();this.after.clear();this.gpuStageIds.clear();
      const frozen=this.frozenBaseline;
      this.current={id:++this.serial,label:event.label,trigger:event.trigger,mode:event.mode,status:'preparing',started:at,stage:'resource',stageStarted:at,stageMs:{resource:0,model:0,screen:0},before:frozen?.summary??this.recent.summary(at-3000),baselineSource:frozen?'before-summon-menu':'recent-play',baselineAgeMs:frozen?Math.max(0,at-frozen.capturedAt):0,memoryBefore:{...memory},contextBefore:context,targets:valid(context.targetFps)?[context.targetFps]:[],stages:[],pauses:0,gpuBoundaryExcluded:0};
      return;
    }
    const c=this.current;if(!c||c.status!=='preparing')return;
    const close=()=>{c.stageMs[c.stage]=(c.stageMs[c.stage]??0)+Math.max(0,at-c.stageStarted);c.stages.push({stage:c.stage,endedMs:at-c.started});};
    if(event.type==='stage'&&event.stage!==c.stage){close();c.stage=event.stage;c.stageStarted=at;}
    else if(event.type==='ready'||event.type==='error'||event.type==='cancel'){
      close();c.prepareMs=at-c.started;c.memoryReady={...memory};c.readyAt=at;c.contextReady=context;
      c.status=event.type==='ready'?'sampling':event.type==='error'?'error':'interrupted';c.reason=event.error??event.reason??null;
    }
  }
  frame(at,frame,memory,context){
    if(!valid(frame.frameMs)||frame.frameMs<=0)return;
    this.frozenBaseline=null;this.recent.add(at,frame);const c=this.current,sample=gpuSample(frame.gpu);
    if(c&&sample&&!this.gpuStageIds.has(sample.sampleId)&&['preparing','sampling','complete'].includes(c.status)&&!(c.status==='complete'&&sample.startAtMs>=c.completedAt)){
      if(this.gpuStageIds.size>=128)this.gpuStageIds.delete(this.gpuStageIds.values().next().value);
      this.gpuStageIds.add(sample.sampleId);
      if(sample.startAtMs>=c.started&&sample.endAtMs<=(c.readyAt??Infinity))this.during.addGpu(frame.gpu);
      else if(c.readyAt!=null&&sample.startAtMs>=c.readyAt&&sample.endAtMs<=(c.completedAt??Infinity))this.after.addGpu(frame.gpu);
      else c.gpuBoundaryExcluded++;
    }
    if(!c||!['preparing','sampling'].includes(c.status))return;
    if(!c.targets.includes(frame.targetFps))c.targets.push(frame.targetFps);
    if(c.status==='preparing'||(frame.intervalStart??at-frame.frameMs)<c.readyAt){this.during.add(at,{...frame,gpu:null});if(frame.gpu?.status&&frame.gpu.status!=='valid')this.during.gpuStatus=frame.gpu.status;return;}
    this.after.add(at,{...frame,gpu:null});if(frame.gpu?.status&&frame.gpu.status!=='valid')this.after.gpuStatus=frame.gpu.status;c.memoryAfter={...memory};
    if(this.after.durationMs>=5000){c.status='complete';c.contextAfter=context();c.completedAt=at;}
  }
  suspend({preserveBaseline=false,at=0}={}){
    // Summoning happens while its modal pauses the game. Freeze only that
    // menu's preceding play window; hidden/settings/death/map pauses discard it.
    if(preserveBaseline){this.frozenBaseline??={summary:this.recent.summary(at-3000),capturedAt:at};this.recent.clear();}
    else this.clearBaseline();
    if(this.current&&['preparing','sampling'].includes(this.current.status))this.current.pauses++;
  }
  snapshot(){
    const c=this.current;if(!c)return null;const during=this.during.summary(),after=this.after.summary();
    const delta={};for(const k of FIELDS){const a=c.before[k].mean,b=after[k].mean;delta[k]=a!=null&&b!=null?b-a:null;}
    delta.gpuMs=c.before.gpuMs.mean!=null&&after.gpuMs.mean!=null?after.gpuMs.mean-c.before.gpuMs.mean:null;
    const before=c.memoryBefore?.jsUsedBytes,last=(c.memoryAfter??c.memoryReady)?.jsUsedBytes;
    delta.jsUsedBytes=before!=null&&last!=null?last-before:null;
    const end=c.contextAfter??c.contextReady,changed=(key,tolerance)=>Array.isArray(c.contextBefore?.[key])&&Array.isArray(end?.[key])&&c.contextBefore[key].some((v,i)=>Math.abs(v-end[key][i])>tolerance);
    return {...c,stageMs:{...c.stageMs},stages:c.stages.map(s=>({...s})),targets:[...c.targets],during,after,delta,cameraChanged:changed('camera',.02),positionChanged:changed('position',.2),baselineReady:c.before.durationMs>=2800,comparisonAvailable:c.before.durationMs>=2800&&after.samples>0,afterProgress:Math.min(1,this.after.durationMs/5000)};
  }
}

const number=(n,digits=1)=>Number.isFinite(n)?n.toFixed(digits):'—';
const change=(n,digits=1)=>Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(digits)}`:'—';
const mib=n=>Number.isFinite(n)?n/1048576:null;
export function bossComparisonLines(s){
  if(!s)return {title:'소환 비교 · 소환 전 3초 기록 중',frame:'진단을 켜고 잠시 플레이한 뒤 소환하세요.',draw:'',memory:'',peak:'',stages:'',cpu:'',gpu:'',note:''};
  const status={preparing:'준비 중',sampling:`등장 후 ${(s.afterProgress*5).toFixed(1)}/5초`,complete:s.baselineReady?'비교 완료':'등장 후 기록 완료 · 이전 표본 부족',interrupted:'측정 중단',error:'준비 실패'}[s.status];
  const a=s.before,b=s.after,m=s.memoryAfter??s.memoryReady;
  return {title:`${s.label} · ${status}`,frame:`프레임 ${number(a.frameMs.mean)} → ${number(b.frameMs.mean)} ms (${change(s.delta.frameMs)})`,
    draw:`드로콜 ${number(a.drawCalls.mean,0)} → ${number(b.drawCalls.mean,0)} (${change(s.delta.drawCalls,0)})`,
    memory:`JS ${number(mib(s.memoryBefore?.jsUsedBytes),0)} → ${number(mib(m?.jsUsedBytes),0)} MiB (${change(mib(s.delta.jsUsedBytes),0)})`,
    peak:`p95 ${number(a.frameMs.p95)} → ${number(b.frameMs.p95)} ms · 준비 최대 ${number(s.during.frameMs.max)} ms`,
    stages:`리소스 ${number(s.stageMs.resource/1000)} · 모델 ${number(s.stageMs.model/1000)} · 화면 ${number(s.stageMs.screen/1000)}초`,
    cpu:`CPU ${number(a.cpuMs.mean)} → ${number(b.cpuMs.mean)} ms · 보스 ${number(b.bossUpdateMs.mean)} · 판정 ${number(b.contactsMs.mean)}`,
    gpu:`GPU ${number(a.gpuMs.mean)} → ${number(b.gpuMs.mean)} ms · 비동기 표본 ${a.gpuMs.samples}/${b.gpuMs.samples}${s.gpuBoundaryExcluded?' · 경계 제외 '+s.gpuBoundaryExcluded:''}`,
    note:`전 3초 → 후 5초${s.baselineSource==='before-summon-menu'?' · 소환창 전 표본':''}${s.baselineReady?'':' · 이전 표본 부족'}${s.targets.length>1?' · 목표 FPS 변경':''}${s.cameraChanged||s.positionChanged?' · 시점/위치 변경':''}${s.pauses?' · 중간 일시정지':''} · ${s.mode==='reuse'?'재소환':s.mode==='cached-model'?'모델 준비됨':'첫 준비'}`};
}
