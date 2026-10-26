import { Vector3 } from '@babylonjs/core';

export function combatFocus(center,enemyPosition){
  if(!enemyPosition)return center;
  const head=enemyPosition.add(new Vector3(0,1.1,0));
  return Vector3.Lerp(center,head,Math.min(.35,2/Math.max(.001,Vector3.Distance(center,head))));
}

export function followTarget(camera, target, dt) {
  // Rebuilding angles from the previous view position here cancels wheel/drag
  // input whenever the actor or pan target moves in the same render frame.
  camera.setTarget(Vector3.Lerp(camera.target, target, 1 - Math.exp(-10 * dt)), false, false, true);
}
