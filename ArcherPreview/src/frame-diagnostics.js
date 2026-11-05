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
    const delayed=interval>this.thresholdMs+.01,busy=this.work[index]>this.thresholdMs+.01;
    if(delayed||busy){
      this.events.push({atSeconds:Math.round((time-this.started)/100)/10,frameMs:Math.round(interval*10)/10,jsSubmitMs:Math.round(this.work[index]*10)/10,trigger:delayed?(busy?'interval-and-current-work':'interval'):'current-work',targetFps:this.targetFps,...context()});
      if(this.events.length>32)this.events.shift();
    }
  }
  summary(){
    const now=this.last??this.times[(this.cursor+this.times.length-1)%this.times.length],values=[],workValues=[];
    let recentCount=0,recentTotal=0,slowFrames=0,maxWorkMs=0,frameTotal=0,workTotal=0,missedTargetFrames=0;
    for(let i=0;i<this.count;i++){
      if(now-this.times[i]>10000)continue;
      const ms=this.intervals[i];values.push(ms);workValues.push(this.work[i]);frameTotal+=ms;workTotal+=this.work[i];if(ms>this.thresholdMs+.01)slowFrames++;
      // Allow ordinary refresh/timer jitter. This catches sustained 40 FPS at a
      // 60 FPS target even when no individual interval exceeds the 50 ms gate.
      if(ms>1250/this.targetFps)missedTargetFrames++;
      maxWorkMs=Math.max(maxWorkMs,this.work[i]);
      if(now-this.times[i]<=1000){recentCount++;recentTotal+=ms;}
    }
    values.sort((a,b)=>a-b);
    workValues.sort((a,b)=>a-b);
    return {fps:recentTotal?1000*recentCount/recentTotal:null,frameMs:values.length?this.intervals[(this.cursor+this.times.length-1)%this.times.length]:null,
      maxMs:values.at(-1)??null,p95Ms:values.length?values[Math.ceil(values.length*.95)-1]:null,
      slowFrames,thresholdMs:this.thresholdMs,targetFps:this.targetFps,samples:values.length,maxWorkMs,
      meanFrameMs:values.length?frameTotal/values.length:null,meanWorkMs:values.length?workTotal/values.length:null,p95WorkMs:workValues.length?workValues[Math.ceil(workValues.length*.95)-1]:null,missedTargetFrames,missedTargetThresholdMs:1250/this.targetFps};
  }
}

export function gpuDiagnosticLine(gpu){
  if(gpu?.status==='valid'&&Number.isFinite(gpu.meanMs))return `GPU 평균 ${gpu.meanMs.toFixed(1)} ms · 비동기 ${gpu.samples}표본`;
  if(gpu?.status==='paused'&&Number.isFinite(gpu.retained?.meanMs))return `GPU 최근 ${gpu.retained.meanMs.toFixed(1)} ms · 일시정지`;
  const labels={unsupported:'미지원',pending:'결과 대기',paused:'일시정지',disabled:'꺼짐',disjoint:'계측 무효',stale:'오래된 표본',invalid:'유효 표본 없음',timeout:'응답 시간 초과',error:'계측 불가',busy:'다른 계측 중','context-lost':'화면 복구 대기'};
  return `GPU — · ${labels[gpu?.status]??'결과 대기'}`;
}

// Older builds stored either the enabled bit or an enabled/expanded object.
// Keep the collection preference, but never restore an inline expanded HUD.
export function readFrameDiagnosticPreference(storage,key='moonforest-frame-diagnostics-v1'){
  try{
    const raw=storage?.getItem(key);if(raw==='1'||raw==='0'||raw==null)return raw==='1';
    const saved=JSON.parse(raw),enabled=typeof saved==='boolean'?saved:saved?.enabled===true;
    storage?.setItem?.(key,enabled?'1':'0');return enabled;
  }catch{return false;}
}

export const DRAW_CPU_DIAGNOSTICS_KEY='moonforest-draw-cpu-diagnostics-v1';
export function readDrawCpuDiagnosticPreference(storage){try{return storage?.getItem(DRAW_CPU_DIAGNOSTICS_KEY)==='1';}catch{return false;}}

