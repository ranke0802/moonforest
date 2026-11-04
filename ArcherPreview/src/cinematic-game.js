import {ASSET_CATALOG} from './asset-catalog.js';
import {ACTOR_DEFINITIONS} from './actor-definitions.js';
import audioManifest from '../public/assets/audio.json' with {type:'json'};
import {createBasePlacementManifest} from './placement-document.js';
import {validateCinematicDocument} from './cinematic-document.js';
import {CinematicPlayer} from './cinematic-player.js';
import {createCinematicSceneHost} from './cinematic-scene-host.js';
import {parseCinematicCommand,cinematicReply} from './cinematic-protocol.js';
import {listRegisteredCinematics,loadRegisteredCinematic} from './cinematic-registry.js';
import {authoringUrl,AUTHORING_MAPS} from './authoring-navigation.js';
import {createCinematicInteraction} from './cinematic-interaction.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';

const storageKey='moonforest-0.1:cinematics:registered:v1';
const cancelled=()=>Object.assign(new Error('컷씬 요청이 취소되었습니다.'),{name:'AbortError'});
const playerVisualOwners=new WeakMap();
export function cinematicReferences(world,mapId=world.mapId){
 const base=createBasePlacementManifest(mapId,{catalog:ASSET_CATALOG});
 return {catalog:ASSET_CATALOG,actorDefinitions:ACTOR_DEFINITIONS,audioIds:Object.keys(audioManifest.sounds),instanceIds:[...base.instances.map(row=>row.instanceId),...(world.mapId===mapId?world.placementOverlay?.instances??[]:[]).map(row=>row.instanceId)]};
}
function checked(input,references){const result=validateCinematicDocument(input,references);if(!result.valid)throw Object.assign(new Error(result.errors.map(row=>row.path+': '+row.message).join('\n')),{errors:result.errors});return result.document;}

