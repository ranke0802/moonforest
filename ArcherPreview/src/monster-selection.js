import {REGULAR_WOLF_VARIANTS} from './regular-wolf-spec.js';
import {MAX_SUMMON_PER_KIND,normalizeSummonCount} from './summon-limits.js';

export const MONSTER_NAMES=Object.freeze({goblin:'고블린',...Object.fromEntries(Object.values(REGULAR_WOLF_VARIANTS).map(value=>[value.id,value.label]))});
export class MonsterSelection{
 constructor(){this.kind='goblin';this.counts=Object.fromEntries(Object.keys(MONSTER_NAMES).map(kind=>[kind,1]));}
 choose(kind){this.kind=Object.hasOwn(this.counts,kind)?kind:'goblin';return this.current();}
 setCount(value){this.counts[this.kind]=normalizeSummonCount(value);}
 current(){return {kind:this.kind,count:this.counts[this.kind]};}
}
export function monsterSelectionHelp(selection){return `${MONSTER_NAMES[selection.kind]}: 모든 맵에서 종류별로 1~${MAX_SUMMON_PER_KIND}마리 소환할 수 있습니다.`;}
export function summonSelectedMonster(battle,player,selection){return battle.summon(player,selection.count,selection.kind);}
