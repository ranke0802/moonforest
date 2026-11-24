// Aggro drives the enemy AI. The guide and voluntary travel lock only after
// a damaging player hit in this fight. Store a map id, never an encounter.
export function createPlayerCombatLock() {
  let hitMap = null;
  return {
    note(kind, foe, damage, map) {
      if (kind === 'enemy' && damage > 0 && foe?.brain && foe.type !== 'npc' && foe.category !== 'npc') hitMap = map;
    },
    active(map, battle) {
      if (hitMap === null) return false;
      if (hitMap !== map || !battle.combatCount) hitMap = null;
      return hitMap !== null;
    },
    reset() { hitMap = null; }
  };
}
