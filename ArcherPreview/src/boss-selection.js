import {MAX_SUMMON_PER_KIND,normalizeSummonCount} from './summon-limits.js';

const ELENA_PHASES = Object.freeze({ elena: 1, 'mourning-elena': 2 });
const BOSS_NAMES = Object.freeze({bear:'곰 보스',elena:'타락한 성녀 엘레나','mourning-elena':'비탄의 마녀 엘레나'});

// Each selected kind keeps its quantity independently across map changes.
export class BossSelection {
  constructor() { this.kind = 'bear'; this.counts = {bear:1,elena:1,'mourning-elena':1}; }

  choose(kind) {
    this.kind = Object.hasOwn(this.counts, kind) ? kind : 'bear';
    return this.current();
  }

  setCount(value) {
    this.counts[this.kind] = normalizeSummonCount(value);
  }

  current() {
    const phase = ELENA_PHASES[this.kind] ?? null;
    return { kind: this.kind, count: this.counts[this.kind], phase };
  }
}

export function bossSelectionHelp(selection) {
  return `${BOSS_NAMES[selection.kind]}: 모든 맵에서 종류별로 1~${MAX_SUMMON_PER_KIND}마리 소환할 수 있습니다.`;
}

export function summonSelectedBoss(battle, player, selection) {
  return battle.summon(player, selection.count, selection.kind);
}
