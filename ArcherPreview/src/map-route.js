export const isForestRoute=(search=globalThis.location?.search??'')=>new URLSearchParams(search).get('character')==='warrior-v4';
export const mapForCharacter=character=>character==='warrior-v4'?'monster-forest':character==='warrior-v3'?'village':'training';
export const isWorldCharacter=character=>['warrior-v3','warrior-v4'].includes(character);
export const FOREST_RADIUS=62;
export const FOREST_SPAWN=Object.freeze({x:0,z:46});
export const MAP_PORTALS=Object.freeze({
  village:{x:.35,z:76,radius:3,destination:'warrior-v4',label:'마물의 숲으로 이동',arrival:{x:0,z:46}},
  'monster-forest':{x:0,z:51,radius:3,destination:'warrior-v3',label:'마을로 돌아가기',arrival:{x:-.4,z:71}},
});
export function portalAvailable(position,portal,state={}){
  return !!portal&&!!position&&Math.hypot(position.x-portal.x,position.z-portal.z)<=portal.radius&&
    !state.loading&&!state.dead&&!state.captured&&!state.healing&&!(state.enemies>0);
}
export function travelUrl(href,destination){
  if(!isWorldCharacter(destination))throw new Error('Unknown travel destination');
  const url=new URL(href);url.searchParams.set('character',destination);url.searchParams.set('arrival','portal');
  for(const name of ['villageReview','villageOverview','villageHorizon','villageFixture','villageMobile'])url.searchParams.delete(name);
  return url.href;
}
