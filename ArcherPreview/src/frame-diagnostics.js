// CPU-side frame intervals, not GPU timestamps. Fixed buffers keep collection
// cheap; summaries and DOM updates run only twice a second while enabled.
export class FrameDiagnostics {
  constructor(){
    this.times=new Float64Array(2048);this.intervals=new Float64Array(2048);this.work=new Float64Array(2048);
    this.reset();
  }
  reset(){this.count=0;this.cursor=0;this.last=null;this.started=null;this.pending=false;this.targetFps=30;this.events=[];}
  suspend(){this.last=null;this.pending=false;}
  begin(now,targetFps){
    const limit=Number.isFinite(targetFps)&&targetFps>0?targetFps:30;
    if(limit!==this.targetFps){this.count=0;this.cursor=0;this.last=null;this.targetFps=limit;}
    this.started??=now;
    this.frameStart=now;this.interval=this.last===null?0:now-this.last;this.pending=true;this.last=now;
  }
  get thresholdMs(){return Math.max(50,1500/this.targetFps);}
  end(now,context=()=>({})){
    const pending=this.pending;this.pending=false;
    if(!pending||this.interval<=0)return;
    const time=this.frameStart,interval=this.interval,index=this.cursor;
    this.times[index]=time;this.intervals[index]=interval;this.work[index]=Math.max(0,now-time);
    this.cursor=(index+1)%this.times.length;this.count=Math.min(this.count+1,this.times.length);
    if(interval>this.thresholdMs+.01){
      this.events.push({atSeconds:Math.round((time-this.started)/100)/10,frameMs:Math.round(interval*10)/10,jsSubmitMs:Math.round(this.work[index]*10)/10,targetFps:this.targetFps,...context()});
      if(this.events.length>32)this.events.shift();
    }
  }
  summary(){
    const now=this.last??this.times[(this.cursor+this.times.length-1)%this.times.length],values=[];
    let recentCount=0,recentTotal=0,slowFrames=0,maxWorkMs=0;
    for(let i=0;i<this.count;i++){
      if(now-this.times[i]>10000)continue;
      const ms=this.intervals[i];values.push(ms);if(ms>this.thresholdMs+.01)slowFrames++;
      maxWorkMs=Math.max(maxWorkMs,this.work[i]);
      if(now-this.times[i]<=1000){recentCount++;recentTotal+=ms;}
    }
    values.sort((a,b)=>a-b);
    return {fps:recentTotal?1000*recentCount/recentTotal:null,frameMs:values.length?this.intervals[(this.cursor+this.times.length-1)%this.times.length]:null,
      maxMs:values.at(-1)??null,p95Ms:values.length?values[Math.ceil(values.length*.95)-1]:null,
      slowFrames,thresholdMs:this.thresholdMs,targetFps:this.targetFps,samples:values.length,maxWorkMs};
  }
}

