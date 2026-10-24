// Body blocking is independent of damage detection: prone enemies remain
// attackable, but become solid again only after their get-up animation finishes.
export function isEnemySolid(enemy) {
  const { hp, mode } = enemy.brain;
  return enemy.active !== false && hp > 0 &&
    mode !== 'down' && mode !== 'recover' && mode !== 'dead';
}

// Physical rolling clearance only. Weapon hurtboxes and attack reach are
// independent; crouching the player does not shrink a monster's hittable body.
export function dodgeSeparation(enemy) { return enemy.radius+.25; }