export function createFrameDiagnostics({doc=document,storage,now=()=>performance.now(),clipboard=globalThis.navigator?.clipboard,metadata=()=>({}),context=()=>({}),loads,memory=()=>({}),zoom=()=>null,renderMetrics=()=>({}),onEnabled=()=>{},onDrawCpuEnabled=()=>{},onCollecting=()=>{},onMapChanged=()=>{},onReset=()=>{}}={}){
  const get=id=>doc.getElementById(id),panel=get('frame-diagnostics'),toggle=get('frame-diagnostics-toggle'),copy=get('copy-frame-diagnostics'),reset=get('reset-frame-diagnostics'),status=get('frame-diagnostics-status'),fallback=get('frame-diagnostics-export');
  const monitor=new FrameDiagnostics(),key='moonforest-frame-diagnostics-v1';let enabled=false,paused=true,collecting=false,next=0;
  const bosses=new BossDiagnostics(),comparison=get('diagnostic-boss-comparison');
  const detailDialog=get('diagnostic-detail-dialog'),expand=get('diagnostic-expand');
  const drawCpuToggle=get('draw-cpu-diagnostics-toggle');
  const compactView=()=>{
    if(panel.dataset){if(panel.dataset.expanded!=='false')panel.dataset.expanded='false';if(panel.dataset.presentation!=='compact')panel.dataset.presentation='compact';}
    panel.classList?.remove('expanded','is-expanded');
    for(const property of ['width','max-width','height','max-height','overflow','overflow-y','pointer-events'])panel.style?.removeProperty?.(property);
    const body=detailDialog?.querySelector?.('.diagnostic-detail-body');
    if(body)for(const node of [comparison,panel.querySelector?.('.diagnostic-general'),get('diagnostic-render'),get('diagnostic-gpu'),get('diagnostic-detail-frame')])if(node&&panel.contains?.(node))body.append(node);
  };
  compactView();
  expand?.setAttribute?.('aria-expanded','false');
  expand?.addEventListener('click',()=>{compactView();if(detailDialog&&!detailDialog.open){const box=get('diagnostic-detail-export'),note=get('diagnostic-detail-status');if(box)box.hidden=true;if(note)note.textContent='';paint({details:true});detailDialog.showModal();expand.setAttribute('aria-expanded','true');}});
  for(const id of ['close-diagnostic-detail','diagnostic-detail-done'])get(id)?.addEventListener('click',()=>detailDialog?.close());
  detailDialog?.addEventListener('close',()=>expand?.setAttribute('aria-expanded','false'));
  const setCollecting=value=>{if(collecting!==value){collecting=value;onCollecting(value);}};
  comparison?.addEventListener('keydown',event=>{if(event.target?.tagName==='SUMMARY'&&['Space','Enter'].includes(event.code))event.stopPropagation();});
  let nextMemory=0,memorySample={},metrics={},sections={bossUpdateMs:0,contactsMs:0,worldUpdateMs:0,hudUpdateMs:0,framePreludeMs:0,playerControllerMs:0,playerAnimationMs:0,actionAudioMs:0,sceneryGeometryMs:0,sceneryTextureMs:0,sceneryOcclusionMs:0,sceneCallMs:0};
  // Paused preview renders can change Babylon's shared CPU counters. Keep the
  // last play snapshot and refresh only asynchronous GPU state/retained age.
  const refreshGpu=()=>{const sample=renderMetrics();if(sample&&Object.hasOwn(sample,'gpu'))metrics={...metrics,gpu:sample.gpu};if(sample&&Object.hasOwn(sample,'drawCpu'))metrics={...metrics,drawCpu:sample.drawCpu};};
  enabled=readFrameDiagnosticPreference(storage,key);
  let drawCpuEnabled=!!drawCpuToggle&&readDrawCpuDiagnosticPreference(storage);
  let diagnosticSamples=0,diagnosticTotal=0,diagnosticMax=0,diagnosticLast=null,diagnosticCompletedAt=null;
  const resetDiagnosticCpu=()=>{diagnosticSamples=0;diagnosticTotal=0;diagnosticMax=0;diagnosticLast=null;diagnosticCompletedAt=null;};
  const setText=(id,value)=>{const node=get(id);if(node&&node.textContent!==value)node.textContent=value;};
  const sampleMemory=(force=false)=>{const at=now();if(force||at>=nextMemory){nextMemory=at+1000;memorySample={...memory(),sampleAtMs:at};}return memorySample;};
  const paint=({details=false}={})=>{
    if(!enabled)return;const s=monitor.summary(),ms=value=>value===null?'—':Math.round(value);
    setText('diagnostic-fps',paused?'일시정지 · 직전 기록':`${s.fps===null?'집계 중':Math.round(s.fps)+' FPS'} · 목표 ${s.targetFps}`);
    setText('diagnostic-frame',`${ms(s.frameMs)} ms · p95 ${ms(s.p95Ms)} ms`);
    const last=monitor.events.at(-1),recent=last&&monitor.last!==null&&(monitor.last-monitor.started)/1000-last.atSeconds<3;
    panel.dataset.delayed=String(Boolean(recent&&!paused));
    // Keep collecting report data; avoid hidden detail DOM/string work during play.
    // Legacy markup without a detail dialog retains its existing inline view.
    if(detailDialog&&!detailDialog.open&&!details)return;
    const load=loads?.snapshot(),mem=sampleMemory(),seconds=value=>(value/1000).toFixed(1)+'초',mib=value=>Number.isFinite(value)?(value/1048576).toFixed(0):'—';
    setText('diagnostic-load',load?`${load.label} · ${seconds(load.totalMs)}${load.phase==='error'?' · 실패':load.phase==='complete'?'':' · 준비 중'}`:'최근 로딩 기록 없음');
    setText('diagnostic-load-phases',load?`다운로드 ${seconds(load.downloadMs)} · 모델 ${seconds(load.modelMs)} · 화면 ${seconds(load.screenMs)}`:'다운로드 — · 모델 — · 화면 —');
    setText('diagnostic-memory',`JS 메모리 ${mib(mem.jsUsedBytes)} / ${mib(mem.jsLimitBytes)} MiB${mem.jsUsedBytes==null?' (미지원)':''}`);
    setText('diagnostic-textures',`배경 고해상도 텍스처 추정 ${mib(mem.backgroundHighTextureEstimateBytes)} / ${mib(mem.backgroundHighTextureBudgetBytes)} MiB`);
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
    const detail=last?`최근 지연 ${Math.round(last.frameMs)} ms · ${last.activity??'플레이'}`:'회전·이동하며 확인하세요';
    setText('diagnostic-detail',paused?'측정 대기 · 설정/초기 로딩 중 제외':detail);
  };
  const sync=()=>{toggle.checked=enabled;panel.hidden=!enabled;copy.disabled=!enabled;reset.disabled=!enabled;if(drawCpuToggle){drawCpuToggle.checked=drawCpuEnabled;drawCpuToggle.disabled=!enabled;}onEnabled(enabled);onDrawCpuEnabled(enabled&&drawCpuEnabled);paint();};
  drawCpuToggle?.addEventListener('change',()=>{
    drawCpuEnabled=drawCpuToggle.checked===true;try{storage?.setItem(DRAW_CPU_DIAGNOSTICS_KEY,drawCpuEnabled?'1':'0');}catch{/* Keep session preference. */}
    onDrawCpuEnabled(enabled&&drawCpuEnabled);if(enabled)refreshGpu();paint();
  });
  toggle.addEventListener('change',()=>{
    enabled=toggle.checked;setCollecting(false);monitor.reset();resetDiagnosticCpu();bosses.reset();metrics={};next=0;nextMemory=0;fallback.hidden=true;status.textContent='';if(!enabled&&detailDialog?.open)detailDialog.close();if(comparison)comparison.open=false;
    try{storage?.setItem(key,enabled?'1':'0');}catch{/* Keep session choice. */}sync();
  });
  reset.addEventListener('click',()=>{monitor.reset();resetDiagnosticCpu();bosses.reset();onReset();metrics={};next=0;status.textContent='기록을 초기화했습니다.';fallback.hidden=true;paint();});
  const snapshot=()=>{
    if(enabled)refreshGpu();
    const report={version:2,createdAt:new Date().toISOString(),...metadata(),measurement:'Frame intervals exclude initial loading, paused and hidden intervals. Load stages are elapsed wall time: download includes manifest/cache lookup and prefetch; model includes decode/setup and remaining I/O; screen includes shader readiness and first frames. Total also includes setup/release. JS heap is approximate, not total device/browser/GPU RAM. Background high texture estimate excludes player, base LOD, framebuffers and other GPU allocations.',summary:monitor.summary(),recentDelays:monitor.events.slice(),loading:loads?.snapshot()??null,loadHistory:loads?.history.slice()??[],memory:sampleMemory()};
    report.version=4;report.cameraZoom=zoom();report.renderMetrics={...metrics};report.bossComparison=bosses.snapshot();report.bossComparisonHistory=bosses.history.slice();report.bossBackgroundLoads=bosses.backgroundLoads.slice();
    report.diagnosticOptions={drawCpuEnabled};
    report.diagnosticCpuMs={scope:'synchronous-endFrame-collection-only',window:'since-diagnostic-reset',samples:diagnosticSamples,meanMs:diagnosticSamples?diagnosticTotal/diagnosticSamples:null,maxMs:diagnosticSamples?diagnosticMax:null,latestMs:diagnosticLast,latestCompletedAtMs:diagnosticCompletedAt};
    report.measurement+=' Boss comparison uses up to 3 seconds before, preparation frames, then 5 seconds of active play after visibility; target FPS/camera/combat changes are recorded, not held fixed. A summon-menu pause preserves its preceding play window with baselineSource/baselineAgeMs; other pauses discard it. Missing baseline produces null deltas, not zero cost. delta.jsUsedBytes is the before/after difference, not total memory. Draw calls include outlines and shadow passes. CPU scene/animation/boss/contact times overlap and must not be summed. Resource stage includes cache/network/decode, not network-only time. JS heap is approximate and may change with GC; exact GPU memory is unavailable.';
    report.measurement+=' A delay event now records either a long preceding frame interval or long current JavaScript submission (trigger). frameMs ends at the current frame start; jsSubmitMs and context describe current work. They are not the same interval and must not be added or assumed to share one cause.';
    report.measurement+=' activeMeshesMs, renderTargetsMs and drawSubmissionMs are CPU scene counters, not GPU time. They overlap with sceneMs and may overlap each other. worldUpdateMs covers camera/lighting/visibility before scene.render; hudUpdateMs covers HUD/quest/save work before rendering and projected feedback after rendering. These are current-frame CPU sections and do not measure browser compositing, temperature or GPU utilization.';
    report.measurement+=' framePreludeMs measures gameplay preparation before the boss update, including controller/animation selection and action audio. sceneCallMs measures the complete synchronous scene.render call, including all its after-render observers; sceneMs remains the SDK counter with its own observer boundary. contactsMs is nested inside rendering; do not sum these fields as independent costs. Viewport resize callbacks run outside these gameplay-frame sections and are reported separately in viewportResize.';
    report.measurement+=' playerControllerMs, playerAnimationMs and actionAudioMs are diagnostic-only sections nested within framePreludeMs. playerAnimationMs includes manual CharacterAnimator transitions and pose sampling before rendering; the SDK animationMs counter has a separate render boundary. These sections are not GPU time and must not be added to their enclosing counters.';
    report.measurement+=' sceneryGeometryMs, sceneryTextureMs and sceneryOcclusionMs measure synchronous after-render callbacks only while diagnostics collect play frames. They are nested within sceneCallMs and may sit outside the SDK sceneMs observer boundary. They do not measure asynchronous decode/download duration or GPU query execution; an occlusion callback can still include CPU driver wait.';
    report.measurement+=' activeMeshCandidates reports the last candidate-provider input, omitted registered disabled static instances/empty clone roots and submitted candidates, not final visible/drawn meshes. textureWork.stage covers resource/texture preparation or material promotion; lastPromoteMs is the last successful synchronous material assignment CPU duration, not GPU upload time or the current pending job duration.';
    report.measurement+=' drawCpu is separately opt-in and defaults off. When selected, it periodically samples one scene render per second and can capture coalesced event-requested frames after defeat, viewport changes or texture promotion, spaced by at least 250ms. Its wrappers/timers can perturb that render. latest is historical and identified by reason/sampleId/sceneFrameId/ageMs; it is not necessarily the delay event frame. Groups include cached/no-op calls and inclusive nested time and must not be summed or treated as actual GL calls. effectChanges counts engine effect-reference changes. Driver blocking, browser scheduling and GPU execution cannot be separated by these CPU clocks; no synchronous GPU read is added.';
    report.measurement+=' diagnosticCpuMs separately summarizes synchronous endFrame collection (counter snapshots, delay/boss recording, memory sampling and any scheduled HUD paint) since diagnostic reset. It excludes scene instrumentation/drawCpu hooks inside rendering, beginFrame, snapshot/copy work and GPU execution. It runs after jsSubmitMs is captured and is not attributed to any preceding frame interval or individual delay; its own final scalar bookkeeping is excluded.';
    report.measurement+=' GPU elapsed times are nonblocking asynchronous results from earlier engine frames, sampled at most about 4 Hz. They are not the CPU frame on which the result arrived and must not be added to CPU times. GPU summaries count each query sampleId once and assign boss phases only when the complete original query interval lies in that phase; crossing intervals are excluded. Unsupported, pending, disjoint, context-lost and stale values are null rather than zero. While paused, retained contains historical completed samples and their age, never current GPU time. No GPU fences, readPixels, finish, or synchronous result wait is used.';
    return report;
  };
  const copyReport=async()=>{
    const value=JSON.stringify(snapshot(),null,2);
    const exportBox=detailDialog?.open?(get('diagnostic-detail-export')??fallback):fallback,exportStatus=detailDialog?.open?(get('diagnostic-detail-status')??status):status;
    try{if(!clipboard?.writeText)throw new Error('Clipboard unavailable');await clipboard.writeText(value);exportBox.hidden=true;exportStatus.textContent='진단 기록을 복사했습니다.';}
    catch{exportBox.value=value;exportBox.hidden=false;exportBox.focus();exportBox.select();exportStatus.textContent='아래 기록을 길게 눌러 복사해 주세요.';}
  };
  copy.addEventListener('click',copyReport);get('diagnostic-detail-copy')?.addEventListener('click',copyReport);
  sync();
  return {
    snapshot,
    refresh:paint,
    get enabled(){return enabled;},
    mark(){return collecting?now():null;},
    measure(name,start){if(start!==null&&collecting&&name in sections)sections[name]+=Math.max(0,now()-start);},
    bossEvent(event){if(!enabled)return;if(event.type==='begin'&&comparison)comparison.open=true;bosses.event(event,now(),sampleMemory(true),context());next=0;paint();},
    mapChanged(){compactView();setCollecting(false);onMapChanged();metrics={};if(!enabled)return;bosses.interrupt('맵 이동');bosses.clearBaseline();paint();},
    beginFrame(active,targetFps){
      if(panel.dataset?.expanded!=='false'||panel.dataset?.presentation!=='compact')compactView();
      setCollecting(enabled&&active);
      if(!collecting){if(enabled){monitor.suspend();if(!paused){refreshGpu();bosses.suspend();paused=true;paint();}}return;}
      paused=false;for(const name in sections)sections[name]=0;monitor.begin(now(),targetFps);
    },
    endFrame(){if(!collecting)return;const time=now();try{metrics={...renderMetrics()};
      monitor.end(time,()=>({...context(),diagnosticOptions:{drawCpuEnabled},render:{...metrics},...sections,bossPreparation:bosses.current?.status==='preparing'?bosses.current.stage:null,bossBackground:bosses.backgroundLoads.filter(r=>r.status==='loading').map(r=>r.label)}));
      bosses.frame(time,{intervalStart:monitor.frameStart-monitor.interval,frameMs:monitor.interval,cpuMs:Math.max(0,time-monitor.frameStart),...metrics,...sections,targetFps:monitor.targetFps},sampleMemory(),context);
      if(time>=next){next=time+500;paint();}}finally{const completed=now(),cost=Math.max(0,completed-time);diagnosticSamples++;diagnosticTotal+=cost;diagnosticMax=Math.max(diagnosticMax,cost);diagnosticLast=cost;diagnosticCompletedAt=completed;}},
    suspend({preserveBossBaseline=false}={}){setCollecting(false);if(enabled)refreshGpu();paused=true;monitor.suspend();bosses.suspend({preserveBaseline:enabled&&preserveBossBaseline,at:enabled&&preserveBossBaseline?now():0});paint();},
  };
}
