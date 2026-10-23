/** Fullscreen is requested inside the click gesture. Landscape lock is optional. */
export function setupFullscreen(button, notify = () => {}, { autoEnter = false } = {}) {
  if (!button) return () => {};
  const root = document.documentElement;
  const orientation = globalThis.screen?.orientation;
  const iconOnly = button.textContent?.trim() === '⛶';
  const isLandscape = () => Boolean(orientation?.type?.startsWith('landscape') || globalThis.matchMedia?.('(orientation: landscape)').matches);
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  let pending = false;
  let disposed = false;
  let wasFullscreen = false;
  function disarmAutoEntry() {
    document.removeEventListener('pointerup', autoGesture, {capture:true});
    document.removeEventListener('keydown', autoGesture, {capture:true});
  }
  function autoGesture(event) {
    if(pending || button.contains(event.target))return;
    if(event.type==='keydown' && ['Escape','Control','Shift','Alt','Meta'].includes(event.key))return;
    disarmAutoEntry();
    void toggle({quiet:true,enterOnly:true});
  }

  function unlock() {
    try { orientation?.unlock?.(); } catch { /* Unsupported or already unlocked. */ }
  }
  function sync() {
    const active = Boolean(fullscreenElement());
    if (wasFullscreen && !active) unlock();
    wasFullscreen = active;
    if(active)disarmAutoEntry();
    button.textContent = iconOnly ? (active ? '⤡' : '⛶') : (active ? '화면 축소' : '전체화면');
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? '화면 축소' : '전체화면');
    button.title = active ? '화면 축소' : '전체화면으로 열고 가로 방향 잠금 시도';
  }
  function waitForWebkitEntry() {
    if (fullscreenElement()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const names = ['fullscreenchange', 'webkitfullscreenchange', 'fullscreenerror', 'webkitfullscreenerror'];
      const timer = setTimeout(() => finish(false), 1800);
      function finish(success) {
        clearTimeout(timer);
        for (const name of names) document.removeEventListener(name, changed);
        success ? resolve() : reject(new Error('Fullscreen unavailable'));
      }
      function changed() { finish(Boolean(fullscreenElement())); }
      for (const name of names) document.addEventListener(name, changed);
    });
  }
  async function toggle({quiet=false,enterOnly=false}={}) {
    if (pending || disposed) return;
    if(enterOnly && fullscreenElement()){sync();return;}
    const report=quiet?()=>{}:notify;
    const exiting = Boolean(fullscreenElement());
    const method = exiting
      ? (document.exitFullscreen || document.webkitExitFullscreen)
      : (root.requestFullscreen || root.webkitRequestFullscreen);
    if (!method) {
      report(exiting ? '브라우저의 전체화면 종료 기능을 사용해 주세요.' : '이 브라우저는 페이지 전체화면을 지원하지 않습니다. 휴대폰을 가로로 돌려 사용해 주세요.');
      return;
    }
    pending = true;
    button.disabled = true;
    try {
      // Do not await anything before this call: transient user activation is required.
      const request = method.call(exiting ? document : root);
      if (request?.then) await request;
      else if (!exiting) await waitForWebkitEntry();
      if (disposed) return;
      if (exiting) { sync(); return; }
      if (!fullscreenElement()) throw new Error('Fullscreen not entered');
      sync();
      if (typeof orientation?.lock === 'function') {
        try {
          await orientation.lock('landscape');
          if (!fullscreenElement() || disposed) unlock();
        } catch {
          if (!disposed && fullscreenElement() && !isLandscape()) report('전체화면은 열렸지만 가로 방향을 자동으로 잠글 수 없습니다. 휴대폰을 가로로 돌려 사용해 주세요.');
        }
      } else {
        if (!isLandscape()) report('전체화면은 열렸습니다. 가로 잠금을 지원하지 않는 브라우저이므로 휴대폰을 가로로 돌려 사용해 주세요.');
      }
    } catch {
      if (!disposed) report(exiting ? '전체화면을 종료하지 못했습니다. 브라우저의 종료 기능을 사용해 주세요.' : '전체화면을 열지 못했습니다. 휴대폰을 가로로 돌려 사용하거나 브라우저에서 다시 시도해 주세요.');
    } finally {
      pending = false;
      if (!disposed) { button.disabled = false; sync(); }
    }
  }

  const onButton=()=>{disarmAutoEntry();void toggle();};
  button.addEventListener('click', onButton);
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
  if(autoEnter && !fullscreenElement() && (root.requestFullscreen || root.webkitRequestFullscreen)){
    document.addEventListener('pointerup',autoGesture,{capture:true,passive:true});
    document.addEventListener('keydown',autoGesture,{capture:true,passive:true});
    // Entry on load is only possible if this navigation retained user activation.
    if(globalThis.navigator?.userActivation?.isActive)void toggle({quiet:true,enterOnly:true});
  }
  return () => {
    disposed = true;
    button.removeEventListener('click', onButton);
    disarmAutoEntry();
    document.removeEventListener('fullscreenchange', sync);
    document.removeEventListener('webkitfullscreenchange', sync);
    unlock();
  };
}
