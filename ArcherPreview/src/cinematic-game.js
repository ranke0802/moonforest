import {ASSET_CATALOG} from './asset-catalog.js';
import {ACTOR_DEFINITIONS} from './actor-definitions.js';
import audioManifest from '../public/assets/audio.json' with {type:'json'};
import {createBasePlacementManifest} from './placement-document.js';
import {validateCinematicDocument} from './cinematic-document.js';
import {CinematicPlayer} from './cinematic-player.js';
import {createCinematicSceneHost} from './cinematic-scene-host.js';
import {parseCinematicCommand,cinematicReply} from './cinematic-protocol.js';
import {listRegisteredCinematics,loadRegisteredCinematic} from './cinematic-registry.js';

const storageKey='moonforest-0.1:cinematics:registered:v1';
const cancelled=()=>Object.assign(new Error('컷씬 요청이 취소되었습니다.'),{name:'AbortError'});
export function cinematicReferences(world,mapId=world.mapId){
 const base=createBasePlacementManifest(mapId,{catalog:ASSET_CATALOG});
 return {catalog:ASSET_CATALOG,actorDefinitions:ACTOR_DEFINITIONS,audioIds:Object.keys(audioManifest.sounds),instanceIds:[...base.instances.map(row=>row.instanceId),...(world.mapId===mapId?world.placementOverlay?.instances??[]:[]).map(row=>row.instanceId)]};
}
function checked(input,references){const result=validateCinematicDocument(input,references);if(!result.valid)throw Object.assign(new Error(result.errors.map(row=>row.path+': '+row.message).join('\n')),{errors:result.errors});return result.document;}

