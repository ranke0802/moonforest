// Babylon's WebGL compile notification identifies the engine, not the Effect.
const RECENT_EFFECTS = 12;

function short(value, limit) {
  if (typeof value !== 'string') return null;
  return value.length > limit ? value.slice(0, limit) + '…' : value;
}

function effectName(effect) {
  const name = effect.name;
  if (typeof name === 'string') return short(name, 80);
  const vertex = short(name?.vertex ?? name?.vertexElement, 80);
  const fragment = short(name?.fragment ?? name?.fragmentElement, 80);
  return short(vertex && fragment ? vertex + ' / ' + fragment : vertex || fragment, 80);
}

export function createShaderBirthWatch(getEngine, now = () => performance.now()) {
  let engine = null, observer = null, disposeObserver = null, seen = null;
  let inFrame = false, frameAttempts = 0, betweenAttempts = 0, pendingBetween = 0;
  const recent = [];

  function pause() {
    engine?.onBeforeShaderCompilationObservable?.remove(observer);
    engine?.onDisposeObservable?.remove(disposeObserver);
    engine = observer = disposeObserver = seen = null;
    inFrame = false;
    frameAttempts = betweenAttempts = pendingBetween = 0;
    recent.length = 0;
  }

  function onAttempt() {
    if (inFrame) frameAttempts++;
    else pendingBetween++;
  }

  function observeEffects(baseline) {
    const effects = engine?._compiledEffects;
    if (!effects) return;
    let observedAtMs;
    for (const key in effects) {
      const effect = effects[key];
      if (!effect || typeof effect !== 'object' || seen.has(effect)) continue;
      seen.add(effect);
      if (baseline) continue;
      observedAtMs ??= Math.round(now());
      if (recent.length === RECENT_EFFECTS) recent.shift();
      recent.push({observedAtMs, shader: effectName(effect), defines: short(effect.defines, 160)});
    }
  }

  return {
    beginFrame(firstCollectedFrame = false) {
      const next = getEngine();
      if (next !== engine || firstCollectedFrame) {
        pause();
        if (!next?.onBeforeShaderCompilationObservable) return;
        engine = next;
        seen = new WeakSet();
        observeEffects(true);
        observer = engine.onBeforeShaderCompilationObservable.add(onAttempt);
        disposeObserver = engine.onDisposeObservable?.add(pause);
      }
      frameAttempts = 0;
      betweenAttempts = pendingBetween;
      pendingBetween = 0;
      inFrame = true;
    },
    endFrame() {
      inFrame = false;
      if (frameAttempts || betweenAttempts) observeEffects(false);
    },
    get frameAttempts() { return frameAttempts; },
    get betweenAttempts() { return betweenAttempts; },
    recentEffects() { return recent.map(entry => ({...entry})); },
    pause,
  };
}
