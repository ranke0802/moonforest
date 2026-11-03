export const PASSIVE_HEALTH_REGEN=Object.freeze({amount:5,interval:2});

// Uses active simulation time only. At most one pulse can be emitted by one
// frame, so resuming after a long suspension cannot replay a bank of heals.
export class PassiveHealthRegen {
  constructor(){this.reset();}
  reset(){this.elapsed=0;}
  update(dt,hp,maxHp,active=true){
    if(!active||!Number.isFinite(hp)||!Number.isFinite(maxHp)||hp<=0||hp>=maxHp){this.reset();return 0;}
    if(!Number.isFinite(dt)||dt<=0)return 0;
    this.elapsed+=dt;
    if(this.elapsed<PASSIVE_HEALTH_REGEN.interval-1e-8)return 0;
    // Keep this frame's fraction without replaying whole missed intervals.
    this.elapsed=this.elapsed<PASSIVE_HEALTH_REGEN.interval?0:this.elapsed%PASSIVE_HEALTH_REGEN.interval;
    return Math.min(PASSIVE_HEALTH_REGEN.amount,maxHp-hp);
  }
}
