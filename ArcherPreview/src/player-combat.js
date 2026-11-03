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
    this.potions.reset();
    this.reaction.reset();
    this.passiveRecovery.reset();
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
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const recovery = this.potions.update(dt, this.hp, this.maxHp);
    this.hp = recovery.hp;
    for (const amount of recovery.heals) onDamage(player.position.add(new Vector3(0, playerDimensions(player).feedbackHeight, 0)), `+${amount}`, false, 'heal');
  }
}
