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
    this.slowTime = 0;
    this.measuredTime = 0;
    this.measuredFrames = 0;
    this.sustainedLimit = 60;
  }
  wake() { this.lastActive = this.now(); }
  recordFrame(dt) {
    if(this.touchDevice||this.sustainedLimit===30||dt<=0||dt>.1)return;
    this.measuredTime+=dt;this.measuredFrames++;
    if(this.measuredTime<1)return;
    const fps=this.measuredFrames/this.measuredTime;
    this.slowTime=fps<54?this.slowTime+this.measuredTime:0;
    if(this.slowTime>=3)this.sustainedLimit=30;
    this.measuredTime=0;this.measuredFrames=0;
  }
  limit({ busy = false, quality = 'high' } = {}) {
    if (busy) this.wake();
    // Do not wake phones back to 60 during combat: sustained GPU load is the
    // thermal problem, not just idle rendering. Animation time stays unchanged.
    if (this.touchDevice || quality === 'battery') return 30;
    return this.sustainedLimit;
  }
}
