import { Vector3 } from '@babylonjs/core';

export function followTarget(camera, target, dt) {
  // Rebuilding angles from the previous view position here cancels wheel/drag
  // input whenever the actor or pan target moves in the same render frame.
  camera.setTarget(Vector3.Lerp(camera.target, target, 1 - Math.exp(-10 * dt)), false, false, true);
}
