import {ASSET_CATALOG} from './asset-catalog.js';
import {ACTOR_DEFINITIONS} from './actor-definitions.js';
import audioManifest from '../public/assets/audio.json' with {type:'json'};
import {createBasePlacementManifest} from './placement-document.js';
import {validateCinematicDocument,cinematicBackgroundAt} from './cinematic-document.js';
import {CinematicPlayer} from './cinematic-player.js';
import {createCinematicSceneHost} from './cinematic-scene-host.js';
import {parseCinematicCommand,cinematicReply,isCinematicCameraMovement} from './cinematic-protocol.js';
import {listRegisteredCinematics,loadRegisteredCinematic} from './cinematic-registry.js';
import {authoringUrl,AUTHORING_MAPS} from './authoring-navigation.js';
import {createCinematicInteraction} from './cinematic-interaction.js';
import {createCinematicSubtitles} from './cinematic-subtitles.js';
import {getCinematicDefinitions} from './cinematic-assets.js';
import {CINEMATIC_AUDIO_IDS,createCinematicAudioTimeline} from './cinematic-audio.js';
import {mediaStore as defaultMediaStore,importCinematicProject} from './cinematic-media.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {cinematicGroundAtScreen} from './cinematic-ground.js';
import {getNpcCatalog,hydrateNpcLibrary} from './npc-library.js';

const storageKey='moonforest-0.1:cinematics:registered:v1';
const cancelled=()=>Object.assign(new Error('컷씬 요청이 취소되었습니다.'),{name:'AbortError'});
const playerVisualOwners=new WeakMap();
export function cinematicReferences(world,mapId=world.mapId,document){
 const catalog=getNpcCatalog(ASSET_CATALOG),base=AUTHORING_MAPS.flatMap(map=>createBasePlacementManifest(map.mapId,{catalog}).instances);
 return {catalog,actorDefinitions:getCinematicDefinitions(catalog),audioIds:CINEMATIC_AUDIO_IDS,migrateCatalogRevision:true,instanceIds:[...base.map(row=>row.instanceId),...(world.placementOverlay?.instances??[]).map(row=>row.instanceId)],deferredInstanceIds:document?.actors.filter(actor=>actor.instanceId&&(actor.mapId??document.mapId)!==world.mapId).map(actor=>actor.instanceId)??[]};
}
function checked(input,references){const result=validateCinematicDocument(input,references);if(!result.valid)throw Object.assign(new Error(result.errors.map(row=>row.path+': '+row.message).join('\n')),{errors:result.errors});return result.document;}