// This controller borrows the live game scene and its frame/input/audio lease.
// The authoring page sends data to this controller; it owns no second engine.
export function setupGameCinematics({root,world,battle,getPlayer,getState,storage,travel,preview=false,window:win=globalThis.window,createHost=createCinematicSceneHost,Player=CinematicPlayer,projectList=listRegisteredCinematics,projectLoad=loadRegisteredCinematic,readyTimeoutMs=60000}){
 const doc=root.ownerDocument,subtitles=doc.createElement('div');subtitles.dataset.toolUi='';subtitles.className='cinematic-subtitles';subtitles.style.cssText='position:fixed;z-index:860;left:10%;right:10%;bottom:12%;text-align:center;white-space:pre-wrap;color:#fff;font:600 clamp(16px,2vw,24px)/1.6 system-ui;text-shadow:0 2px 5px #000;pointer-events:none';root.append(subtitles);
 let disposed=false,epoch=0,pendingReady=null,loaded=null,externalResume=false,local={},panel=null,style=null,imported=null,uiBusy=false,readySignature=null,autoOpenStarted=false,interaction=null;
 const host=createHost({world,battle,getPlayer,getState,audioIds:Object.keys(audioManifest.sounds),audioEnabled:true,acquireToolLease:async options=>{
  const node=getPlayer?.(),hide=player.document?.actors.length>0&&node?.setEnabled,owner=hide?{enabled:playerVisualOwners.get(node)?.enabled??node.isEnabled()}:null;
  const lease=await world.acquireToolLease({...options,onRelease:(...args)=>{if(owner&&playerVisualOwners.get(node)===owner){playerVisualOwners.delete(node);if(!node.isDisposed?.())node.setEnabled(owner.enabled);}options.onRelease?.(...args);}});
  if(owner&&lease.active){playerVisualOwners.set(node,owner);node.setEnabled(false);}return lease;
 },onSubtitles:rows=>{subtitles.textContent=rows.map(row=>typeof row==='string'?row:row.text).join('\n');},onMarker:label=>status('표식: '+label)});
 const player=new Player({host,references:cinematicReferences(world),onState:state=>{host.setPlaybackState(state.state);renderState(state);}});
 const ownLease=()=>world.toolLease?.active&&/^cinematic-/.test(world.toolLease.owner??'');
 const ready=()=>{const state=getState();return !!(!disposed&&(state.ready||ownLease())&&!state.loading&&!state.dead&&!state.failed&&!state.hidden&&!state.settings);};
 function status(message){const node=panel?.querySelector('[data-status]');if(node)node.textContent=message;}
 function renderState(state){if(disposed)return;interaction?.setPlaybackState(state.state);const labels={idle:'컷씬을 선택해 주세요.',preparing:'장면을 여는 중…',ready:'준비 완료 · 재생을 누르세요.',playing:'재생 중',paused:'일시정지',completed:'재생이 끝났습니다.',cancelled:'재생을 종료했습니다.',error:'장면을 열지 못했습니다.'};status(`${labels[state.state]??'준비 중'}${state.duration?' · '+state.time.toFixed(1)+' / '+state.duration.toFixed(1)+'초':''}${state.error?'\n'+state.error:''}`);const seek=panel?.querySelector('[data-seek]');if(seek){seek.max=state.duration;seek.value=state.time;seek.disabled=!['ready','playing','paused'].includes(state.state);}if(!['ready','playing','paused','preparing'].includes(state.state)){subtitles.textContent='';interaction?.clear();}updateButtons();}
 function post(id,payload){if(preview&&win?.parent&&win.parent!==win)win.parent.postMessage(cinematicReply(id,payload),win.location.origin);}
 function cancelReady(){if(!pendingReady)return;const job=pendingReady;pendingReady=null;clearTimeout(job.timer);job.reject(cancelled());}
 function waitReady(request){
  if(ready())return Promise.resolve();cancelReady();
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(pendingReady?.request===request)pendingReady=null;reject(new Error('게임 준비 대기 시간이 초과되었습니다.'));},readyTimeoutMs);pendingReady={request,timer,resolve,reject};});
 }
 function notifyReady(){
  if(disposed)return;const available=ready(),signature=world.mapId+':'+available;if(signature!==readySignature){readySignature=signature;post('host-ready',{ok:true,ready:available,mapId:world.mapId});}
  if(available&&pendingReady){const job=pendingReady;pendingReady=null;clearTimeout(job.timer);job.resolve();}
  updateButtons();const wanted=new URL(win.location.href).searchParams.get('scene');if(!preview&&available&&wanted&&!autoOpenStarted){autoOpenStarted=true;const select=panel?.querySelector('[data-registered]'),option=[...select.children].find(row=>row.value.endsWith(':'+wanted));if(option){for(const row of select.children)row.selected=row===option;void runUi(async()=>{await open(await selectedDocument());});}else status('저장한 컷씬을 찾지 못했습니다. 작업 파일을 열어 주세요.');}
 }
 host.setCallbacks({onFrame:dt=>player.update(dt),onPause:paused=>{if(paused){externalResume=player.state==='playing';player.pause();}else if(externalResume){externalResume=false;player.resume();}},onCancel:reason=>{externalResume=false;void player.stop(reason);}});
 async function load(input){
  const mapId=typeof input==='string'?JSON.parse(input).mapId:input?.mapId,references=cinematicReferences(world,mapId),document=checked(input,references);
  if(document.mapId!==world.mapId)throw new Error('먼저 컷씬의 맵으로 이동하세요: '+document.mapId);
  const request=++epoch;cancelReady();await player.stop('replace');if(disposed||request!==epoch)throw cancelled();await waitReady(request);if(disposed||request!==epoch)throw cancelled();
  player.references=references;const result=await player.load(document);if(!result||disposed||request!==epoch)throw cancelled();loaded=document;return true;
 }
 async function open(input){const value=typeof input==='string'?JSON.parse(input):input;
  validateStored(value);if(value.mapId!==world.mapId){status('컷씬의 지역을 여는 중…');if(!travel||await travel(value.mapId)===false)throw new Error('지역을 열지 못했습니다. 다시 시도해 주세요.');}
  return load(value);
 }
 function saveScene(input){const value=typeof input==='string'?JSON.parse(input):input,document=checked(value,cinematicReferences(world,value?.mapId));if(!storage)throw new Error('저장 공간을 사용할 수 없습니다. 작업 파일로 저장해 주세요.');const next={...readLocal(),[document.cutsceneId]:document},raw=JSON.stringify({version:1,documents:next});if(Object.keys(next).length>8||new TextEncoder().encode(raw).length>2*1024*1024)throw new Error('저장 공간이 찼습니다. 필요 없는 컷씬을 지운 뒤 저장하세요.');storage.setItem(storageKey,raw);local=next;refreshList();return {saved:true,gameUrl:authoringUrl(win.location.href,{mode:'cinematic',mapId:document.mapId,sceneId:document.cutsceneId})};}
 async function execute(command){
  if(disposed)throw cancelled();
  if(command.command==='load')await load(command.document);
  else if(command.command==='patch-document'){
   const document=checked(command.document,player.references),previous=player.document;if(!previous||document.mapId!==previous.mapId||document.actors.length!==previous.actors.length||document.actors.some((actor,index)=>{const old=previous.actors[index];return ['actorId','assetId','assetVersion','actorDefinitionId','instanceId'].some(key=>actor[key]!==old[key]);}))throw new Error('대상이 바뀌었습니다. 장면을 다시 열어 주세요.');
   const camera=host.captureCamera();try{player.document=document;if(!player.sample(true))throw new Error('장면을 먼저 열어 주세요.');loaded=document;}catch(error){player.document=previous;player.sample(true);throw error;}finally{world.camera.setTarget?.(Vector3.FromArray(camera.target));world.camera.setPosition?.(Vector3.FromArray(camera.position));world.camera.fov=camera.fov;world.camera.getViewMatrix(true);}
  }
  else if(command.command==='select-actor'){player.pause();if(!interaction?.select(command.actorId))throw new Error('대상을 찾지 못했습니다.');}
  else if(command.command==='focus-actor'){player.pause();if(!interaction?.focus(command.actorId))throw new Error('대상을 찾지 못했습니다.');}
  else if(command.command==='camera-mode'){player.pause();host.getLiveLease?.()?.setCameraMode?.(command.mode);}
  else if(command.command==='save-scene')return saveScene(command.document);
  else if(command.command==='play'){externalResume=false;if(player.state==='completed'||player.state==='cancelled'){if(!loaded)throw new Error('먼저 파일을 불러오세요.');await load(loaded);}if(!player.play())throw new Error('준비된 컷씬이 없습니다.');}
  else if(command.command==='pause'){externalResume=false;player.pause();}
  else if(command.command==='resume'){externalResume=false;player.resume();}
  else if(command.command==='seek'){if(!player.seek(command.time))throw new Error('준비 후 유효한 시간으로 탐색하세요.');}
  else if(command.command==='stop'){externalResume=false;++epoch;cancelReady();await player.stop('skip');subtitles.textContent='';}
  else if(command.command==='loop')player.setLoop(command.loop);
  else if(command.command==='capture-camera'){const camera=host.captureCamera(),target=camera.target;return {...player.inspect(),camera,playerPosition:getPlayer?.()?.position?.asArray?.()??null,focusPosition:[target[0],world.terrain?.heightAt?.(target[0],target[2])??getPlayer?.()?.position?.y??0,target[2]]};}
  return player.inspect();
 }
 const receive=event=>{
  const command=parseCinematicCommand(event,{source:win.parent,origin:win.location.origin});if(!command||!preview||win.parent===win)return;
  execute(command).then(result=>post(command.requestId,{ok:true,...result}),error=>post(command.requestId,{ok:false,error:error.message,errors:error.errors}));
 };
 if(preview)win.addEventListener('message',receive);
 if(preview)interaction=createCinematicInteraction({world,host,player,onSelect:value=>post('actor-selection',{ok:true,mapId:world.mapId,cutsceneId:player.document?.cutsceneId,time:player.time,...value}),onChange:value=>post('actor-edited',{ok:true,mapId:world.mapId,cutsceneId:player.document?.cutsceneId,time:player.time,...value})});
 function validateStored(item){const result=validateCinematicDocument(item,cinematicReferences(world,item?.mapId));
    // Authored overlay IDs are available only after their map has loaded. Keep
    // stored documents visible, then require the complete reference check in
    // selectedDocument/load before any scene, input or resource is acquired.
    const errors=result.errors.filter(error=>!(error.message==='Unknown existing instance reference'&&/^\$\.actors\[\d+\]\.instanceId$/.test(error.path)));
    if(errors.length)throw new Error(errors.map(error=>error.path+': '+error.message).join('\n'));return item;
 }
 function readLocal(){try{const raw=storage?.getItem(storageKey);if(!raw)return {};if(new TextEncoder().encode(raw).length>2*1024*1024)throw new Error('저장한 작업의 용량이 너무 큽니다.');const value=JSON.parse(raw);if(!value||value.version!==1||!value.documents||typeof value.documents!=='object'||Array.isArray(value.documents)||Object.keys(value.documents).length>8)throw new Error('저장한 작업을 읽지 못했습니다.');for(const [id,item]of Object.entries(value.documents)){validateStored(item);if(id!==item.cutsceneId)throw new Error('저장한 작업의 이름이 맞지 않습니다.');}return value.documents;}catch(error){status('브라우저 등록본을 읽지 못했습니다: '+error.message);return {};}}
 function selectedValue(){const list=panel?.querySelector('[data-registered]');return list?.value||list?.querySelector('option')?.value||'';}
 function refreshList(){const list=panel?.querySelector('[data-registered]');if(!list)return;const previous=selectedValue();list.replaceChildren();for(const [source,rows]of [['project',projectList()],['browser',Object.entries(local).map(([cutsceneId,value])=>({cutsceneId,mapId:value.mapId}))]])for(const row of rows){const option=doc.createElement('option');option.value=source+':'+row.cutsceneId;option.textContent=`${row.cutsceneId} · ${AUTHORING_MAPS.find(map=>map.mapId===row.mapId)?.label??'저장한 지역'}`;list.append(option);}if([...list.children].some(row=>row.value===previous))for(const row of list.children)row.selected=row.value===previous;const empty=panel.querySelector('[data-empty]');if(empty)empty.hidden=!!list.children.length;updateButtons();}
 async function selectedDocument(){const value=selectedValue();if(!value)throw new Error('저장된 컷씬이 없습니다. 컷씬 만들기를 눌러 먼저 만들어 주세요.');const [source,...rest]=value.split(':'),id=rest.join(':');if(source==='browser')return validateStored(local[id]);const row=projectList().find(item=>item.cutsceneId===id);if(row?.mapId!==world.mapId&&travel){if(await travel(row.mapId)===false)throw new Error('지역을 열지 못했습니다.');}return projectLoad(id,{references:cinematicReferences(world,row?.mapId),baseUrl:win.location.href});}
 function updateButtons(){if(!panel)return;const busy=uiBusy||player.state==='preparing',has=!!(loaded||imported||selectedValue());for(const action of ['play','registered'])panel.querySelector(`[data-action="${action}"]`).disabled=busy||!has;panel.querySelector('[data-action="pause"]').disabled=busy||player.state!=='playing';panel.querySelector('[data-action="resume"]').disabled=busy||player.state!=='paused';panel.querySelector('[data-action="load-import"]').disabled=busy||!imported;panel.querySelector('[data-action="register"]').disabled=busy||!(imported||loaded);panel.querySelector('[data-action="stop"]').disabled=!['preparing','ready','playing','paused'].includes(player.state);panel.querySelector('[data-import]').disabled=busy;}
 async function runUi(operation){if(uiBusy)return false;uiBusy=true;updateButtons();try{return await operation();}catch(error){if(error.name!=='AbortError')status(error.message);return false;}finally{uiBusy=false;updateButtons();}}
 if(!preview){
  style=doc.createElement('style');style.textContent='.cinematic-game{position:fixed;z-index:855;top:75px;left:12px;width:min(390px,calc(100vw - 24px));max-height:70dvh;overflow:auto;padding:12px;background:#17221ff5;color:#eee8d8;border:1px solid #9f936f;border-radius:8px;font:13px/1.6 system-ui;user-select:text}.cinematic-game button,.cinematic-game input,.cinematic-game select{font:inherit;margin:4px;max-width:98%;min-height:32px}.cinematic-game output{display:block;white-space:pre-wrap;overflow-wrap:anywhere}';
  panel=doc.createElement('details');panel.className='cinematic-game';panel.dataset.toolUi='';panel.dataset.ui='';panel.open=true;
  panel.innerHTML=`<summary>저장한 컷씬 보기</summary><p>컷씬을 고르고 <strong>재생</strong>을 누르세요. 필요한 지역은 자동으로 열립니다.</p><label>저장한 컷씬<select data-registered></select></label><p data-empty>아직 저장한 컷씬이 없어요. <a href="${authoringUrl(win.location.href,{mode:'studio'})}" style="color:inherit">컷씬 만들기</a>에서 만든 뒤 ‘게임에 저장’을 누르세요.</p><div><button data-action="play">▶ 재생</button><button data-action="pause">일시정지</button><button data-action="resume">이어 보기</button><button data-action="stop">게임으로 돌아가기</button></div><input data-seek type="range" min="0" max="0" step=".01" value="0" disabled><label><input data-loop type="checkbox">반복 재생</label><hr><label>작업 파일 열기<input data-import type="file" accept=".moonforest-scene,.json,application/json"></label><button data-action="register">이 브라우저에 저장</button><output data-file></output><output data-status aria-live="polite">저장한 컷씬이나 작업 파일을 선택하세요.</output><details><summary>다른 열기 방식</summary><button data-action="registered">선택한 컷씬 열기</button><button data-action="load-import">선택한 작업 파일 열기</button><button data-action="travel">작업한 지역 열기</button></details><p>여기에 저장한 작업은 이 브라우저에서 다시 열 수 있습니다. 다른 기기에서는 제작 화면에서 저장한 작업 파일을 열어 주세요.</p>`;
  root.append(style,panel);local=readLocal();refreshList();
  panel.querySelector('[data-import]').onchange=async event=>{try{const file=event.target.files?.[0];if(!file)return;if(file.size>512*1024)throw new Error('작업 파일의 용량이 너무 큽니다.');const value=JSON.parse(await file.text());imported=validateStored(value);panel.querySelector('[data-file]').textContent='작업 파일을 열었습니다.';await runUi(()=>open(imported));}catch(error){imported=null;status(error.message);}finally{event.target.value='';updateButtons();}};
  panel.querySelector('[data-registered]').onchange=()=>{imported=null;updateButtons();};
  panel.onclick=event=>{const button=event.target.closest?.('[data-action]'),action=button?.dataset.action;if(!action||button.disabled)return;if(action==='stop'){void execute({command:'stop'}).catch(error=>status(error.message));return;}void runUi(async()=>{
   if(action==='load-import'){if(!imported)throw new Error('먼저 작업 파일을 선택하세요.');await open(imported);}
   else if(action==='register'){const value=imported??loaded;if(!value)throw new Error('먼저 작업 파일을 열어 주세요.');saveScene(value);status('이 브라우저에 저장했습니다. ‘저장한 컷씬’에서 다시 볼 수 있습니다.');}
   else if(action==='registered')await open(await selectedDocument());
   else if(action==='travel'){const value=imported??await selectedDocument();await travel?.(value.mapId);}
   else if(action==='play'){const value=imported??await selectedDocument();if(!loaded||loaded.cutsceneId!==value.cutsceneId||loaded.mapId!==world.mapId)await open(value);await execute({command:'play'});}
   else await execute({command:action});
  });};
  panel.querySelector('[data-loop]').onchange=event=>{player.setLoop(event.target.checked);};panel.querySelector('[data-seek]').oninput=event=>{player.seek(Number(event.target.value));};
 }
 const observer=world.scene.onDisposeObservable.addOnce(()=>{void api.dispose();});
 const api={player,host,load,open,saveScene,execute,notifyReady,inspect:()=>({...player.inspect(),host:host.inspect(),pendingReady:!!pendingReady}),leaveMap(){++epoch;cancelReady();interaction?.clear();externalResume=false;loaded=null;subtitles.textContent='';void player.stop('map-change');void host.evictIdle?.();readySignature=null;post('host-ready',{ok:true,ready:false,mapId:world.mapId});},async dispose(){if(disposed)return;disposed=true;++epoch;cancelReady();interaction?.dispose();if(preview)win.removeEventListener('message',receive);world.scene.onDisposeObservable.remove(observer);panel?.remove();style?.remove();subtitles.remove();await player.dispose();await host.dispose();}};
 notifyReady();return api;
}
