import {Vector3} from '@babylonjs/core';
import {BossEncounter} from './boss-encounter.js';
import {ElenaBrain,ELENA_HOME,ELENA_SPIN,ELENA_CAST} from './elena-spec.js';
import {createElenaContact} from './elena-style.js';
import {ElenaLineEffect,lineHitsPlayer} from './elena-magic.js';
import {shieldIntercepts} from './player-strikes.js';
import {applyHitFlash} from './hit-feedback.js';
import {ENEMY_ARENA_RADIUS} from './world-limits.js';

export class ElenaEncounter extends BossEncounter {
  constructor(...args){super(...args);this.kind='elena';this.displayName='엘레나';this.radius=.34;this.stopDistance=1.08;this.separationRadius=.42;this.engaged=false;}
  createBrain(durations){return new ElenaBrain(durations);}
  async summon(...args){await super.summon(...args);this.contact??=createElenaContact(this.world);this.spell??=new ElenaLineEffect(this.world);this.spell.reset();}
  hide(){super.hide();this.contact?.hide();this.spell?.reset();this.engaged=false;}
  updateRenderRange(camera){super.updateRenderRange(camera);this.contact?.update(this.actor,this.active&&!this.corpseGone&&this.renderVisible!==false,this.death.opacity);}
  motionSpec(name){return name===ELENA_SPIN.name?ELENA_SPIN:name===ELENA_CAST.name?ELENA_CAST:undefined;}
  attackRange(spec){return spec?.range??1.35;}
  attackDamage(event){return event.damage;}
  isHeavyAttack(){return false;}
  poseAndContacts(player,result,sample,shield){
    if(this.renderVisible===false&&!this.engaged)return 0;
    const fire=this.pendingEvents.some(e=>e.kind==='line');this.pendingEvents=this.pendingEvents.filter(e=>e.kind!=='line');
    const stop=super.poseAndContacts(player,result,sample,shield);
    if(!this.spell||!this.active||this.corpseGone||this.brain.hp<=0||this.brain.stagger||this.brain.state!==ELENA_CAST.name){this.spell?.reset();return stop;}
    const hand=this.nodes['mixamorig:RightHand'].getAbsolutePosition(),aim=player.position.add(new Vector3(0,.95,0));
    this.spell.aim(this.brain.serial,hand,aim,ELENA_CAST.range);
    this.spell.show(hand,this.brain.time,this.brain.durations[ELENA_CAST.name]*ELENA_CAST.impact,{flash:fire});
    if(fire&&!this.spell.fired){
      this.spell.fired=true;
      const clear=!this.world.navigation||this.world.navigation.segmentClear(hand,player.position,0,true);
      if(clear&&lineHitsPlayer(hand,this.spell.end,player.position))this.receiveBossHit({damage:ELENA_CAST.damage,bodyContact:true,shieldContact:shieldIntercepts(hand,aim,shield),action:result,source:hand});
    }
    return stop;
  }
  update(dt,player){
    if(!this.active||this.corpseGone)return;
    if(this.brain.hp<=0||this.brain.stagger)this.spell?.reset();
    const p=this.actor.position,nearHome=Math.hypot(player.position.x-ELENA_HOME.x,player.position.z-ELENA_HOME.z)<12;
    this.engaged=this.brain.hp>0&&nearHome&&Vector3.DistanceSquared(p,player.position)<64;
    if(this.engaged||['dead','down','recover'].includes(this.brain.mode)){super.update(dt,player);if(this.brain.state===ELENA_CAST.name)this.ring.isVisible=false;return;}
    // A resident must not run a whole-map path search or start boss music while
    // the player explores elsewhere. Return to the dwelling without teleporting.
    this.dt=dt;this.player=player;this.pendingEvents=[];this.brain.flash=Math.max(0,this.brain.flash-dt);this.brain.stagger=Math.max(0,this.brain.stagger-dt);
    const dx=ELENA_HOME.x-p.x,dz=ELENA_HOME.z-p.z,distance=Math.hypot(dx,dz),walking=distance>.12;
    const state=walking?'Walking':'Elena_Idle';if(this.brain.state!==state)this.brain.start(state,walking?'move':'idle');
    this.brain.time+=dt;this.lastRoot=null;this.lastSerial=null;
    if(walking){
      const before=p.clone(),target={x:ELENA_HOME.x,z:ELENA_HOME.z};
      const waypoint=this.world.navigation?.steer(p,target,this.radius,this.routeState??={},dt)??target;
      const x=waypoint.x-p.x,z=waypoint.z-p.z,d=Math.hypot(x,z),step=Math.min(1.1*dt,d);
      if(d>.001){p.x+=x/d*step;p.z+=z/d*step;this.actor.rotation.y=Math.atan2(x,z);}
      this.world.navigation?.constrain(p,before,this.radius,ENEMY_ARENA_RADIUS);this.world.terrain?.place(p);
    }
    this.animator.transition(state,{clipTime:this.brain.time,actionId:this.brain.serial,loop:true});this.animator.update(dt);this.ring.isVisible=false;applyHitFlash(this.asset.meshes,this.brain.flash,this.brain.flashDuration);
    this.spell?.reset();
  }
}