// This controller borrows the live game scene and its frame/input/audio lease.
// The authoring page sends data to this controller; it owns no second engine.
export function setupGameCinematics({root,world,battle,getPlayer,getState,storage,travel,preview=false,window:win=globalThis.window,createHost=createCinematicSceneHost,Player=CinematicPlayer,projectList=listRegisteredCinematics,projectLoad=loadRegisteredCinematic,readyTimeoutMs=60000}){
 const doc=root.ownerDocument,subtitles=doc.createElement('div');subtitles.dataset.toolUi='';subtitles.className='cinematic-subtitles';subtitles.style.cssText='position:fixed;z-index:860;left:10%;right:10%;bottom:12%;text-align:center;white-space:pre-wrap;color:#fff;font:600 clamp(16px,2vw,24px)/1.6 system-ui;text-shadow:0 2px 5px #000;pointer-events:none';root.append(subtitles);
 let disposed=false,epoch=0,pendingReady=null,loaded=null,externalResume=false,local={},panel=null,style=null;
 const host=createHost({world,battle,getPlayer,getState,audioIds:Object.keys(audioManifest.sounds),audioEnabled:true,onSubtitles:rows=>{subtitles.textContent=rows.map(row=>typeof row==='string'?row:row.text).join('\n');},onMarker:label=>status('표식: '+label)});
 const player=new Player({host,references:cinematicReferences(world),onState:state=>{host.setPlaybackState(state.state);renderState(state);}});
 const ownLease=()=>world.toolLease?.active&&/^cinematic-/.test(world.toolLease.owner??'');
 const ready=()=>{const state=getState();return !!(!disposed&&(state.ready||ownLease())&&!state.loading&&!state.dead&&!state.failed&&!state.hidden&&!state.settings);};
 function status(message){const node=panel?.querySelector('[data-status]');if(node)node.textContent=message;}
 function renderState(state){if(disposed)return;status(`${state.state} · ${state.time.toFixed(2)} / ${state.duration.toFixed(2)}초${state.error?'\n'+state.error:''}`);const seek=panel?.querySelector('[data-seek]');if(seek){seek.max=state.duration;seek.value=state.time;}if(!['ready','playing','paused','preparing'].includes(state.state))subtitles.textContent='';}
 function post(id,payload){if(preview&&win?.parent&&win.parent!==win)win.parent.postMessage(cinematicReply(id,payload),win.location.origin);}
 function cancelReady(){if(!pendingReady)return;const job=pendingReady;pendingReady=null;clearTimeout(job.timer);job.reject(cancelled());}
 function waitReady(request){
  if(ready())return Promise.resolve();cancelReady();
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(pendingReady?.request===request)pendingReady=null;reject(new Error('게임 준비 대기 시간이 초과되었습니다.'));},readyTimeoutMs);pendingReady={request,timer,resolve,reject};});
 }
 function notifyReady(){
  if(disposed)return;const available=ready();post('host-ready',{ok:true,ready:available,mapId:world.mapId});
  if(available&&pendingReady){const job=pendingReady;pendingReady=null;clearTimeout(job.timer);job.resolve();}
 }
 host.setCallbacks({onFrame:dt=>player.update(dt),onPause:paused=>{if(paused){externalResume=player.state==='playing';player.pause();}else if(externalResume){externalResume=false;player.resume();}},onCancel:reason=>{externalResume=false;void player.stop(reason);}});
 async function load(input){
  const mapId=typeof input==='string'?JSON.parse(input).mapId:input?.mapId,references=cinematicReferences(world,mapId),document=checked(input,references);
  if(document.mapId!==world.mapId)throw new Error('먼저 컷씬의 맵으로 이동하세요: '+document.mapId);
  const request=++epoch;cancelReady();await player.stop('replace');if(disposed||request!==epoch)throw cancelled();await waitReady(request);if(disposed||request!==epoch)throw cancelled();
  player.references=references;const result=await player.load(document);if(!result||disposed||request!==epoch)throw cancelled();loaded=document;return true;
 }
 async function execute(command){
  if(disposed)throw cancelled();
  if(command.command==='load')await load(command.document);
  else if(command.command==='play'){externalResume=false;if(player.state==='completed'||player.state==='cancelled'){if(!loaded)throw new Error('먼저 파일을 불러오세요.');await load(loaded);}if(!player.play())throw new Error('준비된 컷씬이 없습니다.');}
  else if(command.command==='pause'){externalResume=false;player.pause();}
  else if(command.command==='resume'){externalResume=false;player.resume();}
  else if(command.command==='seek'){if(!player.seek(command.time))throw new Error('준비 후 유효한 시간으로 탐색하세요.');}
  else if(command.command==='stop'){externalResume=false;++epoch;cancelReady();await player.stop('skip');subtitles.textContent='';}
  else if(command.command==='loop')player.setLoop(command.loop);
  else if(command.command==='capture-camera')return {...player.inspect(),camera:host.captureCamera()};
  return player.inspect();
 }
 const receive=event=>{
  const command=parseCinematicCommand(event,{source:win.parent,origin:win.location.origin});if(!command||!preview||win.parent===win)return;
  execute(command).then(result=>post(command.requestId,{ok:true,...result}),error=>post(command.requestId,{ok:false,error:error.message,errors:error.errors}));
 };
 if(preview)win.addEventListener('message',receive);
 function readLocal(){try{const raw=storage?.getItem(storageKey);if(!raw)return {};if(new TextEncoder().encode(raw).length>2*1024*1024)throw new Error('등록 저장소 크기 초과');const value=JSON.parse(raw);if(!value||value.version!==1||!value.documents||typeof value.documents!=='object'||Array.isArray(value.documents)||Object.keys(value.documents).length>8)throw new Error('등록 저장소 형식 오류');for(const [id,item]of Object.entries(value.documents)){const result=validateCinematicDocument(item,cinematicReferences(world,item?.mapId));
    // Authored overlay IDs are available only after their map has loaded. Keep
    // stored documents visible, then require the complete reference check in
    // selectedDocument/load before any scene, input or resource is acquired.
    const errors=result.errors.filter(error=>!(error.message==='Unknown existing instance reference'&&/^\$\.actors\[\d+\]\.instanceId$/.test(error.path)));
    if(errors.length)throw new Error(errors.map(error=>error.path+': '+error.message).join('\n'));if(id!==item.cutsceneId)throw new Error('등록 ID와 파일 ID가 다릅니다.');}return value.documents;}catch(error){status('브라우저 등록본을 읽지 못했습니다: '+error.message);return {};}}
 function refreshList(){const list=panel?.querySelector('[data-registered]');if(!list)return;list.replaceChildren();for(const [source,rows]of [['project',projectList()],['browser',Object.entries(local).map(([cutsceneId,value])=>({cutsceneId,mapId:value.mapId}))]])for(const row of rows){const option=doc.createElement('option');option.value=source+':'+row.cutsceneId;option.textContent=`${source==='project'?'프로젝트':'브라우저 저장본 · 로드 시 재검증'} · ${row.cutsceneId} · ${row.mapId}`;list.append(option);}}
 async function selectedDocument(){const value=panel.querySelector('[data-registered]').value;if(!value)throw new Error('등록된 파일을 선택하세요.');const [source,...rest]=value.split(':'),id=rest.join(':');if(source==='browser')return checked(local[id],cinematicReferences(world,local[id]?.mapId));const row=projectList().find(item=>item.cutsceneId===id);return projectLoad(id,{references:cinematicReferences(world,row?.mapId),baseUrl:win.location.href});}
 if(!preview){
  style=doc.createElement('style');style.textContent='.cinematic-game{position:fixed;z-index:855;top:75px;left:12px;width:min(390px,calc(100vw - 24px));max-height:70dvh;overflow:auto;padding:12px;background:#17221ff5;color:#eee8d8;border:1px solid #9f936f;border-radius:8px;font:13px/1.6 system-ui;user-select:text}.cinematic-game button,.cinematic-game input,.cinematic-game select{font:inherit;margin:4px;max-width:98%;min-height:32px}.cinematic-game output{display:block;white-space:pre-wrap;overflow-wrap:anywhere}';
  panel=doc.createElement('details');panel.className='cinematic-game';panel.dataset.toolUi='';panel.dataset.ui='';panel.open=true;
  panel.innerHTML='<summary>MoonForest 0.1 · 컷씬 파일 재생</summary><p>검증한 파일을 선택해 재생합니다. 등록만으로 일반 플레이에 자동 발동하지 않습니다.</p><label>JSON 파일 <input data-import type="file" accept=".json,application/json"></label><button data-action="load-import">검증한 파일 로드</button><button data-action="register">브라우저 목록에 등록</button><select data-registered></select><button data-action="registered">선택 등록본 로드</button><button data-action="travel">선택 파일의 맵으로 이동</button><div><button data-action="play">재생</button><button data-action="pause">일시정지</button><button data-action="resume">계속</button><button data-action="stop">건너뛰기 · 종료</button><label><input data-loop type="checkbox">반복</label></div><input data-seek type="range" min="0" max="0" step=".01" value="0"><output data-file>파일 미선택 · 프로젝트 미등록</output><output data-status aria-live="polite">게임 준비 후 파일을 선택하세요.</output><p>프로젝트 등록: 내보낸 JSON에 node scripts/register-cinematic.mjs &lt;파일&gt; --apply 를 실행한 뒤 기존 빌드·배포를 수행합니다.</p>';
  root.append(style,panel);local=readLocal();refreshList();let imported=null;
  panel.querySelector('[data-import]').onchange=async event=>{try{const file=event.target.files?.[0];if(!file)return;if(file.size>512*1024)throw new Error('파일은 512 KiB 이하여야 합니다.');const raw=await file.text(),value=JSON.parse(raw);imported=checked(raw,cinematicReferences(world,value.mapId));panel.querySelector('[data-file]').textContent=`${imported.cutsceneId} · ${imported.mapId} · 검증 통과 · 프로젝트 미등록`;}catch(error){imported=null;status(error.message);}finally{event.target.value='';}};
  panel.onclick=event=>{const action=event.target.closest?.('[data-action]')?.dataset.action;if(!action)return;(async()=>{
   if(action==='load-import'){if(!imported)throw new Error('유효한 파일을 먼저 선택하세요.');await load(imported);}
   else if(action==='register'){if(!imported)throw new Error('유효한 파일을 먼저 선택하세요.');if(!storage)throw new Error('브라우저 저장소를 사용할 수 없습니다.');const next={...local,[imported.cutsceneId]:imported},raw=JSON.stringify({version:1,documents:next});if(Object.keys(next).length>8||new TextEncoder().encode(raw).length>2*1024*1024)throw new Error('등록은 8개·2 MiB 이내입니다.');storage.setItem(storageKey,raw);local=next;refreshList();status('브라우저 등록 완료 · 새로고침 후 목록 유지 · 프로젝트 미등록/미배포');}
   else if(action==='registered')await load(await selectedDocument());
   else if(action==='travel'){const value=imported??await selectedDocument();await travel?.(value.mapId);}
   else await execute({command:action});
  })().catch(error=>status(error.message));};
  panel.querySelector('[data-loop]').onchange=event=>{player.setLoop(event.target.checked);};panel.querySelector('[data-seek]').oninput=event=>{player.seek(Number(event.target.value));};
 }
 const observer=world.scene.onDisposeObservable.addOnce(()=>{void api.dispose();});
 const api={player,host,load,execute,notifyReady,inspect:()=>({...player.inspect(),host:host.inspect(),pendingReady:!!pendingReady}),leaveMap(){++epoch;cancelReady();externalResume=false;loaded=null;subtitles.textContent='';void player.stop('map-change');void host.evictIdle?.({all:true});post('host-ready',{ok:true,ready:false,mapId:world.mapId});},async dispose(){if(disposed)return;disposed=true;++epoch;cancelReady();if(preview)win.removeEventListener('message',receive);world.scene.onDisposeObservable.remove(observer);panel?.remove();style?.remove();subtitles.remove();await player.dispose();await host.dispose();}};
 notifyReady();return api;
}
