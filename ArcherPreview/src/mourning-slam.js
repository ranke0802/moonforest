import {Vector3} from '@babylonjs/core';
import {MOURNING_SIZE} from './elena-spec.js';
import {smooth01} from './mourning-motion-v2.js';

// Lock the entire step before its floor warning. Damage remains a single
// ground spell at 1.65 clip seconds; the advance itself deals no contact damage.
export class MourningSlamAdvance {
  constructor(){this.origin=new Vector3();this.target=new Vector3();this.step=new Vector3();this.reset();}
  reset(){this.serial=null;this.progress=0;this.distance=0;}
  update(enemy,player){
    const {brain,actor}=enemy;
    if(!enemy.active||brain.hp<=0||brain.mode!=='attack'||brain.spell?.motion!=='cast_slam'||brain.stagger||!enemy.playerAlive){this.reset();return;}
    const navigation=enemy.movementNavigation,terrain=enemy.world.terrain;
    if(this.serial!==brain.serial){
      this.serial=brain.serial;this.progress=0;this.origin.copyFrom(actor.position);this.target.copyFrom(actor.position);
      const dx=Math.sin(actor.rotation.y),dz=Math.cos(actor.rotation.y),gap=Math.hypot(player.position.x-actor.position.x,player.position.z-actor.position.z);
      const wanted=Math.max(0,Math.min(.9,gap-enemy.radius-.8));
      for(const fraction of [1,.66,.33]){
        const x=this.origin.x+dx*wanted*fraction,z=this.origin.z+dz*wanted*fraction;
        this.step.set(x,terrain?.heightAt(x,z)??this.origin.y,z);
        if(Math.hypot(x-enemy.home.x,z-enemy.home.z)>MOURNING_SIZE.homeRadius)continue;
        if(Math.abs(this.step.y-this.origin.y)>.3)continue;
        if(navigation&&(!navigation.free(this.step,enemy.radius)||!navigation.segmentClear(this.origin,this.step,enemy.radius)))continue;
        this.target.copyFrom(this.step);break;
      }
      this.distance=Vector3.Distance(this.origin,this.target);
    }
    const progress=smooth01((brain.time-.15)/.85);
    if(progress<=this.progress)return;
    Vector3.LerpToRef(this.origin,this.target,progress,this.step);
    this.step.y=terrain?.heightAt(this.step.x,this.step.z)??this.origin.y;
    if(navigation&&(!navigation.free(this.step,enemy.radius)||!navigation.segmentClear(actor.position,this.step,enemy.radius))){
      // A newly blocked step cancels its old footprint; no invisible wall hit
      // or last-moment retargeting. The next action gets a fresh warning.
      enemy.pendingEvents.length=0;brain.cancelCast();brain.wait=.2;enemy.spell?.reset();this.reset();return;
    }
    actor.position.copyFrom(this.step);this.progress=progress;
  }
}
