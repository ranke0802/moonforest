// The slow-motion push-in narrows the field of view for under a second. Scenery picks its
// detail level from the camera's screen area, so the push-in raised the detail of the whole
// map for that moment (phone recording 2026-11-20: 0.70M -> 1.06M triangles, 60-100 ms
// frames while it lasted). While pinned, detail selection keeps seeing the un-zoomed area.
const own=camera=>Object.prototype.hasOwnProperty.call(camera,'screenArea');
export function pinScreenArea(camera){
  if(!camera||own(camera))return false;
  const area=camera.screenArea;if(!Number.isFinite(area))return false;
  Object.defineProperty(camera,'screenArea',{configurable:true,enumerable:false,get:()=>area});return true;
}
export function unpinScreenArea(camera){if(!camera||!own(camera))return false;delete camera.screenArea;return true;}
