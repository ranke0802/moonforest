import { normalizeAttackSpeed } from './controller.js';
import {GreatAttackCast,GREAT_ATTACK_CHARGE_SECONDS} from './v03/great-attack.js';
import { JUDGMENT_CONTACT_END } from './player-strike-timings.js';
export const V2_ATTACKS = ['slash', 'attack', 'judgment'];
export const V2_COMBO = ['slash', 'attack'];
export const V2_ATTACK_BASE_RATE = 1.8;
export const V2_HOLD_SECONDS = .45;
export const V2_SHIELD_HOLD_SECONDS = .2;
// The authored raised, forward-facing shield pose before the pullback and push.
export const V2_SHIELD_GUARD_CLIP_TIME = .5;
export const V2_SHIELD_GUARD_COST = 5;
export const V2_COMBO_GRACE = .8;
export const V2_STAMINA_MAX=100;
export const V2_STAMINA_REGEN=15;
export const V2_SPRINT_COST=5;
export const V2_SPRINT_MULTIPLIER=1.8;
export const V2_STAMINA_COST=Object.freeze({slash:10,attack:10,judgment:30,shieldPush:20,dodge:10});
// Share the real blade window; recovery starts only once all heavy contacts
// have finished, independent of animation playback speed or a missed swing.
export const V2_JUDGMENT_RECOVERY_START=JUDGMENT_CONTACT_END;
export const V2_LABELS = {idle:'대기',run:'달리기',attack:'베고 찌르기 · 2타',slash:'한손 베기 · 1타',judgment:'심판의 검 · 3타',shieldPush:'방패 밀치기',dodge:'회피 구르기',knockdown:'넉다운',getUp:'기상'};
export const V2_MOTION_DEFAULTS = {idle:1,run:1,attack:1.6,slash:1,judgment:1,shieldPush:1,dodge:1.7,knockdown:1,getUp:1};

