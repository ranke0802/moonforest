// Bounded CPU/frame telemetry only. No GPU fences, readbacks, scene traversal,
// or network requests are introduced by the comparison recorder.
const FIELDS=['frameMs','cpuMs','drawCalls','sceneMs','animationMs','bossUpdateMs','contactsMs'];
const valid=n=>Number.isFinite(n)&&n>=0;
export class FrameWindow {
  constructor(){this.times=new Float64Array(2048);this.values=Object.fromEntries(FIELDS.map(k=>[k,new Float64Array(2048)]));this.clear();}
  clear(){this.count=0;this.cursor=0;this.durationMs=0;}
  add(at,frame){const i=this.cursor;this.times[i]=at;for(const k of FIELDS)this.values[k][i]=valid(frame[k])?frame[k]:NaN;this.cursor=(i+1)%2048;this.count=Math.min(2048,this.count+1);this.durationMs+=frame.frameMs;}
  summary(since=-Infinity){
    const result={samples:0,durationMs:0};
    for(const k of FIELDS){const values=[];for(let i=0;i<this.count;i++)if(this.times[i]>=since&&valid(this.values[k][i]))values.push(this.values[k][i]);values.sort((a,b)=>a-b);
      const sum=values.reduce((a,b)=>a+b,0);result[k]={mean:values.length?sum/values.length:null,p95:values.length?values[Math.ceil(values.length*.95)-1]:null,max:values.at(-1)??null};
      if(k==='frameMs'){result.samples=values.length;result.durationMs=sum;}}
    return result;
  }
}

export class BossDiagnostics {
  constructor(){this.recent=new FrameWindow();this.during=new FrameWindow();this.after=new FrameWindow();this.reset();}
  reset(){this.recent.clear();this.during.clear();this.after.clear();this.current=null;this.history=[];this.backgroundLoads=[];this.serial=0;}
  interrupt(reason){if(this.current&&['preparing','sampling'].includes(this.current.status)){this.current.status='interrupted';this.current.reason=reason;}}
  event(event,at,memory,context={}){
    if(event.type==='prefetch-start'){this.backgroundLoads.push({label:event.label,status:'loading',started:at,memoryBefore:{...memory}});if(this.backgroundLoads.length>8)this.backgroundLoads.shift();return;}
    if(event.type==='prefetch-end'){const pending=this.backgroundLoads.findLast(r=>r.status==='loading'&&r.label===event.label);if(pending){pending.status=event.error?'error':'complete';pending.elapsedMs=at-pending.started;pending.memoryAfter={...memory};pending.error=event.error??null;}return;}
    if(event.type==='begin'){
      this.interrupt('다음 소환');if(this.current){this.history.push(this.snapshot());if(this.history.length>3)this.history.shift();}
      this.during.clear();this.after.clear();
      this.current={id:++this.serial,label:event.label,trigger:event.trigger,mode:event.mode,status:'preparing',started:at,stage:'resource',stageStarted:at,stageMs:{resource:0,model:0,screen:0},before:this.recent.summary(at-3000),memoryBefore:{...memory},contextBefore:context,targets:valid(context.targetFps)?[context.targetFps]:[],stages:[],pauses:0};
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
    this.recent.add(at,frame);const c=this.current;if(!c||!['preparing','sampling'].includes(c.status))return;
    if(!c.targets.includes(frame.targetFps))c.targets.push(frame.targetFps);
    if(c.status==='preparing'||(frame.intervalStart??at-frame.frameMs)<c.readyAt){this.during.add(at,frame);return;}
    this.after.add(at,frame);c.memoryAfter={...memory};
    if(this.after.durationMs>=5000){c.status='complete';c.contextAfter=context();c.completedAt=at;}
  }
  suspend(){this.recent.clear();if(this.current&&['preparing','sampling'].includes(this.current.status))this.current.pauses++;}
  snapshot(){
    const c=this.current;if(!c)return null;const during=this.during.summary(),after=this.after.summary();
    const delta={};for(const k of FIELDS){const a=c.before[k].mean,b=after[k].mean;delta[k]=a!=null&&b!=null?b-a:null;}
    const before=c.memoryBefore?.jsUsedBytes,last=(c.memoryAfter??c.memoryReady)?.jsUsedBytes;
    delta.jsUsedBytes=before!=null&&last!=null?last-before:null;
    const end=c.contextAfter??c.contextReady,changed=(key,tolerance)=>Array.isArray(c.contextBefore?.[key])&&Array.isArray(end?.[key])&&c.contextBefore[key].some((v,i)=>Math.abs(v-end[key][i])>tolerance);
    return {...c,stageMs:{...c.stageMs},stages:c.stages.map(s=>({...s})),targets:[...c.targets],during,after,delta,cameraChanged:changed('camera',.02),positionChanged:changed('position',.2),baselineReady:c.before.durationMs>=2800,afterProgress:Math.min(1,this.after.durationMs/5000)};
  }
}

const number=(n,digits=1)=>Number.isFinite(n)?n.toFixed(digits):'—';
const change=(n,digits=1)=>Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(digits)}`:'—';
const mib=n=>Number.isFinite(n)?n/1048576:null;
export function bossComparisonLines(s){
  if(!s)return {title:'소환 비교 · 소환 전 3초 기록 중',frame:'진단을 켜고 잠시 플레이한 뒤 소환하세요.',draw:'',memory:'',peak:'',stages:'',cpu:'',note:''};
  const status={preparing:'준비 중',sampling:`등장 후 ${(s.afterProgress*5).toFixed(1)}/5초`,complete:'비교 완료',interrupted:'측정 중단',error:'준비 실패'}[s.status];
  const a=s.before,b=s.after,m=s.memoryAfter??s.memoryReady;
  return {title:`${s.label} · ${status}`,frame:`프레임 ${number(a.frameMs.mean)} → ${number(b.frameMs.mean)} ms (${change(s.delta.frameMs)})`,
    draw:`드로콜 ${number(a.drawCalls.mean,0)} → ${number(b.drawCalls.mean,0)} (${change(s.delta.drawCalls,0)})`,
    memory:`JS ${number(mib(s.memoryBefore?.jsUsedBytes),0)} → ${number(mib(m?.jsUsedBytes),0)} MiB (${change(mib(s.delta.jsUsedBytes),0)})`,
    peak:`p95 ${number(a.frameMs.p95)} → ${number(b.frameMs.p95)} ms · 준비 최대 ${number(s.during.frameMs.max)} ms`,
    stages:`리소스 ${number(s.stageMs.resource/1000)} · 모델 ${number(s.stageMs.model/1000)} · 화면 ${number(s.stageMs.screen/1000)}초`,
    cpu:`CPU ${number(a.cpuMs.mean)} → ${number(b.cpuMs.mean)} ms · 보스 ${number(b.bossUpdateMs.mean)} · 판정 ${number(b.contactsMs.mean)}`,
    note:`전 3초 → 후 5초${s.baselineReady?'':' · 이전 표본 부족'}${s.targets.length>1?' · 목표 FPS 변경':''}${s.cameraChanged||s.positionChanged?' · 시점/위치 변경':''}${s.pauses?' · 중간 일시정지':''} · ${s.mode==='reuse'?'재소환':s.mode==='cached-model'?'모델 준비됨':'첫 준비'}`};
}
