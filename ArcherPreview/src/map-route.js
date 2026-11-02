export const isForestRoute=(search=globalThis.location?.search??'')=>new URLSearchParams(search).get('character')==='warrior-v4';
export const mapForCharacter=character=>character==='warrior-plains'?'great-plains':character==='warrior-v5'?'witch-cave':character==='warrior-v4'?'monster-forest':character==='warrior-v3'?'village':'training';
export const isWorldCharacter=character=>['warrior-v3','warrior-plains','warrior-v4','warrior-v5'].includes(character);
export const CAVE_RADIUS=74;
export const CAVE_SPAWN=Object.freeze({x:-42,z:43});
export const FOREST_RADIUS=62;
export const FOREST_SPAWN=Object.freeze({x:0,z:46});
export const MAP_PORTALS=Object.freeze({
  village:{x:.35,z:76,radius:3,destination:'warrior-plains',label:'대평원으로 나가기',arrival:{x:-87,z:-8},roadPassage:true},
  'great-plains':{x:-94,z:-8,radius:3,destination:'warrior-v3',label:'마을로 돌아가기',arrival:{x:.35,z:70},roadPassage:true},
  'monster-forest':{x:0,z:51,radius:3,destination:'warrior-plains',label:'대평원으로 돌아가기',arrival:{x:61,z:-66},roadPassage:true},
  'witch-cave':{x:-46,z:47,radius:3,destination:'warrior-v4',label:'마물의 숲으로 돌아가기',arrival:{x:28,z:-38}},
});
export const FOREST_CAVE_PORTAL=Object.freeze({x:28,z:-41,radius:2.5,destination:'warrior-v5',label:'마녀의 동굴로 들어가기',arrival:CAVE_SPAWN});
export const PLAINS_FOREST_PORTAL=Object.freeze({x:65,z:-72,radius:3,destination:'warrior-v4',label:'마물의 숲으로 들어가기',arrival:FOREST_SPAWN,roadPassage:true});
export const mapPortals=id=>id==='great-plains'?[MAP_PORTALS[id],PLAINS_FOREST_PORTAL]:id==='monster-forest'?[MAP_PORTALS[id],FOREST_CAVE_PORTAL]:MAP_PORTALS[id]?[MAP_PORTALS[id]]:[];
export function portalHeadingTurn(from,to){
  const departure=mapPortals(mapForCharacter(from)).find(portal=>portal.destination===to);
  const returning=mapPortals(mapForCharacter(to)).find(portal=>portal.destination===from);
  if(!departure||!returning)return 0;
  // Align both road corridors, including the village's northbound exit and
  // the plains' west entrance. Do not impose a 180-degree turn on every road.
  const outward=Math.atan2(departure.x-returning.arrival.x,departure.z-returning.arrival.z);
  const inward=Math.atan2(departure.arrival.x-returning.x,departure.arrival.z-returning.z);
  return Math.atan2(Math.sin(inward-outward),Math.cos(inward-outward));
}
export function worldSpawn(character,search='',villageSpawn={x:0,z:0}){
  const params=new URLSearchParams(search);
  if(character==='warrior-v5')return CAVE_SPAWN;
  if(character==='warrior-plains')return params.get('arrival')==='portal'&&params.get('from')==='warrior-v4'?MAP_PORTALS['monster-forest'].arrival:MAP_PORTALS.village.arrival;
  if(character==='warrior-v4')return params.get('arrival')==='portal'&&params.get('from')==='warrior-v5'?MAP_PORTALS['witch-cave'].arrival:FOREST_SPAWN;
  return params.get('arrival')==='portal'?MAP_PORTALS['great-plains'].arrival:villageSpawn;
}
export function portalAvailable(position,portal,state={}){
  return !!portal&&!!position&&Math.hypot(position.x-portal.x,position.z-portal.z)<=portal.radius&&
    !state.loading&&!state.dead&&!state.captured&&!state.healing&&!(state.enemies>0);
}
export function travelUrl(href,destination){
  if(!isWorldCharacter(destination))throw new Error('Unknown travel destination');
  const url=new URL(href),source=url.searchParams.get('character');url.searchParams.set('character',destination);url.searchParams.set('arrival','portal');
  if(isWorldCharacter(source))url.searchParams.set('from',source);
  for(const name of ['villageReview','villageOverview','villageHorizon','villageFixture','villageMobile','elenaReview'])url.searchParams.delete(name);
  return url.href;
}
