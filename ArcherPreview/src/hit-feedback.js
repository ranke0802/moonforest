import { Color3, Vector3 } from '@babylonjs/core';

export const PLAYER_STAGGER = .26;
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
  reset(){this.remaining=0;this.direction=Vector3.Zero();}
  start(direction){
    this.direction.copyFrom(direction);this.direction.y=0;
    if(this.direction.lengthSquared()<1e-8)this.direction.set(0,0,-1);
    this.direction.normalize();this.remaining=PLAYER_STAGGER;
  }
  update(dt,actor){
    const before=this.remaining;
    this.remaining=Math.max(0,before-Math.max(0,dt));
    // Exact eased displacement integrates to 28 cm, independent of frame rate.
    const distance=.28*((before/PLAYER_STAGGER)**2-(this.remaining/PLAYER_STAGGER)**2);
    if(distance>0)actor.position.addInPlace(this.direction.scale(distance));
    return distance;
  }
}
