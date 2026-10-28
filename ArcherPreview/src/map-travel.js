import {createPortalMist} from './portal-mist.js';
import {MAP_PORTALS,portalAvailable,travelUrl} from './map-route.js';
import {VILLAGE_GROUND_ROUTES,sampleGroundCurve} from './village-ground-layout.js';
const exitSamples=sampleGroundCurve(VILLAGE_GROUND_ROUTES[1].points).filter(p=>p[1]>=40);
export function exitRoadX(z){
  let nearest=exitSamples[0];for(const p of exitSamples)if(Math.abs(p[1]-z)<Math.abs(nearest[1]-z))nearest=p;return nearest[0];
}
export function villageTravelLimit(position,normal=48){return position.z>43&&Math.abs(position.x-exitRoadX(position.z))<4?80:normal;}
export function clampVillageExit(position,previous){
  if(Math.hypot(position.x,position.z)<=48)return position;
  if((previous?.z>47&&Math.abs(previous.x-exitRoadX(previous.z))<4)||(position.z>43&&Math.abs(position.x-exitRoadX(position.z))<4)){
    position.z=Math.max(44,Math.min(position.z,78));const x=exitRoadX(position.z);position.x=Math.max(x-1.6,Math.min(x+1.6,position.x));
  }else {const d=Math.hypot(position.x,position.z);position.x*=48/d;position.z*=48/d;}
  return position;
}
const key='moonforest-map-travel-v1';
export function consumeTravel(storage,character,now=Date.now()){
  try{
    const raw=storage?.getItem(key);storage?.removeItem(key);if(!raw)return null;
    const data=JSON.parse(raw);
    if(data.destination!==character||now-data.time>120000||now<data.time||!Number.isFinite(data.hp)||data.hp<=0)return null;
    if(!Number.isFinite(data.potions))return null;
    return {hp:Math.min(500,data.hp),potions:Math.max(0,Math.min(3,Math.floor(data.potions)))};
  }catch{return null;}
}
export function createMapPortal(world,{button,getState,onTravel,storage,persistTravel=true}){
  const portal=MAP_PORTALS[world.mapId];if(!portal)return null;
  const mist=createPortalMist(world,portal);button.hidden=true;
  let available=false,disposed=false;
  const activate=()=>{
    const state=getState();if(disposed||!portalAvailable(state.position,portal,state))return;
    if(persistTravel)try{storage?.setItem(key,JSON.stringify({destination:portal.destination,hp:state.hp,potions:state.potions,time:Date.now()}));}catch{}
    onTravel(travelUrl(location.href,portal.destination));
  };
  button.addEventListener('click',activate);
  const keyboard=event=>{if(event.code==='KeyT'&&!event.repeat&&!event.target?.closest?.('input,select,textarea,dialog'))activate();};
  document.addEventListener('keydown',keyboard);
  const dispose=()=>{if(disposed)return;disposed=true;button.hidden=true;button.removeEventListener('click',activate);document.removeEventListener('keydown',keyboard);world.scene.onDisposeObservable.remove(observer);mist.dispose();};
  const observer=world.scene.onDisposeObservable.addOnce(dispose);
  return {dispose,update(dt=0){
    if(disposed)return;mist.update(dt);
    const state=getState(),near=state.position&&Math.hypot(state.position.x-portal.x,state.position.z-portal.z)<6;
    available=portalAvailable(state.position,portal,state);button.hidden=!near;button.disabled=!available;
    const label=available?`${portal.label} · T`:state.enemies>0?'전투 종료 후 이동 가능':'이동 지점에 가까이 가세요';
    if(button.textContent!==label)button.textContent=label;
  }};
}
