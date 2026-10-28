export const isForestRoute=(search=globalThis.location?.search??'')=>new URLSearchParams(search).get('character')==='warrior-v4';
export const mapForCharacter=character=>character==='warrior-v5'?'witch-cave':character==='warrior-v4'?'monster-forest':character==='warrior-v3'?'village':'training';
export const isWorldCharacter=character=>['warrior-v3','warrior-v4','warrior-v5'].includes(character);
export const CAVE_RADIUS=74;
export const CAVE_SPAWN=Object.freeze({x:-42,z:43});
export const FOREST_RADIUS=62;
export const FOREST_SPAWN=Object.freeze({x:0,z:46});
export const MAP_PORTALS=Object.freeze({
  village:{x:.35,z:76,radius:3,destination:'warrior-v4',label:'마물의 숲으로 이동',arrival:{x:0,z:46}},
  'monster-forest':{x:0,z:51,radius:3,destination:'warrior-v3',label:'마을로 돌아가기',arrival:{x:-.4,z:71}},
  'witch-cave':{x:-46,z:47,radius:3,destination:'warrior-v4',label:'마물의 숲으로 돌아가기',arrival:{x:28,z:-38}},
});
export const FOREST_CAVE_PORTAL=Object.freeze({x:28,z:-41,radius:2.5,destination:'warrior-v5',label:'마녀의 동굴로 들어가기',arrival:CAVE_SPAWN});
export const mapPortals=id=>id==='monster-forest'?[MAP_PORTALS[id],FOREST_CAVE_PORTAL]:MAP_PORTALS[id]?[MAP_PORTALS[id]]:[];
export function worldSpawn(character,search='',villageSpawn={x:0,z:0}){
  const params=new URLSearchParams(search);
  if(character==='warrior-v5')return CAVE_SPAWN;
  if(character==='warrior-v4')return params.get('arrival')==='portal'&&params.get('from')==='warrior-v5'?MAP_PORTALS['witch-cave'].arrival:FOREST_SPAWN;
  return params.get('arrival')==='portal'?MAP_PORTALS['monster-forest'].arrival:villageSpawn;
}
export function portalAvailable(position,portal,state={}){
  return !!portal&&!!position&&Math.hypot(position.x-portal.x,position.z-portal.z)<=portal.radius&&
    !state.loading&&!state.dead&&!state.captured&&!state.healing&&!(state.enemies>0);
}
export function travelUrl(href,destination){
  if(!isWorldCharacter(destination))throw new Error('Unknown travel destination');
  const url=new URL(href),source=url.searchParams.get('character');url.searchParams.set('character',destination);url.searchParams.set('arrival','portal');
  if(isWorldCharacter(source))url.searchParams.set('from',source);
  for(const name of ['villageReview','villageOverview','villageHorizon','villageFixture','villageMobile'])url.searchParams.delete(name);
  return url.href;
}
