import { Color3, Vector3 } from '@babylonjs/core';

export const PLAYER_STAGGER = .2;
export const PLAYER_BLOCK_GROGGY = 1.5;
const WHITE = Color3.White();
const flashValues=new WeakMap();
export function canInlineHitFlash(mesh){
  const material=mesh?.material;
  return mesh?.metadata?.elenaInlineFlash===true&&mesh.visibility===1&&material?.alpha===1
    &&!material.needAlphaBlendingForMesh(mesh)&&!material.needAlphaTestingForMesh(mesh);
}
export function applyHitFlash(meshes, remaining, duration=.22) {
  if(!meshes)return;
  const alpha=.72*Math.min(1,Math.max(0,remaining/duration));
  if(flashValues.get(meshes)===alpha){
    // An opacity change can require the original overlay even at the same flash time.
    if(alpha>0)for(const mesh of meshes)if(mesh.metadata?.elenaInlineFlash)mesh.renderOverlay=!canInlineHitFlash(mesh);
    return;
  }
  flashValues.set(meshes,alpha);
  for(const mesh of meshes||[]){
    // The one-pass outline shader reads the parent's flash; avoid another overlay draw.
    if(mesh.metadata?.moonforestOutline)continue;
    mesh.overlayColor=WHITE;mesh.overlayAlpha=alpha;mesh.renderOverlay=alpha>0&&!canInlineHitFlash(mesh);
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