export function createFrameDiagnostics({doc=document,storage,now=()=>performance.now(),clipboard=globalThis.navigator?.clipboard,metadata=()=>({}),context=()=>({}),loads,memory=()=>({}),zoom=()=>null}={}){
  const get=id=>doc.getElementById(id),panel=get('frame-diagnostics'),toggle=get('frame-diagnostics-toggle'),copy=get('copy-frame-diagnostics'),reset=get('reset-frame-diagnostics'),status=get('frame-diagnostics-status'),fallback=get('frame-diagnostics-export');
  const monitor=new FrameDiagnostics(),key='moonforest-frame-diagnostics-v1';let enabled=false,paused=true,collecting=false,next=0;
  let nextMemory=0,memorySample={};
  try{enabled=storage?.getItem(key)==='1';}catch{/* Session-only when storage is unavailable. */}
  const setText=(id,value)=>{const node=get(id);if(node&&node.textContent!==value)node.textContent=value;};
  const sampleMemory=()=>{const at=now();if(at>=nextMemory){nextMemory=at+1000;memorySample={...memory(),sampleAtMs:at};}return memorySample;};
  const paint=()=>{
    if(!enabled)return;const s=monitor.summary(),ms=value=>value===null?'—':Math.round(value);
    const load=loads?.snapshot(),mem=sampleMemory(),seconds=value=>(value/1000).toFixed(1)+'초',mib=value=>Number.isFinite(value)?(value/1048576).toFixed(0):'—';
    setText('diagnostic-load',load?`${load.label} · ${seconds(load.totalMs)}${load.phase==='error'?' · 실패':load.phase==='complete'?'':' · 준비 중'}`:'최근 로딩 기록 없음');
    setText('diagnostic-load-phases',load?`다운로드 ${seconds(load.downloadMs)} · 모델 ${seconds(load.modelMs)} · 화면 ${seconds(load.screenMs)}`:'다운로드 — · 모델 — · 화면 —');
    setText('diagnostic-memory',`JS 메모리 ${mib(mem.jsUsedBytes)} / ${mib(mem.jsLimitBytes)} MiB${mem.jsUsedBytes==null?' (미지원)':''}`);
    setText('diagnostic-textures',`배경 고해상도 텍스처 추정 ${mib(mem.backgroundHighTextureEstimateBytes)} / ${mib(mem.backgroundHighTextureBudgetBytes)} MiB`);
    setText('diagnostic-fps',`${s.fps===null?'—':Math.round(s.fps)} FPS · 목표 ${s.targetFps}`);
    setText('diagnostic-frame',`프레임 ${ms(s.frameMs)} ms · 최대 ${ms(s.maxMs)} ms`);
    setText('diagnostic-stalls',`최근 10초 지연 ${s.slowFrames}회 · ${Math.round(s.thresholdMs)} ms 초과`);
    const view=zoom();
    setText('diagnostic-zoom',view?`화면 배율 ${view.factor.toFixed(2)}×`:'화면 배율 —');
    setText('diagnostic-zoom-range',view?`최소 ${view.minEnabled?view.minZoom.toFixed(2)+'×':'해제'} · 최대 ${view.maxEnabled?view.maxZoom.toFixed(2)+'×':'해제'}`:'최소 — · 최대 —');
    const last=monitor.events.at(-1),recent=last&&monitor.last!==null&&(monitor.last-monitor.started)/1000-last.atSeconds<3;
    panel.dataset.delayed=String(Boolean(recent&&!paused));
    const detail=last?`최근 지연 ${Math.round(last.frameMs)} ms · ${last.activity??'플레이'}`:'회전·이동하며 확인하세요';
    setText('diagnostic-detail',paused?'측정 대기 · 설정/초기 로딩 중 제외':detail);
  };
  const sync=()=>{toggle.checked=enabled;panel.hidden=!enabled;copy.disabled=!enabled;reset.disabled=!enabled;paint();};
  toggle.addEventListener('change',()=>{
    enabled=toggle.checked;monitor.reset();next=0;nextMemory=0;collecting=false;fallback.hidden=true;status.textContent='';
    try{storage?.setItem(key,enabled?'1':'0');}catch{/* Keep session choice. */}sync();
  });
  reset.addEventListener('click',()=>{monitor.reset();next=0;status.textContent='기록을 초기화했습니다.';fallback.hidden=true;paint();});
  copy.addEventListener('click',async()=>{
    const report={version:2,createdAt:new Date().toISOString(),...metadata(),measurement:'Frame intervals exclude initial loading, paused and hidden intervals. Load stages are elapsed wall time: download includes manifest/cache lookup and prefetch; model includes decode/setup and remaining I/O; screen includes shader readiness and first frames. Total also includes setup/release. JS heap is approximate, not total device/browser/GPU RAM. Background high texture estimate excludes player, base LOD, framebuffers and other GPU allocations.',summary:monitor.summary(),recentDelays:monitor.events.slice(),loading:loads?.snapshot()??null,loadHistory:loads?.history.slice()??[],memory:sampleMemory()};
    report.cameraZoom=zoom();
    const value=JSON.stringify(report,null,2);
    try{if(!clipboard?.writeText)throw new Error('Clipboard unavailable');await clipboard.writeText(value);fallback.hidden=true;status.textContent='진단 기록을 복사했습니다.';}
    catch{fallback.value=value;fallback.hidden=false;fallback.focus();fallback.select();status.textContent='아래 기록을 길게 눌러 복사해 주세요.';}
  });
  sync();
  return {
    refresh:paint,
    beginFrame(active,targetFps){
      collecting=enabled&&active;
      if(!collecting){if(enabled){monitor.suspend();if(!paused){paused=true;paint();}}return;}
      paused=false;monitor.begin(now(),targetFps);
    },
    endFrame(){if(!collecting)return;const time=now();monitor.end(time,context);if(time>=next){next=time+500;paint();}},
    suspend(){collecting=false;paused=true;monitor.suspend();paint();},
  };
}
