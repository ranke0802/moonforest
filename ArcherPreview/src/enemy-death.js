export const CORPSE_FADE_SECONDS=5;
export const MOURNING_DEATH_HOLD_SECONDS=.65;
export class EnemyDeath {
  constructor(){this.reset();}
  reset({holdPose=false,clipSeconds=5.2,holdSeconds=MOURNING_DEATH_HOLD_SECONDS}={}){
    this.started=false;this.elapsed=0;this.holdPose=Boolean(holdPose);
    this.duration=this.holdPose?Math.max(.001,Number.isFinite(clipSeconds)?clipSeconds:5.2)+Math.max(0,Number.isFinite(holdSeconds)?holdSeconds:MOURNING_DEATH_HOLD_SECONDS):CORPSE_FADE_SECONDS;
  }
  advance(dt){const first=!this.started;this.started=true;this.elapsed=Math.min(this.duration,this.elapsed+Math.max(0,Number.isFinite(dt)?dt:0));return first;}
  // An opaque death never enters transparent rendering, including its last
  // frame. Its owner disables the complete actor once the pose hold ends.
  get opacity(){return this.holdPose?1:1-this.elapsed/CORPSE_FADE_SECONDS;}
  get finished(){return this.started&&this.elapsed>=this.duration;}
}
