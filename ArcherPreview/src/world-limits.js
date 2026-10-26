// Keep movement, spawning and authored displacements on the same arena.
export const ARENA_RADIUS = 22;
export const ENEMY_ARENA_RADIUS = ARENA_RADIUS - .5;
export const VIEW_DISTANCE = 32;
export const FOG_START = 18;
export const FOG_END = 30;

export function withinRenderRange(camera, position, padding = 0) {
  const distance = VIEW_DISTANCE + padding;
  return (camera.x-position.x)**2+(camera.y-position.y)**2+(camera.z-position.z)**2 <= distance*distance;
}
