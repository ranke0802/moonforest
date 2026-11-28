import {downloadText} from './resource-downloads.js';
import {loadingArtFor} from './loading-art.js';
// Visible lines follow the 0.3 player's language (identity in Korean / 0.2).
import {tr} from './v03/i18n.js';
import {phaseShare,expectedPhaseMs,rememberPhaseMs} from './phase-share.js';
// Where the bar stands when the download ends and when the counted screen stage begins.
// With the estimate (0.3) the uncounted model stage between them has a stretch of its own.
const PLAIN_SPAN=Object.freeze({download:70,model:70}),ESTIMATE_SPAN=Object.freeze({download:35,model:80});

export function needsModuleReload(error){
  const seen=new Set();
  for(let current=error;current&&!seen.has(current)&&seen.size<4;current=current.cause){
    seen.add(current);
    if(current.code==='APP_MODULE_LOAD_FAILED'||/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load module script|Unable to preload CSS/i.test(String(current.message??current)))return true;
  }
  return false;
}

export function loadingErrorRecord(error,depth=0){
  const record={name:String(error?.name??'Error').slice(0,120),message:String(error?.message??error??'알 수 없는 오류').slice(0,2000),stack:String(error?.stack??'').slice(0,8000)};
  for(const key of ['code','stage','assetId','level','timeoutMs','ktxStage','meshoptStage','textureRole','resourceUrl','loaderMessage','loaderCause','repairStatus','repairError'])if(['string','number'].includes(typeof error?.[key]))record[key]=typeof error[key]==='string'?error[key].slice(0,1000):error[key];
  const modelWait=primitiveRecord(error?.modelWait);if(modelWait)record.modelWait=modelWait;
  if(error?.cause&&depth<2&&error.cause!==error)record.cause=loadingErrorRecord(error.cause,depth+1);
  return record;
}
// Downloadable diagnostic only (never shown on the card): a bounded copy of
// plain objects/arrays of strings, numbers, booleans and null.
function primitiveRecord(value,depth=0){
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value==='string')return value.slice(0,240);
  if(depth>=6||typeof value!=='object')return undefined;
  if(Array.isArray(value))return value.slice(0,8).map(item=>primitiveRecord(item,depth+1)??null);
  if(Object.getPrototypeOf(value)!==Object.prototype)return undefined;
  const out={};let keys=0;for(const key of Object.keys(value)){if(++keys>24)break;const item=primitiveRecord(value[key],depth+1);if(item!==undefined)out[key]=item;}
  return out;
}

