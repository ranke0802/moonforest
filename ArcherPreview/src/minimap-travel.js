import {isWorldCharacter,travelUrl,mapForCharacter,mapPortals} from './map-route.js';
import {ELENA_SANCTUARY_WAYPOINT} from './map-waypoints.js';
import {ELENA_HOME} from './elena-spec.js';

// Look inward from the destination entrance, independent of the old view.
export function applyMinimapArrivalPose(actor,camera,pan,{destination,position,waypoint}={}){
 const portals=mapPortals(mapForCharacter(destination));
 const portal=portals.reduce((best,p)=>!best||Math.hypot(p.x-position.x,p.z-position.z)<Math.hypot(best.x-position.x,best.z-position.z)?p:best,null);
 const dx=waypoint?ELENA_HOME.x-position.x:portal?position.x-portal.x:0,dz=waypoint?ELENA_HOME.z-position.z:portal?position.z-portal.z:1;
 const yaw=Math.hypot(dx,dz)>.001?Math.atan2(dx,dz):Math.PI;
 actor.rotation.y=yaw;camera.alpha=-Math.PI/2-yaw;
 if(pan)Object.assign(pan,{x:0,y:0,z:0});
 for(const key of ['inertialAlphaOffset','inertialPanningX','inertialPanningY'])if(key in camera)camera[key]=0;
 camera.movement?.resetPanVelocity?.();camera.movement?.resetRotationVelocity?.();
 return yaw;
}

export const MINIMAP_REGIONS=Object.freeze([
 {map:'village',character:'warrior-v3',label:'마을',note:'성문 앞길로 이동'},
 {map:'great-plains',character:'warrior-plains',label:'대평원',note:'길의 입구로 이동'},
 {map:'monster-forest',character:'warrior-v4',label:'마물의 숲',note:'숲 입구로 이동'},
 {map:'witch-cave',character:'warrior-v5',label:'마녀의 동굴',note:'동굴 입구로 이동'},
 {...ELENA_SANCTUARY_WAYPOINT,waypoint:ELENA_SANCTUARY_WAYPOINT.id,note:'성녀의 거처 앞길로 이동'},
].map(region=>Object.freeze({id:region.character,...region})));

export function minimapTravelUrl(href,region){
 const url=new URL(travelUrl(href,region.character));
 url.searchParams.delete('waypoint');
 if(region.waypoint)url.searchParams.set('waypoint',region.waypoint);
 return url.href;
}

const currentRegion=(state,region)=>!region.waypoint&&state.character===region.character;

export function minimapTravelBlocked(state={}){
 if(!state.ready||state.loading||state.busy||!isWorldCharacter(state.character))return '이동 준비가 끝난 뒤 다시 열어 주세요.';
 if(state.dead)return '쓰러진 상태에서는 이동할 수 없습니다.';
 if(state.captured)return '행동할 수 있는 상태가 되면 이동할 수 있습니다.';
 if(state.healing)return '회복을 마친 뒤 이동할 수 있습니다.';
 if(state.enemies>0)return '전투를 마친 뒤 이동할 수 있습니다.';
 return '';
}

// The chooser only requests the existing in-document map transition. Arrival,
// retained player state and loading failure/retry belong to that same owner.
export function setupMinimapTravel({element,root=element?.parentElement,getState,onTravel,getHref=()=>globalThis.location.href,resetInput=()=>{},onPauseChange=()=>{},onError=()=>{}}){
 if(!element||!root)return {isOpen:()=>false,close(){},dispose(){}};
 element.__minimapTravel?.dispose();
 const doc=element.ownerDocument,abort=new AbortController(),dialog=doc.createElement('dialog'),launcher=doc.createElement('button');
 let disposed=false,pending=false,lastOpen=false;
 dialog.id='minimap-travel-dialog';dialog.className='minimap-travel-dialog';dialog.dataset.ui='';dialog.setAttribute('aria-labelledby','minimap-travel-title');
 dialog.innerHTML=`<header><div><small>MOONFOREST</small><h2 id="minimap-travel-title">지역 이동</h2></div><button type="button" data-region-close aria-label="지역 이동 닫기">닫기 ×</button></header><p class="minimap-travel-intro">이동할 장소를 선택하세요.</p><div class="minimap-region-grid">${MINIMAP_REGIONS.map(region=>`<button type="button" data-region="${region.id}"${region.waypoint?' data-waypoint="'+region.waypoint+'"':''}><strong>${region.label}</strong><small>${region.note}</small></button>`).join('')}</div><p class="minimap-travel-status" role="status" aria-live="polite"></p><footer><button type="button" data-region-close>돌아가기</button></footer>`;
 launcher.type='button';launcher.className='minimap-travel-launch';launcher.dataset.ui='';launcher.setAttribute('aria-label','지역 이동 열기');launcher.setAttribute('aria-haspopup','dialog');launcher.setAttribute('aria-controls',dialog.id);launcher.setAttribute('aria-expanded','false');launcher.title='지역 이동';launcher.innerHTML='<span>지역 이동</span>';
 element.classList.add('has-region-travel');element.append(launcher);root.append(dialog);
 const status=dialog.querySelector('[role="status"]');
 const refresh=()=>{
  const state=getState(),blocked=minimapTravelBlocked(state);status.textContent=blocked||'목적지를 선택하면 해당 지점으로 이동합니다.';
  for(const region of MINIMAP_REGIONS){const button=dialog.querySelector(`[data-region="${region.id}"]`),current=currentRegion(state,region);button.disabled=pending||current||!!blocked;button.setAttribute('aria-current',current?'location':'false');button.querySelector('small').textContent=current?'현재 지역':region.note;}
 };
 const changed=()=>{const open=dialog.open;launcher.setAttribute('aria-expanded',String(open));if(open!==lastOpen){lastOpen=open;onPauseChange();}};
 const close=()=>{if(dialog.open){dialog.close();changed();}};
 const open=()=>{
  if(disposed||pending||element.hidden||dialog.open)return;
  const state=getState();if(!state.ready||state.loading||state.busy||!isWorldCharacter(state.character)||doc.querySelector('dialog[open]'))return;
  resetInput();refresh();dialog.showModal();changed();
 };
 launcher.addEventListener('click',event=>{event.stopPropagation();open();},{signal:abort.signal});
 dialog.addEventListener('click',async event=>{
  event.stopPropagation();
  if(event.target.closest('[data-region-close]')){close();return;}
  const button=event.target.closest('[data-region]');if(!button||button.disabled||disposed||pending)return;
  const state=getState(),region=MINIMAP_REGIONS.find(region=>region.id===button.dataset.region);
  if(!region||currentRegion(state,region)||minimapTravelBlocked(state)){refresh();return;}
  pending=true;refresh();resetInput();close();
  try{await onTravel(minimapTravelUrl(getHref(),region));}catch(error){onError(error);}finally{pending=false;}
 },{signal:abort.signal});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();},{signal:abort.signal});
 dialog.addEventListener('close',()=>{if(dialog.open)return;resetInput();changed();if(!disposed&&!pending&&!element.hidden)launcher.focus({preventScroll:true});},{signal:abort.signal});
 const api={isOpen:()=>dialog.open,close,dispose(){if(disposed)return;disposed=true;close();abort.abort();launcher.remove();dialog.remove();if(element.__minimapTravel===api){delete element.__minimapTravel;element.classList.remove('has-region-travel');}}};
 element.__minimapTravel=api;return api;
}