export class WarriorV2Controller {
  constructor({durations,speeds={},holdNow=null,staminaEnabled=true}) {
    this.durations=durations;this.runSpeed=speeds.run||4.4371;
    this.attackSpeed=V2_ATTACK_BASE_RATE;this.state='idle';this.time=0;this.action=null;this.serial=0;
    this.held=false;this.holdTime=0;this.holdTriggered=false;this.holdNow=holdNow;this.holdStartedAt=null;this.lastAttack=null;this.attackIndex=0;this.comboRemaining=0;this.dead=false;
    this.staggerRemaining=0;this.staggerLocked=false;this.hitPose=null;this.queuedAttack=null;this.queuedChargeProgress=0;
    this.shieldHeld=false;this.shieldHoldTime=0;this.shieldStartedAt=null;this.shieldExhausted=false;
    this.staminaEnabled=staminaEnabled;this.maxStamina=V2_STAMINA_MAX;this.stamina=this.maxStamina;this.staminaRejectSerial=0;
    this.sprintHeld=false;this.sprinting=false;this.sprintExhausted=false;this.sprintInitialSeconds=null;this.pendingSprint=null;this.staminaSpent=false;
    this.sprintRecord={sprintSeconds:0,idleSeconds:0,allowRestore:false};
    this.motionSpeeds={...V2_MOTION_DEFAULTS};
    this.walkSpeedFactor=1;this.sprintSpeedFactor=V2_SPRINT_MULTIPLIER;
    // Tap chain and per-step stamina override (an edition may lengthen the chain).
    this.combo=V2_COMBO;this.comboCost=null;this.greatAttackLevel=0;
  }
  setMovementSpeed({walk=1,sprint=V2_SPRINT_MULTIPLIER}={}){this.walkSpeedFactor=Number.isFinite(walk)?Math.max(.5,Math.min(2,walk)):1;this.sprintSpeedFactor=Number.isFinite(sprint)?Math.max(.5,Math.min(3,sprint)):V2_SPRINT_MULTIPLIER;}
  setAttackSpeed(value){this.attackSpeed=normalizeAttackSpeed(value)*V2_ATTACK_BASE_RATE;}
  setMotionSpeed(state,value){if(state in this.motionSpeeds)this.motionSpeeds[state]=normalizeAttackSpeed(value);}
  playbackRate(state){return (this.motionSpeeds[state]??1)*(V2_ATTACKS.includes(state)?this.attackSpeed:1);}
  canSpendStamina(kind,cost=V2_STAMINA_COST[kind]??0){return !this.staminaEnabled||this.stamina+1e-8>=cost;}
  spendStamina(kind,cost=V2_STAMINA_COST[kind]??0){
    if(!this.canSpendStamina(kind,cost)){this.staminaRejectSerial++;return false;}
    if(this.staminaEnabled&&cost){this.stamina=Math.max(0,this.stamina-cost);this.staminaSpent=true;}
    return true;
  }
  restoreStamina(seconds){if(this.staminaEnabled&&seconds>0)this.stamina=Math.min(this.maxStamina,this.stamina+V2_STAMINA_REGEN*(this.staminaRecoveryScale??1)*seconds);}
  restoreJudgmentRecovery(from,to,rate){if(rate>0)this.restoreStamina(Math.max(0,to-Math.max(from,V2_JUDGMENT_RECOVERY_START))/rate);}
  resetStamina(){this.cancelShieldInput();this.stamina=this.maxStamina;this.staminaSpent=false;this.setSprintHeld(false);}
  setSprintHeld(held,initialFrameSeconds){
    if(held){if(!this.sprintHeld){this.sprintHeld=true;this.sprintInitialSeconds=Number.isFinite(initialFrameSeconds)?Math.max(0,initialFrameSeconds):null;}}
    else{this.sprintHeld=false;this.sprinting=false;this.sprintExhausted=false;this.sprintInitialSeconds=null;this.pendingSprint=null;}
  }
  commitSprintMovement(requestedDistance,actualDistance){
    const pending=this.pendingSprint;this.pendingSprint=null;if(!pending)return;
    const requested=Math.max(0,Number.isFinite(requestedDistance)?requestedDistance:0),actual=Math.max(0,Number.isFinite(actualDistance)?actualDistance:0);
    if(requested<=1e-8||actual<=1e-8){this.sprinting=false;if(pending.allowRestore)this.restoreStamina(pending.idleSeconds);return;}
    const portion=Math.min(1,actual/requested);this.sprinting=true;
    if(this.staminaEnabled){
      this.stamina=Math.max(0,this.stamina-V2_SPRINT_COST*pending.sprintSeconds*portion);
      if(this.stamina<=1e-8){this.stamina=0;this.sprintExhausted=true;this.staminaRejectSerial++;}
    }
  }
  startAttack(kind,chargeProgress=0) {
    if(this.captured||this.knockedDown||this.groggy||this.shieldPending||this.guarding)return false;
    const normal=kind==null;kind??=this.combo[this.attackIndex%this.combo.length];
    if(!this.spendStamina(kind,normal?this.comboCost?.[kind]:undefined))return false;
    if(normal)this.attackIndex++;
    this.lastAttack=kind;this.comboRemaining=0;this.action={id:++this.serial,state:kind,time:0,elapsed:0,hitStop:0};
    if(!normal&&kind==='judgment'&&Number.isInteger(this.greatAttackLevel)&&this.greatAttackLevel>0){
      // A heavy buffered behind another action can already have received its keyup.
      this.action.greatAttack=new GreatAttackCast(this.serial,this.greatAttackLevel,this.held&&this.holdTriggered,chargeProgress);
    }
    return true;
  }
  releaseHold(){this.held=false;this.holdTime=0;this.holdTriggered=false;this.holdStartedAt=null;}
  heavyIntent(){return {held:this.held,holdTime:this.holdTime,holdTriggered:this.holdTriggered,holdStartedAt:this.holdStartedAt,queuedAttack:this.queuedAttack==='judgment'?'judgment':null,queuedChargeProgress:this.queuedChargeProgress};}
  heldSeconds(){
    if(!this.holdNow||!Number.isFinite(this.holdStartedAt))return null;
    const now=this.holdNow();return Number.isFinite(now)?Math.max(0,(now-this.holdStartedAt)/1000):null;
  }
  syncHeldCharge(dt=0){
    const trained=this.greatAttackLevel>0,limit=trained?GREAT_ATTACK_CHARGE_SECONDS:V2_HOLD_SECONDS;
    if(!this.held||this.holdTime>=limit)return 0;
    const before=this.holdTime,physical=this.heldSeconds(),advanced=before+dt;
    // Starfall uses the physical press clock through slow motion and frame stalls.
    const elapsed=trained?(physical??advanced):Math.max(advanced,physical??0);
    const missed=Math.max(0,elapsed-advanced);
    const readyAt=this.holdTriggered?0:Math.max(0,V2_HOLD_SECONDS-before-missed);
    this.holdTime=Math.min(limit,Math.max(before,elapsed));
    if(!this.holdTriggered&&this.holdTime>=V2_HOLD_SECONDS-1e-8){this.holdTriggered=true;this.queuedAttack='judgment';}
    if(trained&&this.holdTriggered){
      const progress=this.holdTime/GREAT_ATTACK_CHARGE_SECONDS;
      if(this.queuedAttack==='judgment')this.queuedChargeProgress=progress;
      const cast=this.action?.greatAttack;
      if(cast?.charging){cast.chargeProgress=progress;cast.progress=progress;}
    }
    return readyAt;
  }
  cancelAttackInput(){
    if(this.action?.greatAttack?.charging)this.action=null;
    this.releaseHold();this.queuedAttack=null;this.queuedChargeProgress=0;
  }
  cancelAttack(){this.cancelShieldInput();this.action=null;this.cancelAttackInput();this.attackIndex=0;this.comboRemaining=0;}
  requestMovement(){
    // Movement is sampled when combat finishes. It never interrupts an attack or charge.
    if(!this.action&&!this.held&&!this.queuedAttack){this.attackIndex=0;this.comboRemaining=0;}
    return false;
  }
  pauseOnImpact(duration){if(this.action)this.action.hitStop=Math.max(this.action.hitStop,duration);}
  deflectSword(actionId){
    if(!this.action||this.action.id!==actionId||!V2_ATTACKS.includes(this.action.state))return false;
    const duration=.16;
    if(!this.hit(duration,{force:true}))return false;
    this.hitPose.deflectFrom=this.hitPose.clipTime;
    return true;
  }
  get groggy(){return this.staggerLocked&&this.staggerRemaining>0;}
  hit(duration=.2,{force=false,reason}={}){
    if(this.captured||this.knockedDown)return false;
    // Further damage can reduce HP, but cannot shorten a block's control lock.
    if(this.groggy&&reason!=='blocked')return false;
    if(!force&&['judgment','dodge'].includes(this.action?.state))return false;
    const buffered=!force&&reason!=='blocked'?this.heavyIntent():null;
    this.hitPose={state:this.action?.state??this.state,clipTime:this.action?.time??this.time};
    this.cancelAttack();this.staggerRemaining=Math.max(this.groggy?this.staggerRemaining:0,duration);this.staggerLocked=reason==='blocked';
    // Keep the physical hold and completed heavy through ordinary recovery.
    // Forced knockdown/capture, blocked attacks and lost focus still cancel it.
    if(buffered)Object.assign(this,buffered);
    return true;
  }
  attack(){
    if(this.dead||this.captured||this.knockedDown||this.groggy||this.held)return false;
    if(this.action||this.staggerRemaining>0||this.shieldHeld){if(this.queuedAttack!=='judgment')this.queuedAttack='normal';}
    else return this.startAttack();
    return true;
  }
  setAttackHeld(held){
    if(held){
      if(this.held)return true;
      if(this.dead||this.captured||this.knockedDown||this.groggy)return false;
      this.held=true;this.holdTime=0;this.holdTriggered=false;this.holdStartedAt=this.holdNow?.()??null;
      if(this.queuedAttack==='normal')this.queuedAttack=null;
    }else{
      // A short press fires on release; a completed hold never also fires a normal attack.
      this.syncHeldCharge();const tap=this.held&&!this.holdTriggered;
      if(this.held&&this.holdTriggered)this.action?.greatAttack?.release();
      this.releaseHold();
      if(tap)this.attack();
    }
    return true;
  }
  interruptWith(kind){
    if(this.dead||this.captured||this.knockedDown||this.groggy)return false;
    // Repeated defense input must not reset its clip, travel, or hit window.
    // Ignore it entirely rather than buffering another cast after completion.
    if(this.action?.state===kind)return false;
    if(!this.canSpendStamina(kind)){this.staminaRejectSerial++;return false;}
    const intent=this.heavyIntent();
    this.cancelAttack();Object.assign(this,intent);this.staggerRemaining=0;this.hitPose=null;this.startAttack(kind);return true;
  }
  shieldPush(){return this.shieldHeld?false:this.interruptWith('shieldPush');}
  get shieldPending(){return this.action?.shieldMode==='pending';}
  get guarding(){return this.action?.shieldMode==='guard';}
  shieldHeldSeconds(){
    if(!this.holdNow||!Number.isFinite(this.shieldStartedAt))return 0;
    const now=this.holdNow();return Number.isFinite(now)?Math.max(0,(now-this.shieldStartedAt)/1000):0;
  }
  syncShieldHold(dt=0){
    if(!this.shieldHeld||(!this.shieldPending&&!this.guarding))return;
    const before=this.shieldHoldTime;
    this.shieldHoldTime=Math.max(before+dt,this.shieldHeldSeconds());
    if(this.shieldHoldTime>=V2_SHIELD_HOLD_SECONDS-1e-8)this.action.shieldMode='guard';
    const seconds=Math.max(0,this.shieldHoldTime-V2_SHIELD_HOLD_SECONDS)-Math.max(0,before-V2_SHIELD_HOLD_SECONDS);
    if(this.staminaEnabled&&seconds>0){
      this.staminaSpent=true;this.stamina=Math.max(0,this.stamina-V2_SHIELD_GUARD_COST*seconds);
      if(this.stamina<=1e-8){this.stamina=0;this.shieldExhausted=true;this.staminaRejectSerial++;this.action=null;}
    }
  }
  cancelShieldInput(){
    if(this.shieldPending||this.guarding)this.action=null;
    this.shieldHeld=false;this.shieldHoldTime=0;this.shieldStartedAt=null;this.shieldExhausted=false;
  }
  setShieldHeld(held){
    if(held){
      if(this.shieldHeld)return !this.shieldExhausted;
      if(this.dead||this.captured||this.knockedDown||this.groggy||this.action?.state==='shieldPush')return false;
      // Own the physical press even when empty, so the input owner delivers its release.
      if(this.staminaEnabled&&this.stamina<=1e-8){this.shieldHeld=true;this.shieldExhausted=true;this.staminaRejectSerial++;return true;}
      const intent=this.heavyIntent();this.cancelAttack();Object.assign(this,intent);
      this.shieldHeld=true;this.shieldStartedAt=this.holdNow?.()??null;this.staggerRemaining=0;this.hitPose=null;
      this.action={id:++this.serial,state:'shieldPush',time:0,elapsed:0,hitStop:0,shieldMode:'pending'};
    }else{
      if(!this.shieldHeld)return true;
      // Classify using physical time even when release arrives before another frame.
      this.syncShieldHold();
      const tap=this.shieldPending&&!this.dead&&!this.captured&&!this.knockedDown&&!this.groggy;
      if(tap&&this.spendStamina('shieldPush'))delete this.action.shieldMode;
      else if(this.shieldPending||this.guarding)this.action=null;
      this.shieldHeld=false;this.shieldHoldTime=0;this.shieldStartedAt=null;this.shieldExhausted=false;
    }
    return true;
  }
  dodge(){return this.interruptWith('dodge');}
  capture(){
    this.capturePose={state:this.action?.state??this.state,clipTime:this.action?.time??this.time};
    this.cancelAttack();this.setSprintHeld(false);this.staggerRemaining=0;this.staggerLocked=false;this.hitPose=null;this.captured=true;
  }
  releaseCapture(){this.captured=false;this.capturePose=null;this.cancelAttack();this.staggerRemaining=0;this.staggerLocked=false;this.hitPose=null;this.state='idle';this.time=0;}
  get knockedDown(){return ['knockdown','getUp'].includes(this.action?.state);}
  knockdown({landed=false}={}){
    if(this.dead||this.captured||this.knockedDown)return false;
    this.cancelAttack();this.setSprintHeld(false);this.staggerRemaining=0;this.staggerLocked=false;this.hitPose=null;
    // A thrown character has already fallen in flight; enter the grounded part.
    this.action={id:++this.serial,state:'knockdown',time:landed?this.durations.knockdown*.55:0,elapsed:0,hitStop:0};
    this.state='knockdown';return true;
  }
  update(dt,input={}) {
    this.pendingSprint=null;this.sprinting=false;
    if(this.captured)return {...this.capturePose,captured:true,moving:false,speed:0,loop:false,actionId:null,chargeProgress:0,events:[]};
    dt=Number.isFinite(dt)?Math.max(0,dt):0;const magnitude=Math.min(1,Math.hypot(input.x||0,input.y||0));const previous=this.state;
    const alive=!this.dead&&input.alive!==false,spentAtStart=this.staminaSpent,sprintInitial=this.sprintInitialSeconds;this.staminaSpent=false;this.sprintInitialSeconds=null;
    if(!alive){if(this.action?.greatAttack)this.cancelAttack();this.cancelShieldInput();this.setSprintHeld(false);}
    if(this.knockedDown){
      let remaining=dt;
      while(this.knockedDown){
        const a=this.action,rate=this.playbackRate(a.state),left=(this.durations[a.state]-a.time)/rate;
        if(remaining<left){a.time+=remaining*rate;remaining=0;break;}
        remaining-=left;
        if(a.state==='knockdown')this.action={id:++this.serial,state:'getUp',time:0,elapsed:0,hitStop:0};
        else this.action=null;
      }
      if(this.action){if(alive&&!spentAtStart)this.restoreStamina(dt);this.state=this.action.state;return {state:this.state,clipTime:this.action.time,knockedDown:true,moving:false,speed:0,loop:false,actionId:null,chargeProgress:0,blendDuration:this.state==='getUp'?.18:.08,events:[]};}
      this.state='idle';this.time=0;dt=remaining;
    }
    const frameDt=dt;let rollFrom=null,rollTo=null;
    // A fresh press is accepted during recovery or hit-stun. Charging runs alongside
    // the current clip; only one next action is buffered, regardless of tap spam.
    const readyAt=this.syncHeldCharge(dt);
    const shieldActive=this.shieldPending||this.guarding;
    this.syncShieldHold(dt);
    // Guard drain belongs to this frame; release-time spending still enters via spentAtStart.
    if(shieldActive)this.staminaSpent=false;
    if(this.shieldPending||this.guarding){
      const action=this.action,rate=this.playbackRate('shieldPush');
      action.elapsed+=dt;action.time=Math.min(V2_SHIELD_GUARD_CLIP_TIME,action.time+dt*rate);
      this.state='shieldPush';
      return {state:this.state,clipTime:action.time,timeScale:rate,moving:false,speed:0,loop:false,actionId:action.id,actionElapsed:action.elapsed,
        guarding:this.guarding,shieldPending:this.shieldPending,freezeOnExit:true,chargeProgress:this.chargeProgress,movementDt:0,blendDuration:.16,events:[]};
    }
    // An exhausted guard ends immediately, without recovering stamina in its final frame.
    if(shieldActive)dt=0;
    if(this.staggerRemaining>0){
      const consumed=Math.min(dt,this.staggerRemaining);this.staggerRemaining-=consumed;dt-=consumed;
      if(alive&&!spentAtStart)this.restoreStamina(consumed);
      if(this.staggerRemaining>1e-8){
        if(this.hitPose?.deflectFrom!=null){
          const t=Math.min(1,(.16-this.staggerRemaining)/.12);
          this.hitPose.clipTime=Math.max(0,this.hitPose.deflectFrom-.19*t*(2-t));
        }
        return {...this.hitPose,moving:false,speed:0,loop:false,actionId:null,staggered:true,groggy:this.groggy,chargeProgress:this.chargeProgress,events:[]};
      }
      this.staggerRemaining=0;this.staggerLocked=false;this.hitPose=null;
    }
    let idleDt=dt,recoveredBeforeAttack=0;
    let hitStopped=false;
    if(this.action){
      this.action.elapsed+=dt;
      const stopped=Math.min(dt,this.action.hitStop);this.action.hitStop-=stopped;hitStopped=stopped>0;
      if(hitStopped)dt=0; // Deliver the final pulse before advancing past the contact pose, even at low FPS.
      const rolling=this.action.state==='dodge';
      if(rolling)rollFrom=this.action.time;
      const rate=this.playbackRate(this.action.state);
      if(this.action.greatAttack)dt=this.action.greatAttack.clipStep(this.action.time,dt,rate);
      const left=Math.max(0,(this.durations[this.action.state]-this.action.time)/rate);
      if(alive&&this.action.state==='judgment')this.restoreJudgmentRecovery(this.action.time,Math.min(this.durations.judgment,this.action.time+dt*rate),rate);
      if(rolling)rollTo=Math.min(this.durations.dodge,this.action.time+dt*rate);
      if(dt<left){this.action.time+=dt*rate;idleDt=0;}
      else {idleDt=dt-left;this.comboRemaining=this.combo.includes(this.action.state)?V2_COMBO_GRACE:0;this.action=null;}
    }
    if(!this.action&&this.queuedAttack&&!this.shieldHeld){
      const kind=this.queuedAttack,charge=this.queuedChargeProgress;
      this.queuedAttack=null;this.queuedChargeProgress=0;
      const available=Math.max(0,idleDt-Math.max(0,readyAt-(frameDt-idleDt)));
      // If a held attack becomes ready partway through an otherwise free
      // frame, regenerate only the time before its actual execution.
      if(alive&&kind==='judgment'&&!spentAtStart&&!this.staminaSpent){
        recoveredBeforeAttack=Math.max(0,idleDt-available);this.restoreStamina(recoveredBeforeAttack);
      }
      if(kind==='judgment')this.attackIndex=0;
      if(alive&&this.startAttack(kind==='normal'?undefined:kind,charge)){
        const duration=this.durations[this.action.state],rate=this.playbackRate(this.action.state);
        const playable=this.action.greatAttack?this.action.greatAttack.clipStep(0,available,rate):available;
        this.action.elapsed=available;this.action.time=Math.min(duration,playable*rate);idleDt=0;
        if(kind==='judgment')this.restoreJudgmentRecovery(0,this.action.time,rate);
        if(this.action.time>=duration){idleDt=Math.max(0,playable-duration/rate);this.comboRemaining=kind==='normal'?V2_COMBO_GRACE:0;this.action=null;}
      }
    }
    if(!this.action){this.comboRemaining=Math.max(0,this.comboRemaining-idleDt);if(!this.comboRemaining)this.attackIndex=0;}
    this.state=this.action?.state||(this.held&&!this.holdTriggered?'idle':magnitude>.08?'run':'idle');if(this.state!==previous)this.time=0;
    let sprintSeconds=0;
    if(alive&&this.state==='run'&&this.sprintHeld&&!this.sprintExhausted&&idleDt>0){
      const window=sprintInitial===null?idleDt:Math.min(idleDt,sprintInitial);
      sprintSeconds=this.staminaEnabled?Math.min(window,this.stamina/V2_SPRINT_COST):window;
      if(sprintSeconds>0){this.sprinting=true;const pending=this.sprintRecord;pending.sprintSeconds=sprintSeconds;pending.idleSeconds=idleDt;pending.allowRestore=!spentAtStart&&!this.staminaSpent;this.pendingSprint=pending;}
      else if(this.staminaEnabled&&this.stamina<=1e-8){this.sprintExhausted=true;this.staminaRejectSerial++;}
    }
    if(alive&&!this.action&&!this.pendingSprint&&!spentAtStart&&!this.staminaSpent)this.restoreStamina(Math.max(0,idleDt-recoveredBeforeAttack));
    const playbackRate=this.playbackRate(this.state)*(this.state==='run'&&idleDt>0?this.walkSpeedFactor+(this.sprintSpeedFactor-this.walkSpeedFactor)*sprintSeconds/idleDt:1);
    if(!this.action)this.time=(this.time+idleDt*playbackRate*(this.state==='run'?magnitude:1))%this.durations[this.state];
    return {state:this.state,clipTime:this.action?.time??this.time,timeScale:playbackRate,moving:this.state==='run',speed:this.state==='run'?this.runSpeed*magnitude*playbackRate:0,
      loop:!this.action,greatAttack:this.action?.greatAttack,actionId:this.action?.id??null,actionElapsed:this.action?.elapsed??0,hitStopped,chargeProgress:this.chargeProgress,
      guarding:this.guarding,shieldPending:this.shieldPending,
      rollFrom,rollTo,movementDt:idleDt,blendDuration:this.state==='dodge'?.06:this.state==='idle'?.24:.16,events:[]};
  }
  get chargeProgress(){
    if(this.greatAttackLevel>0){
      if(this.action?.greatAttack?.charging)return this.action.greatAttack.chargeProgress;
      if(this.held&&!this.holdTriggered)return this.holdTime/GREAT_ATTACK_CHARGE_SECONDS;
      return this.queuedAttack==='judgment'&&this.held?this.queuedChargeProgress:0;
    }
    return this.queuedAttack==='judgment'?1:this.held&&!this.holdTriggered?this.holdTime/V2_HOLD_SECONDS:0;
  }
}
