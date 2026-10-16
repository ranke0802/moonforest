export const STATE_LABELS = { idle: '대기', walk: '걷기', run: '달리기', attack: '활 공격', moveAttack: '이동 공격', hit: '피격', death: '사망' };

// Authored 30fps frames: release 54, arrow hidden 58, final pose 81.
// Keep the draw/release at normal speed; only accelerate the arrow-hidden recovery.
export const ATTACK_TIMING = Object.freeze({ releasePhase: 53 / 80, recoveryPhase: 57 / 80, recoveryRate: 3, blendDuration: .08 });
const isAttack = state => state === 'attack' || state === 'moveAttack';
const seconds = value => Number.isFinite(value) ? Math.max(0, value) : 0;

/** Gameplay timing is independent of rendering and never changes the authored root bone. */
export class CharacterController {
  constructor({ durations = {}, speeds = {} } = {}) {
    this.durations = { idle: 2, walk: 4 / 3, run: .8, attack: 8 / 3, moveAttack: 8 / 3, hit: 5 / 6, death: 2.8, ...durations };
    this.speeds = { walk: 1.1297524, run: 3.0859220759743686, moveAttack: 1.1297524, ...speeds };
    this.runToggled = false;
    this.action = null;
    this.state = 'idle';
    this.dead = false;
    this.attackQueued = false;
    this.attackHeld = false;
    this.nextActionId = 1;
  }
  _start(kind) {
    // Both attack variants share one clock, even when movement changes mid-shot.
    this.action = { kind, id: this.nextActionId++, progress: 0, clipTime: 0, elapsed: 0, released: false, duration: Math.max(.01, this.durations[kind]) };
  }
  attack() {
    if (this.dead || this.action?.kind === 'hit') return false;
    if (this.action?.kind === 'attack') {
      if (this.attackQueued) return false;
      this.attackQueued = true;
      return true;
    }
    this._start('attack');
    return true;
  }
  setAttackHeld(held) {
    if (!held) { this.attackHeld = false; return true; }
    if (this.dead || this.action?.kind === 'hit') return false;
    this.attackHeld = true;
    // A held button is not a buffered tap: releasing it must cancel the next auto-shot.
    if (!this.action) this._start('attack');
    return true;
  }
  _cancelAttackInput() { this.attackQueued = false; this.attackHeld = false; }
  hit() {
    if (this.dead) return false;
    this._cancelAttackInput();
    this._start('hit');
    return true;
  }
  die() { if (this.dead) return; this._cancelAttackInput(); this.dead = true; this._start('death'); }
  revive() { this._cancelAttackInput(); this.dead = false; this.action = null; this.state = 'idle'; this.runToggled = false; }
  toggleRun() { if (!this.dead) this.runToggled = !this.runToggled; }
  _advance(dt, moving, events) {
    let remaining = dt;
    while (this.action && remaining > 0) {
      const action = this.action;
      const attack = action.kind === 'attack';
      const recoveryStart = action.duration * ATTACK_TIMING.recoveryPhase;
      const rate = attack && action.clipTime >= recoveryStart - 1e-10 ? ATTACK_TIMING.recoveryRate : 1;
      const boundary = attack && action.clipTime < recoveryStart - 1e-10 ? recoveryStart : action.duration;
      const step = Math.min(remaining, Math.max(0, (boundary - action.clipTime) / rate));
      const before = action.clipTime;
      action.clipTime = Math.min(boundary, before + step * rate);
      if (attack && !action.released && action.clipTime >= action.duration * ATTACK_TIMING.releasePhase - 1e-10) {
        const releaseTime = action.duration * ATTACK_TIMING.releasePhase;
        events.push({ type: 'release', release: true, actionId: action.id, state: moving ? 'moveAttack' : 'attack', phase: ATTACK_TIMING.releasePhase, clipTime: releaseTime, actionTime: action.elapsed + (releaseTime - before) / rate, timeInUpdate: dt - remaining + (releaseTime - before) / rate });
        action.released = true;
      }
      action.elapsed += step;
      action.progress = action.clipTime / action.duration;
      remaining = Math.max(0, remaining - step);
      if (action.clipTime >= action.duration - 1e-10) {
        action.clipTime = action.duration;
        action.progress = 1;
        if (action.kind === 'death') break;
        this.action = null;
        if (attack && (this.attackQueued || this.attackHeld)) {
          this.attackQueued = false;
          this._start('attack');
        }
      }
    }
  }
  update(dt, input = {}) {
    const magnitude = Math.min(1, Math.hypot(input.x || 0, input.y || 0));
    const events = [];
    const previous = this.state;
    this._advance(seconds(dt), magnitude > .08, events);
    const moving = magnitude > .08 && !this.dead && this.action?.kind !== 'hit';
    const state = this.dead ? 'death' : this.action?.kind === 'hit' ? 'hit' : this.action?.kind === 'attack' ? (moving ? 'moveAttack' : 'attack') : moving ? ((this.runToggled || input.run) ? 'run' : 'walk') : 'idle';
    const phase = this.action?.progress || 0;
    const attackPhase = !isAttack(state) ? null : phase < ATTACK_TIMING.releasePhase ? 'windup' : phase < ATTACK_TIMING.recoveryPhase ? 'followThrough' : 'recovery';
    const timeScale = this.action ? (attackPhase === 'recovery' ? ATTACK_TIMING.recoveryRate : 1) * this.durations[state] / this.action.duration : 1;
    this.state = state;
    // An authored full walking attack supplies the leg cycle. Do not overlay another full-body walk.
    const speed = moving ? (this.speeds[state] || 0) * magnitude : 0;
    // phase/clipTime describe the END of this update, so rendering and release events agree.
    return { state, speed, moving: speed > 0, phase, clipTime: this.action ? phase * this.durations[state] : undefined, timeScale, actionId: this.action?.id ?? null, actionTime: this.action?.elapsed ?? 0, attackPhase, attackQueued: this.attackQueued, attackHeld: this.attackHeld, events, blendDuration: isAttack(state) || isAttack(previous) ? ATTACK_TIMING.blendDuration : .14, loop: ['idle', 'walk', 'run'].includes(state), dead: this.dead };
  }
}

export function normalizedStick(dx, dy, radius = 54) {
  const length = Math.hypot(dx, dy);
  if (length < radius * .1) return { x: 0, y: 0, knobX: dx, knobY: dy };
  const clamp = Math.min(1, radius / length);
  return { x: dx * clamp / radius, y: -dy * clamp / radius, knobX: dx * clamp, knobY: dy * clamp };
}
