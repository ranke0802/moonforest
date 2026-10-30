import {Vector3} from '@babylonjs/core';

export const CAMERA_LOWER_BETA=.25;
export const ARCHER_UPPER_BETA=1.48;
export const WARRIOR_UPPER_BETA=1.78;
export const UNRESTRICTED_UPPER_BETA=Math.PI-.035;
export const CAMERA_EYE_BELOW_CHIN=.35;

export function upwardFocusLift(camera,warrior=true){
  return warrior?Math.max(0,-CAMERA_EYE_BELOW_CHIN-camera.radius*Math.cos(camera.beta)):0;
}

export class CameraPitch {
  constructor(camera,{warrior=false,storage,key='moonforest-camera-upward-limit-v1'}={}){
    Object.assign(this,{camera,warrior,storage,key});this.settings={upwardLimited:true};
    this.adjusted=new Vector3();this.next=new Vector3();
    try{const saved=JSON.parse(storage?.getItem(key)??'null');if(typeof saved?.upwardLimited==='boolean')this.settings.upwardLimited=saved.upwardLimited;}catch{/* Session defaults also work with unavailable storage. */}
    this.apply();
  }
  setWarrior(value){this.warrior=!!value;this.apply();}
  update({upwardLimited}){
    if(typeof upwardLimited!=='boolean')throw new TypeError('Invalid upward view limit');
    this.settings.upwardLimited=upwardLimited;this.apply();
    try{this.storage?.setItem(this.key,JSON.stringify(this.settings));}catch{/* Keep the current session preference. */}
  }
  apply(){
    const c=this.camera;c.lowerBetaLimit=CAMERA_LOWER_BETA;c.upperBetaLimit=this.warrior?(this.settings.upwardLimited?WARRIOR_UPPER_BETA:UNRESTRICTED_UPPER_BETA):ARCHER_UPPER_BETA;
    c.beta=Math.max(c.lowerBetaLimit,Math.min(c.upperBetaLimit,c.beta));
  }
  follow(baseFocus,dt,{snap=false}={}){
    this.apply();const c=this.camera,lift=upwardFocusLift(c,this.warrior);
    this.adjusted.copyFrom(baseFocus);this.adjusted.y+=lift;
    if(snap)this.next.copyFrom(this.adjusted);else Vector3.LerpToRef(c.target,this.adjusted,1-Math.exp(-10*Math.max(0,dt)),this.next);
    // Increasing pitch/radius can lower the eye in a single input event. The
    // minimum pivot height must not wait for follow smoothing, even on dt=0.
    // Returning to normal angles keeps the existing smooth descent. No cave
    // wall/ceiling height sample is used to lift the camera outside the room.
    if(lift>0)this.next.y=Math.max(this.next.y,this.adjusted.y);
    c.setTarget(this.next,false,false,true);
    return this.next;
  }
  snapshot(){return {warrior:this.warrior,upwardLimited:this.settings.upwardLimited,beta:this.camera.beta,lowerBeta:this.camera.lowerBetaLimit,upperBeta:this.camera.upperBetaLimit,lift:upwardFocusLift(this.camera,this.warrior)};}
}

export function setupCameraPitchControls(pitch,{doc=document,onChange=()=>{}}={}){
  const input=doc.getElementById('camera-upward-limited'),status=doc.getElementById('camera-pitch-status');
  const sync=()=>{input.checked=pitch.settings.upwardLimited;input.disabled=!pitch.warrior;status.textContent=pitch.warrior?(pitch.settings.upwardLimited?'위쪽 시야 제한을 사용합니다.':'거의 수직으로 올려다볼 수 있습니다.'):'전사 카메라에 적용됩니다.';};
  input.addEventListener('change',()=>{pitch.update({upwardLimited:input.checked});sync();onChange();});sync();return {sync};
}
