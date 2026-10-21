import { normalizeAttackSpeed } from './controller.js';

/** Supplied full-body Run_03 and Thrust_Slash. Attack finishes before locomotion resumes. */
export class NativeWarriorController {
  constructor({ durations, speeds = {} }) {
    this.durations = durations;
    this.runSpeed = speeds.run || 2.4;
    this.attackSpeed = 1;
    this.state = 'idle';
    this.dead = false;
    this.time = 0;
    this.action = null;
    this.held = false;
    this.queued = false;
    this.serial = 0;
  }
  setAttackSpeed(value) { this.attackSpeed = normalizeAttackSpeed(value); }
  startAttack() { this.action = { id: ++this.serial, time: 0 }; this.queued = false; }
  attack() { if (this.action) this.queued = true; else this.startAttack(); return true; }
  setAttackHeld(held) { this.held = held; if (held && !this.action) this.startAttack(); return true; }
  update(dt, input = {}) {
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const magnitude = Math.min(1, Math.hypot(input.x || 0, input.y || 0));
    const previous = this.state;
    if (this.action) {
      this.action.time += dt * this.attackSpeed;
      if (this.action.time >= this.durations.attack) {
        const overflow = this.action.time % this.durations.attack;
        if (this.held || this.queued) { this.startAttack(); this.action.time = overflow; }
        else this.action = null;
      }
    }
    this.state = this.action ? 'attack' : magnitude > .08 ? 'run' : 'idle';
    if (this.state !== previous) this.time = 0;
    // Scale the gait clock with analog movement so short joystick travel does not slide.
    if (this.state === 'run') this.time = (this.time + dt * magnitude) % this.durations.run;
    return { state:this.state, clipTime:this.action ? this.action.time : this.time,
      moving:this.state === 'run', speed:this.state === 'run' ? this.runSpeed * magnitude : 0,
      loop:this.state !== 'attack', actionId:this.action?.id ?? null,
      blendDuration:.14, events:[] };
  }
}
