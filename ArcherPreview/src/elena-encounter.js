import {Vector3} from '@babylonjs/core';
import {BossEncounter} from './boss-encounter.js';
import {ElenaBrain,ELENA_HOME,ELENA_SPELLS,spellImpact} from './elena-spec.js';
import {createElenaContact} from './elena-style.js';
import {GroundSpellTelegraph,spellContains} from './elena-ground-magic.js';
import {shieldIntercepts} from './player-strikes.js';
import {applyHitFlash} from './hit-feedback.js';
import {ENEMY_ARENA_RADIUS} from './world-limits.js';

export class ElenaEncounter extends BossEncounter {
  constructor(...args){super(...args);this.kind='elena';this.phase=1;this.displayName='타락한 성녀 엘레나';this.radius=.34;this.stopDistance=1.08;this.separationRadius=.42;this.engaged=false;this.motionRootTravel=false;}
  createBrain(durations){return new ElenaBrain(durations);}
  async summon(...args){await super.summon(...args);this.transformRequested=false;this.contact??=createElenaContact(this.world);this.spell??=new GroundSpellTelegraph(this.world);this.spell.reset();}
  hide(){super.hide();this.contact?.hide();this.spell?.reset();this.engaged=false;}
  updateRenderRange(camera){super.updateRenderRange(camera);this.contact?.update(this.actor,this.active&&!this.corpseGone&&this.renderVisible!==false,this.death.opacity);}
  motionSpec(name){return this.brain?.mode==='attack'?this.brain.spell:ELENA_SPELLS.find(s=>s.name===name);}
  attackRange(spec){return spec?.range??1.35;}
  attackDamage(event){return event.damage;}
  isHeavyAttack(){return false;}
  poseAndContacts(player,result,sample,shield){
    if(this.renderVisible===false&&!this.engaged)return 0;
    const fire=this.pendingEvents.some(e=>e.kind==='ground'),serial=this.brain.serial;this.pendingEvents=this.pendingEvents.filter(e=>e.kind!=='ground');
    const stop=super.poseAndContacts(player,result,sample,shield);
    if(!this.spell||!this.active||this.corpseGone||this.brain.hp<=0||this.brain.stagger||this.brain.mode!=='attack'||serial!==this.brain.serial){this.spell?.reset();return stop;}
    const spec=this.brain.spell,origin=this.actor.position,aim=this.reviewMode?origin.add(new Vector3(Math.sin(this.actor.rotation.y)*6,0,Math.cos(this.actor.rotation.y)*6)):player.position;
    this.spell.aim(this.brain.serial,spec.pattern,origin,aim,{range:spec.range,bossRadius:this.radius+.3});
    this.spell.show(this.brain.time,spellImpact(spec,this.brain.durations[this.brain.state]),{flash:fire});
    if(fire&&!this.spell.fired){
      this.spell.fired=true;
      const clear=!this.world.navigation||this.world.navigation.segmentClear(this.spell.plan.origin,player.position,0,true);
      if(!this.reviewMode&&clear&&spellContains(this.spell.plan,player.position)){
        const hand=this.nodes['mixamorig:RightHand'].getAbsolutePosition();
        this.receiveBossHit({damage:spec.damage,bodyContact:true,shieldContact:shieldIntercepts(hand,player.position.add(new Vector3(0,.95,0)),shield),action:result,source:hand});
      }
    }
    return stop;
  }
  update(dt,player){
    if(!this.active||this.corpseGone)return;
    if(this.reviewMode){this.updateReview(dt,player);return;}
    if(this.brain.hp<=0||this.brain.stagger)this.spell?.reset();
    const p=this.actor.position,nearHome=Math.hypot(player.position.x-ELENA_HOME.x,player.position.z-ELENA_HOME.z)<12;
    this.engaged=this.brain.hp>0&&nearHome&&Vector3.DistanceSquared(p,player.position)<64;
    if(this.engaged||['dead','down','recover'].includes(this.brain.mode)){super.update(dt,player);this.ring.isVisible=false;return;}
    // A resident must not run a whole-map path search or start boss music while
    // the player explores elsewhere. Return to the dwelling without teleporting.
    this.dt=dt;this.player=player;this.pendingEvents=[];this.brain.flash=Math.max(0,this.brain.flash-dt);this.brain.stagger=Math.max(0,this.brain.stagger-dt);
    const dx=ELENA_HOME.x-p.x,dz=ELENA_HOME.z-p.z,distance=Math.hypot(dx,dz),walking=distance>.12;
    const state=walking?this.brain.walk:this.brain.idle;if(this.brain.state!==state)this.brain.start(state,walking?'move':'idle');
    this.brain.time+=dt;this.lastRoot=null;this.lastSerial=null;
    if(walking){
      const before=p.clone(),target={x:ELENA_HOME.x,z:ELENA_HOME.z};
      const waypoint=this.world.navigation?.steer(p,target,this.radius,this.routeState??={},dt)??target;
      const x=waypoint.x-p.x,z=waypoint.z-p.z,d=Math.hypot(x,z),step=Math.min((this.phase===2?.673:1.1)*dt,d);
      if(d>.001){p.x+=x/d*step;p.z+=z/d*step;this.actor.rotation.y=Math.atan2(x,z);}
      this.world.navigation?.constrain(p,before,this.radius,ENEMY_ARENA_RADIUS);this.world.terrain?.place(p);
    }
    this.animator.transition(state,{clipTime:this.brain.time,actionId:this.brain.serial,loop:true});this.animator.update(dt);this.ring.isVisible=false;applyHitFlash(this.asset.meshes,this.brain.flash,this.brain.flashDuration);
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
      if(moving){const before=this.actor.position.clone(),speed=(this.phase===2?.673:1.1)*(movement.run?1.5:1);this.actor.position.x+=movement.x*speed*dt;this.actor.position.z+=movement.z*speed*dt;this.actor.rotation.y=Math.atan2(movement.x,movement.z);this.world.navigation?.constrain(this.actor.position,before,this.radius,ENEMY_ARENA_RADIUS);this.world.terrain?.place(this.actor.position);}
    }
    this.animator.gaitRate=movement.run?3:2;
    this.animator.transition(this.brain.state,{clipTime:this.brain.time,actionId:this.brain.serial,loop:moving});this.animator.update(dt);this.ring.isVisible=false;
  }
  inspect(){return {...super.inspect(),phase:this.phase,name:this.displayName,pattern:this.brain?.spell?.pattern,review:!!this.reviewMode,animation:this.animator.inspect?.()};}
}