export function createLoadingView(doc=document,{clipboard=globalThis.navigator?.clipboard}={}){
  const get=id=>doc.getElementById(id),overlay=get('loading'),track=overlay.querySelector('[role="progressbar"]');
  const detail=get('loading-error'),summary=get('loading-error-message'),stack=get('loading-error-stack'),copy=get('copy-loading-diagnostics'),status=get('loading-copy-status'),fallback=get('loading-diagnostics-export');
  const art=get('loading-art');
  let failed=false,reloadRequired=false,reloadRequested=false,generation=0,diagnostics=()=>({}),report=null,phase='download',progress=0;
  // begin({deferMs}): the screen is prepared but stays off until that long has passed
  // (0.3 road travel with the next map staged: a short change shows nothing at all).
  let deferred=null,shown=false;
  const cancelDeferred=()=>{if(deferred!==null){clearTimeout(deferred);deferred=null;}};
  const show=()=>{shown=true;doc.documentElement.dataset.loading='true';overlay.hidden=false;};
  const progressTo=value=>{progress=Math.max(progress,Math.max(0,Math.min(100,value)));get('loading-progress').style.width=progress+'%';track.setAttribute('aria-valuenow',String(Math.round(progress)));};
  const current=expected=>!failed&&(expected===undefined||expected===generation);
  // The model stage reports no counts. With enableEstimate() the bar moves through it by how
  // long that stage took last time on this device (phase-share.js), on one timer that lives
  // only for that stage, and the time it really took is kept for the next run.
  let estimate=null,creep=null,creepStarted=0,creepExpected=0,creepKey='card:',counted=false;
  const span=()=>estimate?ESTIMATE_SPAN:PLAIN_SPAN;
  const stopCreep=measure=>{if(creep===null)return;estimate.clearInterval(creep);creep=null;if(measure)rememberPhaseMs(creepKey,estimate.now()-creepStarted,estimate.storage);};
  const startCreep=()=>{
    if(!estimate||creep!==null||counted)return;
    creepStarted=estimate.now();creepExpected=expectedPhaseMs(creepKey,estimate.fallbackMs,estimate.storage);
    creep=estimate.setInterval(()=>{
      if(failed||phase!=='preparing'||counted){stopCreep(false);return;}
      const s=span();progressTo(s.download+(s.model-s.download)*phaseShare(estimate.now()-creepStarted,creepExpected));
    },estimate.tickMs);
  };
  // Loading artwork is decorative and never participates in scene readiness.
  art?.addEventListener?.('error',()=>{art.hidden=true;overlay.dataset.art='none';});
  // data-art: 'pending' until the picture is on screen (0.3 shows the words only after it), then 'ready'; 'none' without a picture.
  art?.addEventListener?.('load',()=>{if(!art.hidden&&overlay.dataset.art==='pending')overlay.dataset.art='ready';});
  const resetError=()=>{generation++;report=null;reloadRequired=false;reloadRequested=false;if(detail){detail.hidden=true;const disclosure=detail.querySelector('details');if(disclosure)disclosure.open=false;}if(summary)summary.textContent='';if(stack)stack.textContent='';if(copy){copy.hidden=true;copy.disabled=false;}if(status)status.textContent='';if(fallback){fallback.hidden=true;fallback.value='';}};
  const copyReport=async()=>{
    if(!failed||!report||copy?.disabled)return;const id=generation,value=report;if(copy)copy.disabled=true;
    try{if(!clipboard?.writeText)throw Error('Clipboard unavailable');await clipboard.writeText(value);if(id!==generation)return;if(fallback)fallback.hidden=true;if(status)status.textContent='진단을 복사했습니다. 채팅에 붙여 주세요.';}
    catch{if(id!==generation)return;if(fallback){fallback.value=value;fallback.hidden=false;fallback.focus();fallback.select?.();}if(status)status.textContent='자동 복사가 제한됐습니다. 아래 내용을 선택해 복사해 주세요.';}
    finally{if(id===generation&&copy)copy.disabled=false;}
  };
  copy?.addEventListener?.('click',copyReport);
  return {
    get failed(){return failed;},
    // A failed module import remains rejected in this document. Only an explicit
    // user retry may refresh it; ordinary resource retries stay in the same map.
    retryPageIfRequired(page=globalThis.location,now=Date.now){
      if(!failed||!reloadRequired)return false;
      if(!reloadRequested){const url=new URL(page.href);url.searchParams.set('_reload',String(now()));reloadRequested=true;page.replace(url.href);}
      return true;
    },
    setDiagnostics(provider){diagnostics=provider;},
    enableEstimate({now=()=>performance.now(),setInterval:every=(fn,ms)=>setInterval(fn,ms),clearInterval:cancel=id=>clearInterval(id),storage,fallbackMs=5000,tickMs=100}={}){
      estimate={now,setInterval:every,clearInterval:cancel,storage,fallbackMs,tickMs};
    },
    // Whether the screen is (or was, for the load just revealed) actually on.
    get shown(){return shown;},
    // onShow: called when a deferred screen comes on after all (the held picture under it goes).
    begin(character,{deferMs=0,onShow}={}){
      stopCreep(false);counted=false;creepKey='card:'+String(character??'');cancelDeferred();
      failed=false;resetError();phase='download';progress=0;overlay.classList.remove('error');
      if(deferMs>0){shown=false;const id=generation;deferred=setTimeout(()=>{deferred=null;if(id===generation&&!failed){show();onShow?.();}},deferMs);}else show();
      get('retry-load').hidden=true;get('retry-load').textContent=tr('다시 불러오기');get('loading-title').textContent=tr('불러오는 중');get('loading-text').textContent=tr('불러오는 중');get('loading-bytes').textContent=tr('0.0 / 0.0 MB');get('loading-progress').style.width='0%';track.setAttribute('aria-valuenow','0');
      if(art){let image;try{image=loadingArtFor(character);}catch{image=null;}if(image?.url){art.hidden=false;art.style.objectPosition=image.position||'center';overlay.dataset.art='pending';art.src=image.url;}else{art.hidden=true;art.removeAttribute('src');overlay.dataset.art='none';}
        // Which place the art shows (0.3 adds its name and a line about it).
        if(image?.id)overlay.dataset.place=image.id;else delete overlay.dataset.place;}
      return generation;
    },
    download(state={},expectedGeneration){
      if(!current(expectedGeneration)||phase!=='download')return;
      const validBytes=Number.isFinite(state.loaded)&&state.loaded>=0&&Number.isFinite(state.total)&&state.total>=0;
      get('loading-bytes').textContent=tr(state.unavailable||!validBytes?'용량 확인 중':downloadText(state));
      get('loading-text').textContent=tr(state.complete||(!state.unavailable&&state.total===0)?'화면 준비하는 중':validBytes&&!state.unavailable?`불러오는 중 (${(state.loaded/1e6).toFixed(1)}/${(state.total/1e6).toFixed(1)}MB)`:'불러오는 중');
      const ratio=state.unavailable?0:state.complete||state.total===0?1:Number.isFinite(state.ratio)?state.ratio:validBytes&&state.total>0?state.loaded/state.total:0;
      progressTo(Math.max(0,Math.min(1,ratio))*span().download);
    },
    preparing(state,expectedGeneration){
      if(!current(expectedGeneration))return;phase='preparing';const s=span();progressTo(s.download);get('loading-bytes').textContent=tr('');
      if(Number.isFinite(state?.completed)&&Number.isFinite(state?.total)&&state.total>0&&state.completed>=0){const total=Math.floor(state.total),completed=Math.min(total,Math.floor(state.completed));if(total>0){get('loading-text').textContent=tr(`화면 준비하는 중 (${completed}/${total})`);counted=true;stopCreep(true);progressTo(s.model+(99-s.model)*completed/total);return;}}
      get('loading-text').textContent=tr('화면 준비하는 중');startCreep();
    },
    reveal(expectedGeneration){if(!current(expectedGeneration))return false;cancelDeferred();stopCreep(true);progressTo(100);overlay.hidden=true;if(art){art.hidden=true;art.removeAttribute('src');}delete overlay.dataset.art;delete doc.documentElement.dataset.loading;return true;},
    fail(title,message,{retry=true,retryLabel='다시 불러오기',error,phase}={}){
      resetError();const failure={...loadingErrorRecord(error??message),phase:phase??null,at:new Date().toISOString()};
      reloadRequired=needsModuleReload(error);
      if(reloadRequired){title='실행 파일을 불러오지 못했습니다';message='페이지를 새로 불러와 다시 시도해 주세요. 저장된 리소스는 유지됩니다.';retryLabel='페이지 새로 불러오기';failure.recovery='reload-page';}
      let context;try{context=diagnostics();report=JSON.stringify({...context,kind:'loading-failure',failure},null,2);}catch(captureError){report=JSON.stringify({kind:'loading-failure',failure,diagnosticCaptureError:loadingErrorRecord(captureError)},null,2);}
      failed=true;stopCreep(false);cancelDeferred();shown=true;
      doc.documentElement.dataset.loading='true';overlay.hidden=false;overlay.classList.add('error');
      // A deploy replaces every hashed chunk: a page whose cached HTML/main
      // still names the previous build fails its lazy import. Reload once on
      // its own with a fresh URL (no tap needed); a repeat within a minute
      // waits for the player's tap as before.
      if(reloadRequired)try{const key='moonforest-module-auto-reload',store=globalThis.sessionStorage,last=Number(store?.getItem(key)??0),now=Date.now();if(!(now-last<60000)){store?.setItem(key,String(now));setTimeout(()=>{try{this.retryPageIfRequired();}catch{}},400);}}catch{}
      get('loading-title').textContent=tr(title);get('loading-text').textContent=tr(message);
      get('retry-load').hidden=!retry;get('retry-load').textContent=tr(retryLabel);get('loading-progress').style.width='0%';track.setAttribute('aria-valuenow','0');
      if(detail)detail.hidden=false;if(summary)summary.textContent=`${failure.name}: ${failure.message}`+(failure.code?`\n코드: ${failure.code}`:'')+(failure.stage||phase?`\n단계: ${failure.stage??phase}`:'')+(failure.loaderMessage?`\n상세: ${failure.loaderMessage}`:'');if(stack)stack.textContent=[failure.stack,failure.cause?.stack].filter(Boolean).join('\n\n원인:\n')||'추가 호출 기록이 없습니다.';if(copy)copy.hidden=false;
    },
    stream(state){
      get('stream-loading').hidden=state.complete||state.total===0||state.unavailable;
      get('stream-bytes').textContent=tr('불러오는 중 '+downloadText(state));get('stream-progress').style.width=Math.min(100,state.ratio*100)+'%';
    },
  };
}
