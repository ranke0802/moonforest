import {downloadText} from './resource-downloads.js';

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
  if(error?.cause&&depth<2&&error.cause!==error)record.cause=loadingErrorRecord(error.cause,depth+1);
  return record;
}

export function createLoadingView(doc=document,{clipboard=globalThis.navigator?.clipboard}={}){
  const get=id=>doc.getElementById(id),overlay=get('loading'),track=overlay.querySelector('[role="progressbar"]');
  const detail=get('loading-error'),summary=get('loading-error-message'),stack=get('loading-error-stack'),copy=get('copy-loading-diagnostics'),status=get('loading-copy-status'),fallback=get('loading-diagnostics-export');
  let failed=false,reloadRequired=false,reloadRequested=false,generation=0,diagnostics=()=>({}),report=null;
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
    begin(){failed=false;resetError();doc.documentElement.dataset.loading='true';overlay.hidden=false;overlay.classList.remove('error');get('retry-load').hidden=true;get('retry-load').textContent='다시 불러오기';get('loading-title').textContent='불러오는 중';get('loading-text').textContent='필요한 리소스를 확인합니다.';get('loading-bytes').textContent='0.0 / 0.0 MB';get('loading-progress').style.width='0%';track.setAttribute('aria-valuenow','0');},
    download(state){
      get('loading-text').textContent=state.unavailable?'리소스를 불러옵니다.':state.complete||state.total===0?'화면을 준비합니다.':'리소스 다운로드';
      get('loading-bytes').textContent=state.unavailable?'용량 확인 중':downloadText(state);
      const percent=Math.max(0,Math.min(100,state.ratio*100));get('loading-progress').style.width=percent+'%';track.setAttribute('aria-valuenow',String(Math.round(percent)));
    },
    preparing(){get('loading-text').textContent='화면을 준비합니다.';},
    reveal(){if(failed)return false;overlay.hidden=true;delete doc.documentElement.dataset.loading;return true;},
    fail(title,message,{retry=true,retryLabel='다시 불러오기',error,phase}={}){
      resetError();const failure={...loadingErrorRecord(error??message),phase:phase??null,at:new Date().toISOString()};
      reloadRequired=needsModuleReload(error);
      if(reloadRequired){title='실행 파일을 불러오지 못했습니다';message='페이지를 새로 불러와 다시 시도해 주세요. 저장된 리소스는 유지됩니다.';retryLabel='페이지 새로 불러오기';failure.recovery='reload-page';}
      let context;try{context=diagnostics();report=JSON.stringify({...context,kind:'loading-failure',failure},null,2);}catch(captureError){report=JSON.stringify({kind:'loading-failure',failure,diagnosticCaptureError:loadingErrorRecord(captureError)},null,2);}
      failed=true;
      doc.documentElement.dataset.loading='true';overlay.hidden=false;overlay.classList.add('error');
      get('loading-title').textContent=title;get('loading-text').textContent=message;
      get('retry-load').hidden=!retry;get('retry-load').textContent=retryLabel;get('loading-progress').style.width='0%';track.setAttribute('aria-valuenow','0');
      if(detail)detail.hidden=false;if(summary)summary.textContent=`${failure.name}: ${failure.message}`+(failure.code?`\n코드: ${failure.code}`:'')+(failure.stage||phase?`\n단계: ${failure.stage??phase}`:'')+(failure.loaderMessage?`\n상세: ${failure.loaderMessage}`:'');if(stack)stack.textContent=[failure.stack,failure.cause?.stack].filter(Boolean).join('\n\n원인:\n')||'추가 호출 기록이 없습니다.';if(copy)copy.hidden=false;
    },
    stream(state){
      get('stream-loading').hidden=state.complete||state.total===0||state.unavailable;
      get('stream-bytes').textContent='불러오는 중 '+downloadText(state);get('stream-progress').style.width=Math.min(100,state.ratio*100)+'%';
    },
  };
}
