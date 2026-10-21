/** Sample the supplied clip intact; stage movement does not retarget its bones. */
export class NativeReviewController {
  constructor({ durations, fps = 60 }) {
    this.duration = durations.native;
    this.fps = fps;
    this.state = 'native';
    this.time = 0;
    this.rate = 1;
    this.playing = false;
    this.loop = false;
    this.dead = false;
  }
  get frame() { return Math.round(this.time * this.fps) + 1; }
  get lastFrame() { return Math.round(this.duration * this.fps) + 1; }
  setAttackSpeed(rate) { this.rate = Math.max(.5, Math.min(2, Number(rate) || 1)); }
  attack() { this.time = 0; this.playing = true; }
  setAttackHeld(held) { if (held) this.attack(); }
  togglePlay() { if (this.time >= this.duration) this.time = 0; this.playing = !this.playing; }
  seek(frame) { this.playing = false; this.time = Math.max(0, Math.min(this.duration, (frame - 1) / this.fps)); }
  update(dt, input = {}) {
    if (this.playing) {
      this.time += Math.max(0, dt) * this.rate;
      if (this.time >= this.duration) {
        if (this.loop && this.duration > 0) this.time %= this.duration;
        else { this.time = this.duration; this.playing = false; }
      }
    }
    const magnitude = Math.min(1, Math.hypot(input.x || 0, input.y || 0));
    return { state: this.state, clipTime: this.time, loop: false, blendDuration: 0,
      moving: magnitude > 0, speed: magnitude * 1.2, events: [] };
  }
}
