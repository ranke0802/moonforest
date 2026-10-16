export const STATE_LABELS = { idle: '대기', walk: '걷기', run: '달리기', attack: '활 공격', moveAttack: '이동 공격', hit: '피격', death: '사망' };

/** Gameplay timing is independent of rendering and never changes the authored root bone. */
export class CharacterController {
  constructor({ durations = {}, speeds = {} } = {}) {
    this.durations = { idle: 2, walk: 1.33, run: .8, attack: 1.6, moveAttack: 1.6, hit: .8, death: 2.4, ...durations };
    this.speeds = { walk: 1.1297524, run: 3.0859220759743686, moveAttack: 1.1297524, ...speeds };
    this.runToggled = false;
    this.action = null;
    this.state = 'idle';
    this.dead = false;
  }
  attack() {
    if (this.dead || this.action) return false;
    this.action = { kind: 'attack', progress: 0 };
    return true;
  }
  hit() {
    if (this.dead) return false;
    this.action = { kind: 'hit', progress: 0 };
    return true;
  }
  die() { this.dead = true; this.action = { kind: 'death', progress: 0 }; }
  revive() { this.dead = false; this.action = null; this.state = 'idle'; this.runToggled = false; }
  toggleRun() { if (!this.dead) this.runToggled = !this.runToggled; }
  update(dt, input = {}) {
    const magnitude = Math.min(1, Math.hypot(input.x || 0, input.y || 0));
    const moving = magnitude > .08 && !this.dead && this.action?.kind !== 'hit';
    let state = this.dead ? 'death' : this.action?.kind === 'hit' ? 'hit' : this.action?.kind === 'attack' ? (moving ? 'moveAttack' : 'attack') : moving ? ((this.runToggled || input.run) ? 'run' : 'walk') : 'idle';
    const phase = this.action?.progress || 0;
    if (this.action && this.action.kind !== 'death') {
      this.action.progress += dt / Math.max(.01, this.durations[state]);
      if (this.action.progress >= 1) {
        this.action = null;
        state = moving ? ((this.runToggled || input.run) ? 'run' : 'walk') : 'idle';
      }
    } else if (this.action) this.action.progress = Math.min(1, this.action.progress + dt / this.durations.death);
    this.state = state;
    // An authored full walking attack supplies the leg cycle. Do not overlay another full-body walk.
    const speed = moving ? (this.speeds[state] || 0) * magnitude : 0;
    return { state, speed, moving: speed > 0, phase, loop: ['idle', 'walk', 'run'].includes(state), dead: this.dead };
  }
}

export function normalizedStick(dx, dy, radius = 54) {
  const length = Math.hypot(dx, dy);
  if (length < radius * .1) return { x: 0, y: 0, knobX: dx, knobY: dy };
  const clamp = Math.min(1, radius / length);
  return { x: dx * clamp / radius, y: -dy * clamp / radius, knobX: dx * clamp, knobY: dy * clamp };
}
