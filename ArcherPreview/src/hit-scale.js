// Hit volumes can be widened as a whole. 0.3 (user, 2026-11-21) sets all three to 1.15;
// 1 keeps the authored sizes (0.2).
// - monsterHurt: the radius of a monster's hurt volumes against the player's blade.
// - playerStrike: the player's blade (its length from the grip, its thickness, the side
//   width of a cut) and the shield push.
// - playerHurt: the player's body radius against monster attacks. Movement, separation and
//   approach distances keep the authored radius.
// One shared object, read where a hit is tested: no allocation, no per-frame work.
export const hitScale={monsterHurt:1,playerStrike:1,playerHurt:1};
const valid=value=>Number.isFinite(value)&&value>0?value:1;
export function setHitScale({monsterHurt=1,playerStrike=1,playerHurt=1}={}){
  hitScale.monsterHurt=valid(monsterHurt);hitScale.playerStrike=valid(playerStrike);hitScale.playerHurt=valid(playerHurt);
}
