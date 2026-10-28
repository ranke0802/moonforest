/** Resize from the laid-out canvas, never from the physical screen or notch size.
 * iOS can finish rotating/resuming after window.resize; observe the canvas too.
 * Coalesce event bursts and only reallocate the GPU buffer when its size changes.
 */
export function observeViewportSize(canvas, onResize, host = window) {
  const doc = host.document;
  let frame = null, disposed = false, previous = '';
  const timers = new Set(), listeners = [];
  function measure() {
    frame = null;
    if (disposed || doc.hidden) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const pixelRatio = host.devicePixelRatio || 1;
    if (width <= 0 || height <= 0) return;
    const key = `${width}:${height}:${pixelRatio}`;
    if (key === previous) return;
    previous = key;
    onResize({ width, height, pixelRatio });
  }
  function schedule() {
    if (!disposed && frame === null) frame = host.requestAnimationFrame(measure);
  }
  function settle() {
    schedule();
    // Bounded checks for older WebKit's delayed rotation / home-screen restore.
    for (const timer of timers) host.clearTimeout(timer);
    timers.clear();
    for (const delay of [150, 500]) {
      const timer = host.setTimeout(() => { timers.delete(timer); schedule(); }, delay);
      timers.add(timer);
    }
  }
  function listen(target, event, handler) {
    target?.addEventListener(event, handler);
    if (target) listeners.push(() => target.removeEventListener(event, handler));
  }
  const observer = host.ResizeObserver ? new host.ResizeObserver(schedule) : null;
  observer?.observe(canvas);
  listen(host, 'resize', schedule);
  listen(host.visualViewport, 'resize', schedule);
  listen(host, 'orientationchange', settle);
  listen(host.screen?.orientation, 'change', settle);
  listen(host, 'pageshow', settle);
  listen(doc, 'visibilitychange', () => { if (!doc.hidden) settle(); });
  listen(doc, 'fullscreenchange', settle);
  listen(doc, 'webkitfullscreenchange', settle);
  schedule();
  return () => {
    disposed = true;
    observer?.disconnect();
    for (const remove of listeners) remove();
    if (frame !== null) host.cancelAnimationFrame(frame);
    for (const timer of timers) host.clearTimeout(timer);
    timers.clear();
  };
}
