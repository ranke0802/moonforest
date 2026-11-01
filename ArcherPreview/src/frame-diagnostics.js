import {BossDiagnostics,bossComparisonLines} from './boss-diagnostics.js';
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

export function gpuDiagnosticLine(gpu){
  if(gpu?.status==='valid'&&Number.isFinite(gpu.meanMs))return `GPU 평균 ${gpu.meanMs.toFixed(1)} ms · 비동기 ${gpu.samples}표본`;
  if(gpu?.status==='paused'&&Number.isFinite(gpu.retained?.meanMs))return `GPU 최근 ${gpu.retained.meanMs.toFixed(1)} ms · 일시정지`;
  const labels={unsupported:'미지원',pending:'결과 대기',paused:'일시정지',disabled:'꺼짐',disjoint:'계측 무효',stale:'오래된 표본',invalid:'유효 표본 없음',timeout:'응답 시간 초과',error:'계측 불가',busy:'다른 계측 중','context-lost':'화면 복구 대기'};
  return `GPU — · ${labels[gpu?.status]??'결과 대기'}`;
}

export function createFrameDiagnostics({doc=document,storage,now=()=>performance.now(),clipboard=globalThis.navigator?.clipboard,metadata=()=>({}),context=()=>({}),loads,memory=()=>({}),zoom=()=>null,renderMetrics=()=>({}),onEnabled=()=>{},onCollecting=()=>{},onMapChanged=()=>{},onReset=()=>{}}={}){
  const get=id=>doc.getElementById(id),panel=get('frame-diagnostics'),toggle=get('frame-diagnostics-toggle'),copy=get('copy-frame-diagnostics'),reset=get('reset-frame-diagnostics'),status=get('frame-diagnostics-status'),fallback=get('frame-diagnostics-export');
  const monitor=new FrameDiagnostics(),key='moonforest-frame-diagnostics-v1';let enabled=false,paused=true,collecting=false,next=0;
  const bosses=new BossDiagnostics(),comparison=get('diagnostic-boss-comparison');
  const detailDialog=get('diagnostic-detail-dialog'),expand=get('diagnostic-expand');
  if(panel.dataset)panel.dataset.expanded='false';
  expand?.setAttribute?.('aria-expanded','false');
  expand?.addEventListener('click',()=>{if(detailDialog&&!detailDialog.open){const box=get('diagnostic-detail-export'),note=get('diagnostic-detail-status');if(box)box.hidden=true;if(note)note.textContent='';paint();detailDialog.showModal();expand.setAttribute('aria-expanded','true');}});
  for(const id of ['close-diagnostic-detail','diagnostic-detail-done'])get(id)?.addEventListener('click',()=>detailDialog?.close());
  detailDialog?.addEventListener('close',()=>expand?.setAttribute('aria-expanded','false'));
  const setCollecting=value=>{if(collecting!==value){collecting=value;onCollecting(value);}};
  comparison?.addEventListener('keydown',event=>{if(event.target?.tagName==='SUMMARY'&&['Space','Enter'].includes(event.code))event.stopPropagation();});
  let nextMemory=0,memorySample={},metrics={},sections={bossUpdateMs:0,contactsMs:0};
  // Paused preview renders can change Babylon's shared CPU counters. Keep the
  // last play snapshot and refresh only asynchronous GPU state/retained age.
  const refreshGpu=()=>{const sample=renderMetrics();if(sample&&Object.hasOwn(sample,'gpu'))metrics={...metrics,gpu:sample.gpu};};
  try{enabled=storage?.getItem(key)==='1';}catch{/* Session-only when storage is unavailable. */}
  const setText=(id,value)=>{const node=get(id);if(node&&node.textContent!==value)node.textContent=value;};
  const sampleMemory=(force=false)=>{const at=now();if(force||at>=nextMemory){nextMemory=at+1000;memorySample={...memory(),sampleAtMs:at};}return memorySample;};
  const paint=()=>{
    if(!enabled)return;const s=monitor.summary(),ms=value=>value===null?'—':Math.round(value);
    const load=loads?.snapshot(),mem=sampleMemory(),seconds=value=>(value/1000).toFixed(1)+'초',mib=value=>Number.isFinite(value)?(value/1048576).toFixed(0):'—';
    setText('diagnostic-load',load?`${load.label} · ${seconds(load.totalMs)}${load.phase==='error'?' · 실패':load.phase==='complete'?'':' · 준비 중'}`:'최근 로딩 기록 없음');
    setText('diagnostic-load-phases',load?`다운로드 ${seconds(load.downloadMs)} · 모델 ${seconds(load.modelMs)} · 화면 ${seconds(load.screenMs)}`:'다운로드 — · 모델 — · 화면 —');
    setText('diagnostic-memory',`JS 메모리 ${mib(mem.jsUsedBytes)} / ${mib(mem.jsLimitBytes)} MiB${mem.jsUsedBytes==null?' (미지원)':''}`);
    setText('diagnostic-textures',`배경 고해상도 텍스처 추정 ${mib(mem.backgroundHighTextureEstimateBytes)} / ${mib(mem.backgroundHighTextureBudgetBytes)} MiB`);
    setText('diagnostic-fps',paused?'일시정지 · 직전 기록':`${s.fps===null?'집계 중':Math.round(s.fps)+' FPS'} · 목표 ${s.targetFps}`);
    setText('diagnostic-frame',`${ms(s.frameMs)} ms · p95 ${ms(s.p95Ms)} ms`);
    setText('diagnostic-detail-frame',`최근 10초 · 최대 ${ms(s.maxMs)} ms · p95 ${ms(s.p95Ms)} ms${paused?' · 정지 전 기록':''}`);
    setText('diagnostic-render',`드로콜 ${Number.isFinite(metrics.drawCalls)?metrics.drawCalls:'—'} · 화면 CPU ${Number.isFinite(metrics.sceneMs)?metrics.sceneMs.toFixed(1):'—'} ms`);
    setText('diagnostic-gpu',gpuDiagnosticLine(metrics.gpu));
    const comparisonSnapshot=bosses.snapshot(),lines=bossComparisonLines(comparisonSnapshot);
    for(const [key,value] of Object.entries(lines))setText('diagnostic-boss-'+key,value);
    setText('diagnostic-boss-live',`현재 보스 ${sections.bossUpdateMs.toFixed(1)} · 판정 ${sections.contactsMs.toFixed(1)} · 애니메이션 ${Number.isFinite(metrics.animationMs)?metrics.animationMs.toFixed(1):'—'} ms${bosses.backgroundLoads.some(r=>r.status==='loading')?' · 변신 준비 중':''}`);
    setText('diagnostic-stalls',`최근 10초 지연 ${s.slowFrames}회 · ${Math.round(s.thresholdMs)} ms 초과`);
    const view=zoom();
    setText('diagnostic-zoom',view?`화면 배율 ${view.factor.toFixed(2)}×`:'화면 배율 —');
    setText('diagnostic-zoom-range',view?`최소 ${view.minEnabled?view.minZoom.toFixed(2)+'×':'해제'} · 최대 ${view.maxEnabled?view.maxZoom.toFixed(2)+'×':'해제'}`:'최소 — · 최대 —');
    const last=monitor.events.at(-1),recent=last&&monitor.last!==null&&(monitor.last-monitor.started)/1000-last.atSeconds<3;
    panel.dataset.delayed=String(Boolean(recent&&!paused));
    const detail=last?`최근 지연 ${Math.round(last.frameMs)} ms · ${last.activity??'플레이'}`:'회전·이동하며 확인하세요';
    setText('diagnostic-detail',paused?'측정 대기 · 설정/초기 로딩 중 제외':detail);
  };
  const sync=()=>{toggle.checked=enabled;panel.hidden=!enabled;copy.disabled=!enabled;reset.disabled=!enabled;onEnabled(enabled);paint();};
  toggle.addEventListener('change',()=>{
    enabled=toggle.checked;setCollecting(false);monitor.reset();bosses.reset();metrics={};next=0;nextMemory=0;fallback.hidden=true;status.textContent='';if(!enabled&&detailDialog?.open)detailDialog.close();if(comparison)comparison.open=false;
    try{storage?.setItem(key,enabled?'1':'0');}catch{/* Keep session choice. */}sync();
  });
  reset.addEventListener('click',()=>{monitor.reset();bosses.reset();onReset();metrics={};next=0;status.textContent='기록을 초기화했습니다.';fallback.hidden=true;paint();});
  const copyReport=async()=>{
    if(enabled)refreshGpu();
    const report={version:2,createdAt:new Date().toISOString(),...metadata(),measurement:'Frame intervals exclude initial loading, paused and hidden intervals. Load stages are elapsed wall time: download includes manifest/cache lookup and prefetch; model includes decode/setup and remaining I/O; screen includes shader readiness and first frames. Total also includes setup/release. JS heap is approximate, not total device/browser/GPU RAM. Background high texture estimate excludes player, base LOD, framebuffers and other GPU allocations.',summary:monitor.summary(),recentDelays:monitor.events.slice(),loading:loads?.snapshot()??null,loadHistory:loads?.history.slice()??[],memory:sampleMemory()};
    report.version=4;report.cameraZoom=zoom();report.renderMetrics={...metrics};report.bossComparison=bosses.snapshot();report.bossComparisonHistory=bosses.history.slice();report.bossBackgroundLoads=bosses.backgroundLoads.slice();
    report.measurement+=' Boss comparison uses up to 3 seconds before, preparation frames, then 5 seconds of active play after visibility; target FPS/camera/combat changes are recorded, not held fixed. A summon-menu pause preserves its preceding play window with baselineSource/baselineAgeMs; other pauses discard it. Missing baseline produces null deltas, not zero cost. delta.jsUsedBytes is the before/after difference, not total memory. Draw calls include outlines and shadow passes. CPU scene/animation/boss/contact times overlap and must not be summed. Resource stage includes cache/network/decode, not network-only time. JS heap is approximate and may change with GC; exact GPU memory is unavailable.';
    report.measurement+=' GPU elapsed times are nonblocking asynchronous results from earlier engine frames, sampled at most about 4 Hz. They are not the CPU frame on which the result arrived and must not be added to CPU times. GPU summaries count each query sampleId once and assign boss phases only when the complete original query interval lies in that phase; crossing intervals are excluded. Unsupported, pending, disjoint, context-lost and stale values are null rather than zero. While paused, retained contains historical completed samples and their age, never current GPU time. No GPU fences, readPixels, finish, or synchronous result wait is used.';
    const value=JSON.stringify(report,null,2);
    const exportBox=detailDialog?.open?(get('diagnostic-detail-export')??fallback):fallback,exportStatus=detailDialog?.open?(get('diagnostic-detail-status')??status):status;
    try{if(!clipboard?.writeText)throw new Error('Clipboard unavailable');await clipboard.writeText(value);exportBox.hidden=true;exportStatus.textContent='진단 기록을 복사했습니다.';}
    catch{exportBox.value=value;exportBox.hidden=false;exportBox.focus();exportBox.select();exportStatus.textContent='아래 기록을 길게 눌러 복사해 주세요.';}
  };
  copy.addEventListener('click',copyReport);get('diagnostic-detail-copy')?.addEventListener('click',copyReport);
  sync();
  return {
    refresh:paint,
    get enabled(){return enabled;},
    mark(){return collecting?now():null;},
    measure(name,start){if(start!==null&&collecting&&name in sections)sections[name]+=Math.max(0,now()-start);},
    bossEvent(event){if(!enabled)return;if(event.type==='begin'&&comparison)comparison.open=true;bosses.event(event,now(),sampleMemory(true),context());next=0;paint();},
    mapChanged(){setCollecting(false);onMapChanged();metrics={};if(!enabled)return;bosses.interrupt('맵 이동');bosses.clearBaseline();paint();},
    beginFrame(active,targetFps){
      setCollecting(enabled&&active);
      if(!collecting){if(enabled){monitor.suspend();if(!paused){refreshGpu();bosses.suspend();paused=true;paint();}}return;}
      paused=false;sections.bossUpdateMs=0;sections.contactsMs=0;monitor.begin(now(),targetFps);
    },
    endFrame(){if(!collecting)return;const time=now();metrics={...renderMetrics()};
      monitor.end(time,()=>({...context(),render:{...metrics},...sections,bossPreparation:bosses.current?.status==='preparing'?bosses.current.stage:null,bossBackground:bosses.backgroundLoads.filter(r=>r.status==='loading').map(r=>r.label)}));
      bosses.frame(time,{intervalStart:monitor.frameStart-monitor.interval,frameMs:monitor.interval,cpuMs:Math.max(0,time-monitor.frameStart),...metrics,...sections,targetFps:monitor.targetFps},sampleMemory(),context);
      if(time>=next){next=time+500;paint();}},
    suspend({preserveBossBaseline=false}={}){setCollecting(false);if(enabled)refreshGpu();paused=true;monitor.suspend();bosses.suspend({preserveBaseline:enabled&&preserveBossBaseline,at:enabled&&preserveBossBaseline?now():0});paint();},
  };
}
