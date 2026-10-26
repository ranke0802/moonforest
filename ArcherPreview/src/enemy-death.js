export const CORPSE_FADE_SECONDS=3;
export class EnemyDeath {
  constructor(){this.reset();}
  reset(){this.started=false;this.elapsed=0;}
  advance(dt){const first=!this.started;this.started=true;this.elapsed=Math.min(CORPSE_FADE_SECONDS,this.elapsed+Math.max(0,dt));return first;}
  get opacity(){return 1-this.elapsed/CORPSE_FADE_SECONDS;}
  get finished(){return this.elapsed>=CORPSE_FADE_SECONDS;}
}
