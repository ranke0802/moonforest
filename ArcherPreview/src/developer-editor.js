import {GizmoManager} from '@babylonjs/core/Gizmos/gizmoManager.js';
import {UtilityLayerRenderer} from '@babylonjs/core/Rendering/utilityLayerRenderer.js';
import {GizmoCoordinatesMode} from '@babylonjs/core/Gizmos/gizmo.js';
import {Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {PointerEventTypes} from '@babylonjs/core/Events/pointerEvents.js';
import {ASSET_CATALOG,searchCatalog} from './asset-catalog.js';
import {createBasePlacementManifest,createEmptyPlacementDocument,validatePlacementDocument,PlacementHistory} from './placement-document.js';
import {AuthoredPlacementRuntime} from './authored-placement-runtime.js';
import {authoredMapStorageKey,authoredMapDraftKey} from './authored-map-loader.js';
import {createEditorWorkspace} from './editor-workspace.js';

const clone=value=>structuredClone(value),degrees=180/Math.PI;
const categoryLabels={tree:'나무',rock:'바위',prop:'소품',plant:'풀·덤불',building:'건물',landmark:'장식물',ground:'바닥',boss:'보스',monster:'몬스터',npc:'주민'};
export const serializePlacementDocument=document=>JSON.stringify(document,null,2)+'\n';
export function terrainAttachment(world,x,z,offset=0){
 const e=.05,height=world.terrain.heightAt(x,z),normal=new Vector3(world.terrain.heightAt(x-e,z)-world.terrain.heightAt(x+e,z),2*e,world.terrain.heightAt(x,z-e)-world.terrain.heightAt(x,z+e)).normalize();
 return {position:[x,height,z],attachment:{surface:'ground',normal:normal.asArray(),offset,supportId:'terrain'}};
}
export function createEditorGizmos(scene){
 const layer=new UtilityLayerRenderer(scene),depth=new UtilityLayerRenderer(scene),manager=new GizmoManager(scene,1,layer,depth);
 manager.usePointerToAttachGizmos=false;manager.enableAutoPicking=false;manager.clearGizmoOnEmptyPointerEvent=false;
 return {manager,dispose(){manager.dispose();layer.dispose();depth.dispose();}};
}
const css=`.placement-editor{position:fixed;z-index:850;left:12px;top:75px;width:min(365px,calc(100vw - 24px));max-height:calc(100dvh - 160px);overflow:auto;background:#17221ff7;color:#eee8d8;border:1px solid #9f936f;border-radius:12px;padding:14px;font:14px/1.5 system-ui;touch-action:auto;user-select:text}.placement-editor summary{font-weight:700;cursor:pointer}.placement-editor button,.placement-editor select,.placement-editor input{font:inherit;min-height:40px;max-width:100%;background:#283a32;color:#f2eddf;border:1px solid #697e70;border-radius:6px;margin:3px;padding:7px 9px}.placement-editor button{cursor:pointer}.placement-editor button:disabled{opacity:.4;cursor:default}.placement-editor [data-primary]{display:block;width:100%;margin:8px 0;background:#d8bd76;border-color:#e8d8ab;color:#1a261f;font-weight:700}.placement-editor [data-assets] button[aria-pressed=true]{border-color:#e8d8ab;background:#415c44}.placement-editor input[type=number]{width:76px}.placement-editor label{display:inline-block}.placement-editor fieldset,.placement-editor details{border:1px solid #5f7467;border-radius:6px;margin:9px 0;padding:7px}.placement-editor [data-assets]{display:flex;gap:3px;flex-wrap:wrap}.placement-editor output{display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.placement-editor [data-info],.placement-editor [data-help]{color:#ced5c5}.placement-editor [data-status]{background:#22392d;border-left:3px solid #b6cf9d;padding:9px}.placement-editor [data-status][data-error=true]{background:#482d2a;border-color:#eab39a}.placement-editor p{margin:7px 0}.placement-editor [hidden]{display:none!important}.placement-editor [data-file-actions]{display:flex;flex-wrap:wrap}@media(max-width:600px){.placement-editor{left:8px;top:62px;width:min(315px,calc(100vw - 16px));max-height:calc(100dvh - 145px);padding:10px;font-size:13px}.placement-editor button{min-height:42px}}`;

export function setupDeveloperEditor({root,world,getPlayer,getState,storage,onCommit=()=>{},canApply=()=>true,createGizmos=createEditorGizmos,Runtime=AuthoredPlacementRuntime,autoEnter=true,setupLayout=createEditorWorkspace}){
 const doc=root.ownerDocument,panel=doc.createElement('details'),style=doc.createElement('style');panel.className='placement-editor';panel.dataset.toolUi='';panel.dataset.ui='';panel.open=true;style.textContent=css;
 const fields=['x','y','z','rx','ry','rz','scale','offset'];
 panel.innerHTML=`<summary>맵 꾸미기</summary><output data-status role="status" aria-live="polite">게임을 준비하고 있어요. 준비되면 편집이 시작돼요.</output><button data-cmd="enter">편집 시작</button><p data-help>① 소품을 골라 놓으세요.<br>② 소품을 마우스나 손가락으로 끌어 옮기세요.<br>③ 게임에 적용하면 바로 플레이할 수 있어요.</p><div data-assets></div><output data-info></output><button data-cmd="place" data-primary>소품 놓기</button><label>놓은 소품 <select data-instances></select></label><div><button data-cmd="move">바닥을 눌러 이동</button><button data-cmd="rotate-left">↶ 회전</button><button data-cmd="rotate-right">회전 ↷</button><button data-cmd="smaller">작게</button><button data-cmd="larger">크게</button><button data-cmd="duplicate">복사</button><button data-cmd="delete">삭제</button></div><button data-cmd="undo">되돌리기</button><button data-cmd="redo">다시 하기</button><button data-cmd="apply" data-primary>이 브라우저 게임에 적용</button><div data-file-actions><button data-cmd="export">작업 저장</button><button data-cmd="open">저장한 작업 열기</button><button data-cmd="exit">게임으로 돌아가기</button></div><input data-import type="file" accept=".moonmap,.mapfile,.json,application/json" hidden><details data-advanced><summary>세부 조정 · 더 보기</summary><p>기존 건물과 지형은 볼 수만 있어요. 새로 놓은 소품은 자유롭게 고칠 수 있어요.</p><button data-cmd="preview">소품 미리 보기</button><fieldset><legend>위치 · 회전 · 크기</legend>${fields.map(name=>`<label>${({x:'가로',y:'높이',z:'세로',rx:'기울기',ry:'방향',rz:'비틀기',scale:'크기',offset:'표면 간격'})[name]} <input data-field="${name}" type="number" step="${name==='scale'?'.1':'.05'}" value="${name==='scale'?1:0}"></label>`).join('')}<p data-range></p><button data-cmd="numeric">세부 조정 적용</button></fieldset><fieldset><legend>이동 도구 · 붙일 면</legend><select data-mode><option value="position">이동</option><option value="rotation">회전</option><option value="scale">크기</option></select><select data-axis><option value="world">맵 기준</option><option value="local">소품 기준</option></select><label>이동 간격 <input data-grid type="number" value="0" min="0" max="10" step=".1"></label><select data-surface><option value="ground">바닥</option><option value="wall">벽 · 장식</option><option value="ceiling">천장 · 장식</option><option value="free">공중 · 장식</option></select><button data-cmd="snap">붙일 곳 선택</button><p>벽·천장·공중에 놓은 장식은 통과할 수 있어요.</p></fieldset><button data-cmd="draft">작업 임시 저장</button><button data-cmd="reopen">임시 작업 열기</button><label><input data-show-all type="checkbox"> 기존 맵 소품도 보기 (편집 불가)</label><label>찾기 <input data-query type="search"></label><label>종류 <select data-category><option value="">전체</option>${[...new Set(ASSET_CATALOG.entries.map(entry=>entry.category))].map(value=>`<option>${value}</option>`).join('')}</select></label><output data-error-detail hidden></output></details>`;
 root.append(style,panel);
 // Keep the primary catalog a category followed by a native keyboard/touch
 // listbox. Metadata browsing does not create any model or runtime resource.
 const category=panel.querySelector('[data-category]'),categoryLabel=category.closest('label'),oldAssets=panel.querySelector('[data-assets]'),variantLabel=doc.createElement('label'),variants=doc.createElement('select');variants.dataset.assets='';variants.dataset.variants='';variants.size=4;variants.setAttribute('role','listbox');variants.setAttribute('aria-label','모양 선택');variantLabel.append('모양 ',variants);oldAssets.replaceWith(categoryLabel,variantLabel);
 const showAll=panel.querySelector('[data-show-all]');showAll.closest('label').replaceChildren(showAll,' 새로 놓을 수 없는 모양도 보기');panel.querySelector('[data-help]').innerHTML='① 종류와 모양을 골라 놓으세요.<br>② 대상을 마우스나 손가락으로 끌어 옮기세요.<br>③ 게임에 적용하면 바로 플레이할 수 있어요.';
 let disposed=false,epoch=0,busy=false,lease=null,gizmos=null,workspace=null,pointerObserver=null,prePointerObserver=null,readyObserver=null,enterTask=null,hiding=null,autoAttempted=false,history=null,base=null,runtime=null,mapId=null,selectedId=null,selectedAsset=null,beforeApplied=null,draftRaw=null,appliedRaw=null,snapArmed=false,moveArmed=false,dragging=false,dragFinishing=false,directDrag=null,cameraLock=null,gizmoObservers=[],dragTask=Promise.resolve(),dragInvalid=false;
 const dragListeners=[],baseMeshes=new Map();
 const downloads=new Map(),field=name=>panel.querySelector(`[data-field="${name}"]`),button=name=>panel.querySelector(`[data-cmd="${name}"]`),status=(value,error=false)=>{const output=panel.querySelector('[data-status]');output.textContent=value;output.dataset.error=String(error);};
 function failure(error){if(error?.name==='AbortError'||disposed)return;panel.querySelector('[data-error-detail]').textContent=String(error?.message??error);panel.querySelector('[data-error-detail]').hidden=false;status(friendlyError(error),true);}
 function friendlyError(error){const message=String(error?.message??error);if(/shader|compilation|Failed to fetch|fetch|network|load|timeout/i.test(message))return '소품을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.';if(/position|outside|collision|navigation|충돌|겹/.test(message))return '소품 충돌로 이 위치를 쓸 수 없어요. 다른 곳으로 옮겨 주세요.';if(/scale|uniform|크기/.test(message))return '소품 크기를 조정하지 못했어요. 조금 더 작게 해 보세요.';if(/JSON|Unexpected|baseRevision|base map|coordinate|version/i.test(message))return '이 작업 파일을 열지 못했어요. 현재 지역에서 저장한 작업 파일을 골라 주세요.';return /[가-힣]/.test(message)?message:'작업을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';}
 function isReady(){const state=getState?.()??{};return !!state.ready&&!state.loading&&!state.dead&&!state.hidden&&!state.settings&&!state.settingsOpen;}
 function updateControls(){const editing=!!lease?.active,working=busy||!!enterTask||dragging,selected=!!current();button('enter').disabled=editing||working||!isReady();button('enter').hidden=editing;button('enter').textContent=working?'편집 준비 중…':isReady()?'편집 시작':'게임 준비 중…';for(const name of ['place','preview'])button(name).disabled=!editing||working||!selectedAsset?.placement.supported;for(const name of ['move','rotate-left','rotate-right','smaller','larger','numeric','duplicate','delete','snap'])button(name).disabled=!editing||working||!selected;for(const name of ['undo','redo','draft','reopen','apply','exit'])button(name).disabled=!editing||working;button('export').disabled=working||!history;button('open').disabled=working||(!editing&&!isReady());}
 const read=key=>{try{return storage?.getItem(key)??null;}catch{return null;}};
 function write(key,value,expected){try{if(!storage)return false;if(expected!==undefined&&read(key)!==expected)throw new Error('다른 창에서 작업이 바뀌었어요. 먼저 작업 저장으로 보관해 주세요.');storage.setItem(key,value);return true;}catch(error){if(/다른 창/.test(error.message))throw error;return false;}}
 function editable(){return !!lease?.active&&!busy&&!disposed;}
 function asset(id,version){return ASSET_CATALOG.entries.find(entry=>entry.assetId===id&&(!version||entry.version===version));}
 function current(){return history?.document.instances.find(instance=>instance.instanceId===selectedId)??null;}
 function selectedRecord(){return runtime?.records.get(selectedId);}
 function groundCollision(item){return item.sourceInstanceId?runtime.createBaseOverride(item.sourceInstanceId).collision:asset(item.assetId,item.assetVersion)?.placement.defaultCollision??'solid';}
 function choose(select,value){let chosen;for(const option of select.children){option.selected=false;option.removeAttribute('selected');if(option.value===value)chosen=option;}if(chosen){chosen.selected=true;chosen.setAttribute('selected','');}}
 function updateAsset(entry){
  if(!entry){selectedAsset=null;panel.querySelector('[data-info]').textContent='이 종류에는 놓을 수 있는 모양이 없어요.';updateControls();return;}selectedAsset=entry;panel.querySelector('[data-info]').textContent=entry.placement.supported?`${entry.name} · 놓은 뒤 끌어서 옮길 수 있어요.`:`${entry.name} · ${entry.placement.reason??'이 모양은 아직 새로 놓을 수 없어요.'}`;
  panel.querySelector('[data-range]').textContent=`크기 범위 ${entry.placement.scaleMin??.1} ~ ${entry.placement.scaleMax??10}`;
  choose(variants,entry.assetId+'@'+entry.version);button('place').textContent=`${categoryLabels[entry.category]??'소품'} 놓기`;updateControls();
 }
 function categories(){const previous=category.value||'prop',rows=ASSET_CATALOG.entries.filter(entry=>panel.querySelector('[data-show-all]').checked||entry.placement.supported),values=[...new Set(rows.map(entry=>entry.category))].sort((a,b)=>['tree','rock','prop','plant'].indexOf(a)-['tree','rock','prop','plant'].indexOf(b));category.replaceChildren();for(const value of values){const option=doc.createElement('option');option.value=value;option.textContent=categoryLabels[value]??value;category.append(option);}choose(category,values.includes(previous)?previous:values[0]);}
 function search(preferred=selectedAsset){
  const rows=searchCatalog(panel.querySelector('[data-query]').value,category.value).filter(entry=>panel.querySelector('[data-show-all]').checked||entry.placement.supported);variants.replaceChildren();
  for(const entry of rows){const option=doc.createElement('option');option.value=entry.assetId+'@'+entry.version;option.textContent=`${entry.name}${entry.placement.supported?'':' · 보기만'}`;variants.append(option);}
  updateAsset(rows.find(entry=>entry===preferred)??rows[0]);
 }
 function showAsset(entry){if(!entry)return;panel.querySelector('[data-query]').value='';choose(category,entry.category);search(entry);}
 function refreshSelection(){
  const select=panel.querySelector('[data-instances]');select.replaceChildren();
  const empty=doc.createElement('option');empty.value='';empty.textContent='옮길 소품을 선택하세요';select.append(empty);
  for(const [index,instance]of (history?.document.instances??[]).entries()){const option=doc.createElement('option');option.value=instance.instanceId;option.textContent=`${asset(instance.assetId,instance.assetVersion)?.name??'소품'} ${index+1}`;option.selected=instance.instanceId===selectedId;select.append(option);}
  choose(select,selectedId??'');
  const item=current();if(item){showAsset(asset(item.assetId,item.assetVersion));const angles=Quaternion.FromArray(item.transform.rotation).toEulerAngles().scale(degrees);for(const [name,value]of Object.entries({x:item.transform.position[0],y:item.transform.position[1],z:item.transform.position[2],rx:angles.x,ry:angles.y,rz:angles.z,scale:item.transform.scale,offset:item.attachment.offset}))field(name).value=String(Number(value.toFixed(5)));panel.querySelector('[data-surface]').value=item.attachment.surface;}
  button('delete').textContent=item?.sourceInstanceId?'원래대로':'삭제';
  attachGizmo();updateControls();
 }
 function persistDraft(){if(!history)return false;const text=serializePlacementDocument(history.document),saved=write(authoredMapDraftKey(mapId),text,draftRaw);if(saved)draftRaw=text;return saved;}
 function bindMap(){
  mapId=world.mapId;base=createBasePlacementManifest(mapId,{catalog:ASSET_CATALOG,placements:world.placements});
  baseMeshes.clear();for(const record of world.villageRenderRecords??[])for(const mesh of record.meshes)baseMeshes.set(mesh,record);
  const applied=world.placementOverlay??createEmptyPlacementDocument(base);beforeApplied=clone(applied);appliedRaw=read(authoredMapStorageKey(mapId));draftRaw=read(authoredMapDraftKey(mapId));
  let initial=applied;
  if(draftRaw)try{initial=validatePlacementDocument(JSON.parse(draftRaw),{catalog:ASSET_CATALOG,baseManifest:base});}catch{status('저장한 작업을 열지 못해 현재 게임에서 시작해요.');}
  initial={...initial,revision:Math.max(initial.revision,applied.revision)};history=new PlacementHistory(initial,{catalog:ASSET_CATALOG,baseManifest:base});selectedId=null;refreshSelection();
 }
 function ensureRuntime(){if(world.authoredPlacements&&!world.authoredPlacements.disposed&&world.authoredPlacements.mapId===world.mapId)return runtime=world.authoredPlacements;runtime=new Runtime(world,{catalog:ASSET_CATALOG,onCommit});world.authoredPlacements=runtime;return runtime;}
 async function commit(next){
  if(!editable())throw new Error('게임 준비가 끝나면 편집을 시작할 수 있어요.');busy=true;updateControls();status('소품을 적용하고 있어요…');gizmos?.manager.attachToNode(null);const request=epoch,previous=history.document;
  try{
   runtime.clearExistingPreview?.();runtime.clearPreview();
   const candidate=validatePlacementDocument({...next,revision:Math.max(previous.revision,runtime.document.revision)+1},{catalog:ASSET_CATALOG,baseManifest:base});
   await runtime.apply(candidate);if(request!==epoch)return;
   if(history.document.revision!==candidate.revision-1)history=new PlacementHistory({...previous,revision:candidate.revision-1},{catalog:ASSET_CATALOG,baseManifest:base});
   history.commit(candidate);const saved=persistDraft();refreshSelection();status(saved?'소품을 놓았어요. 끌어서 옮긴 뒤 게임에 적용하세요.':'소품을 놓았어요. 작업 저장으로 파일에 보관할 수 있어요.');
  }catch(error){runtime.clearExistingPreview?.();throw error;}finally{if(request===epoch){busy=false;attachGizmo();updateControls();}}
 }
 function values(item){
  const result=clone(item),number=name=>{const value=Number(field(name).value);if(!Number.isFinite(value))throw new Error(name+'에 유효한 숫자를 입력하세요.');return value;};
  result.transform.position=[number('x'),number('y'),number('z')];result.transform.rotation=Quaternion.FromEulerAngles(number('rx')/degrees,number('ry')/degrees,number('rz')/degrees).normalize().asArray();result.transform.scale=number('scale');result.attachment.offset=number('offset');
  const surface=panel.querySelector('[data-surface]').value;
  if(surface==='ground'){const attached=terrainAttachment(world,result.transform.position[0],result.transform.position[2],result.attachment.offset);result.transform.position=attached.position;result.attachment=attached.attachment;result.collision=groundCollision(item);}
  else if(surface==='free'){result.attachment={surface,normal:[0,1,0],offset:result.attachment.offset};result.collision='none';}
  else{if(item.attachment.surface!==surface)throw new Error('벽·천장은 표면 찍기로 실제 지지 면을 선택하세요.');result.collision='none';}
  return result;
 }
 function newInstance(){
  if(!selectedAsset?.placement.supported)throw new Error('놓을 소품을 먼저 골라 주세요.');const player=getPlayer(),target=world.camera?.getTarget?.(),point={x:target?.x??player.position.x+3,z:target?.z??player.position.z},radius=Math.hypot(selectedAsset.bounds.size[0],selectedAsset.bounds.size[2])*selectedAsset.units.metersPerSourceUnit*.5,occupied=[{x:player.position.x,z:player.position.z,radius:.8}],safe=world.navigation?.findFree?.(point,radius,undefined,occupied)??point;
  const support=terrainAttachment(world,safe.x,safe.z);return {instanceId:'authored-'+(globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),assetId:selectedAsset.assetId,assetVersion:selectedAsset.version,transform:{position:support.position,rotation:[0,0,0,1],scale:1},attachment:support.attachment,collision:selectedAsset.placement.defaultCollision??'solid'};
 }
 function stopCameraInertia(camera){for(const key of ['inertialAlphaOffset','inertialBetaOffset','inertialRadiusOffset','inertialPanningX','inertialPanningY'])if(key in camera)camera[key]=0;camera.movement?.resetPanVelocity();camera.movement?.resetRotationVelocity();camera.movement?.resetZoomVelocity();}
 function lockCamera(){if(cameraLock)return;const camera=world.camera??world.scene.activeCamera;if(!camera)return;cameraLock={camera,lease,attached:camera.inputs?.attachedToElement===true};if(cameraLock.attached)camera.detachControl();stopCameraInertia(camera);}
 function unlockCamera(){const held=cameraLock;cameraLock=null;if(!held)return;stopCameraInertia(held.camera);if(held.attached&&held.lease===lease&&lease?.active&&(!lease.isCurrent||lease.isCurrent())&&!disposed&&(world.camera??world.scene.activeCamera)===held.camera){if(held.lease.attachCamera)held.lease.attachCamera();else held.camera.attachControl(held.camera.inputs?.noPreventDefault??true);}}
 function groundHit(x=world.scene.pointerX,y=world.scene.pointerY){return world.scene.pick?.(x,y,mesh=>mesh===world.ground);}
 // A custom Babylon predicate replaces its default pickability check. Preserve
 // that check, except for the immutable map surfaces deliberately exposed here.
 function editorPickable(mesh){return (mesh.isPickable!==false||baseMeshes.has(mesh))&&mesh.isEnabled()&&mesh.isVisible&&mesh.getTotalVertices()>0&&!mesh.metadata?.runtimeOutline&&!mesh.metadata?.moonforestOutline;}
 function gizmoHovered(){return panel.querySelector('[data-advanced]').open&&gizmos?.manager.isHovered;}
 function beginDrag(){dragging=true;dragFinishing=false;dragInvalid=false;dragTask=Promise.resolve();lockCamera();updateControls();}
 function previewAt(point){
  if(!directDrag||dragInvalid)return;const request=epoch,item=clone(directDrag.original),step=Number(panel.querySelector('[data-grid]').value),snap=value=>Number.isFinite(step)&&step>0?Math.round(value/step)*step:value,support=terrainAttachment(world,snap(point.x+directDrag.dx),snap(point.z+directDrag.dz),item.attachment.offset);item.transform.position=support.position;item.attachment=support.attachment;
  // Serialize target updates: a slow preparation may never overwrite a later drag sample.
  dragTask=dragTask.then(async()=>{if(request!==epoch||dragInvalid)return;try{await runtime.previewExisting(item);if(request===epoch)status('여기서 놓으면 위치가 정해져요.');}catch(error){if(request===epoch){dragInvalid=true;failure(error);}}});
 }
 async function finishDrag(cancel=false){
  if(!dragging||dragFinishing)return;dragFinishing=true;const request=epoch;try{await dragTask;if(request!==epoch)return;if(cancel||dragInvalid){runtime.clearExistingPreview?.();refreshSelection();status('이동을 취소했어요.');return;}const item=selectedRecord()?.instance;if(item){const next=history.document;next.instances=next.instances.map(value=>value.instanceId===item.instanceId?clone(item):value);dragging=false;await commit(next);}}
  catch(error){if(request===epoch){runtime.clearExistingPreview?.();refreshSelection();failure(error);}}
  finally{if(request===epoch){dragging=false;dragFinishing=false;directDrag=null;unlockCamera();updateControls();}}
 }
 function prePointer(info){
  if(!editable()||info.skipOnPointerObservable)return;const event=info.event??{},x=info.localPosition?.x??world.scene.pointerX,y=info.localPosition?.y??world.scene.pointerY;if(snapArmed){if(info.type===PointerEventTypes.POINTERDOWN&&(event.button==null||event.button===0)){info.skipOnPointerObservable=true;event.preventDefault?.();pick(event,x,y);}return;}if(dragFinishing){if(directDrag)info.skipOnPointerObservable=true;return;}
  if(directDrag){if(event.pointerId!=null&&directDrag.pointerId!=null&&event.pointerId!==directDrag.pointerId){info.skipOnPointerObservable=true;return;}if(info.type===PointerEventTypes.POINTERMOVE){info.skipOnPointerObservable=true;const hit=groundHit(x,y);if(hit?.hit&&hit.pickedPoint)previewAt(hit.pickedPoint);event.preventDefault?.();}else if(info.type===PointerEventTypes.POINTERUP){
   // Babylon 9.31 converts DOM cancel/blur to a plain DeviceEventFactory UP
   // before the later canvas cancellation listener runs. It is not a drop.
   const cancelled=event.type==='pointercancel'||(Object.hasOwn(event,'deviceType')&&Object.hasOwn(event,'deviceSlot'));
   info.skipOnPointerObservable=true;if(!cancelled){const hit=groundHit(x,y);if(hit?.hit&&hit.pickedPoint)previewAt(hit.pickedPoint);}finishDrag(cancelled).catch(failure);
  }return;}
  if(info.type!==PointerEventTypes.POINTERDOWN||dragging||gizmoHovered()||(event.button!=null&&event.button!==0))return;
  if(moveArmed){const hit=groundHit(x,y),item=current();if(!hit?.hit||!hit.pickedPoint||!item)return;moveArmed=false;beginDrag();directDrag={original:clone(item),dx:0,dz:0,pointerId:event.pointerId};info.skipOnPointerObservable=true;previewAt(hit.pickedPoint);finishDrag().catch(failure);return;}
  const hit=world.scene.pick?.(x,y,editorPickable),id=hit?.pickedMesh?.metadata?.placementInstanceId??baseMeshes.get(hit?.pickedMesh)?.placement.id;
  if(!hit?.hit||!id)return;if(!runtime?.records.has(id)){if(baseMeshes.has(hit.pickedMesh)){info.skipOnPointerObservable=true;selectInstance(id,{focus:false}).catch(failure);}return;}selectedId=id;refreshSelection();const item=current();if(item?.attachment.surface!=='ground'||item.attachment.supportId!=='terrain')return;
  const floor=groundHit(x,y);if(!floor?.hit||!floor.pickedPoint)return;beginDrag();directDrag={original:clone(item),dx:item.transform.position[0]-floor.pickedPoint.x,dz:item.transform.position[2]-floor.pickedPoint.z,pointerId:event.pointerId};info.skipOnPointerObservable=true;event.preventDefault?.();status('끌어서 옮긴 뒤 놓으세요.');
 }
 function installDragCancellation(){const win=doc.defaultView,canvas=root.querySelector('canvas'),on=(target,type,listener)=>{if(!target?.addEventListener)return;target.addEventListener(type,listener);dragListeners.push({target,type,listener});};
  const cancel=()=>{if(dragging)finishDrag(true).catch(failure);};on(win,'blur',cancel);on(doc,'visibilitychange',()=>{if(doc.hidden)cancel();});on(win,'keydown',event=>{if(event.code==='Escape'){moveArmed=false;snapArmed=false;cancel();}});on(canvas,'pointercancel',cancel);on(canvas,'lostpointercapture',cancel);
 }
 function attachGizmo(){
  if(!gizmos)return;const manager=gizmos.manager,record=selectedRecord(),mode=panel.querySelector('[data-mode]').value,shown=panel.querySelector('[data-advanced]').open===true&&!busy;
  manager.positionGizmoEnabled=shown&&mode==='position';manager.rotationGizmoEnabled=shown&&mode==='rotation';manager.scaleGizmoEnabled=shown&&mode==='scale';manager.coordinatesMode=panel.querySelector('[data-axis]').value==='local'?GizmoCoordinatesMode.Local:GizmoCoordinatesMode.World;
  if(manager.gizmos.scaleGizmo)for(const axis of ['xGizmo','yGizmo','zGizmo'])manager.gizmos.scaleGizmo[axis].isEnabled=false;
  manager.attachToNode(shown?record?.root??null:null);
  const step=Number(panel.querySelector('[data-grid]').value);if(manager.gizmos.positionGizmo)manager.gizmos.positionGizmo.snapDistance=Number.isFinite(step)&&step>0?step:0;
  for(const gizmo of Object.values(manager.gizmos)){
   if(!gizmo||gizmoObservers.some(item=>item.gizmo===gizmo))continue;
   const start=gizmo.onDragStartObservable?.add(()=>{if(!editable())return;beginDrag();const record=selectedRecord();record?.root.unfreezeWorldMatrix();for(const node of record?.root.getDescendants()??[])node.unfreezeWorldMatrix?.();});
   const change=gizmo.onDragObservable?.add(()=>{if(!dragging||!editable()||dragInvalid)return;const request=epoch;dragTask=(async()=>{try{const item=current(),record=selectedRecord(),normal=Vector3.FromArray(item.attachment.normal),candidate=clone(item);candidate.transform.position=record.root.position.subtract(normal.scale(item.attachment.offset)).asArray();candidate.transform.rotation=(record.root.rotationQuaternion??Quaternion.FromEulerVector(record.root.rotation)).normalize().asArray();candidate.transform.scale=record.root.scaling.x;if(item.attachment.surface==='ground'){const attached=terrainAttachment(world,candidate.transform.position[0],candidate.transform.position[2],item.attachment.offset);candidate.transform.position=attached.position;candidate.attachment=attached.attachment;}await runtime.previewExisting(candidate);if(request===epoch&&!dragInvalid)status('선택 대상 미리보기 · 놓으면 충돌을 확정합니다.');}catch(error){if(request!==epoch)return;dragInvalid=true;gizmos?.manager.attachToNode(null);status(error.message);}})();});
   const end=gizmo.onDragEndObservable?.add(()=>finishDrag().catch(failure));
   gizmoObservers.push({gizmo,start,change,end});
  }
 }
 function pick(event,x=world.scene.pointerX,y=world.scene.pointerY){
  if(!editable()||dragging||gizmoHovered())return;
  const hit=world.scene.pick(x,y,editorPickable);
  if(!hit?.hit)return;
  if(snapArmed){
   snapArmed=false;const item=current();if(!item){status('부착할 인스턴스를 먼저 선택하세요.');return;}
   const support=baseMeshes.get(hit.pickedMesh),normal=hit.getNormal(true)?.normalize(),surface=panel.querySelector('[data-surface]').value;
   if(!normal||!hit.pickedPoint)return;
   if((surface==='wall'||surface==='ceiling')&&!support){status('벽·천장은 불변 원래 맵의 실제 표면을 선택하세요.');return;}
   if(hit.pickedMesh.metadata?.authoredPlacement){status('다른 편집 소품 위의 종속 배치는 아직 지원하지 않습니다.');return;}
   const next=history.document,candidate=clone(item);candidate.transform.position=hit.pickedPoint.asArray();candidate.attachment={surface,normal:normal.asArray(),offset:Number(field('offset').value),...(surface==='free'?{}:{supportId:support?.placement.id??'terrain'})};candidate.collision=surface==='ground'?groundCollision(item):'none';const rotation=Quaternion.Identity();Quaternion.FromUnitVectorsToRef(Vector3.Up(),normal,rotation);candidate.transform.rotation=rotation.asArray();next.instances=next.instances.map(value=>value.instanceId===item.instanceId?candidate:value);commit(next).catch(failure);return;
  }
  const id=hit.pickedMesh.metadata?.placementInstanceId;
  if(id&&runtime.records.has(id)){selectedId=id;refreshSelection();return;}
  const baseRecord=baseMeshes.get(hit.pickedMesh);if(baseRecord)selectInstance(baseRecord.placement.id,{focus:false}).catch(failure);
 }
 function focusSelection(){if(workspace?.focusSelection)return workspace.focusSelection();const record=selectedRecord();if(!record)return false;const target=record.bounds?.center??record.min?.add(record.max).scale(.5)??record.root?.position;if(!target)return false;stopCameraInertia(world.camera);world.camera?.setTarget(target,false,false,true);return true;}
 async function selectInstance(id,{focus=true}={}){
  if(typeof id!=='string'||!id)throw new Error('고칠 대상을 먼저 골라 주세요.');if(!lease?.active)await enter();if(!editable()||dragging)throw new Error('지금 작업이 끝나면 다시 골라 주세요.');
  if(!runtime.records.has(id)){
   const row=base?.instances.find(instance=>instance.instanceId===id);if(!row)throw new Error('이 맵에서 대상을 찾지 못했어요.');if(!row.editable||typeof runtime.createBaseOverride!=='function')throw new Error(row.reason??'이 대상은 지형이나 기존 구조와 연결되어 아직 움직일 수 없어요.');const item=runtime.createBaseOverride(id),next=history.document;next.instances.push(item);selectedId=id;await commit(next);
  }
  selectedId=id;refreshSelection();if(focus)focusSelection();status('대상을 골랐어요. 끌어서 옮기거나 회전·크기를 조정하세요.');return current();
 }
 function removeReadyObserver(){if(readyObserver)world.scene.onBeforeRenderObservable?.remove(readyObserver);readyObserver=null;}
 function enter(options={}){
  const isCurrent=options.isCurrent??(()=>true);if(!isCurrent())return Promise.resolve(false);
  if(disposed)return Promise.resolve(false);if(hiding)return hiding.then(()=>enter(options));panel.hidden=false;
  if(options.selection)return enter({...options,selection:null}).then(result=>result===false||!isCurrent()?false:selectInstance(typeof options.selection==='string'?options.selection:options.selection.instanceId));
  if(enterTask)return enterTask;if(lease?.active)return Promise.resolve();if(busy)return Promise.resolve();if(!isReady())return Promise.reject(new Error('게임을 준비하고 있어요. 준비되면 편집 시작을 눌러 주세요.'));autoAttempted=true;removeReadyObserver();const request=++epoch,enterMap=world.mapId;busy=true;status('편집을 준비하고 있어요…');
  // Deferring once makes the shared promise available even if binding fails synchronously.
  const task=Promise.resolve().then(async()=>{let acquired=null;try{
   if(!isCurrent())return false;bindMap();ensureRuntime();acquired=await world.acquireToolLease({owner:'placement-editor',freeCamera:true,hideHud:true,audioEnabled:false,onCancel:()=>leave(false)});
   if(request!==epoch||disposed||world.mapId!==enterMap||!isCurrent()){acquired.release('cancel',{restore:world.mapId===enterMap&&!disposed});return false;}lease=acquired;
   gizmos=createGizmos(world.scene);workspace=setupLayout?.({root,panel,world,getSelection:selectedRecord,getLease:()=>lease,isEditing:()=>!!lease?.active});pointerObserver=world.scene.onPointerObservable.add(info=>{if(info.type===PointerEventTypes.POINTERPICK)pick(info.event);});prePointerObserver=world.scene.onPrePointerObservable?.add(prePointer);installDragCancellation();
   if(history.document.instances.length||runtime.document.instances.length){const next={...history.document,revision:Math.max(history.document.revision,runtime.document.revision)+1};await runtime.apply(next);if(request!==epoch)return;history=new PlacementHistory(next,{catalog:ASSET_CATALOG,baseManifest:base});}
   if(!isCurrent()){await leave(true);return false;}refreshSelection();status('놓을 소품을 골라 주세요. 소품을 끌어서 옮길 수 있어요.');
  }catch(error){if(request===epoch){cleanupGizmos();lease=null;acquired?.release('editor-error');}throw error;}
  finally{if(enterTask===task)enterTask=null;if(request===epoch){busy=false;attachGizmo();updateControls();}else if(!disposed)queueMicrotask(notifyReady);}});enterTask=task;updateControls();return task;
 }
 function notifyReady(){if(disposed||panel.hidden)return;updateControls();if(autoEnter&&!autoAttempted&&!lease?.active&&!busy&&!enterTask&&isReady())enter().catch(failure);}
 function cleanupGizmos(){unlockCamera();workspace?.dispose();workspace=null;for(const {target,type,listener}of dragListeners)target.removeEventListener(type,listener);dragListeners.length=0;if(pointerObserver)world.scene.onPointerObservable.remove(pointerObserver);if(prePointerObserver)world.scene.onPrePointerObservable?.remove(prePointerObserver);pointerObserver=null;prePointerObserver=null;for(const {gizmo,start,change,end}of gizmoObservers){gizmo.onDragStartObservable?.remove(start);gizmo.onDragObservable?.remove(change);gizmo.onDragEndObservable?.remove(end);}gizmoObservers=[];gizmos?.dispose();gizmos=null;}
 async function leave(restore=true,keep=false){
  epoch++;busy=false;dragging=false;dragFinishing=false;directDrag=null;snapArmed=false;moveArmed=false;try{persistDraft();}catch(error){failure(error);}cleanupGizmos();runtime?.clearExistingPreview?.();runtime?.clearPreview();
  const held=lease;lease=null;
  try{if(restore&&!keep&&runtime&&!runtime.disposed&&world.mapId===mapId){const restored={...beforeApplied,revision:Math.max(runtime.document.revision,history.document.revision)+1};await runtime.apply(restored);}}
  finally{held?.release('editor-exit',{restore});updateControls();}
 }
 function hide(){
  if(disposed)return Promise.resolve();panel.hidden=true;autoAttempted=true;removeReadyObserver();
  if(hiding)return hiding;if(!lease?.active&&!enterTask&&!busy)return Promise.resolve();
  const pending=enterTask;hiding=Promise.allSettled([leave(true),pending]).then(()=>{hiding=null;});return hiding;
 }
 function download(){if(!history)throw new Error('소품을 놓은 뒤 작업을 저장해 주세요.');const blob=new Blob([serializePlacementDocument(history.document)],{type:'application/json'}),url=URL.createObjectURL(blob),link=doc.createElement('a');link.href=url;link.download=`문포레스트-${mapId}-작업.moonmap`;link.hidden=true;(doc.body??root).append(link);try{link.click();}finally{link.remove();downloads.set(url,setTimeout(()=>{URL.revokeObjectURL(url);downloads.delete(url);},1000));}status('작업을 파일로 저장했어요. 저장한 작업 열기로 이어서 만들 수 있어요.');}
 const action=async event=>{
  const command=event.target.closest?.('[data-cmd]')?.dataset.cmd;if(!command)return;
  try{
   if(command==='enter'){await enter();return;}if(command==='exit'){await leave(true);status('게임으로 돌아왔어요. 이어서 고치려면 편집 시작을 눌러 주세요.');return;}
   if(command==='export'){download();return;}if(command==='open'){panel.querySelector('[data-import]').click();return;}
   if(!editable()||dragging)throw new Error('편집 준비가 끝나면 다시 눌러 주세요.');
   if(command==='place'){const next=history.document,item=newInstance();selectedId=item.instanceId;next.instances.push(item);await commit(next);focusSelection();}
   else if(command==='preview'){await runtime.preview(newInstance());status('소품을 미리 보고 있어요. 소품 놓기로 확정하세요.');}
   else if(command==='numeric'){const item=current();if(!item)throw new Error('인스턴스를 선택하세요.');const next=history.document;next.instances=next.instances.map(value=>value.instanceId===item.instanceId?values(item):value);await commit(next);}
   else if(command==='duplicate'){const item=current();if(!item)throw new Error('고칠 대상을 골라 주세요.');const copy=clone(item),fromBase=!!copy.sourceInstanceId;delete copy.sourceInstanceId;copy.instanceId='authored-'+crypto.randomUUID();copy.transform.position[0]+=.5;if(fromBase||copy.attachment.surface==='ground'&&copy.attachment.supportId==='terrain'){const support=terrainAttachment(world,copy.transform.position[0],copy.transform.position[2],fromBase?0:copy.attachment.offset);copy.transform.position=support.position;copy.attachment=support.attachment;if(fromBase)copy.collision=asset(copy.assetId,copy.assetVersion).placement.defaultCollision??'solid';}selectedId=copy.instanceId;const next=history.document;next.instances.push(copy);await commit(next);if(fromBase)status('고른 대상의 새 복사본을 바닥에 놓았어요.');}
   else if(command==='delete'){const restored=!!current()?.sourceInstanceId,next=history.document;next.instances=next.instances.filter(item=>item.instanceId!==selectedId);selectedId=null;await commit(next);if(restored)status('기존 대상을 원래 위치와 모습으로 되돌렸어요.');}
   else if(command==='move'){if(!current())throw new Error('옮길 소품을 골라 주세요.');if(current().attachment.surface!=='ground'||current().attachment.supportId!=='terrain')throw new Error('이 소품은 세부 조정의 이동 도구로 옮겨 주세요.');moveArmed=true;snapArmed=false;status('소품을 옮길 바닥을 눌러 주세요.');}
   else if(['rotate-left','rotate-right','smaller','larger'].includes(command)){const item=current();if(!item)throw new Error('고칠 소품을 골라 주세요.');const changed=clone(item);if(command.startsWith('rotate'))changed.transform.rotation=Quaternion.FromArray(changed.transform.rotation).multiply(Quaternion.RotationAxis(Vector3.Up(),(command==='rotate-left'?-1:1)*Math.PI/12)).normalize().asArray();else{const limits=asset(item.assetId,item.assetVersion).placement;changed.transform.scale=Math.max(limits.scaleMin??.1,Math.min(limits.scaleMax??10,item.transform.scale*(command==='smaller'?.9:1.1)));}const next=history.document;next.instances=next.instances.map(value=>value.instanceId===item.instanceId?changed:value);await commit(next);}
   else if(command==='snap'){if(!current())throw new Error('고칠 소품을 골라 주세요.');snapArmed=true;moveArmed=false;status('소품을 붙일 바닥·벽·천장을 눌러 주세요.');}
   else if(command==='undo'||command==='redo'){busy=true;attachGizmo();try{runtime.clearExistingPreview?.();runtime.clearPreview();const next=command==='undo'?history.undo():history.redo();if(next.revision<=runtime.document.revision)next.revision=runtime.document.revision+1;await runtime.apply(next);if(history.document.revision!==next.revision)history=new PlacementHistory(next,{catalog:ASSET_CATALOG,baseManifest:base});persistDraft();status('배치와 충돌·미니맵을 함께 복원했습니다.');}catch(error){history=new PlacementHistory(runtime.document,{catalog:ASSET_CATALOG,baseManifest:base});throw error;}finally{busy=false;refreshSelection();}}
   else if(command==='draft')status(persistDraft()?'이 브라우저에 작업을 임시 저장했어요.':'브라우저 저장을 사용할 수 없어요. 작업 저장으로 파일에 보관해 주세요.');
   else if(command==='reopen'){const raw=read(authoredMapDraftKey(mapId));if(!raw)throw new Error('임시 저장본이 없습니다.');draftRaw=raw;await commit(validatePlacementDocument(JSON.parse(raw),{catalog:ASSET_CATALOG,baseManifest:base}));}
   else if(command==='apply'){if(!canApply())throw new Error('플레이어 위치와 소품 충돌이 겹칩니다. 소품을 옮긴 뒤 게임에 적용하세요.');const text=serializePlacementDocument(history.document),saved=write(authoredMapStorageKey(mapId),text,appliedRaw);if(saved)appliedRaw=text;beforeApplied=history.document;await leave(true,true);status(saved?'게임에 적용했어요! 이 브라우저에서는 다음에도 그대로 이어져요.':'이번 게임에 적용했어요. 브라우저 저장을 쓸 수 없어 작업 저장으로 보관해 주세요.');}
  }catch(error){failure(error);}finally{updateControls();}
 };
 const imported=async event=>{const input=event.currentTarget??event.target;try{const file=input.files?.[0];if(!file)return;if(file.size>512*1024)throw new Error('이 작업 파일은 너무 커서 열 수 없어요.');if(!lease?.active)await enter();const request=epoch;busy=true;updateControls();status('저장한 작업을 열고 있어요…');let next;try{next=validatePlacementDocument(JSON.parse(await file.text()),{catalog:ASSET_CATALOG,baseManifest:base});}finally{if(request===epoch)busy=false;}if(request!==epoch)return;await commit(next);status('저장한 작업을 열었어요. 이어서 고친 뒤 게임에 적용하세요.');}catch(error){failure(error);}finally{input.value='';updateControls();}};
 panel.addEventListener('click',action);panel.querySelector('[data-query]').addEventListener('input',()=>search());category.addEventListener('change',()=>search());panel.querySelector('[data-show-all]').addEventListener('change',()=>{categories();search();});variants.addEventListener('change',()=>{const entry=ASSET_CATALOG.entries.find(row=>row.assetId+'@'+row.version===variants.value);if(entry)updateAsset(entry);});panel.querySelector('[data-instances]').addEventListener('change',event=>{selectedId=event.target.value;refreshSelection();});for(const selector of ['[data-mode]','[data-axis]','[data-grid]'])panel.querySelector(selector).addEventListener('change',attachGizmo);panel.querySelector('[data-import]').addEventListener('change',imported);
 panel.querySelector('[data-advanced]').addEventListener('toggle',()=>{if(dragging)finishDrag(true).then(attachGizmo).catch(failure);else attachGizmo();});
 const observer=world.scene.onDisposeObservable.addOnce(()=>api.dispose());
 const api={isEditing:()=>!!lease?.active,inspect:()=>({mapId,editing:!!lease?.active,selectedId,document:history?.document,runtime:runtime?.diagnostics()}),enter,hide,selectInstance,focusSelection,notifyReady,leaveMap(){autoAttempted=false;leave(false).catch(failure);},dispose(){if(disposed)return;disposed=true;removeReadyObserver();leave(false).catch(()=>{});world.scene.onDisposeObservable.remove(observer);for(const [url,timer]of downloads){clearTimeout(timer);URL.revokeObjectURL(url);}downloads.clear();panel.removeEventListener('click',action);panel.remove();style.remove();}};
 categories();search();if(autoEnter)readyObserver=world.scene.onBeforeRenderObservable?.add(notifyReady);queueMicrotask(notifyReady);return api;
}
