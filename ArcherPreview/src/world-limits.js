import {VILLAGE_RADIUS} from './village-layout.js';
import {FOREST_RADIUS,isWorldCharacter} from './map-route.js';
// Live bindings keep every movement/combat module on the current map without
// replacing the document (which would release fullscreen and orientation lock).
export let ARENA_RADIUS,ENEMY_ARENA_RADIUS,VIEW_DISTANCE,SCENERY_VIEW_DISTANCE,SKYLINE_VIEW_DISTANCE,FOG_START,FOG_END;
export function setWorldCharacter(character){
  const village=isWorldCharacter(character);
  ARENA_RADIUS=character==='warrior-v4'?FOREST_RADIUS:village?VILLAGE_RADIUS:22;
  ENEMY_ARENA_RADIUS=ARENA_RADIUS-.5;VIEW_DISTANCE=village?65:32;
  SCENERY_VIEW_DISTANCE=village?105:60;SKYLINE_VIEW_DISTANCE=village?350:220;
  FOG_START=village?88:52;FOG_END=SCENERY_VIEW_DISTANCE;
}
setWorldCharacter(new URLSearchParams(globalThis.location?.search??'').get('character'));

export function withinRenderRange(camera, position, padding = 0) {
  const distance = VIEW_DISTANCE + padding;
  return (camera.x-position.x)**2+(camera.y-position.y)**2+(camera.z-position.z)**2 <= distance*distance;
}
