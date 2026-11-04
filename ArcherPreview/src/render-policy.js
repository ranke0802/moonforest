export const RENDER_SCALE_PERCENTAGES=Object.freeze([75,85,100]);
export const defaultRenderScale=touchDevice=>touchDevice?85:100;
export function normalizeRenderScale(value,touchDevice=false){
  const percent=Number(value);
  return RENDER_SCALE_PERCENTAGES.includes(percent)?percent:defaultRenderScale(touchDevice);
}

// Apply the explicit 3D scale after the existing quality/DPR cap. Do not clamp
// again: battery mode at 75% intentionally renders below one CSS pixel per pixel.
export function renderPixelRatio(deviceRatio, quality, touchDevice, renderPercent=100) {
  const caps = touchDevice ? { high: 2, balanced: 1.5, battery: 1 } : { high: 3, balanced: 2, battery: 1 };
  const base=Math.max(1, Math.min(Number(deviceRatio) || 1, caps[quality] ?? caps.high));
  return base*normalizeRenderScale(renderPercent)/100;
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
