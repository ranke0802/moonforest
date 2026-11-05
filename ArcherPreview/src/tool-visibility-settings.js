export const DEVELOPER_TOOLS_KEY='moonforest-developer-tools-v1';

// The settings switch owns launched editors as well as its lightweight menu.
// Hidden controllers retain drafts/documents, but release their gameplay lease.
export function createDeveloperToolSessions({getEnabled=()=>true,getTools=()=>[]}={}){
 let current=null,closing=Promise.resolve(),disposed=false;
 async function open(owner,isCurrent,work){
  if(disposed||!getEnabled(owner)||!isCurrent())return false;
  const ticket={owner};current=ticket;
  const valid=()=>!disposed&&current===ticket&&getEnabled(owner)&&isCurrent();
  await closing;
  if(!valid())return false;
  return work(valid);
 }
 function close(owner){
  if(!current||current.owner!==owner)return closing;
  current=null;
  const jobs=[closing];
  for(const tool of new Set(getTools().filter(Boolean))){
   try{jobs.push(tool.hide?.());}catch(error){jobs.push(Promise.reject(error));}
  }
  closing=Promise.allSettled(jobs).then(()=>{});
  return closing;
 }
 return {open,close,dispose(){if(disposed)return closing;const pending=close(current?.owner);disposed=true;return pending;}};
}

const tools=[['nearby','주변 오브젝트 편집'],['authoring','게임 / 만들기']];
export function readDeveloperTools(storage){
  try{const value=JSON.parse(storage?.getItem(DEVELOPER_TOOLS_KEY)??'null');return Object.fromEntries(tools.map(([id])=>[id,value?.[id]===true]));}
  catch{return {nearby:false,authoring:false};}
}

// Launchers live in settings flow, never over the player's movable HUD.
// Each async mount owns a generation so an old import cannot resurrect an OFF tool.
export function setupDeveloperToolSettings({host,dialog,storage,mounts={},inGame=false,onDisable=()=>{}}){
  const doc=host.ownerDocument,section=doc.createElement('details');section.className='settings-section';section.id='developer-tools-settings';
  const title=doc.createElement('summary');title.textContent='개발 도구';section.append(title);
  const body=doc.createElement('div');body.className='settings-section-body';section.append(body);
  const help=doc.createElement('p');help.textContent=inGame?'기본은 꺼짐입니다. 켜면 해당 도구 창이 게임 화면에 열립니다.':'기본은 꺼짐입니다. 켠 도구는 이 설정 안에서 사용합니다.';body.append(help);host.append(section);
  const saved=readDeveloperTools(storage),entries=new Map();let disposed=false;
  function closeDialog(){if(!dialog?.open)return;if(dialog.close)dialog.close();else{dialog.open=false;dialog.removeAttribute?.('open');dialog.dispatchEvent?.(new doc.defaultView.Event('close'));}}
  function save(){try{storage?.setItem(DEVELOPER_TOOLS_KEY,JSON.stringify(Object.fromEntries([...entries].map(([id,row])=>[id,row.enabled]))));}catch{/* Keep the session choice when storage is unavailable. */}}
  function refresh(){if(disposed)return;for(const row of entries.values())if(row.enabled){row.api?.update?.();row.api?.notifyReady?.();}}
  async function apply(row,enabled,{persist=true}={}){
    row.enabled=enabled===true;row.input.checked=row.enabled;if(row.openButton)row.openButton.disabled=!row.enabled;const generation=++row.generation;
    if(!row.enabled)onDisable(row.id);
    row.api?.dispose?.();row.api=null;row.container.replaceChildren();row.container.hidden=!row.enabled;
    if(persist)save();if(!row.enabled||disposed)return;
    if(inGame&&persist)closeDialog();
    const status=doc.createElement('p');status.setAttribute('role','status');status.textContent='도구를 준비하는 중…';
    const mountHost=doc.createElement('div');row.container.append(status,mountHost);
    const isCurrent=()=>!disposed&&row.enabled&&row.generation===generation;
    try{
      const api=await mounts[row.id]?.({host:mountHost,isCurrent});
      if(!isCurrent()){api?.dispose?.();return;}
      row.api=api;status.remove();refresh();if(inGame)api?.show?.();
    }catch(error){if(isCurrent()){status.textContent='도구를 준비하지 못했습니다. 껐다가 다시 켜 주세요. '+error.message;}}
  }
  for(const [id,label]of tools){
    const labelNode=doc.createElement('label'),input=doc.createElement('input');input.type='checkbox';input.id='developer-'+id+'-enabled';labelNode.append(input,' '+label);body.append(labelNode);
    const container=doc.createElement('div');container.dataset.developerToolHost=id;container.hidden=true;body.append(container);
    const row={id,input,container,enabled:false,generation:0,api:null};row.change=()=>void apply(row,input.checked);input.addEventListener('change',row.change);if(inGame){const button=doc.createElement('button');button.type='button';button.textContent='게임 화면에서 열기';button.dataset.developerOpen=id;button.disabled=true;row.openButton=button;row.open=()=>{if(!row.enabled||disposed)return;closeDialog();if(row.api)row.api.show?.();else void apply(row,true);};button.addEventListener('click',row.open);body.append(button);}entries.set(id,row);
  }
  for(const [id,row]of entries)void apply(row,saved[id],{persist:false});
  dialog?.addEventListener('toggle',refresh);
  return {enabled:id=>!disposed&&entries.get(id)?.enabled===true,refresh,dispose(){if(disposed)return;disposed=true;dialog?.removeEventListener('toggle',refresh);for(const row of entries.values()){row.generation++;onDisable(row.id);row.api?.dispose?.();row.input.removeEventListener('change',row.change);row.openButton?.removeEventListener('click',row.open);}section.remove();}};
}
