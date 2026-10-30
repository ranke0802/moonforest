import {Vector3} from '@babylonjs/core';
import {BossEncounter} from './boss-encounter.js';
import {ElenaBrain,ELENA_HOME,ELENA_SPELLS,MOURNING_MOVEMENT,MOURNING_SIZE,MOURNING_SIZE_SCALE} from './elena-spec.js';
import {createElenaContact} from './elena-style.js';
import {GroundSpellTelegraph,spellContains} from './elena-ground-magic.js';
import {shieldIntercepts} from './player-strikes.js';
import {applyHitFlash} from './hit-feedback.js';
import {ENEMY_ARENA_RADIUS} from './world-limits.js';
import {chooseElenaReposition} from './elena-reposition.js';
import {MourningLocomotion} from './mourning-locomotion.js';
import {chargeTouchesPlayer} from './elena-charge.js';

export class ElenaEncounter extends BossEncounter {
  constructor(...args){super(...args);this.kind='elena';this.phase=1;this.home=ELENA_HOME;this.displayName='타락한 성녀 엘레나';this.radius=.34;this.stopDistance=1.08;this.separationRadius=.42;this.engaged=false;this.motionRootTravel=false;}
  createBrain(durations){return new ElenaBrain(durations);}
  async summon(...args){await super.summon(...args);this.home={x:this.actor.position.x,z:this.actor.position.z};this.repositionTarget=null;this.locomotion?.reset();this.transformRequested=false;this.contact??=createElenaContact(this.world);this.spell??=new GroundSpellTelegraph(this.world);this.spell.reset();}
  hide(){this.brain?.cancelCast();if(this.phase===2)this.brain?.cancelMovement();super.hide();this.contact?.hide();this.spell?.reset();this.engaged=false;this.repositionTarget=null;this.chargeOrigin=null;this.locomotion?.reset();}
  updateRenderRange(camera){super.updateRenderRange(camera);this.contact?.update(this.actor,this.active&&!this.corpseGone&&this.renderVisible!==false,this.death.opacity);}
  motionSpec(name){return this.brain?.mode==='attack'?this.brain.spell:ELENA_SPELLS.find(s=>s.name===name);}
  attackRange(spec){return spec?.range??1.35;}
  attackDamage(event){return event.damage;}
  isHeavyAttack(){return false;}
  contactSeparation(){
    // Keep the real body contact reachable during a charge; the ordinary
    // 65 cm comfort gap otherwise pushes the boss away before it can hit.
    return this.phase===2&&this.brain.repositioning&&this.brain.moveKind==='charge'&&this.brain.time>=MOURNING_MOVEMENT.chargeWarning?this.radius+.3:super.contactSeparation();
  }
  movementPlan(player,result){
    if(this.phase===2){this.locomotion??=new MourningLocomotion();return this.locomotion.plan(this,player,result);}
    if(!this.brain.repositioning){this.repositionTarget=null;this.chargeOrigin=null;return super.movementPlan(player);}
    if(this.repositionSerial!==this.brain.serial||!this.repositionTarget){
      this.repositionSerial=this.brain.serial;this.routeState={};
      const options={phase:this.phase,turn:this.brain.nextSpell,radius:this.radius,navigation:this.movementNavigation,terrain:this.world.terrain,home:this.home};
      this.chargeOrigin=null;
      this.repositionTarget=chooseElenaReposition(this.actor.position,player.position,options);
    }
    const target=this.repositionTarget;
    if(!target||Math.hypot(target.x-this.actor.position.x,target.z-this.actor.position.z)<.16){
      this.brain.finishReposition();result.speed=0;return {target:this.actor.position,stopDistance:0,direct:true};
    }
    return {target,stopDistance:.12,direct:true};
  }
  poseAndContacts(player,result,sample,shield){
    if(this.renderVisible===false&&!this.engaged)return 0;
    const fire=this.pendingEvents.some(e=>e.kind==='ground'),serial=this.brain.serial;this.pendingEvents=this.pendingEvents.filter(e=>e.kind!=='ground');
    const stop=super.poseAndContacts(player,result,sample,shield);
    if(!this.spell||!this.active||this.corpseGone||this.brain.hp<=0||(!this.playerAlive&&!this.reviewMode)||this.brain.stagger||serial!==this.brain.serial){this.spell?.reset();return stop;}
    if(!this.reviewMode&&this.phase===2&&this.brain.repositioning&&this.brain.moveKind==='charge'&&this.chargeOrigin&&this.repositionTarget){
      const length=Math.hypot(this.repositionTarget.x-this.chargeOrigin.x,this.repositionTarget.z-this.chargeOrigin.z);
      this.spell.aim('charge:'+this.brain.serial,'corridor',this.chargeOrigin,this.repositionTarget,{range:Math.hypot(length+this.radius,this.radius),bossRadius:.1,halfWidth:this.radius,scale:MOURNING_SIZE_SCALE});
      this.spell.show(Math.min(this.brain.time,MOURNING_MOVEMENT.chargeWarning),MOURNING_MOVEMENT.chargeWarning,{flash:this.brain.time>=MOURNING_MOVEMENT.chargeWarning});
      if(this.brain.time>=MOURNING_MOVEMENT.chargeWarning){
        const clear=!this.world.navigation||this.world.navigation.segmentClear(this.actor.position,player.position,0,true);
        if(!this.chargeResolved&&clear&&chargeTouchesPlayer(this.spell.plan,this.chargePrevious??this.chargeOrigin,this.actor.position,player.position,{reach:this.radius})){
          // Consume the one contact even on dodge/block/invulnerability, so an
          // avoided charge cannot hit again when that protection ends.
          this.chargeResolved=true;
          const from=this.actor.position.add(new Vector3(0,1,0));
          this.receiveBossHit({damage:MOURNING_MOVEMENT.chargeDamage,bodyContact:true,shieldContact:shieldIntercepts(from,player.position.add(new Vector3(0,.95,0)),shield),action:result,source:this.chargeOrigin});
        }
        this.chargePrevious?.copyFrom(this.actor.position);
      }
      return stop;
    }
    if(this.brain.mode!=='attack'){this.spell.reset();return stop;}
    const spec=this.brain.spell,origin=this.actor.position,aim=this.reviewMode?origin.add(new Vector3(Math.sin(this.actor.rotation.y)*6,0,Math.cos(this.actor.rotation.y)*6)):player.position;
    this.spell.aim(this.brain.serial,spec.pattern,origin,aim,{range:spec.range,bossRadius:this.radius+.3,scale:this.phase===2?MOURNING_SIZE_SCALE:1});
    this.spell.show(this.brain.castWarningElapsed,this.brain.castWarningDuration,{flash:fire});
    if(fire&&!this.spell.fired){
      this.spell.fired=true;
      const clear=!this.world.navigation||this.world.navigation.segmentClear(this.spell.plan.origin,player.position,0,true);
      if(!this.reviewMode&&clear&&spellContains(this.spell.plan,player.position)){
        // The enlarged witch's hand can pass above or behind a nearby player.
        // Her floor spell approaches from the boss, at the player's guard height.
        const source=this.phase===2?origin.add(new Vector3(0,.95,0)):this.nodes['mixamorig:RightHand'].getAbsolutePosition();
        this.receiveBossHit({damage:spec.damage,bodyContact:true,shieldContact:shieldIntercepts(source,player.position.add(new Vector3(0,.95,0)),shield),action:result,source});
      }
    }
    return stop;
  }
  update(dt,player){
    if(!this.active||this.corpseGone)return;
    if(this.reviewMode){this.updateReview(dt,player);return;}
    if(this.brain.hp<=0||this.brain.stagger)this.spell?.reset();
    // Separate enter/leave distances so motion along the detection edge cannot
    // alternate returning home and attacking on adjacent frames.
    const slack=this.phase===2&&this.engaged?1.5:0;
    const p=this.actor.position,nearHome=Math.hypot(player.position.x-this.home.x,player.position.z-this.home.z)<(this.phase===2?MOURNING_SIZE.homeDetectionRange:12)+slack,detection=(this.phase===2?MOURNING_SIZE.engagementRange:8)+slack;
    this.engaged=this.brain.hp>0&&nearHome&&Vector3.DistanceSquared(p,player.position)<detection*detection;
    if(this.engaged||['dead','down','recover'].includes(this.brain.mode)){super.update(dt,player);this.ring.isVisible=false;return;}
    // A resident must not run a whole-map path search or start boss music while
    // the player explores elsewhere. Return to the dwelling without teleporting.
    if(this.phase===2){this.brain.cancelMovement();this.locomotion?.cancel(this);this.repositionTarget=null;this.chargeOrigin=null;}
    this.dt=dt;this.player=player;this.pendingEvents=[];this.brain.flash=Math.max(0,this.brain.flash-dt);this.brain.stagger=Math.max(0,this.brain.stagger-dt);
    const dx=this.home.x-p.x,dz=this.home.z-p.z,distance=Math.hypot(dx,dz),walking=distance>.12;
    const state=walking?this.brain.walk:this.brain.idle;if(this.brain.state!==state)this.brain.start(state,walking?'move':'idle');
    this.brain.time+=dt;this.lastRoot=null;this.lastSerial=null;
    if(walking){
      const before=p.clone(),target=this.home;
      const waypoint=this.movementNavigation?.steer(p,target,this.radius,this.routeState??={},dt)??target;
      const x=waypoint.x-p.x,z=waypoint.z-p.z,d=Math.hypot(x,z),step=Math.min((this.phase===2?MOURNING_MOVEMENT.walkSpeed:1.1)*dt,d);
      if(d>.001){p.x+=x/d*step;p.z+=z/d*step;this.actor.rotation.y=Math.atan2(x,z);}
      this.movementNavigation?.constrain(p,before,this.radius,ENEMY_ARENA_RADIUS);this.world.terrain?.place(p);
    }
    if(this.phase===2)this.animator.gaitRate=MOURNING_MOVEMENT.walkSpeed/((this.config.motion?.baseWalkSpeed??.3368)*MOURNING_SIZE_SCALE);
    this.animator.transition(state,{clipTime:this.brain.time,actionId:this.brain.serial,loop:true,staggerRemaining:this.brain.stagger});this.animator.update(dt);this.ring.isVisible=false;applyHitFlash(this.asset.meshes,this.brain.flash,this.brain.flashDuration);
    this.spell?.reset();
  }
  updateDeath(dt){
    if(this.phase!==1||!this.onTransform){super.updateDeath(dt);return;}
    // Phase one does not grant a kill/reward. Keep its authored fall visible
    // until the next phase is ready; failed downloads never remove both actors.
    if(!this.transformRequested&&this.brain.time>=1.25){this.transformRequested=true;this.onTransform(this);}
  }
  requestReviewCast(){if(this.reviewMode&&this.brain.hp>0&&this.brain.mode!=='attack'){this.brain.cast();return true;}return false;}
  updateReview(dt,player){
    this.dt=dt;this.player=player;this.engaged=false;
    const casting=this.brain.mode==='attack';
    const result=this.brain.update(dt,0,true,{manual:true});this.pendingEvents=result.events;
    const movement=this.reviewMovement??{x:0,z:0},length=Math.hypot(movement.x,movement.z),moving=!casting&&this.brain.mode!=='attack'&&length>.08;
    if(!casting&&this.brain.mode!=='attack'){
      const state=moving?this.brain.walk:this.brain.idle;if(this.brain.state!==state)this.brain.start(state,moving?'move':'idle');
      if(moving){const before=this.actor.position.clone(),speed=(this.phase===2?.673:1.1)*(movement.run?1.5:1);this.actor.position.x+=movement.x*speed*dt;this.actor.position.z+=movement.z*speed*dt;this.actor.rotation.y=Math.atan2(movement.x,movement.z);this.movementNavigation?.constrain(this.actor.position,before,this.radius,ENEMY_ARENA_RADIUS);this.world.terrain?.place(this.actor.position);}
    }
    this.animator.gaitRate=(movement.run?3:2)/(this.phase===2?MOURNING_SIZE_SCALE:1);
    this.animator.transition(this.brain.state,{clipTime:this.brain.time,actionId:this.brain.serial,loop:moving,staggerRemaining:this.brain.stagger});this.animator.update(dt);this.ring.isVisible=false;
  }
  inspect(){return {...super.inspect(),phase:this.phase,name:this.displayName,pattern:this.brain?.spell?.pattern,movement:this.brain?.repositioning?this.brain.moveKind:null,locomotion:this.locomotion?.inspect(),chargeDamage:MOURNING_MOVEMENT.chargeDamage,chargeResolved:!!this.chargeResolved,castRate:this.brain?.attackPlaybackRate,sizeScale:this.sizeScale??1,bodyHeight:this.phase===2?MOURNING_SIZE.bodyHeight:undefined,collisionRadius:this.radius,review:!!this.reviewMode,animation:this.animator.inspect?.()};}
}
