/** Resize from the laid-out canvas, never from the physical screen or notch size.
 * iOS can finish rotating/resuming after window.resize; observe the canvas too.
 * Let mobile rotation/toolbar layout settle before reallocating the GPU buffer.
 */
export function observeViewportSize(canvas, onResize, host = window, {onLayout=()=>{},onPending=()=>{}} = {}) {
  const doc = host.document;
  const mobile=host.matchMedia?host.matchMedia('(pointer:coarse)').matches:!!host.navigator?.maxTouchPoints;
  const quietMs=mobile?125:80,maxWaitMs=mobile?500:250;
  const now=()=>host.performance?.now?.()??performance.now();
  let frame=null,timer=null,disposed=false,previous='',committed=null,pending=null;
  let watchUntil=0,watchAt=Infinity,lastNotice='false:false:false';
  const listeners=[],subscribers=new Set();
  const copy=size=>size?{width:size.width,height:size.height,pixelRatio:size.pixelRatio}:null;
  function snapshot(){
    const at=now();
    // Texture work also waits for delayed rotation/resume layout. Keep the
    // watch active until its final measurement, even if that frame runs late.
    return {settling:!!pending||!!watchUntil,disposed,mobile,committed:copy(committed),pending:copy(pending?.size),
      elapsedMs:pending?Math.max(0,at-pending.started):0,stableMs:pending?Math.max(0,at-pending.changed):0,
      quietMs,maxWaitMs,watching:!!watchUntil};
  }
  function notify(){
    const state=snapshot(),key=`${state.settling}:${state.watching}:${state.disposed}`;
    if(key===lastNotice)return;lastNotice=key;
    for(const listener of [...subscribers])listener(state);
  }
  function clearTimer(){if(timer!==null)host.clearTimeout(timer);timer=null;}
  function arm(at=now()){
    clearTimer();
    if(disposed||doc.hidden)return;
    let due=pending?Math.min(pending.changed+quietMs,pending.started+maxWaitMs):Infinity;
    if(watchUntil>at)due=Math.min(due,watchAt,watchUntil);
    if(Number.isFinite(due))timer=host.setTimeout(()=>{timer=null;schedule();},Math.max(0,due-at));
  }
  function commit(size,key){
    const wasPending=!!pending;pending=null;
    if(key!==previous){previous=key;committed=copy(size);onResize(copy(size));}
    else onLayout(copy(size));
    if(wasPending)notify();
  }
  function measure() {
    frame = null;
    if (disposed || doc.hidden) return;
    const at=now();
    if(watchUntil&&at>=watchUntil){watchUntil=0;watchAt=Infinity;}
    else if(at>=watchAt)watchAt=Math.min(watchUntil,at+quietMs);
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const pixelRatio = host.devicePixelRatio || 1;
    if (width <= 0 || height <= 0) {
      // A detached/hidden canvas has no valid buffer to commit. Drop an old
      // deadline rather than repeatedly scheduling an already-expired timer.
      if(pending){pending=null;notify();}
      arm(at);notify();return;
    }
    const size={width,height,pixelRatio};
    const key = `${width}:${height}:${pixelRatio}`;
    // Startup is immediate. Batch subsequent fullscreen/resize bursts on both
    // desktop and mobile so each intermediate size does not clear the canvas.
    if(!previous){commit(size,key);arm(at);notify();return;}
    if(key!==previous&&!pending){
      pending={size,key,started:at,changed:at};
      onPending(copy(size));notify();
    }else if(pending&&key!==pending.key){pending.size=size;pending.key=key;pending.changed=at;}
    if(pending){
      if(at-pending.changed>=quietMs||at-pending.started>=maxWaitMs)commit(size,key);
      arm(at);notify();return;
    }
    // A 180-degree phone turn can swap CSS safe-area insets without changing
    // canvas dimensions. Refresh lightweight HUD layout without reallocating
    // the renderer or resetting held input for an unchanged backing size.
    onLayout(size);arm(at);notify();
  }
  function schedule() {
    if (!disposed && !doc.hidden && frame === null) frame = host.requestAnimationFrame(measure);
  }
  function settle() {
    if(disposed||doc.hidden)return;
    const at=now();watchUntil=at+maxWaitMs;watchAt=at+quietMs;
    schedule();
    // Probe delayed WebKit layout even without ResizeObserver. This texture
    // gate does not cancel input or resize the buffer until CSS really changes.
    // Probes share the timer and cannot commit the same backing size twice.
    arm(at);notify();
  }
  function visibility(){
    if(!doc.hidden){settle();return;}
    if(frame!==null)host.cancelAnimationFrame(frame);frame=null;clearTimer();
    watchUntil=0;watchAt=Infinity;
    pending=null;notify();
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
  listen(doc, 'visibilitychange', visibility);
  listen(doc, 'fullscreenchange', settle);
  listen(doc, 'webkitfullscreenchange', settle);
  schedule();
  const dispose=() => {
    if(disposed)return;
    disposed = true;
    observer?.disconnect();
    for (const remove of listeners) remove();
    if (frame !== null) host.cancelAnimationFrame(frame);
    frame=null;clearTimer();pending=null;watchUntil=0;watchAt=Infinity;
    notify();subscribers.clear();
  };
  dispose.isSettling=()=>!!pending||!!watchUntil;
  dispose.snapshot=snapshot;
  dispose.subscribe=listener=>{if(disposed)return()=>{};subscribers.add(listener);return()=>subscribers.delete(listener);};
  return dispose;
}
