import { normalizeAttackSpeed } from './controller.js';

export const WARRIOR_LABELS = { idle: '대기', walk: '걷기', run: '달리기', guard: '방어 태세', slashDown: '사선 베기', slashReturn: '반대 베기', thrust: '찌르기', hit: '피격', death: '쓰러짐' };
export const WARRIOR_ATTACKS = ['slashDown', 'slashReturn', 'thrust'];
export class WarriorController {
  constructor({ durations = {}, speeds = {} } = {}) {
    this.durations = { idle: 2, walk: 1.2, run: 22 / 30, guard: 2, slashDown: 1.4, slashReturn: 1.4, thrust: 1.4, hit: .9, death: 2.5, ...durations };
    this.speeds = { walk: .775862, run: 2.272727, ...speeds };
    this.nextActionId = 1; this.attackSpeed = 1; this.revive();
  }
  _start(kind) { this.action = { kind, id: this.nextActionId++, time: 0, struck: false }; }
  _attack() { this._start(WARRIOR_ATTACKS[this.combo++ % WARRIOR_ATTACKS.length]); }
  attack() {
    if (this.dead || this.action?.kind === 'hit') return false;
    if (this.action) this.queued = true; else this._attack();
    return true;
  }
  setAttackHeld(held) {
    if (!held) { this.held = false; return true; }
    if (this.dead || this.action?.kind === 'hit') return false;
    this.held = true; if (!this.action) this._attack(); return true;
  }
  toggleGuard() { if (!this.dead && !this.action) this.guardToggled = !this.guardToggled; }
  toggleRun() { if (!this.dead) this.runToggled = !this.runToggled; }
  setAttackSpeed(value) { this.attackSpeed = normalizeAttackSpeed(value); }
  hit() { if (this.dead) return false; this.held = this.queued = this.guardToggled = false; this._start('hit'); return true; }
  die() { if (this.dead) return; this.held = this.queued = this.guardToggled = false; this.dead = true; this._start('death'); }
  revive() { this.action = null; this.dead = this.held = this.queued = this.guardToggled = this.runToggled = false; this.combo = 0; this.state = 'idle'; }
  update(dt, input = {}) {
    let remaining = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const events = [], previous = this.state;
    while (this.action && remaining > 0) {
      const a = this.action, attack = WARRIOR_ATTACKS.includes(a.kind), duration = this.durations[a.kind], rate = attack ? this.attackSpeed : 1;
      const step = Math.min(remaining, (duration - a.time) / rate);
      a.time = Math.min(duration, a.time + step * rate); remaining -= step;
      if (attack && !a.struck && a.time >= duration * .5) { events.push({ type: 'strike', actionId: a.id, state: a.kind }); a.struck = true; }
      if (a.time < duration - 1e-9 || a.kind === 'death') break;
      this.action = null;
      if (attack && (this.held || this.queued)) { this.queued = false; this._attack(); }
    }
    const magnitude = Math.min(1, Math.hypot(input.x || 0, input.y || 0));
    // A movement command exits the stationary shield stance.
    if (magnitude > .08) this.guardToggled = false;
    this.state = this.action?.kind || (this.guardToggled ? 'guard' : magnitude > .08 ? ((this.runToggled || input.run) ? 'run' : 'walk') : 'idle');
    const speed = this.action || this.guardToggled ? 0 : (this.speeds[this.state] || 0) * magnitude;
    return { state: this.state, speed, moving: speed > 0, loop: !this.action, dead: this.dead, actionId: this.action?.id ?? null, clipTime: this.action?.time, phase: this.action ? this.action.time / this.durations[this.state] : 0, timeScale: WARRIOR_ATTACKS.includes(this.state) ? this.attackSpeed : 1, blendDuration: this.state === 'death' || previous === 'death' ? .12 : .16, events };
  }
}
