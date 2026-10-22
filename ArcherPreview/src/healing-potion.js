export const POTION={uses:3,amount:40,pulses:4,interval:1};

export class HealingPotion {
  constructor(){this.reset();}
  reset(){this.remaining=POTION.uses;this.cancel();}
  cancel(){this.pulsesLeft=0;this.elapsed=0;}
  get active(){return this.pulsesLeft>0;}
  canUse(hp,maxHp){return hp>0&&hp<maxHp&&this.remaining>0&&!this.active;}
  use(hp,maxHp){
    if(!this.canUse(hp,maxHp))return false;
    this.remaining--;this.pulsesLeft=POTION.pulses;this.elapsed=0;return true;
  }
  update(dt,hp,maxHp){
    const heals=[];
    if(hp<=0){this.cancel();return {hp,heals};}
    if(!this.active)return {hp,heals};
    this.elapsed+=Number.isFinite(dt)?Math.max(0,dt):0;
    while(this.active&&this.elapsed>=POTION.interval-1e-8){
      this.elapsed=Math.max(0,this.elapsed-POTION.interval);this.pulsesLeft--;
      const amount=Math.max(0,Math.min(POTION.amount,maxHp-hp));hp+=amount;
      if(amount>0)heals.push(amount);
    }
    if(!this.active)this.elapsed=0;
    return {hp,heals};
  }
}
