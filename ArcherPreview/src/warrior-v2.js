import { normalizeAttackSpeed } from './controller.js';
export const V2_ATTACKS = ['slash', 'attack', 'judgment'];
export const V2_COMBO = ['slash', 'attack'];
export const V2_ATTACK_BASE_RATE = 1.8;
export const V2_HOLD_SECONDS = .45;
export const V2_COMBO_GRACE = .8;
export const V2_LABELS = {idle:'대기',run:'달리기',attack:'베고 찌르기 · 2타',slash:'한손 베기 · 1타',judgment:'심판의 검 · 3타',shieldPush:'방패 밀치기'};

export class WarriorV2Controller {
  constructor({durations,speeds={}}) {
    this.durations=durations;this.runSpeed=speeds.run||4.4371;
    this.attackSpeed=V2_ATTACK_BASE_RATE;this.state='idle';this.time=0;this.action=null;this.serial=0;
    this.held=false;this.holdTime=0;this.holdTriggered=false;this.lastAttack=null;this.attackIndex=0;this.comboRemaining=0;this.dead=false;
    this.staggerRemaining=0;this.hitPose=null;this.queuedAttack=null;
  }
  setAttackSpeed(value){this.attackSpeed=normalizeAttackSpeed(value)*V2_ATTACK_BASE_RATE;}
  startAttack(kind) {
    kind??=V2_COMBO[this.attackIndex++%V2_COMBO.length];
    this.lastAttack=kind;this.comboRemaining=0;this.action={id:++this.serial,state:kind,time:0,elapsed:0,hitStop:0};
  }
  releaseHold(){this.held=false;this.holdTime=0;this.holdTriggered=false;}
  cancelAttackInput(){this.releaseHold();this.queuedAttack=null;}
  cancelAttack(){this.action=null;this.cancelAttackInput();this.attackIndex=0;this.comboRemaining=0;}
  requestMovement(){
    // Movement is sampled when combat finishes. It never interrupts an attack or charge.
    if(!this.action&&!this.held&&!this.queuedAttack){this.attackIndex=0;this.comboRemaining=0;}
    return false;
  }
  pauseOnImpact(duration){if(this.action)this.action.hitStop=Math.max(this.action.hitStop,duration);}
  hit(duration=.26){
    this.hitPose={state:this.action?.state??this.state,clipTime:this.action?.time??this.time};
    this.cancelAttack();this.staggerRemaining=duration;
  }
  attack(){
    if(this.dead||this.held)return false;
    if(this.action||this.staggerRemaining>0){if(this.queuedAttack!=='judgment')this.queuedAttack='normal';}
    else this.startAttack();
    return true;
  }
  setAttackHeld(held){
    if(held){
      if(this.held)return true;
      if(this.dead)return false;
      this.held=true;this.holdTime=0;this.holdTriggered=false;
      if(this.queuedAttack==='normal')this.queuedAttack=null;
    }else{
      // A short press fires on release; a completed hold never also fires a normal attack.
      const tap=this.held&&!this.holdTriggered;this.releaseHold();
      if(tap)this.attack();
    }
    return true;
  }
  shieldPush(){if(this.action||this.staggerRemaining>0)return false;this.cancelAttackInput();this.attackIndex=0;this.startAttack('shieldPush');return true;}
  update(dt,input={}) {
    dt=Number.isFinite(dt)?Math.max(0,dt):0;const magnitude=Math.min(1,Math.hypot(input.x||0,input.y||0));const previous=this.state;
    const frameDt=dt;let readyAt=0;
    // A fresh press is accepted during recovery or hit-stun. Charging runs alongside
    // the current clip; only one next action is buffered, regardless of tap spam.
    if(this.held&&!this.holdTriggered){
      readyAt=Math.max(0,V2_HOLD_SECONDS-this.holdTime);
      this.holdTime=Math.min(V2_HOLD_SECONDS,this.holdTime+dt);
      if(this.holdTime>=V2_HOLD_SECONDS-1e-8){this.holdTriggered=true;this.queuedAttack='judgment';}
    }
    if(this.staggerRemaining>0){
      const consumed=Math.min(dt,this.staggerRemaining);this.staggerRemaining-=consumed;dt-=consumed;
      if(this.staggerRemaining>1e-8)return {...this.hitPose,moving:false,speed:0,loop:false,actionId:null,staggered:true,chargeProgress:this.chargeProgress,events:[]};
      this.staggerRemaining=0;this.hitPose=null;
    }
    let idleDt=dt;
    let hitStopped=false;
    if(this.action){
      this.action.elapsed+=dt;
      const stopped=Math.min(dt,this.action.hitStop);this.action.hitStop-=stopped;hitStopped=stopped>0;
      if(hitStopped)dt=0; // Deliver the final pulse before advancing past the contact pose, even at low FPS.
      const rate=this.action.state==='shieldPush'?1:this.attackSpeed;
      const left=Math.max(0,(this.durations[this.action.state]-this.action.time)/rate);
      if(dt<left){this.action.time+=dt*rate;idleDt=0;}
      else {idleDt=dt-left;this.comboRemaining=V2_COMBO.includes(this.action.state)?V2_COMBO_GRACE:0;this.action=null;}
    }
    if(!this.action&&this.queuedAttack){
      const kind=this.queuedAttack;this.queuedAttack=null;
      const available=Math.max(0,idleDt-Math.max(0,readyAt-(frameDt-idleDt)));
      if(kind==='judgment')this.attackIndex=0;
      this.startAttack(kind==='normal'?undefined:kind);
      const duration=this.durations[this.action.state];
      this.action.elapsed=available;this.action.time=Math.min(duration,available*this.attackSpeed);idleDt=0;
      if(this.action.time>=duration){idleDt=Math.max(0,available-duration/this.attackSpeed);this.comboRemaining=kind==='normal'?V2_COMBO_GRACE:0;this.action=null;}
    }
    if(!this.action){this.comboRemaining=Math.max(0,this.comboRemaining-idleDt);if(!this.comboRemaining)this.attackIndex=0;}
    this.state=this.action?.state||(this.held&&!this.holdTriggered?'idle':magnitude>.08?'run':'idle');if(this.state!==previous)this.time=0;
    if(!this.action)this.time=(this.time+idleDt*(this.state==='run'?magnitude:1))%this.durations[this.state];
    return {state:this.state,clipTime:this.action?.time??this.time,moving:this.state==='run',speed:this.state==='run'?this.runSpeed*magnitude:0,
      loop:!this.action,actionId:this.action?.id??null,actionElapsed:this.action?.elapsed??0,hitStopped,chargeProgress:this.chargeProgress,
      blendDuration:this.state==='idle'?.24:.16,events:[]};
  }
  get chargeProgress(){return this.queuedAttack==='judgment'?1:this.held&&!this.holdTriggered?this.holdTime/V2_HOLD_SECONDS:0;}
}
