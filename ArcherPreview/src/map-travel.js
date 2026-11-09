import {createPortalMist} from './portal-mist.js';
import {mapPortals,portalAvailable,travelUrl} from './map-route.js';
import {VILLAGE_GROUND_ROUTES,sampleGroundCurve} from './village-ground-layout.js';
import {plainsToVillage} from './village-plains-boundary.js';
import {plainsToForest} from './plains-forest-boundary.js';
const exitSamples=sampleGroundCurve(VILLAGE_GROUND_ROUTES[1].points).filter(p=>p[1]>=40);
export function exitRoadX(z){
  let nearest=exitSamples[0];for(const p of exitSamples)if(Math.abs(p[1]-z)<Math.abs(nearest[1]-z))nearest=p;return nearest[0];
}
export function villageTravelLimit(position,normal=48){return position.z>43&&Math.abs(position.x-exitRoadX(position.z))<22?80:normal;}
export function clampVillageExit(position,previous){
  if(Math.hypot(position.x,position.z)<=48)return position;
  if((previous?.z>43&&Math.abs(previous.x-exitRoadX(previous.z))<22)||(position.z>43&&Math.abs(position.x-exitRoadX(position.z))<22)){
    position.z=Math.max(43,Math.min(position.z,78));const x=exitRoadX(position.z);position.x=Math.max(x-22,Math.min(x+22,position.x));
  }else {const d=Math.hypot(position.x,position.z);position.x*=48/d;position.z*=48/d;}
  return position;
}
// The common-coordinate strips cover both shoulders and the nearby trees.
// Arrival retains the player's offset; the return trigger distinguishes
// intentional outward movement from arriving or standing in the strip.
export function roadPortalContains(mapId,portal,position){
 if(!portal?.roadPassage||!position)return false;
 if(mapId==='village'&&portal.destination==='warrior-plains')return Math.abs(position.x-exitRoadX(position.z))<=20&&position.z>=73&&position.z<=78;
 if(mapId==='great-plains'&&portal.destination==='warrior-v3'){const p=plainsToVillage(position);return Math.abs(p.x-exitRoadX(p.z))<=20&&p.z>=70&&p.z<=77.5;}
 if(mapId==='monster-forest'&&portal.destination==='warrior-plains')return Math.abs(position.x)<=18&&position.z>=48&&position.z<=56;
 if(mapId==='great-plains'&&portal.destination==='warrior-v4'){const p=plainsToForest(position);return Math.abs(p.x)<=18&&p.z>=45&&p.z<=54;}
 return false;
}
// Signed distance along the road, increasing towards this portal's destination.
// Use the shared road coordinate so the rotated plains boundaries behave like
// the corresponding village/forest roads.
function roadOutwardProgress(mapId,portal,position){
 if(!position)return null;
 if(mapId==='village'&&portal.destination==='warrior-plains')return position.z;
 if(mapId==='monster-forest'&&portal.destination==='warrior-plains')return position.z;
 if(mapId==='great-plains'&&portal.destination==='warrior-v3')return -plainsToVillage(position).z;
 if(mapId==='great-plains'&&portal.destination==='warrior-v4')return -plainsToForest(position).z;
 return null;
}
const RETURN_ROAD_MOVEMENT=0.3;
export function safeRoadArrival(world,position,radius,limitFor){
 const legal=p=>{
  if(world.mapId==='village'){const bounded=clampVillageExit({...p},p);if(Math.hypot(bounded.x-p.x,bounded.z-p.z)>.001)return false;}
  return world.navigation.free(p,radius,limitFor(p));
 };
 if(legal(position))return {x:position.x,z:position.z};
 for(let ring=.25;ring<=10;ring+=.25)for(let i=0;i<32;i++){
  const angle=i*Math.PI/16,p={x:position.x+Math.cos(angle)*ring,z:position.z+Math.sin(angle)*ring};if(legal(p))return p;
 }
 throw Error('지역 경계에서 안전한 도착 위치를 찾지 못했습니다.');
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
export function createMapPortal(world,{button,getState,onTravel,storage,persistTravel=true,disarmRoadDestination=null}){
  const portals=mapPortals(world.mapId);if(!portals.length)return null;
  let portal=portals[0];const mists=portals.filter(p=>!p.roadPassage).map(p=>createPortalMist(world,p));button.hidden=true;
  let available=false,disposed=false,automaticPending=false;
  // A transformed arrival can be inside the return trigger. Track the most
  // inward point, so reversing works even before leaving the broad strip.
  // Time, camera rotation and small positional jitter cannot trigger a return.
  let disarmed=portals.find(p=>p.roadPassage&&p.destination===disarmRoadDestination)??null;
  let inwardProgress=disarmed?roadOutwardProgress(world.mapId,disarmed,getState().position):null;
  const inside=(p,state)=>p.roadPassage?roadPortalContains(world.mapId,p,state.position):portalAvailable(state.position,p,{});
  const canUse=(p,state)=>p.roadPassage?inside(p,state)&&portalAvailable({x:p.x,z:p.z},p,state):portalAvailable(state.position,p,state);
  const activate=()=>{
    const state=getState();if(disposed||portal===disarmed||!canUse(portal,state))return;
    if(persistTravel)try{storage?.setItem(key,JSON.stringify({destination:portal.destination,hp:state.hp,potions:state.potions,time:Date.now()}));}catch{}
    onTravel(travelUrl(location.href,portal.destination),portal);
  };
  button.addEventListener('click',activate);
  const keyboard=event=>{if(event.code==='KeyT'&&!event.repeat&&!event.target?.closest?.('input,select,textarea,dialog'))activate();};
  document.addEventListener('keydown',keyboard);
  const dispose=()=>{if(disposed)return;disposed=true;button.hidden=true;button.removeEventListener('click',activate);document.removeEventListener('keydown',keyboard);world.scene.onDisposeObservable.remove(observer);for(const mist of mists)mist.dispose();};
  const observer=world.scene.onDisposeObservable.addOnce(dispose);
  return {dispose,update(dt=0){
    if(disposed)return;for(const mist of mists)mist.update(dt);
    const position=getState().position;
    if(disarmed&&position){
      if(!inside(disarmed,{position}))disarmed=null;
      else {
        const progress=roadOutwardProgress(world.mapId,disarmed,position);
        if(Number.isFinite(progress)){
          if(!Number.isFinite(inwardProgress)||progress<inwardProgress)inwardProgress=progress;
          else if(progress-inwardProgress>=RETURN_ROAD_MOVEMENT)disarmed=null;
        }
      }
    }
    if(position)portal=portals.reduce((a,b)=>Math.hypot(position.x-a.x,position.z-a.z)<Math.hypot(position.x-b.x,position.z-b.z)?a:b);
    const state=getState(),near=state.position&&(inside(portal,state)||Math.hypot(state.position.x-portal.x,state.position.z-portal.z)<6);
    available=portal!==disarmed&&canUse(portal,state);button.hidden=!near;button.disabled=!available;
    if(portal.roadPassage&&available&&!automaticPending){automaticPending=true;activate();return;}
    const label=available?`${portal.label} · T`:state.enemies>0?'전투 종료 후 이동 가능':'이동 지점에 가까이 가세요';
    if(button.textContent!==label)button.textContent=label;
  }};
}
