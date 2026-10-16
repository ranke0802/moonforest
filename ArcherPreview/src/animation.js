/** Cross-fades authored full-body clips. Moving attacks already contain the walking leg cycle. */
export class CharacterAnimator {
  constructor(groups, names) {
    this.clips = {};
    this.active = new Map();
    this.current = null;
    this.actionId = null;
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
  transition(state, { phase = 0, clipTime, timeScale = 1, actionId = null, loop = false, blendDuration = .14 } = {}) {
    if (!this.clips[state]) throw new Error(`필수 동작을 찾지 못했습니다: ${state}`);
    const previous = this.current;
    const changed = previous !== state || this.actionId !== actionId;
    this.current = state;
    this.actionId = actionId;
    if (changed) {
      for (const entry of this.active.values()) { entry.target = 0; entry.blendDuration = blendDuration; }
    }
    const group = this.clips[state];
    let entry = this.active.get(state);
    if (!entry) {
      group.start(loop, 1, group.from, group.to, false);
      // Sample from the controller's seconds, not a second Babylon wall clock.
      // This also prevents hidden tabs / dropped frames from moving the arrow ahead of its event.
      group.pause();
      group.setWeightForAllAnimatables(0);
      entry = { group, weight: previous === null ? 1 : 0, target: 1, clipTime: 0, blendDuration };
      this.active.set(state, entry);
    }
    entry.target = 1;
    entry.loop = loop;
    entry.actionId = actionId;
    entry.timeScale = timeScale;
    if (changed) entry.blendDuration = blendDuration;
    entry.controlled = Number.isFinite(clipTime);
    if (entry.controlled) entry.clipTime = clipTime;
    else if (changed) entry.clipTime = phase * this.durations[state];
    group.loopAnimation = loop;
    group.speedRatio = timeScale;
  }
  update(dt) {
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    let totalWeight = 0;
    for (const [state, entry] of this.active) {
      const step = dt / Math.max(.001, entry.blendDuration);
      entry.weight = entry.target > entry.weight ? Math.min(entry.target, entry.weight + step) : Math.max(entry.target, entry.weight - step);
      if (entry.weight <= 0 && entry.target === 0) { entry.group.stop(); this.active.delete(state); continue; }
      totalWeight += entry.weight;
    }
    const current = this.active.get(this.current);
    for (const [state, entry] of this.active) {
      // Interrupted fades can leave three groups active. Never mix the rest pose into that gap.
      if (totalWeight > 0) entry.weight /= totalWeight;
      entry.group.setWeightForAllAnimatables(entry.weight);
      const duration = this.durations[state];
      const sharedAttack = state !== this.current && ['attack', 'moveAttack'].includes(state) && ['attack', 'moveAttack'].includes(this.current) && entry.actionId === this.actionId && current.controlled;
      if (sharedAttack) entry.clipTime = current.clipTime / this.durations[this.current] * duration;
      // Only the current finite action gets an authoritative sampled time each update.
      else if (!entry.controlled || state !== this.current) entry.clipTime += dt * entry.timeScale;
      entry.clipTime = entry.loop && duration > 0 ? entry.clipTime % duration : Math.min(duration, Math.max(0, entry.clipTime));
      const phase = duration > 0 ? entry.clipTime / duration : 0;
      // useWeight=true is essential: otherwise goToFrame bypasses the cross-fade.
      entry.group.goToFrame(entry.group.from + phase * (entry.group.to - entry.group.from), true);
    }
  }
  dispose() { for (const group of Object.values(this.clips)) group.stop(); this.active.clear(); }
}
