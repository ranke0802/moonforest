import { normalizeAttackSpeed } from './controller.js';
export const V2_ATTACKS = ['slash', 'attack', 'judgment'];
export const V2_LABELS = {idle:'대기',run:'달리기',attack:'찌르기·베기',slash:'한손 베기',judgment:'심판의 검',shieldPush:'방패 밀치기'};

export class WarriorV2Controller {
  constructor({durations,speeds={},random=Math.random}) {
    this.durations=durations;this.runSpeed=speeds.run||4.4371;this.random=random;
    this.attackSpeed=1;this.state='idle';this.time=0;this.action=null;this.serial=0;
    this.held=false;this.queued=false;this.lastAttack=null;this.attackChoice='sequence';this.attackIndex=0;this.dead=false;
  }
  setAttackSpeed(value){this.attackSpeed=normalizeAttackSpeed(value);}
  setAttackChoice(value){this.attackChoice=V2_ATTACKS.includes(value)?value:'sequence';}
  startAttack(kind) {
    if(!kind){
      kind=this.attackChoice==='sequence'?V2_ATTACKS[this.attackIndex++%V2_ATTACKS.length]:this.attackChoice;
      this.lastAttack=kind;
    }
    this.action={id:++this.serial,state:kind,time:0};this.queued=false;
  }
  attack(){if(this.action)this.queued=true;else this.startAttack();return true;}
  setAttackHeld(held){this.held=Boolean(held);if(held&&!this.action)this.startAttack();return true;}
  shieldPush(){if(this.action)return false;this.startAttack('shieldPush');return true;}
  update(dt,input={}) {
    dt=Number.isFinite(dt)?Math.max(0,dt):0;const magnitude=Math.min(1,Math.hypot(input.x||0,input.y||0));const previous=this.state;
    if(this.action){
      let remaining=dt;
      while(this.action&&remaining>0){
        const rate=this.action.state==='shieldPush'?1:this.attackSpeed;
        const left=(this.durations[this.action.state]-this.action.time)/rate;
        if(remaining<left){this.action.time+=remaining*rate;break;}
        remaining-=Math.max(0,left);
        if(this.held||this.queued)this.startAttack();else this.action=null;
      }
    }
    this.state=this.action?.state||(magnitude>.08?'run':'idle');if(this.state!==previous)this.time=0;
    if(!this.action)this.time=(this.time+dt*(this.state==='run'?magnitude:1))%this.durations[this.state];
    return {state:this.state,clipTime:this.action?.time??this.time,moving:this.state==='run',speed:this.state==='run'?this.runSpeed*magnitude:0,
      loop:!this.action,actionId:this.action?.id??null,blendDuration:this.state==='idle'?.24:.16,events:[]};
  }
}
