/** Cross-fades authored full-body clips. Moving attacks already contain the walking leg cycle. */
export class CharacterAnimator {
  constructor(groups, names) {
    this.clips = {};
    this.active = new Map();
    this.current = null;
    for (const [state, name] of Object.entries(names)) {
      const group = groups.find(g => g.name === name);
      if (!group) throw new Error(`필수 동작을 찾지 못했습니다: ${name}`);
      group.stop();
      this.clips[state] = group;
    }
    this.durations = Object.fromEntries(Object.entries(this.clips).map(([state, group]) => {
      const fps = group.targetedAnimations[0]?.animation.framePerSecond || 60;
      return [state, (group.to - group.from) / fps];
    }));
  }
  transition(state, { phase = 0, loop = false } = {}) {
    if (this.current === state) return;
    const previous = this.current;
    this.current = state;
    for (const entry of this.active.values()) entry.target = 0;
    const group = this.clips[state];
    let entry = this.active.get(state);
    if (!entry) {
      group.start(loop, 1, group.from, group.to, false);
      group.setWeightForAllAnimatables(0);
      entry = { group, weight: 0, target: 1 };
      this.active.set(state, entry);
    }
    entry.target = 1;
    group.loopAnimation = loop;
    if (phase > 0 && ['attack', 'moveAttack'].includes(state) && ['attack', 'moveAttack'].includes(previous)) group.goToFrame(group.from + Math.min(.999, phase) * (group.to - group.from));
    // Revive must rewind an ended death/idle transition; no model translation is reset here.
    if (previous === 'death' && state === 'idle') group.goToFrame(group.from);
  }
  update(dt) {
    const step = dt / .14;
    for (const [state, entry] of this.active) {
      entry.weight = entry.target > entry.weight ? Math.min(entry.target, entry.weight + step) : Math.max(entry.target, entry.weight - step);
      entry.group.setWeightForAllAnimatables(entry.weight);
      if (entry.weight <= 0 && entry.target === 0) { entry.group.stop(); this.active.delete(state); }
    }
  }
  dispose() { for (const group of Object.values(this.clips)) group.stop(); this.active.clear(); }
}
