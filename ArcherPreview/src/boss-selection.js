const RESIDENT_PHASES = Object.freeze({ elena: 1, 'mourning-elena': 2 });

// Keep the bear quantity while the single resident boss is selected.
export class BossSelection {
  constructor() { this.kind = 'bear'; this.bearCount = 1; }

  choose(kind, cave) {
    this.kind = cave && Object.hasOwn(RESIDENT_PHASES, kind) ? kind : 'bear';
    return this.current(cave);
  }

  setCount(value) {
    if (this.kind === 'bear') {
      const count = Number(value);
      this.bearCount = Number.isFinite(count) ? Math.max(1, Math.min(5, Math.floor(count))) : 1;
    }
  }

  current(cave) {
    if (!cave) this.kind = 'bear';
    const phase = RESIDENT_PHASES[this.kind] ?? null;
    return { kind: this.kind, count: phase ? 1 : this.bearCount, phase };
  }
}

export function bossSelectionHelp(selection, cave) {
  if (!cave) return '엘레나는 마녀의 동굴에서 소환할 수 있습니다.';
  return selection.phase ? '엘레나는 한 마리만 소환할 수 있습니다.' : '곰은 한 번에 1~5마리 소환할 수 있습니다.';
}

export function summonSelectedBoss(battle, player, selection) {
  return selection.phase
    ? battle.summonResident(player, selection.phase)
    : battle.summon(player, selection.count, 'bear');
}
