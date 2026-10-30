import {chooseElenaCharge,chooseMourningReposition} from './elena-reposition.js';
import {MOURNING_MOVEMENT,MOURNING_SIZE_SCALE} from './elena-spec.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const MOURNING_ROUTE_POLICY=Object.freeze({progressWindow:.28,chargeCheckInterval:.2,maxRedirects:1,historyLimit:6});

/** Small, bounded state. Collision still constrains every actual root step. */
export class MourningLocomotion {
  constructor(){this.recent=[];this.reset();}
  reset(){this.recent.length=0;this.serial=null;this.redirects=0;this.watchTime=0;this.nextChargeCheck=0;this.launched=false;this.selections=0;this.rejectedCharges=0;this.blockedRecoveries=0;this.magicFallbacks=0;}
  remember(position){
    if(this.recent.length&&distance(position,this.recent.at(-1))<.3)return;
    if(this.recent.length===MOURNING_ROUTE_POLICY.historyLimit)this.recent.shift();
    this.recent.push({x:position.x,z:position.z});
  }
  clearCharge(e){e.chargeOrigin=null;e.chargePrevious=null;}
  cancel(e){this.serial=null;this.watchTime=0;e.repositionTarget=null;this.clearCharge(e);}
  watch(e){this.watchTime=0;this.checkpoint=this.bestDistance=e.repositionTarget?distance(e.actor.position,e.repositionTarget):0;}
  options(e){return {turn:e.brain.movementTurn,radius:e.radius,navigation:e.movementNavigation,terrain:e.world.terrain,home:e.home,recent:this.recent};}
  choose(e,player,{recovery=false}={}){
    this.selections++;
    return chooseMourningReposition(e.actor.position,player.position,{...this.options(e),length:e.brain.moveKind==='skitter'?4.4:2.1,recovery});
  }
  finish(e,result,{blocked=false}={}){
    this.remember(e.actor.position);if(blocked)this.magicFallbacks++;
    e.brain.finishReposition();e.repositionTarget=null;this.clearCharge(e);e.spell?.reset();this.serial=null;result.speed=0;
    return {target:e.actor.position,stopDistance:0,direct:true};
  }
  redirect(e,player,result){
    this.blockedRecoveries++;this.clearCharge(e);e.spell?.reset();this.remember(e.actor.position);
    if(this.redirects>=MOURNING_ROUTE_POLICY.maxRedirects)return this.finish(e,result,{blocked:true});
    this.redirects++;
    // A new serial releases the old warning/damage gate and turns toward the
    // new step. Never bend an already displayed charge path toward the player.
    e.brain.redirectMovement('walk');this.serial=e.brain.serial;e.repositionSerial=this.serial;e.routeState={};
    e.repositionTarget=this.choose(e,player,{recovery:true});this.watch(e);
    if(!e.repositionTarget)return this.finish(e,result,{blocked:true});
    result.speed=MOURNING_MOVEMENT.walkSpeed;this.gait(e,result.speed);
    return {target:e.repositionTarget,stopDistance:.12,direct:true};
  }
  gait(e,speed){if(e.animator)e.animator.gaitRate=speed?Math.min(MOURNING_MOVEMENT.gaitCap,speed/((e.config?.motion?.baseWalkSpeed??.3368)*MOURNING_SIZE_SCALE)):0;}
  plan(e,player,result){
    const brain=e.brain;
    if(!brain.repositioning){this.cancel(e);return {target:player.position,stopDistance:e.stopDistance};}
    if(this.serial!==brain.serial){
      this.serial=brain.serial;e.repositionSerial=this.serial;this.redirects=0;this.nextChargeCheck=MOURNING_ROUTE_POLICY.chargeCheckInterval;this.launched=false;e.routeState={};
      this.remember(e.actor.position);this.clearCharge(e);
      if(brain.moveKind==='charge'){
        this.selections++;e.repositionTarget=chooseElenaCharge(e.actor.position,player.position,this.options(e));
        if(e.repositionTarget){e.chargeOrigin=e.actor.position.clone();e.chargePrevious=e.actor.position.clone();e.chargeResolved=false;}
        else {this.rejectedCharges++;return this.redirect(e,player,result);}
      }else e.repositionTarget=this.choose(e,player);
      if(!e.repositionTarget)return this.redirect(e,player,result);
      this.watch(e);
    }
    const target=e.repositionTarget;
    if(!target||distance(e.actor.position,target)<.16)return this.finish(e,result);
    if(e.chargeOrigin){
      const warning=brain.time<MOURNING_MOVEMENT.chargeWarning;
      // Check the fixed corridor at a low rate while warning, and once at
      // launch. A new obstacle cancels it before a fast step or any damage.
      if((warning&&brain.time>=this.nextChargeCheck)||(!warning&&!this.launched)){
        this.nextChargeCheck=brain.time+MOURNING_ROUTE_POLICY.chargeCheckInterval;
        if(e.movementNavigation&&!e.movementNavigation.segmentClear(e.actor.position,target,e.radius))return this.redirect(e,player,result);
      }
      if(warning){result.speed=0;this.watch(e);this.gait(e,0);return {target,stopDistance:.12,direct:true};}
      this.launched=true;
    }
    if(result.speed>0){
      this.watchTime+=Math.min(.1,e.dt??0);this.bestDistance=Math.min(this.bestDistance,distance(e.actor.position,target));
      if(this.watchTime>=MOURNING_ROUTE_POLICY.progressWindow){
        if(this.checkpoint-this.bestDistance<.03)return this.redirect(e,player,result);
        this.watch(e);
      }
    }else this.watch(e);
    this.gait(e,result.speed);
    return {target,stopDistance:.12,direct:true};
  }
  inspect(){return {selections:this.selections,rejectedCharges:this.rejectedCharges,blockedRecoveries:this.blockedRecoveries,magicFallbacks:this.magicFallbacks,redirects:this.redirects,recentPositions:this.recent.length};}
}
