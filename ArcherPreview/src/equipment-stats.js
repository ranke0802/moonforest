export const EQUIPMENT_STYLES = Object.freeze([
  { id:'original', label:'기본', value:0, attackBonus:5, defense:2 },
  { id:'violet-silver', label:'보라 · 은색', value:1, attackBonus:7, defense:3 },
  { id:'teal-bronze', label:'청록 · 청동', value:2, attackBonus:9, defense:4 },
]);
const styleOf=id=>EQUIPMENT_STYLES.find(style=>style.id===id)||EQUIPMENT_STYLES[0];
export function equipmentStats(choices={}) {
  return {attackBonus:styleOf(choices.sword).attackBonus,defense:styleOf(choices.shield).defense};
}
export function equipmentLabel(slot,style) {
  return `${style.label} · ${slot==='sword'?'공격력':'방어력'} +${slot==='sword'?style.attackBonus:style.defense}`;
}
export function boostSwordStrike(window,bonus) {
  if(!bonus)return window;
  if(window.burst){const burst=window.burst.map(damage=>damage+bonus);return {...window,burst,damage:burst.reduce((sum,damage)=>sum+damage,0)};}
  return {...window,damage:window.damage+bonus};
}
// Flat armor reduction is applied once per incoming hit, after critical damage.
export function armoredDamage(damage,defense=0) {return damage>0?Math.max(1,Math.round(damage)-Math.max(0,defense)):0;}
