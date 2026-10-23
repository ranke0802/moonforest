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
  }
  wake() { this.lastActive = this.now(); }
  limit({ busy = false, quality = 'high' } = {}) {
    if (busy) this.wake();
    if (quality === 'battery') return 30;
    return this.touchDevice && this.now() - this.lastActive >= 3000 ? 30 : 60;
  }
}