// This controller borrows the live game scene and its frame/input/audio lease.
// The authoring page sends data to this controller; it owns no second engine.
export function setupGameCinematics({root,world,battle,getPlayer,getState,storage,travel,preview=false,window:win=globalThis.window,createHost=createCinematicSceneHost,Player=CinematicPlayer,projectList=listRegisteredCinematics,projectLoad=loadRegisteredCinematic,readyTimeoutMs=60000,media=defaultMediaStore,createAudioTimeline=createCinematicAudioTimeline}){
 const doc=root.ownerDocument,subtitles=doc.createElement('div'),centerText=doc.createElement('div');subtitles.dataset.toolUi='';subtitles.className='cinematic-subtitles';subtitles.style.cssText='position:fixed;z-index:860;left:10%;right:10%;bottom:12%;text-align:center;white-space:pre-wrap;color:#fff;font:600 clamp(16px,2vw,24px)/1.6 system-ui;text-shadow:0 2px 5px #000;pointer-events:none';
 centerText.dataset.toolUi='';centerText.className='cinematic-center-text';centerText.style.cssText='position:fixed;z-index:861;left:10%;right:10%;top:50%;transform:translateY(-50%);text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;color:#fff2d2;font:600 clamp(20px,3vw,36px)/1.6 system-ui;text-shadow:0 2px 6px #000,0 0 18px #000;pointer-events:none';root.append(subtitles,centerText);
 const previewHeroes=new Map(),previewStyle=preview?doc.createElement('style'):null,oldPreviewMode=root.dataset.cinematicPreview;
 function holdPreviewHero(){if(!preview)return;for(const node of previewHeroes.keys())if(node.isDisposed?.())previewHeroes.delete(node);const node=getPlayer?.();if(!node?.setEnabled||node.isDisposed?.())return;if(!previewHeroes.has(node))previewHeroes.set(node,node.isEnabled());node.setEnabled(false);}
 if(preview){root.dataset.cinematicPreview='true';previewStyle.textContent='#app[data-cinematic-preview] > :not(canvas):not([data-tool-ui]):not(style):not(#loading){visibility:hidden!important;pointer-events:none!important}';root.append(previewStyle);holdPreviewHero();}
 let disposed=false,epoch=0,loadSerial=0,uiEpoch=0,pendingReady=null,loaded=null,externalResume=false,local={},panel=null,style=null,imported=null,uiBusy=false,readySignature=null,autoOpenStarted=false,interaction=null,subtitleView=null,audioTimeline=null,internalTravel=null;
 const fade=doc.createElement('div'),unlock=doc.createElement('button');fade.dataset.toolUi='';fade.className='cinematic-screen-fade';fade.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:970;pointer-events:none';unlock.dataset.toolUi='';unlock.className='cinematic-audio-unlock';unlock.textContent='소리 켜기';unlock.hidden=true;unlock.style.cssText='position:fixed;right:12px;top:12px;z-index:980;min-height:40px;padding:8px 16px';root.append(fade,unlock);
 const audioGesture=()=>{const owner=host.getLiveLease?.()?.audio??world.toolLease?.audio;if(!owner)return;Promise.resolve(owner.unlock?.()).then(()=>{unlock.hidden=owner.context?.state==='running';audioTimeline?.sample(player.document,player.time,{playing:player.state==='playing'});}).catch(()=>{});};unlock.addEventListener('click',audioGesture);
 const host=createHost({world,battle,getPlayer,getState,actorDefinitions:getCinematicDefinitions(ASSET_CATALOG),audioIds:CINEMATIC_AUDIO_IDS,audioEnabled:true,acquireToolLease:async options=>{
  const node=getPlayer?.(),hide=player.document?.actors.length>0&&node?.setEnabled,owner=hide?{enabled:playerVisualOwners.get(node)?.enabled??node.isEnabled()}:null;
  const lease=await world.acquireToolLease({...options,onRelease:(...args)=>{if(owner&&playerVisualOwners.get(node)===owner){playerVisualOwners.delete(node);if(!node.isDisposed?.())node.setEnabled(owner.enabled);}options.onRelease?.(...args);}});
  if(owner&&lease.active){playerVisualOwners.set(node,owner);node.setEnabled(false);}return lease;
 },onSubtitles:rows=>subtitleView?.render(rows),onMarker:label=>status('표식: '+label)});
 const audioTimelines=new Map();
 const originalHost={prepare:host.prepare.bind(host),sample:host.sample.bind(host),emit:host.emit?.bind(host),stopAudio:host.stopAudio?.bind(host),release:host.release.bind(host)};
 async function prepareAudio(document,options){let timeline=audioTimelines.get(options.token);if(!document.tracks.audio.length){timeline?.dispose();audioTimelines.delete(options.token);if(audioTimeline===timeline)audioTimeline=null;unlock.hidden=true;return;}if(options.lease?.audio){if(!timeline){timeline=createAudioTimeline({audio:options.lease.audio,store:media,baseUrl:new URL('assets/audio.json',win.location.href)});audioTimelines.set(options.token,timeline);}await timeline.prepare(document,{signal:options.signal});audioTimeline=timeline;unlock.hidden=options.lease.audio.context?.state==='running';}}
 host.prepare=async(document,options)=>{const prepared=await originalHost.prepare(document,options);await prepareAudio(document,options);return prepared;};
 host.sample=(frame,options)=>{originalHost.sample(frame,options);fade.style.opacity=String(frame.presentation?.blackOpacity??0);audioTimelines.get(options.token)?.sample(player.document,frame.time,{playing:player.state==='playing',seeking:options.seeking});};
 host.emit=(cue,options)=>cue.kind==='audio'&&audioTimelines.has(options.token)?audioTimelines.get(options.token).emit(cue):originalHost.emit?.(cue,options);
 host.stopAudio=options=>{audioTimelines.get(options?.token)?.stop();originalHost.stopAudio?.(options);};
 host.release=async options=>{const timeline=audioTimelines.get(options.token);timeline?.dispose();audioTimelines.delete(options.token);if(audioTimeline===timeline){audioTimeline=null;unlock.hidden=true;}return originalHost.release(options);};
 const player=new Player({host,retainOnComplete:preview,references:cinematicReferences(world),travelBackground:async(mapId,{signal}={})=>{if(signal?.aborted||disposed)throw cancelled();if(!travel)throw new Error('배경 전환을 사용할 수 없습니다.');const token={};internalTravel=token;fade.style.opacity='1';interaction?.clear();subtitleView?.clear();try{if(await travel(mapId)===false)throw new Error('배경을 불러오지 못했습니다.');if(signal?.aborted||disposed)throw cancelled();await waitReady(epoch);if(signal?.aborted||disposed)throw cancelled();holdPreviewHero();world.wakeToolPlayback?.();}finally{if(internalTravel===token)internalTravel=null;}},onState:state=>{host.setPlaybackState(state.state);renderState(state);if(['ready','playing','paused','completed'].includes(state.state))world.wakeToolPlayback?.();}});
 let cameraMovementControl=null,cameraMovementSequence=0;
 function clearCameraMovement(){host.getLiveLease?.()?.clearCameraMovement?.();}
 function cameraControlId(){const op=player.operation,lease=host.getLiveLease?.();return preview&&op&&!op.released&&lease?.active&&!lease.paused&&lease===op.lease&&(!lease.isCurrent||lease.isCurrent())&&Number.isSafeInteger(op.token?.id)?op.token.id:null;}
 function inspectPlayer(){return {...player.inspect(),cameraControlId:cameraControlId()};}
 const ownLease=()=>world.toolLease?.active&&/^cinematic-/.test(world.toolLease.owner??'');
 const ready=()=>{const state=getState();return !!(!disposed&&(state.ready||ownLease())&&!state.loading&&!state.dead&&!state.failed&&!state.hidden&&!state.settings);};
 subtitleView=createCinematicSubtitles({root,canvas:world.scene.getEngine?.().getRenderingCanvas?.()??root.querySelector('canvas'),preview,bottom:subtitles,center:centerText,getContext:()=>({document:player.document,mapId:world.mapId,time:player.time,state:player.state,retained:player.inspect().retained,lease:host.getLiveLease?.()??world.toolLease,generation:epoch,enabled:ready(),detached:world.camera.inputs?.attachedToElement===false}),onSelect:value=>post('subtitle-selection',{ok:true,...value}),onEdit:value=>{
  const previous=player.document,cue=previous?.tracks.subtitles[value.subtitleIndex];if(!cue||previous.cutsceneId!==value.cutsceneId||cinematicBackgroundAt(previous,value.time).mapId!==value.mapId)return false;
  const document={...previous,tracks:{...previous.tracks,subtitles:previous.tracks.subtitles.map((row,index)=>index===value.subtitleIndex?{...row,position:{...value.position}}:row)}};player.document=document;loaded=document;post('subtitle-edited',{ok:true,...value});return true;
 }});
 function status(message){const node=panel?.querySelector('[data-status]');if(node)node.textContent=message;}
 function renderState(state){if(disposed)return;if(!["ready","paused","completed"].includes(state.state)||state.state==="completed"&&state.retained!==true)clearCameraMovement();post("camera-control-state",{ok:true,...inspectPlayer(),mapId:player.document?.mapId??world.mapId,backgroundMapId:world.mapId});if(state.state==='preparing'&&player.document?.tracks.backgrounds?.length)fade.style.opacity='1';if(state.state==='playing')audioTimeline?.sample(player.document,player.time,{playing:true});if(['cancelled','error','idle'].includes(state.state)){fade.style.opacity='0';unlock.hidden=true;}interaction?.setPlaybackState(state.state);subtitleView?.setPlaybackState(state.state);const labels={idle:'컷씬을 선택해 주세요.',preparing:'장면을 여는 중…',ready:'준비 완료 · 재생을 누르세요.',playing:'재생 중',paused:'일시정지',completed:'재생이 끝났습니다.',cancelled:'재생을 종료했습니다.',error:'장면을 열지 못했습니다.'};status(`${labels[state.state]??'준비 중'}${state.duration?' · '+state.time.toFixed(1)+' / '+state.duration.toFixed(1)+'초':''}${state.error?'\n'+state.error:''}`);const seek=panel?.querySelector('[data-seek]');if(seek){seek.max=state.duration;seek.value=state.time;seek.disabled=!['ready','playing','paused'].includes(state.state);}if(!['ready','playing','paused','preparing',...(preview?['completed']:[])].includes(state.state)){subtitleView?.clear();interaction?.clear();}updateButtons();}
 function post(id,payload){if(preview&&win?.parent&&win.parent!==win)win.parent.postMessage(cinematicReply(id,{cameraControlId:cameraControlId(),...payload,...(loaded?.tracks.backgrounds?.length||player.document?.tracks.backgrounds?.length?{mapId:player.document?.mapId??loaded.mapId,backgroundMapId:world.mapId}:{})}),win.location.origin);}
 function cancelReady(){if(!pendingReady)return;const job=pendingReady;pendingReady=null;clearTimeout(job.timer);job.reject(cancelled());}
 function waitReady(request){
  if(ready())return Promise.resolve();cancelReady();
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(pendingReady?.request===request)pendingReady=null;reject(new Error('게임 준비 대기 시간이 초과되었습니다.'));},readyTimeoutMs);pendingReady={request,timer,resolve,reject};});
 }
 function notifyReady(){
  if(disposed||(!preview&&panel?.hidden))return;holdPreviewHero();subtitleView.refresh();const available=ready(),signature=world.mapId+':'+available;if(signature!==readySignature){readySignature=signature;post('host-ready',{ok:true,ready:available,mapId:world.mapId});}
  if(available&&pendingReady){const job=pendingReady;pendingReady=null;clearTimeout(job.timer);job.resolve();}
  updateButtons();const wanted=new URL(win.location.href).searchParams.get('scene');if(!preview&&available&&wanted&&!autoOpenStarted){autoOpenStarted=true;const select=panel?.querySelector('[data-registered]'),option=[...select.children].find(row=>row.value.endsWith(':'+wanted));if(option){for(const row of select.children)row.selected=row===option;void runUi(async current=>{const value=await selectedDocument(current);if(current())await open(value);});}else status('저장한 컷씬을 찾지 못했습니다. 작업 파일을 열어 주세요.');}
 }
 host.setCallbacks({onFrame:dt=>player.update(dt),onPause:paused=>{clearCameraMovement();if(paused){externalResume=player.state==='playing';player.pause();}else if(externalResume){externalResume=false;player.resume();}},onCancel:reason=>{externalResume=false;void player.stop(reason);}});
 async function load(input,{preserveCamera=false,hydrationRequest}={}){
  const serial=hydrationRequest??++loadSerial;
  await hydrateNpcLibrary({refresh:true});
  if(disposed||serial!==loadSerial)throw cancelled();
  const value=typeof input==='string'?JSON.parse(input):input,mapId=value?.mapId,references=cinematicReferences(world,mapId,value),document=checked(value,references),time=preview&&preserveCamera&&player.document?.cutsceneId===document.cutsceneId?Math.min(player.time,document.duration):0;
  const view=preview&&preserveCamera&&player.document?.cutsceneId===document.cutsceneId?{mapId:world.mapId,camera:host.captureCamera()}:null;
  if(document.mapId!==world.mapId&&!document.tracks.backgrounds?.length)throw new Error('먼저 컷씬의 맵으로 이동하세요: '+document.mapId);
  const request=++epoch;cancelReady();await player.stop('replace');if(disposed||request!==epoch)throw cancelled();await waitReady(request);if(disposed||request!==epoch)throw cancelled();
  player.references=references;const result=await player.load(document,{time});if(!result||disposed||request!==epoch)throw cancelled();loaded=document;interaction?.setDocument(document);if(view?.mapId===world.mapId){world.camera.setTarget?.(Vector3.FromArray(view.camera.target));world.camera.setPosition?.(Vector3.FromArray(view.camera.position));world.camera.fov=view.camera.fov;world.camera.getViewMatrix(true);}world.wakeToolPlayback?.();return true;
 }
 async function open(input){const serial=++loadSerial;await hydrateNpcLibrary({refresh:true});if(disposed||serial!==loadSerial)throw cancelled();const value=typeof input==='string'?JSON.parse(input):input;
  validateStored(value);if(value.mapId!==world.mapId){status('컷씬의 지역을 여는 중…');if(!travel||await travel(value.mapId)===false)throw new Error('지역을 열지 못했습니다. 다시 시도해 주세요.');}
  if(disposed||serial!==loadSerial)throw cancelled();return load(value,{hydrationRequest:serial});
 }
 function saveScene(input){const value=typeof input==='string'?JSON.parse(input):input,document=checked(value,cinematicReferences(world,value?.mapId,value));if(!storage)throw new Error('저장 공간을 사용할 수 없습니다. 작업 파일로 저장해 주세요.');const next={...readLocal(),[document.cutsceneId]:document},raw=JSON.stringify({version:1,documents:next});if(Object.keys(next).length>8||new TextEncoder().encode(raw).length>2*1024*1024)throw new Error('저장 공간이 찼습니다. 필요 없는 컷씬을 지운 뒤 저장하세요.');storage.setItem(storageKey,raw);local=next;refreshList();return {saved:true,gameUrl:authoringUrl(win.location.href,{mode:'cinematic',mapId:document.mapId,sceneId:document.cutsceneId})};}
 async function execute(command,{isCurrent=()=>true}={}){
  if(disposed||!isCurrent())throw cancelled();
  if(['patch-document','save-scene'].includes(command.command))await hydrateNpcLibrary({refresh:true});
  if(command.command==='load')await load(command.document,{preserveCamera:command.preserveCamera});
  else if(command.command==='patch-document'){
   const document=checked(command.document,cinematicReferences(world,command.document?.mapId,command.document)),previous=player.document;if(!previous||document.mapId!==previous.mapId||document.actors.length!==previous.actors.length||document.actors.some((actor,index)=>{const old=previous.actors[index];return ['actorId','assetId','assetVersion','actorDefinitionId','instanceId'].some(key=>actor[key]!==old[key]);}))throw new Error('대상이 바뀌었습니다. 장면을 다시 열어 주세요.');
   const camera=host.captureCamera(),previousTime=player.time,previousMap=world.mapId;try{player.document=document;player.time=Math.min(player.time,document.duration);if(JSON.stringify(previous.tracks.audio)!==JSON.stringify(document.tracks.audio)||JSON.stringify(previous.media)!==JSON.stringify(document.media)){const op=player.operation;await prepareAudio(document,{token:op.token,lease:op.lease,signal:op.controller.signal});}if(!player.sample(true)&&!player.backgroundPromise)throw new Error('장면을 먼저 열어 주세요.');await player.waitReady?.();loaded=document;interaction?.setDocument(document);world.wakeToolPlayback?.();}catch(error){player.document=previous;player.time=previousTime;player.sample(true);throw error;}finally{if(previousMap===world.mapId){world.camera.setTarget?.(Vector3.FromArray(camera.target));world.camera.setPosition?.(Vector3.FromArray(camera.position));world.camera.fov=camera.fov;world.camera.getViewMatrix(true);}}
  }
  else if(command.command==='select-actor'){player.pause();if(!interaction?.select(command.actorId))throw new Error('대상을 찾지 못했습니다.');}
  else if(command.command==='focus-actor'){player.pause();if(!interaction?.focus(command.actorId))throw new Error('대상을 찾지 못했습니다.');}
  else if(command.command==='camera-mode'){player.pause();host.getLiveLease?.()?.setCameraMode?.(command.mode);}
  else if(command.command==='camera-move'){
   const id=cameraControlId(),lease=host.getLiveLease?.();
   if(!preview||id===null||command.cameraControlId!==id||command.cutsceneId!==player.document?.cutsceneId||command.mapId!==world.mapId||!Number.isSafeInteger(command.sequence)||command.sequence<1||!isCinematicCameraMovement(command.movement))throw new Error('현재 편집 중인 장면의 이동 조작만 사용할 수 있습니다.');
   if(cameraMovementControl!==id){cameraMovementControl=id;cameraMovementSequence=0;}
   if(command.sequence<=cameraMovementSequence)return inspectPlayer();
   cameraMovementSequence=command.sequence;
   const moving=Object.values(command.movement).some(value=>value!==0),editable=['ready','paused'].includes(player.state)||player.state==='completed'&&player.inspect().retained===true;
   if(!moving){lease.clearCameraMovement?.();return inspectPlayer();}
   if(!editable){clearCameraMovement();throw new Error('재생을 일시정지한 뒤 카메라를 이동하세요.');}
   if(!lease.setCameraMovement?.(command.movement))throw new Error('카메라 이동을 준비하지 못했습니다. 장면을 다시 열어 주세요.');
   world.wakeToolPlayback?.();
  }
  else if(command.command==='path-visibility'){interaction?.setPathVisible(command.visible);}
  else if(command.command==='list-existing')return {...inspectPlayer(),instances:host.getExistingHandles?.()??[]};
  else if(command.command==='save-scene')return saveScene(command.document);
  else if(command.command==='play'){await player.waitReady?.();if(!isCurrent())throw cancelled();externalResume=false;if(player.state==='completed'&&!player.inspect().retained||player.state==='cancelled'){if(!loaded)throw new Error('먼저 파일을 불러오세요.');await load(loaded);}if(!isCurrent())throw cancelled();world.wakeToolPlayback?.();if(world.toolLease?.paused)throw new Error('화면이 숨겨져 있거나 다른 창이 열려 일시정지 상태입니다.');if(player.state!=='playing'&&!player.play())throw new Error('준비된 컷씬이 없습니다.');}
  else if(command.command==='pause'){externalResume=false;player.pause();}
  else if(command.command==='resume'){await player.waitReady?.();if(!isCurrent())throw cancelled();externalResume=false;world.wakeToolPlayback?.();if(world.toolLease?.paused)throw new Error('화면이 숨겨져 있거나 다른 창이 열려 일시정지 상태입니다.');if(player.state!=='playing'&&!player.resume())throw new Error('먼저 장면을 열어 주세요.');}
  else if(command.command==='seek'){if(!player.seek(command.time))throw new Error('준비 후 유효한 시간으로 탐색하세요.');await player.waitReady?.();if(!isCurrent())throw cancelled();interaction?.setDocument(player.document);world.wakeToolPlayback?.();}
  else if(command.command==='stop'){clearCameraMovement();externalResume=false;++loadSerial;++epoch;cancelReady();await player.stop('skip');subtitleView.clear();}
  else if(command.command==='loop')player.setLoop(command.loop);
  else if(command.command==='capture-camera'){await player.waitReady?.();const camera=host.captureCamera(),engine=world.scene.getEngine(),canvas=engine.getRenderingCanvas?.(),rect=canvas?.getBoundingClientRect?.(),width=rect?.width||canvas?.clientWidth||engine.getRenderWidth()*engine.getHardwareScalingLevel(),height=rect?.height||canvas?.clientHeight||engine.getRenderHeight()*engine.getHardwareScalingLevel(),point=cinematicGroundAtScreen(world,width/2,height/2);return {...inspectPlayer(),camera,playerPosition:getPlayer?.()?.position?.asArray?.()??null,focusPosition:point?.asArray()??null,...(!point?{placementError:'화면 중앙에 바닥이 보이도록 시점을 내려 주세요.'}:{})};}
  return inspectPlayer();
 }
 const receive=event=>{
  const command=parseCinematicCommand(event,{source:win.parent,origin:win.location.origin});if(!command||!preview||win.parent===win)return;
  execute(command).then(result=>post(command.requestId,{ok:true,...result}),error=>post(command.requestId,{ok:false,error:error.message,errors:error.errors}));
 };
 if(preview)win.addEventListener('message',receive);
 if(preview)interaction=createCinematicInteraction({world,host,player,onExistingSelect:instance=>post('existing-selection',{ok:true,mapId:world.mapId,backgroundMapId:world.mapId,cutsceneId:player.document?.cutsceneId,time:player.time,instance}),onSelect:value=>post('actor-selection',{ok:true,mapId:world.mapId,cutsceneId:player.document?.cutsceneId,time:player.time,...value}),onChange:value=>post('actor-edited',{ok:true,mapId:world.mapId,cutsceneId:player.document?.cutsceneId,time:player.time,...value})});
 function validateStored(item){const result=validateCinematicDocument(item,cinematicReferences(world,item?.mapId,item));
    // Authored overlay IDs are available only after their map has loaded. Keep
    // stored documents visible, then require the complete reference check in
    // selectedDocument/load before any scene, input or resource is acquired.
    const errors=result.errors.filter(error=>!(error.message==='Unknown existing instance reference'&&/^\$\.actors\[\d+\]\.instanceId$/.test(error.path)));
    if(errors.length)throw new Error(errors.map(error=>error.path+': '+error.message).join('\n'));return item;
 }
 function readLocal(){try{const raw=storage?.getItem(storageKey);if(!raw)return {};if(new TextEncoder().encode(raw).length>2*1024*1024)throw new Error('저장한 작업의 용량이 너무 큽니다.');const value=JSON.parse(raw);if(!value||value.version!==1||!value.documents||typeof value.documents!=='object'||Array.isArray(value.documents)||Object.keys(value.documents).length>8)throw new Error('저장한 작업을 읽지 못했습니다.');for(const [id,item]of Object.entries(value.documents)){validateStored(item);if(id!==item.cutsceneId)throw new Error('저장한 작업의 이름이 맞지 않습니다.');}return value.documents;}catch(error){status('브라우저 등록본을 읽지 못했습니다: '+error.message);return {};}}
 function selectedValue(){const list=panel?.querySelector('[data-registered]');return list?.value||list?.querySelector('option')?.value||'';}
 function refreshList(){const list=panel?.querySelector('[data-registered]');if(!list)return;const previous=selectedValue();list.replaceChildren();for(const [source,rows]of [['project',projectList()],['browser',Object.entries(local).map(([cutsceneId,value])=>({cutsceneId,mapId:value.mapId}))]])for(const row of rows){const option=doc.createElement('option');option.value=source+':'+row.cutsceneId;option.textContent=`${row.cutsceneId} · ${AUTHORING_MAPS.find(map=>map.mapId===row.mapId)?.label??'저장한 지역'}`;list.append(option);}if([...list.children].some(row=>row.value===previous))for(const row of list.children)row.selected=row.value===previous;const empty=panel.querySelector('[data-empty]');if(empty)empty.hidden=!!list.children.length;updateButtons();}
 async function selectedDocument(current=()=>true){if(!current())throw cancelled();const value=selectedValue();if(!value)throw new Error('저장된 컷씬이 없습니다. 컷씬 만들기를 눌러 먼저 만들어 주세요.');const [source,...rest]=value.split(':'),id=rest.join(':');if(source==='browser')return validateStored(local[id]);const row=projectList().find(item=>item.cutsceneId===id);if(row?.mapId!==world.mapId&&travel){if(await travel(row.mapId)===false)throw new Error('지역을 열지 못했습니다.');}if(!current())throw cancelled();return projectLoad(id,{references:cinematicReferences(world,row?.mapId),baseUrl:win.location.href});}
 function updateButtons(){if(!panel)return;const busy=uiBusy||player.state==='preparing',has=!!(loaded||imported||selectedValue());for(const action of ['play','registered'])panel.querySelector(`[data-action="${action}"]`).disabled=busy||!has;panel.querySelector('[data-action="pause"]').disabled=busy||player.state!=='playing';panel.querySelector('[data-action="resume"]').disabled=busy||player.state!=='paused';panel.querySelector('[data-action="load-import"]').disabled=busy||!imported;panel.querySelector('[data-action="register"]').disabled=busy||!(imported||loaded);panel.querySelector('[data-action="stop"]').disabled=!['preparing','ready','playing','paused'].includes(player.state);panel.querySelector('[data-import]').disabled=busy;}
 async function runUi(operation){const request=uiEpoch,current=()=>!disposed&&request===uiEpoch&&!panel?.hidden;if(uiBusy||!current())return false;uiBusy=true;updateButtons();try{return await operation(current);}catch(error){if(current()&&error.name!=='AbortError')status(error.message);return false;}finally{if(request===uiEpoch){uiBusy=false;updateButtons();}}}
 if(!preview){
  style=doc.createElement('style');style.textContent='.cinematic-game{position:fixed;z-index:855;top:75px;left:12px;width:min(390px,calc(100vw - 24px));max-height:70dvh;overflow:auto;padding:12px;background:#17221ff5;color:#eee8d8;border:1px solid #9f936f;border-radius:8px;font:13px/1.6 system-ui;user-select:text}.cinematic-game button,.cinematic-game input,.cinematic-game select{font:inherit;margin:4px;max-width:98%;min-height:32px}.cinematic-game output{display:block;white-space:pre-wrap;overflow-wrap:anywhere}';
  panel=doc.createElement('details');panel.className='cinematic-game';panel.dataset.toolUi='';panel.dataset.ui='';panel.open=true;
  panel.innerHTML=`<summary>저장한 컷씬 보기</summary><p>컷씬을 고르고 <strong>재생</strong>을 누르세요. 필요한 지역은 자동으로 열립니다.</p><label>저장한 컷씬<select data-registered></select></label><p data-empty>아직 저장한 컷씬이 없어요. <a href="${authoringUrl(win.location.href,{mode:'studio'})}" style="color:inherit">컷씬 만들기</a>에서 만든 뒤 ‘게임에 저장’을 누르세요.</p><div><button data-action="play">▶ 재생</button><button data-action="pause">일시정지</button><button data-action="resume">이어 보기</button><button data-action="stop">게임으로 돌아가기</button></div><input data-seek type="range" min="0" max="0" step=".01" value="0" disabled><label><input data-loop type="checkbox">반복 재생</label><hr><label>작업 파일 열기<input data-import type="file" accept=".moonforest-scene,.moonforest-project,.json,application/json,application/octet-stream"></label><button data-action="register">이 브라우저에 저장</button><output data-file></output><output data-status aria-live="polite">저장한 컷씬이나 작업 파일을 선택하세요.</output><details><summary>다른 열기 방식</summary><button data-action="registered">선택한 컷씬 열기</button><button data-action="load-import">선택한 작업 파일 열기</button><button data-action="travel">작업한 지역 열기</button></details><p>여기에 저장한 작업은 이 브라우저에서 다시 열 수 있습니다. 다른 기기에서는 제작 화면에서 저장한 작업 파일을 열어 주세요.</p>`;
  style.textContent+='.cinematic-game button,.cinematic-game select,.cinematic-game input[type=file]{background:#263c2d;color:#f1ead9;border:1px solid #819071;border-radius:5px;padding:6px}.cinematic-game button:disabled{opacity:.45}.cinematic-game [data-action=close]{float:right;min-width:40px;min-height:40px;margin-top:-3px}';
  const close=doc.createElement('button');close.type='button';close.dataset.action='close';close.setAttribute('aria-label','컷씬 창 닫기');close.textContent='×';panel.querySelector('summary').after(close);
  root.append(style,panel);local=readLocal();refreshList();
  panel.querySelector('[data-import]').onchange=async event=>{const input=event.currentTarget??event.target,file=input?.files?.[0],request=uiEpoch;try{if(!file)return;await runUi(async current=>{try{if(file.size>65*1024*1024)throw new Error('작업 파일의 용량이 너무 큽니다.');const value=await importCinematicProject(file,{store:media});if(!current())return;await hydrateNpcLibrary({refresh:true});if(!current())return;imported=validateStored(value);panel.querySelector('[data-file]').textContent='작업 파일을 열었습니다.';await open(imported);}catch(error){if(current())imported=null;throw error;}});}finally{if(input&&request===uiEpoch)input.value='';}};
  panel.querySelector('[data-registered]').onchange=()=>{imported=null;updateButtons();};
  panel.onclick=event=>{const button=event.target.closest?.('[data-action]'),action=button?.dataset.action;if(!action||button.disabled||panel.hidden)return;if(action==='stop'||action==='close'){void api.hide()?.catch(error=>status(error.message));return;}void runUi(async current=>{
   if(action==='load-import'){if(!imported)throw new Error('먼저 작업 파일을 선택하세요.');await open(imported);}
   else if(action==='register'){const value=imported??loaded;if(!value)throw new Error('먼저 작업 파일을 열어 주세요.');saveScene(value);status('이 브라우저에 저장했습니다. ‘저장한 컷씬’에서 다시 볼 수 있습니다.');}
   else if(action==='registered'){const value=await selectedDocument(current);if(current())await open(value);}
   else if(action==='travel'){const value=imported??await selectedDocument(current);if(current())await travel?.(value.mapId);}
   else if(action==='play'){const value=imported??await selectedDocument(current);if(!current())return;if(!loaded||loaded.cutsceneId!==value.cutsceneId||loaded.mapId!==world.mapId)await open(value);if(current())await execute({command:'play'},{isCurrent:current});}
   else await execute({command:action},{isCurrent:current});
  });};
  panel.querySelector('[data-loop]').onchange=event=>{player.setLoop(event.target.checked);};panel.querySelector('[data-seek]').oninput=event=>{player.seek(Number(event.target.value));};
 }
 const observer=world.scene.onDisposeObservable.addOnce(()=>{void api.dispose();});
 const api={player,host,load,open,saveScene,execute,notifyReady,show(){if(disposed)return;if(panel){panel.hidden=false;panel.open=true;}notifyReady();},hide(){if(disposed||preview)return;++uiEpoch;uiBusy=false;panel.hidden=true;autoOpenStarted=true;return execute({command:'stop'});},inspect:()=>({...player.inspect(),host:host.inspect(),interaction:interaction?.inspect(),subtitles:subtitleView.inspect(),audio:audioTimeline?.inspect(),pendingReady:!!pendingReady}),leaveMap(){clearCameraMovement();if(internalTravel){interaction?.clear();subtitleView.clear();readySignature=null;return;}++loadSerial;++epoch;cancelReady();interaction?.clear();externalResume=false;loaded=null;subtitleView.clear();void player.stop('map-change');void host.evictIdle?.();readySignature=null;post('host-ready',{ok:true,ready:false,mapId:world.mapId});},async dispose(){if(disposed)return;clearCameraMovement();disposed=true;++loadSerial;++epoch;cancelReady();interaction?.dispose();subtitleView.dispose();for(const timeline of audioTimelines.values())timeline.dispose();audioTimelines.clear();unlock.removeEventListener('click',audioGesture);unlock.remove();fade.remove();if(preview)win.removeEventListener('message',receive);world.scene.onDisposeObservable.remove(observer);panel?.remove();style?.remove();subtitles.remove();centerText.remove();await player.dispose();await host.dispose();previewStyle?.remove();if(preview){if(oldPreviewMode===undefined)delete root.dataset.cinematicPreview;else root.dataset.cinematicPreview=oldPreviewMode;for(const [node,enabled]of previewHeroes)if(!node.isDisposed?.())node.setEnabled(enabled);previewHeroes.clear();}}};
 notifyReady();return api;
}
