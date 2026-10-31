import { Vector3 } from '@babylonjs/core';
const chinOffset=new Vector3(0,-.03,-.025);
export const STABLE_PLAYER_FOCUS_HEIGHT=1.05;
export function playerChinTarget(actor,head){
  // The reviewed V6 rig's Head joint is above the visible chin. Offset in the
  // bone's local space so terrain height, scale and turning are all respected.
  if(head){head.computeWorldMatrix(true);return Vector3.TransformCoordinates(chinOffset,head.getWorldMatrix());}
  return actor.position.add(new Vector3(0,1.46,0));
}

// The player actor is the ground/world anchor. Jump, roll and running bob are
// authored below it in the rig, so a fixed world-height focus excludes them.
export class CameraFollow {
  constructor({storage,key='moonforest-camera-motion-follow-v1'}={}){
    this.storage=storage;this.key=key;this.settings={followMotion:false};this.center=new Vector3();
    try{const saved=JSON.parse(storage?.getItem(key)??'null');if(typeof saved?.followMotion==='boolean')this.settings.followMotion=saved.followMotion;}catch{/* Use the stable default when storage is unavailable. */}
  }
  update({followMotion}){
    if(typeof followMotion!=='boolean')throw new TypeError('Invalid camera motion follow');
    this.settings.followMotion=followMotion;
    try{this.storage?.setItem(this.key,JSON.stringify(this.settings));}catch{/* Session preference still applies. */}
  }
  focus(actor,head,enemyPosition=null,radius=Infinity){
    if(this.settings.followMotion)return combatFocus(playerChinTarget(actor,head),enemyPosition,radius);
    this.center.copyFrom(actor.position);this.center.y+=STABLE_PLAYER_FOCUS_HEIGHT;return this.center;
  }
  snapshot(){return {...this.settings,stableFocusHeight:STABLE_PLAYER_FOCUS_HEIGHT};}
}

export function setupCameraFollowControls(follow,{doc=document,onChange=()=>{}}={}){
  const input=doc.getElementById('camera-follow-motion'),status=doc.getElementById('camera-follow-status');
  const sync=()=>{input.checked=follow.settings.followMotion;status.textContent=input.checked?'캐릭터의 머리와 모션을 따라갑니다.':'모션 흔들림 없이 캐릭터 중심을 따라갑니다.';};
  input.addEventListener('change',()=>{follow.update({followMotion:input.checked});sync();onChange();});sync();return {sync};
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
