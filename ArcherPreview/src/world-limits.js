import {VILLAGE_RADIUS} from './village-layout-base.js';
import {FOREST_RADIUS,CAVE_RADIUS,isWorldCharacter} from './map-route.js';
import {PLAINS_RADIUS} from './great-plains-layout-base.js';
// Live bindings keep every movement/combat module on the current map without
// replacing the document (which would release fullscreen and orientation lock).
export let ARENA_RADIUS,ENEMY_ARENA_RADIUS,VILLAGE_MAP,VIEW_DISTANCE,SCENERY_VIEW_DISTANCE,SKYLINE_VIEW_DISTANCE,FOG_START,FOG_END;
export function setWorldCharacter(character){
  const village=isWorldCharacter(character);
  ARENA_RADIUS=character==='warrior-plains'?PLAINS_RADIUS:character==='warrior-v5'?CAVE_RADIUS:character==='warrior-v4'?FOREST_RADIUS:village?VILLAGE_RADIUS:22;
  VILLAGE_MAP=village&&!['warrior-plains','warrior-v4','warrior-v5'].includes(character);
  ENEMY_ARENA_RADIUS=ARENA_RADIUS-.5;VIEW_DISTANCE=village?65:32;
  SCENERY_VIEW_DISTANCE=village?105:60;SKYLINE_VIEW_DISTANCE=village?350:220;
  FOG_START=village?88:52;FOG_END=SCENERY_VIEW_DISTANCE;
}
setWorldCharacter(new URLSearchParams(globalThis.location?.search??'').get('character'));

// Where monsters may go beyond the map's circle. 0.3 (user, 2026-11-21) lets them use the
// road out of the village, the same strip the player walks; with no rule set the circle is
// the whole of it, as before (0.2).
// rule: {limit(position,normal) -> radius for constrain/path from that position,
//        clamp(position,previous) -> keeps a position inside the walkable shape,
//        outside(point,limit) -> true for a point inside the wider circle but off the shape,
//        warmLimits(normal) -> the other radii limit() can return on this map, so their route grids
//                              are built while the map loads and not by the first search that needs one}
let enemyTravelRule=null;
export function setEnemyTravelRule(rule){enemyTravelRule=rule??null;}
export function enemyLimitAt(position){return enemyTravelRule&&position?enemyTravelRule.limit(position,ENEMY_ARENA_RADIUS):ENEMY_ARENA_RADIUS;}
export function enemyWarmLimits(){return enemyTravelRule?.warmLimits?.(ENEMY_ARENA_RADIUS)??[];}
export function clampEnemyTravel(position,previous){if(enemyTravelRule)enemyTravelRule.clamp(position,previous);}
export function offEnemyTravelShape(point,limit){return enemyTravelRule?enemyTravelRule.outside(point,limit):false;}

export function withinRenderRange(camera, position, padding = 0) {
  const distance = VIEW_DISTANCE + padding;
  return (camera.x-position.x)**2+(camera.y-position.y)**2+(camera.z-position.z)**2 <= distance*distance;
}
