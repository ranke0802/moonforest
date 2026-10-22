import { Vector3 } from '@babylonjs/core';
export const PLAYER_STRIKES={
  attack:[{id:'thrust',from:.55,to:1.02,damage:18},{id:'follow-cut',from:1.08,to:1.65,damage:20}],
  slash:[{id:'cut',from:.38,to:.80,damage:20}],
  // Only the descending blade deals the heavy hit. Landing/recovery are inactive.
  judgment:[{id:'jump-cut',from:.94,to:1.12,damage:64,heavy:true,burst:[20,20,24],interval:.055}],
  shieldPush:[{id:'shield-push',from:1.10,to:1.15,damage:10,stun:1.5}],
};
/** Clip-time sweeps are clipped to the strike window, including slow frames at 2x. */
export class PlayerStrikeSampler{
  reset(){this.last=null;}
  sample(result,sword,shield,multiHit=true){
    if(result.actionId==null||result.staggered||result.state==='dodge'){this.reset();return null;}
    const node=result.state==='shieldPush'?shield:sword;
    if(!node){this.reset();return null;}
    node.computeWorldMatrix(true);
    const local=result.state==='shieldPush'?[[-.55,0,.16],[.55,0,.16]]:[[-.002,.405,0],[-.002,-.951,0]];
    const blade=local.map(p=>Vector3.TransformCoordinates(Vector3.FromArray(p),node.getWorldMatrix()).asArray());
    const last=this.last?.actionId===result.actionId?this.last:null,from=last?.time??result.clipTime;
    const strikes=!multiHit&&result.state==='attack'?[{id:'thrust-cut',from:.55,to:1.65,damage:18}]:PLAYER_STRIKES[result.state];
    const windows=strikes?.filter(w=>result.clipTime>=w.from&&from<=w.to)||[];
    const at=time=>last&&result.clipTime>from?blade.map((p,k)=>p.map((v,j)=>last.blade[k][j]+(v-last.blade[k][j])*Math.max(0,Math.min(1,(time-from)/(result.clipTime-from))))):blade;
    this.last={actionId:result.actionId,time:result.clipTime,blade};
    const contacts=windows.map(window=>({window,blade:at(Math.min(result.clipTime,window.to)),previous:at(Math.max(from,window.from))}));
    return {actionId:result.actionId,elapsed:result.actionElapsed??result.clipTime,blade,previous:null,...contacts[0],contacts,
      bladeRadius:result.state==='shieldPush'?.06:.045};
  }
}

// OBB intersection in the shield's real mesh coordinates; +Z is the visible face.
export function segmentBoxHit(a,b,min,max){
  let lo=0,hi=1;
  for(let k=0;k<3;k++){
    const d=b[k]-a[k];if(Math.abs(d)<1e-9){if(a[k]<min[k]||a[k]>max[k])return false;continue;}
    let x=(min[k]-a[k])/d,y=(max[k]-a[k])/d;if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)return false;
  }return true;
}
export function shieldIntercepts(from,to,shield){
  if(!shield)return false;shield.computeWorldMatrix(true);
  const inverse=shield.getWorldMatrix().clone().invert(),a=Vector3.TransformCoordinates(from,inverse).asArray(),b=Vector3.TransformCoordinates(to,inverse).asArray();
  // Rear contacts do not count as a block, and the shield must actually lie in the path.
  if(a[2]<.10||b[2]>a[2])return false;
  return segmentBoxHit(a,b,[-.69,-1.04,-.03],[.69,1.04,.42]);
}
