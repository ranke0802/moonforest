const panels=new WeakMap();

function appRoot(pageUrl){try{return new URL('./',pageUrl);}catch{return null;}}
function allowedBundle(src,root){
  if(!root||!src)return null;
  try{const url=new URL(src,root),prefix=root.pathname+'assets/';
    if(url.origin!==root.origin||!url.pathname.startsWith(prefix))return null;
    const name=url.pathname.slice(prefix.length),match=/^index-([A-Za-z0-9_-]{1,80})\.js$/.exec(name);
    return match?{path:url.pathname,id:match[1],url:url.origin+url.pathname}:null;
  }catch{return null;}
}
function uniqueBundle(values){const paths=new Map(values.filter(Boolean).map(value=>[value.path,value]));return paths.size===1?[...paths.values()][0]:null;}

export function runningAppBundle(doc,pageUrl){
  const root=appRoot(pageUrl);return uniqueBundle([...doc.querySelectorAll('script[src]')].filter(script=>script.getAttribute('type')?.toLowerCase()==='module').map(script=>allowedBundle(script.getAttribute('src'),root)));
}

// Only tokenize module-script opening tags. Do not mount/parse an HTML document:
// its images/iframes must never start secondary downloads during this check.
export function deployedAppBundle(html,pageUrl){
  const root=appRoot(pageUrl),bundles=[],source=html.replace(/<!--[\s\S]*?-->/g,'');
  for(const tag of source.match(/<script\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)??[]){
    const attrs=new Map();let duplicate=false;
    for(const match of tag.matchAll(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)){
      const key=match[1].toLowerCase();if(attrs.has(key))duplicate=true;attrs.set(key,match[2]??match[3]??match[4]);
    }
    if(!duplicate&&attrs.get('type')?.toLowerCase()==='module')bundles.push(allowedBundle(attrs.get('src'),root));
  }
  return uniqueBundle(bundles);
}

export function setupRuntimeVersionPanel({doc=document,host,pageUrl=doc.location?.href??globalThis.location?.href??doc.baseURI,fetcher=globalThis.fetch,timeoutMs=8000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  if(!host)return null;
  const prior=panels.get(doc);if(prior&&!prior.disposed){if(prior.element.parentElement!==host)host.append(prior.element);return prior;}
  doc.getElementById('runtime-version')?.remove();
  const running=runningAppBundle(doc,pageUrl),root=appRoot(pageUrl),panel=doc.createElement('section');panel.id='runtime-version';panel.className='runtime-version';
  const current=doc.createElement('p');current.textContent=running?'실행 중 · '+running.id:'실행 중 · 개발 화면';current.style.overflowWrap='anywhere';
  const button=doc.createElement('button');button.id='check-runtime-version';button.type='button';button.className='motion-speed-toggle';button.textContent='업데이트 확인';button.style.minHeight='44px';
  const status=doc.createElement('p');status.id='runtime-version-status';status.setAttribute('role','status');status.textContent='버전 확인은 버튼을 누를 때만 진행합니다.';
  const details=doc.createElement('details'),summary=doc.createElement('summary');summary.textContent='실행 정보';
  const code=doc.createElement('code');code.textContent=running?.path??'배포 파일 식별 없음';code.style.overflowWrap='anywhere';const server=doc.createElement('p');
  details.append(summary,code,server);panel.append(current,button,status,details);host.append(panel);
  let disposed=false,pending=null,abort=null,timer=null,generation=0,cancelListener=null;
  const alive=id=>!disposed&&generation===id&&panel.isConnected;
  const show=(state,message,id)=>{if(alive(id)){panel.dataset.versionState=state;status.textContent=message;}};
  const check=()=>{
    if(disposed)return Promise.resolve({state:'disposed'});if(pending)return pending;
    const id=++generation;button.disabled=true;show('checking','배포 버전을 확인하는 중…',id);
    pending=Promise.resolve().then(async()=>{
      if(!alive(id))return {state:'disposed'};
      if(!running||!root||!/^https?:$/.test(root.protocol)){show('unsupported','이 화면에서는 배포 버전을 비교할 수 없습니다.',id);return {state:'unsupported'};}
      abort=new AbortController();let timedOut=false;
      const cancellation=new Promise((_,reject)=>{cancelListener=()=>reject(Error('Version cancelled'));abort.signal.addEventListener('abort',cancelListener,{once:true});});
      const request=(async()=>{
        const response=await fetcher(new URL('index.html',root).href,{cache:'no-cache',credentials:'same-origin',redirect:'error',signal:abort.signal,headers:{Accept:'text/html'}});
        if(response.status!==200||response.redirected)throw Error('Version page unavailable');
        if(response.url){const received=new URL(response.url);if(received.origin!==root.origin||received.pathname!==new URL('index.html',root).pathname)throw Error('Unexpected version origin');}
        if(!response.headers?.get('content-type')?.toLowerCase().includes('text/html'))throw Error('Version response is not HTML');
        const html=await response.text();if(html.length>262144)throw Error('Version page too large');const deployed=deployedAppBundle(html,root.href);if(!deployed)throw Error('Version entry missing or ambiguous');return deployed;
      })();
      const timeout=new Promise((_,reject)=>{timer=setTimer(()=>{timedOut=true;abort.abort();reject(Error('Version timeout'));},timeoutMs);});
      try{
        const deployed=await Promise.race([request,timeout,cancellation]);if(!alive(id))return {state:'disposed'};
        const state=deployed.path===running.path?'current':'outdated';server.textContent='확인한 배포 · '+deployed.path;
        show(state,state==='current'?'현재 배포 버전과 같습니다.':'새 버전이 있습니다. 전투를 마친 뒤 새로고침해 주세요.',id);return {state,running:running.path,deployed:deployed.path};
      }catch{
        if(!alive(id))return {state:'disposed'};show('error',timedOut?'확인 시간이 초과됐습니다. 필요할 때 다시 확인해 주세요.':'확인하지 못했습니다. 필요할 때 다시 눌러 주세요.',id);return {state:'error',timeout:timedOut};
      }
    }).finally(()=>{if(timer!==null)clearTimer(timer);if(cancelListener)abort?.signal.removeEventListener('abort',cancelListener);timer=null;abort=null;cancelListener=null;pending=null;if(alive(id))button.disabled=false;});
    return pending;
  };
  const onClick=()=>{void check();};button.addEventListener('click',onClick);
  const control={element:panel,check,get disposed(){return disposed;},dispose(){if(disposed)return;disposed=true;generation++;abort?.abort();if(timer!==null)clearTimer(timer);timer=null;button.removeEventListener('click',onClick);panel.remove();panels.delete(doc);}};
  panels.set(doc,control);return control;
}
