import {GizmoManager} from '@babylonjs/core/Gizmos/gizmoManager.js';
import {UtilityLayerRenderer} from '@babylonjs/core/Rendering/utilityLayerRenderer.js';
import {GizmoCoordinatesMode} from '@babylonjs/core/Gizmos/gizmo.js';
import {Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {PointerEventTypes} from '@babylonjs/core/Events/pointerEvents.js';
import {ASSET_CATALOG,searchCatalog} from './asset-catalog.js';
import {createBasePlacementManifest,createEmptyPlacementDocument,validatePlacementDocument,PlacementHistory} from './placement-document.js';
import {AuthoredPlacementRuntime} from './authored-placement-runtime.js';
import {authoredMapStorageKey,authoredMapDraftKey} from './authored-map-loader.js';

const clone=value=>structuredClone(value),degrees=180/Math.PI;
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
const css=`.placement-editor{position:fixed;z-index:850;left:12px;top:75px;width:min(390px,calc(100vw - 24px));max-height:calc(100dvh - 170px);overflow:auto;background:#17221ff5;color:#eee8d8;border:1px solid #9f936f;border-radius:8px;padding:12px;font:13px/1.5 system-ui;touch-action:auto;user-select:text}.placement-editor summary{font-weight:700;cursor:pointer}.placement-editor button,.placement-editor select,.placement-editor input{font:inherit;min-height:32px;max-width:100%;background:#283a32;color:#f2eddf;border:1px solid #697e70;border-radius:4px;margin:3px;padding:4px 6px}.placement-editor input[type=number]{width:76px}.placement-editor label{display:inline-block}.placement-editor fieldset{border:1px solid #5f7467;margin:8px 0;padding:6px}.placement-editor [data-assets]{max-height:135px;overflow:auto}.placement-editor [data-assets] button{display:block;width:98%;text-align:left}.placement-editor output{display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.placement-editor [data-info]{color:#c3c8b8}.placement-editor p{margin:7px 0}`;

export function setupDeveloperEditor({root,world,getPlayer,getState,storage,onCommit=()=>{},canApply=()=>true,createGizmos=createEditorGizmos,Runtime=AuthoredPlacementRuntime}){
 const doc=root.ownerDocument,panel=doc.createElement('details'),style=doc.createElement('style');panel.className='placement-editor';panel.dataset.toolUi='';panel.dataset.ui='';panel.open=true;style.textContent=css;
 const fields=['x','y','z','rx','ry','rz','scale','offset'];
 panel.innerHTML=`<summary>MoonForest 0.1 · 배치 편집</summary><p>원래 맵·지형·베이크 구조는 읽기 전용입니다. 독립 소품 3종을 새 배치로 편집합니다. 벽·천장·자유 배치는 장식 전용이며 충돌이 없습니다.</p><button data-cmd="enter">편집 시작</button><button data-cmd="exit">종료 · 적용본 복원</button><label>검색 <input data-query type="search"></label><label>분류 <select data-category><option value="">전체</option>${[...new Set(ASSET_CATALOG.entries.map(entry=>entry.category))].map(value=>`<option>${value}</option>`).join('')}</select></label><div data-assets></div><output data-info></output><button data-cmd="preview">선택 에셋 미리보기</button><button data-cmd="place">새 배치</button><label>인스턴스 <select data-instances></select></label><fieldset><legend>이동 · 회전 X/Y/Z ° (Y-X-Z) · 균일 크기</legend>${fields.map(name=>`<label>${name} <input data-field="${name}" type="number" step="${name==='scale'?'.1':'.05'}" value="${name==='scale'?1:0}"></label>`).join('')}<p data-range></p><button data-cmd="numeric">수치 확정</button><button data-cmd="duplicate">복제</button><button data-cmd="delete">삭제</button></fieldset><fieldset><legend>Gizmo와 스냅</legend><select data-mode><option value="position">이동</option><option value="rotation">회전</option><option value="scale">균일 확대</option></select><select data-axis><option value="world">월드 축</option><option value="local">로컬 축</option></select><label>격자 <input data-grid type="number" value="0.5" min="0" max="10" step=".1"></label><select data-surface><option value="ground">바닥</option><option value="wall">벽 · 장식</option><option value="ceiling">천장 · 장식</option><option value="free">자유 · 장식</option></select><button data-cmd="snap">표면 찍기 · 법선 정렬</button></fieldset><button data-cmd="undo">되돌리기</button><button data-cmd="redo">다시 실행</button><button data-cmd="draft">임시 저장</button><button data-cmd="reopen">임시본 재열기</button><button data-cmd="apply">브라우저 게임에 적용</button><button data-cmd="export">JSON 내보내기</button><label>JSON 가져오기 <input data-import type="file" accept=".json,application/json"></label><output data-status aria-live="polite">플레이 준비 후 편집을 시작하세요.</output>`;
 root.append(style,panel);
 let disposed=false,epoch=0,busy=false,lease=null,gizmos=null,pointerObserver=null,history=null,base=null,runtime=null,mapId=null,selectedId=null,selectedAsset=null,beforeApplied=null,draftRaw=null,appliedRaw=null,snapArmed=false,dragging=false,gizmoObservers=[],dragTask=Promise.resolve(),dragInvalid=false;
 const field=name=>panel.querySelector(`[data-field="${name}"]`),status=value=>{panel.querySelector('[data-status]').textContent=value;};
 const read=key=>{try{return storage?.getItem(key)??null;}catch{return null;}};
 function write(key,value,expected){try{if(!storage)return false;if(expected!==undefined&&read(key)!==expected)throw new Error('다른 창에서 저장한 배치와 충돌합니다. JSON으로 내보내세요.');storage.setItem(key,value);return true;}catch(error){if(/충돌/.test(error.message))throw error;return false;}}
 function editable(){return !!lease?.active&&!busy&&!disposed;}
 function asset(id,version){return ASSET_CATALOG.entries.find(entry=>entry.assetId===id&&(!version||entry.version===version));}
 function current(){return history?.document.instances.find(instance=>instance.instanceId===selectedId)??null;}
 function selectedRecord(){return runtime?.records.get(selectedId);}
 function showAsset(entry){
  selectedAsset=entry;panel.querySelector('[data-info]').textContent=`${entry.name} · ${entry.assetId}\n${entry.geometry.triangles.toLocaleString()} 삼각형 · 재질 ${entry.geometry.materials} · ${entry.reviewStatus}\n${entry.placement.reason??'독립 소품 배치 지원'}${entry.reduction.locked?'\n폴리곤 감량 잠금':''}`;
  panel.querySelector('[data-range]').textContent=`균일 크기 ${entry.placement.scaleMin??.1} ~ ${entry.placement.scaleMax??10}; 음수·비균일 크기 미지원`;
  for(const name of ['place','preview'])panel.querySelector(`[data-cmd="${name}"]`).disabled=!entry.placement.supported;
 }
 function search(){
  const rows=searchCatalog(panel.querySelector('[data-query]').value,panel.querySelector('[data-category]').value),list=panel.querySelector('[data-assets]');list.replaceChildren();
  for(const entry of rows){const button=doc.createElement('button');button.type='button';button.textContent=`${entry.name}${entry.placement.supported?' · 배치 가능':' · 읽기 전용'}`;button.onclick=()=>showAsset(entry);list.append(button);}
 }
 function refreshSelection(){
  const select=panel.querySelector('[data-instances]');select.replaceChildren();
  const empty=doc.createElement('option');empty.value='';empty.textContent='인스턴스를 선택하세요';select.append(empty);
  for(const instance of history?.document.instances??[]){const option=doc.createElement('option');option.value=instance.instanceId;option.textContent=instance.instanceId;option.selected=instance.instanceId===selectedId;select.append(option);}
  const item=current();if(item){showAsset(asset(item.assetId,item.assetVersion));const angles=Quaternion.FromArray(item.transform.rotation).toEulerAngles().scale(degrees);for(const [name,value]of Object.entries({x:item.transform.position[0],y:item.transform.position[1],z:item.transform.position[2],rx:angles.x,ry:angles.y,rz:angles.z,scale:item.transform.scale,offset:item.attachment.offset}))field(name).value=String(Number(value.toFixed(5)));panel.querySelector('[data-surface]').value=item.attachment.surface;}
  attachGizmo();
 }
 function persistDraft(){if(!history)return false;const text=serializePlacementDocument(history.document),saved=write(authoredMapDraftKey(mapId),text,draftRaw);if(saved)draftRaw=text;return saved;}
 function bindMap(){
  mapId=world.mapId;base=createBasePlacementManifest(mapId,{catalog:ASSET_CATALOG,placements:world.placements});
  const applied=world.placementOverlay??createEmptyPlacementDocument(base);beforeApplied=clone(applied);appliedRaw=read(authoredMapStorageKey(mapId));draftRaw=read(authoredMapDraftKey(mapId));
  let initial=applied;
  if(draftRaw)try{initial=validatePlacementDocument(JSON.parse(draftRaw),{catalog:ASSET_CATALOG,baseManifest:base});}catch(error){status('임시본을 적용하지 않았습니다: '+error.message);}
  initial={...initial,revision:Math.max(initial.revision,applied.revision)};history=new PlacementHistory(initial,{catalog:ASSET_CATALOG,baseManifest:base});selectedId=null;refreshSelection();
 }
 function ensureRuntime(){if(world.authoredPlacements&&!world.authoredPlacements.disposed&&world.authoredPlacements.mapId===world.mapId)return runtime=world.authoredPlacements;runtime=new Runtime(world,{catalog:ASSET_CATALOG,onCommit});world.authoredPlacements=runtime;return runtime;}
 async function commit(next){
  if(!editable())throw new Error('편집을 시작한 뒤 확정하세요.');busy=true;gizmos?.manager.attachToNode(null);const request=epoch,previous=history.document;
  try{
   runtime.clearExistingPreview?.();runtime.clearPreview();
   const candidate=validatePlacementDocument({...next,revision:Math.max(previous.revision,runtime.document.revision)+1},{catalog:ASSET_CATALOG,baseManifest:base});
   await runtime.apply(candidate);if(request!==epoch)return;
   if(history.document.revision!==candidate.revision-1)history=new PlacementHistory({...previous,revision:candidate.revision-1},{catalog:ASSET_CATALOG,baseManifest:base});
   history.commit(candidate);persistDraft();refreshSelection();status('임시 배치 확정 · 충돌·길찾기·LOD·그림자·미니맵 갱신 완료. 게임 적용/프로젝트 반영은 별도입니다.');
  }catch(error){runtime.clearExistingPreview?.();status(error.message);throw error;}finally{if(request===epoch){busy=false;attachGizmo();}}
 }
 function values(item){
  const result=clone(item),number=name=>{const value=Number(field(name).value);if(!Number.isFinite(value))throw new Error(name+'에 유효한 숫자를 입력하세요.');return value;};
  result.transform.position=[number('x'),number('y'),number('z')];result.transform.rotation=Quaternion.FromEulerAngles(number('rx')/degrees,number('ry')/degrees,number('rz')/degrees).normalize().asArray();result.transform.scale=number('scale');result.attachment.offset=number('offset');
  const surface=panel.querySelector('[data-surface]').value;
  if(surface==='ground'){const attached=terrainAttachment(world,result.transform.position[0],result.transform.position[2],result.attachment.offset);result.transform.position=attached.position;result.attachment=attached.attachment;result.collision='solid';}
  else if(surface==='free'){result.attachment={surface,normal:[0,1,0],offset:result.attachment.offset};result.collision='none';}
  else{if(item.attachment.surface!==surface)throw new Error('벽·천장은 표면 찍기로 실제 지지 면을 선택하세요.');result.collision='none';}
  return result;
 }
 function newInstance(){
  if(!selectedAsset?.placement.supported)throw new Error('배치 지원이 확인된 독립 소품을 선택하세요.');const player=getPlayer(),point={x:player.position.x+3,z:player.position.z},radius=Math.hypot(selectedAsset.bounds.size[0],selectedAsset.bounds.size[2])*selectedAsset.units.metersPerSourceUnit*.5,safe=world.navigation?.findFree?.(point,radius)??point;
  const support=terrainAttachment(world,safe.x,safe.z);return {instanceId:'authored-'+(globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),assetId:selectedAsset.assetId,assetVersion:selectedAsset.version,transform:{position:support.position,rotation:[0,0,0,1],scale:1},attachment:support.attachment,collision:'solid'};
 }
 function attachGizmo(){
  if(!gizmos)return;if(busy){gizmos.manager.attachToNode(null);return;}const manager=gizmos.manager,record=selectedRecord(),mode=panel.querySelector('[data-mode]').value;
  manager.positionGizmoEnabled=mode==='position';manager.rotationGizmoEnabled=mode==='rotation';manager.scaleGizmoEnabled=mode==='scale';manager.coordinatesMode=panel.querySelector('[data-axis]').value==='local'?GizmoCoordinatesMode.Local:GizmoCoordinatesMode.World;
  if(manager.gizmos.scaleGizmo)for(const axis of ['xGizmo','yGizmo','zGizmo'])manager.gizmos.scaleGizmo[axis].isEnabled=false;
  manager.attachToNode(record?.root??null);
  const step=Number(panel.querySelector('[data-grid]').value);if(manager.gizmos.positionGizmo)manager.gizmos.positionGizmo.snapDistance=Number.isFinite(step)&&step>0?step:0;
  for(const gizmo of Object.values(manager.gizmos)){
   if(!gizmo||gizmoObservers.some(item=>item.gizmo===gizmo))continue;
   const start=gizmo.onDragStartObservable?.add(()=>{if(!editable())return;dragging=true;dragInvalid=false;dragTask=Promise.resolve();const record=selectedRecord();record?.root.unfreezeWorldMatrix();for(const node of record?.root.getDescendants()??[])node.unfreezeWorldMatrix?.();});
   const change=gizmo.onDragObservable?.add(()=>{if(!dragging||!editable()||dragInvalid)return;const request=epoch;dragTask=(async()=>{try{const item=current(),record=selectedRecord(),normal=Vector3.FromArray(item.attachment.normal),candidate=clone(item);candidate.transform.position=record.root.position.subtract(normal.scale(item.attachment.offset)).asArray();candidate.transform.rotation=(record.root.rotationQuaternion??Quaternion.FromEulerVector(record.root.rotation)).normalize().asArray();candidate.transform.scale=record.root.scaling.x;if(item.attachment.surface==='ground'){const attached=terrainAttachment(world,candidate.transform.position[0],candidate.transform.position[2],item.attachment.offset);candidate.transform.position=attached.position;candidate.attachment=attached.attachment;}await runtime.previewExisting(candidate);if(request===epoch&&!dragInvalid)status('선택 대상 미리보기 · 놓으면 충돌을 확정합니다.');}catch(error){if(request!==epoch)return;dragInvalid=true;gizmos?.manager.attachToNode(null);status(error.message);}})();});
   const end=gizmo.onDragEndObservable?.add(()=>{if(!dragging)return;dragging=false;const request=epoch;(async()=>{await dragTask;if(request!==epoch||!editable())return;if(dragInvalid){const original=current();if(original)await runtime.previewExisting(original);runtime.clearExistingPreview?.();refreshSelection();return;}const item=selectedRecord()?.instance;if(item){const next=history.document;next.instances=next.instances.map(value=>value.instanceId===item.instanceId?clone(item):value);await commit(next);}})().catch(error=>{if(request===epoch){runtime.clearExistingPreview?.();status(error.message);}});});
   gizmoObservers.push({gizmo,start,change,end});
  }
 }
 function pick(event){
  if(!editable()||dragging||gizmos?.manager.isHovered)return;
  const hit=world.scene.pick(world.scene.pointerX,world.scene.pointerY,mesh=>mesh.isEnabled()&&mesh.isVisible&&mesh.getTotalVertices()>0&&!mesh.metadata?.runtimeOutline);
  if(!hit?.hit)return;
  if(snapArmed){
   snapArmed=false;const item=current();if(!item){status('부착할 인스턴스를 먼저 선택하세요.');return;}
   const support=world.villageRenderRecords?.find(record=>record.meshes.includes(hit.pickedMesh)),normal=hit.getNormal(true)?.normalize(),surface=panel.querySelector('[data-surface]').value;
   if(!normal||!hit.pickedPoint)return;
   if((surface==='wall'||surface==='ceiling')&&!support){status('벽·천장은 불변 원래 맵의 실제 표면을 선택하세요.');return;}
   if(hit.pickedMesh.metadata?.authoredPlacement){status('다른 편집 소품 위의 종속 배치는 아직 지원하지 않습니다.');return;}
   const next=history.document,candidate=clone(item);candidate.transform.position=hit.pickedPoint.asArray();candidate.attachment={surface,normal:normal.asArray(),offset:Number(field('offset').value),...(surface==='free'?{}:{supportId:support?.placement.id??'terrain'})};candidate.collision=surface==='ground'?'solid':'none';const rotation=Quaternion.Identity();Quaternion.FromUnitVectorsToRef(Vector3.Up(),normal,rotation);candidate.transform.rotation=rotation.asArray();next.instances=next.instances.map(value=>value.instanceId===item.instanceId?candidate:value);commit(next).catch(error=>status(error.message));return;
  }
  const id=hit.pickedMesh.metadata?.placementInstanceId;
  if(id&&runtime.records.has(id)){selectedId=id;refreshSelection();return;}
  const baseRecord=world.villageRenderRecords?.find(record=>record.meshes.includes(hit.pickedMesh));if(baseRecord)status(`${baseRecord.placement.id}: 원래 맵은 읽기 전용입니다. 카탈로그에서 독립 복사본을 배치하세요.`);
 }
 async function enter(){
  if(lease?.active||busy)return;if(!getState().ready)throw new Error('플레이 준비가 끝난 뒤 편집을 시작하세요.');const request=++epoch;busy=true;
  try{
   bindMap();ensureRuntime();lease=await world.acquireToolLease({owner:'placement-editor',freeCamera:true,audioEnabled:false,onCancel:()=>leave(false)});
   if(request!==epoch){lease.release('cancel',{restore:false});return;}
   gizmos=createGizmos(world.scene);pointerObserver=world.scene.onPointerObservable.add(info=>{if(info.type===PointerEventTypes.POINTERPICK)pick(info.event);});
   if(history.document.instances.length||runtime.document.instances.length){const next={...history.document,revision:Math.max(history.document.revision,runtime.document.revision)+1};await runtime.apply(next);history=new PlacementHistory(next,{catalog:ASSET_CATALOG,baseManifest:base});}
   refreshSelection();status('편집 중 · 게임 입력과 전투를 잠시 멈추고 자유 카메라를 사용합니다.');
  }catch(error){cleanupGizmos();const held=lease;lease=null;held?.release('editor-error');throw error;}
  finally{if(request===epoch){busy=false;attachGizmo();}}
 }
 function cleanupGizmos(){if(pointerObserver)world.scene.onPointerObservable.remove(pointerObserver);pointerObserver=null;for(const {gizmo,start,change,end}of gizmoObservers){gizmo.onDragStartObservable?.remove(start);gizmo.onDragObservable?.remove(change);gizmo.onDragEndObservable?.remove(end);}gizmoObservers=[];gizmos?.dispose();gizmos=null;}
 async function leave(restore=true,keep=false){
  epoch++;busy=false;dragging=false;snapArmed=false;try{persistDraft();}catch(error){status(error.message);}cleanupGizmos();runtime?.clearExistingPreview?.();runtime?.clearPreview();
  const held=lease;lease=null;
  try{if(restore&&!keep&&runtime&&!runtime.disposed&&world.mapId===mapId){const restored={...beforeApplied,revision:Math.max(runtime.document.revision,history.document.revision)+1};await runtime.apply(restored);}}
  finally{held?.release('editor-exit',{restore});}
 }
 function download(){const blob=new Blob([serializePlacementDocument(history.document)],{type:'application/json'}),url=URL.createObjectURL(blob),link=doc.createElement('a');link.href=url;link.download=`moonforest-0.1-${mapId}-placements.json`;link.click();URL.revokeObjectURL(url);status('JSON 내보냄 · 프로젝트 반영: node scripts/apply-authored-map.mjs <파일> --apply → 기존 빌드·배포');}
 const action=async event=>{
  const command=event.target.closest?.('[data-cmd]')?.dataset.cmd;if(!command)return;
  try{
   if(command==='enter'){await enter();return;}if(command==='exit'){await leave(true);status('편집 종료 · 게임 적용본을 복원했습니다.');return;}
   if(!editable())throw new Error('편집을 먼저 시작하세요.');
   if(command==='place'){const next=history.document,item=newInstance();selectedId=item.instanceId;next.instances.push(item);await commit(next);}
   else if(command==='preview'){await runtime.preview(newInstance());status('명시적으로 선택한 소품 한 개만 미리보기 중입니다.');}
   else if(command==='numeric'){const item=current();if(!item)throw new Error('인스턴스를 선택하세요.');const next=history.document;next.instances=next.instances.map(value=>value.instanceId===item.instanceId?values(item):value);await commit(next);}
   else if(command==='duplicate'){const item=current();if(!item)throw new Error('인스턴스를 선택하세요.');const copy=clone(item);copy.instanceId='authored-'+crypto.randomUUID();copy.transform.position[0]+=.5;if(copy.attachment.supportId==='terrain')copy.transform.position[1]=world.terrain.heightAt(copy.transform.position[0],copy.transform.position[2]);selectedId=copy.instanceId;const next=history.document;next.instances.push(copy);await commit(next);}
   else if(command==='delete'){const next=history.document;next.instances=next.instances.filter(item=>item.instanceId!==selectedId);selectedId=null;await commit(next);}
   else if(command==='snap'){if(!current())throw new Error('인스턴스를 선택하세요.');snapArmed=true;status('현재 바닥·벽·천장 모드에 맞는 실제 불변 지지 면을 클릭하세요.');}
   else if(command==='undo'||command==='redo'){busy=true;attachGizmo();try{runtime.clearExistingPreview?.();runtime.clearPreview();const next=command==='undo'?history.undo():history.redo();if(next.revision<=runtime.document.revision)next.revision=runtime.document.revision+1;await runtime.apply(next);if(history.document.revision!==next.revision)history=new PlacementHistory(next,{catalog:ASSET_CATALOG,baseManifest:base});persistDraft();status('배치와 충돌·미니맵을 함께 복원했습니다.');}catch(error){history=new PlacementHistory(runtime.document,{catalog:ASSET_CATALOG,baseManifest:base});throw error;}finally{busy=false;refreshSelection();}}
   else if(command==='draft')status(persistDraft()?'브라우저 임시 저장 완료 · 프로젝트 파일과 배포는 별도입니다.':'저장소를 사용할 수 없어 이번 실행의 메모리에만 있습니다. JSON을 내보내세요.');
   else if(command==='reopen'){const raw=read(authoredMapDraftKey(mapId));if(!raw)throw new Error('임시 저장본이 없습니다.');draftRaw=raw;await commit(validatePlacementDocument(JSON.parse(raw),{catalog:ASSET_CATALOG,baseManifest:base}));}
   else if(command==='apply'){if(!canApply())throw new Error('플레이어 위치와 소품 충돌이 겹칩니다. 소품을 옮긴 뒤 게임에 적용하세요.');const text=serializePlacementDocument(history.document),saved=write(authoredMapStorageKey(mapId),text,appliedRaw);if(saved)appliedRaw=text;beforeApplied=history.document;await leave(true,true);status(saved?'브라우저 게임에 적용했습니다. 새로고침·맵 왕복에도 같은 ID로 불러옵니다. 프로젝트 배포는 별도입니다.':'이번 실행에만 적용했습니다. 저장소 실패로 새로고침 시 유지되지 않습니다.');}
   else if(command==='export')download();
  }catch(error){status(error.message);}
 };
 const imported=async event=>{try{const file=event.target.files?.[0];if(!file)return;if(file.size>512*1024)throw new Error('배치 파일은 512 KiB 이하여야 합니다.');const next=validatePlacementDocument(JSON.parse(await file.text()),{catalog:ASSET_CATALOG,baseManifest:base});await commit(next);}catch(error){status(error.message);}finally{event.target.value='';}};
 panel.addEventListener('click',action);panel.querySelector('[data-query]').addEventListener('input',search);panel.querySelector('[data-category]').addEventListener('change',search);panel.querySelector('[data-instances]').addEventListener('change',event=>{selectedId=event.target.value;refreshSelection();});for(const selector of ['[data-mode]','[data-axis]','[data-grid]'])panel.querySelector(selector).addEventListener('change',attachGizmo);panel.querySelector('[data-import]').addEventListener('change',imported);
 const observer=world.scene.onDisposeObservable.addOnce(()=>api.dispose());
 const api={isEditing:()=>!!lease?.active,inspect:()=>({mapId,editing:!!lease?.active,selectedId,document:history?.document,runtime:runtime?.diagnostics()}),enter,leaveMap(){leave(false).catch(error=>status(error.message));},dispose(){if(disposed)return;disposed=true;leave(false).catch(()=>{});world.scene.onDisposeObservable.remove(observer);panel.removeEventListener('click',action);panel.remove();style.remove();}};
 search();showAsset(ASSET_CATALOG.entries.find(entry=>entry.placement.supported));return api;
}
