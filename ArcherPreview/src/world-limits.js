import { isVillageRoute, VILLAGE_RADIUS } from './village-layout.js';
// The route is fixed for a scene lifetime. Switching into/out of v3 reloads it.
import {isForestRoute,FOREST_RADIUS} from './map-route.js';
const forest=isForestRoute(),village=isVillageRoute()||forest;
// Keep movement, spawning and authored displacements on the same arena.
export const ARENA_RADIUS = forest ? FOREST_RADIUS : village ? VILLAGE_RADIUS : 22;
export const ENEMY_ARENA_RADIUS = ARENA_RADIUS - .5;
export const VIEW_DISTANCE = village ? 65 : 32;
// Only cheap static scenery extends beyond the existing gameplay render range.
export const SCENERY_VIEW_DISTANCE = village ? 105 : 60;
// The skyline is a single small static mesh. Tree LOD/culling and gameplay keep
// their own shorter ranges; this far plane does not extend those render ranges.
export const SKYLINE_VIEW_DISTANCE = village ? 350 : 220;
export const FOG_START = village ? 88 : 52;
export const FOG_END = SCENERY_VIEW_DISTANCE;

export function withinRenderRange(camera, position, padding = 0) {
  const distance = VIEW_DISTANCE + padding;
  return (camera.x-position.x)**2+(camera.y-position.y)**2+(camera.z-position.z)**2 <= distance*distance;
}
