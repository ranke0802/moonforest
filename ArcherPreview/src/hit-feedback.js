import { Color3, Vector3 } from '@babylonjs/core';

export const PLAYER_STAGGER = .2;
export const BLOCK_STAGGER = 1;
const WHITE = Color3.White();
export function applyHitFlash(meshes, remaining, duration=.22) {
  const alpha=.72*Math.min(1,Math.max(0,remaining/duration));
  for(const mesh of meshes||[]){
    mesh.overlayColor=WHITE;mesh.overlayAlpha=alpha;mesh.renderOverlay=alpha>0;
  }
}

/** Short, bounded recoil of the actor; no changes to the source skeleton or clips. */
export class PlayerHitReaction {
  constructor(){this.reset();}
  reset(){this.remaining=0;this.flashRemaining=0;this.flashDuration=PLAYER_STAGGER;this.recoilDuration=PLAYER_STAGGER;this.distance=.28;this.direction=Vector3.Zero();}
  cancelRecoil(){this.remaining=0;}
  start(direction,{recoil=true,flashDuration=PLAYER_STAGGER,distance=.28}={}){
    this.direction.copyFrom(direction);this.direction.y=0;
    if(this.direction.lengthSquared()<1e-8)this.direction.set(0,0,-1);
    this.direction.normalize();this.remaining=recoil?this.recoilDuration:0;this.distance=distance;
    this.flashRemaining=this.flashDuration=flashDuration;
  }
  update(dt,actor){
    this.flashRemaining=Math.max(0,this.flashRemaining-Math.max(0,dt));
    const before=this.remaining;
    this.remaining=Math.max(0,before-Math.max(0,dt));
    // Exact eased displacement integrates to 28 cm, independent of frame rate.
    const distance=this.distance*((before/this.recoilDuration)**2-(this.remaining/this.recoilDuration)**2);
    if(distance>0)actor.position.addInPlace(this.direction.scale(distance));
    return distance;
  }
}
