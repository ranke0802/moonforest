// Keep the asset detail intact; bound supersampling on touch devices instead.
export function renderPixelRatio(deviceRatio, quality, touchDevice) {
  const caps = touchDevice ? { high: 2, balanced: 1.5, battery: 1 } : { high: 3, balanced: 2, battery: 1 };
  return Math.max(1, Math.min(Number(deviceRatio) || 1, caps[quality] ?? caps.high));
}

export class RenderActivity {
  constructor(touchDevice, now = () => performance.now()) {
    this.touchDevice = touchDevice;
    this.now = now;
    this.lastActive = now();
    this.targetFps = 30;
  }
  wake() { this.lastActive = this.now(); }
  setTargetFps(value) { this.targetFps=Number(value)===60?60:30;return this.targetFps; }
  limit({ busy = false } = {}) {
    if (busy) this.wake();
    // Explicit user choice is independent of device and resolution quality.
    // Real frame time still drives simulation; this is a cap, not a time scale.
    return this.targetFps;
  }
}
