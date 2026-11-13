import { Vector3 } from '@babylonjs/core';
import { PlayerHitReaction } from './hit-feedback.js';
import { HealingPotion } from './healing-potion.js';
import {playerDimensions} from './player-dimensions.js';
import {PassiveHealthRegen} from './passive-health-regen.js';

// One player clock and health pool, regardless of how many enemies are active.
export class PlayerCombat {
  constructor() {
    this.maxHp = 500;
    this.defense = 0;
    this.potions = new HealingPotion();
    this.reaction = new PlayerHitReaction();
    this.passiveRecovery=new PassiveHealthRegen();
    this.reset();
  }
  reset() {
    this.hp = this.maxHp;
    this.invulnerable = 0;
    this.grabOwner = null;
    this.wolfRamLease={owner:null,brain:null,serial:null,player:null,scene:null,map:null};
    this.wolfRamRecovery=0;
    this.potions.reset();
    this.reaction.reset();
    this.passiveRecovery.reset();
  }
  wolfRamOwner(player){
    const lease=this.wolfRamLease,owner=lease.owner,b=owner?.brain;
    if(owner&&(!owner.active||b!==lease.brain||b.serial!==lease.serial||b.hp<=0||b.mode!=='attack'||!b.action?.momentumRam||b.ramAbortReason||owner.world.scene!==lease.scene||owner.world.mapId!==lease.map||lease.scene?.isDisposed||player!==lease.player))this.releaseWolfRam(owner);
    return lease.owner;
  }
  canStartWolfRam(owner,player){return !this.wolfRamRecovery&&(!this.wolfRamOwner(player)||this.wolfRamLease.owner===owner);}
  claimWolfRam(owner,player){
    if(!this.canStartWolfRam(owner,player)||this.grabOwner&&this.grabOwner!==owner)return false;
    const lease=this.wolfRamLease;lease.owner=owner;lease.brain=owner.brain;lease.serial=owner.brain.serial;lease.player=player;lease.scene=owner.world.scene;lease.map=owner.world.mapId;return true;
  }
  releaseWolfRam(owner,recoverySeconds=0){
    const lease=this.wolfRamLease;if(lease.owner!==owner)return false;
    lease.owner=lease.brain=lease.serial=lease.player=lease.scene=lease.map=null;
    this.wolfRamRecovery=Math.max(this.wolfRamRecovery,recoverySeconds);return true;
  }
  recover(dt,player,onDamage,active=true){
    const amount=this.passiveRecovery.update(dt,this.hp,this.maxHp,active);
    if(amount>0){
      this.hp+=amount;
      onDamage(player.position.add(new Vector3(0,playerDimensions(player).feedbackHeight,0)),`+${amount}`,false,'heal');
    }
    return amount;
  }
  update(dt, player, onDamage) {
    this.wolfRamRecovery=Math.max(0,this.wolfRamRecovery-Math.max(0,dt));
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const recovery = this.potions.update(dt, this.hp, this.maxHp);
    this.hp = recovery.hp;
    for (const amount of recovery.heals) onDamage(player.position.add(new Vector3(0, playerDimensions(player).feedbackHeight, 0)), `+${amount}`, false, 'heal');
  }
}
