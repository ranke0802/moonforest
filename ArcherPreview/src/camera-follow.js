import { Vector3 } from '@babylonjs/core';
const chinOffset=new Vector3(0,-.03,-.025);
export function playerChinTarget(actor,head){
  // The reviewed V6 rig's Head joint is above the visible chin. Offset in the
  // bone's local space so terrain height, scale and turning are all respected.
  if(head){head.computeWorldMatrix(true);return Vector3.TransformCoordinates(chinOffset,head.getWorldMatrix());}
  return actor.position.add(new Vector3(0,1.46,0));
}

export function combatFocus(center,enemyPosition,radius=Infinity){
  if(!enemyPosition)return center;
  const head=enemyPosition.add(new Vector3(0,1.1,0));
  const weight=Math.max(0,Math.min(1,(radius-5)/5));
  const focus=Vector3.Lerp(center,head,Math.min(.35,2/Math.max(.001,Vector3.Distance(center,head)))*weight);
  if(Number.isFinite(radius))focus.y=center.y;
  return focus;
}

export function followTarget(camera, target, dt) {
  // Rebuilding angles from the previous view position here cancels wheel/drag
  // input whenever the actor or pan target moves in the same render frame.
  camera.setTarget(Vector3.Lerp(camera.target, target, 1 - Math.exp(-10 * dt)), false, false, true);
}
