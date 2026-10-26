import { Vector3 } from '@babylonjs/core';
import { PlayerHitReaction } from './hit-feedback.js';
import { HealingPotion } from './healing-potion.js';

// One player clock and health pool, regardless of how many enemies are active.
export class PlayerCombat {
  constructor() {
    this.maxHp = 500;
    this.defense = 0;
    this.potions = new HealingPotion();
    this.reaction = new PlayerHitReaction();
    this.reset();
  }
  reset() {
    this.hp = this.maxHp;
    this.invulnerable = 0;
    this.grabOwner = null;
    this.potions.reset();
    this.reaction.reset();
  }
  update(dt, player, onDamage) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const recovery = this.potions.update(dt, this.hp, this.maxHp);
    this.hp = recovery.hp;
    for (const amount of recovery.heals) onDamage(player.position.add(new Vector3(0, 1.8, 0)), `+${amount}`, false, 'heal');
  }
}
