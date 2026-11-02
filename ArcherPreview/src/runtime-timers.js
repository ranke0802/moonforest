// Window timer functions require their host as the receiver in browsers.
// Keep injected clocks on their own receiver too; never call a copied native
// function as a method of a lifetime or decoder instance.
export function runtimeTimers(timers={}){
  return {
    now:()=>timers.now?timers.now():globalThis.performance.now(),
    setTimeout:(callback,delay)=>timers.setTimeout?timers.setTimeout(callback,delay):globalThis.setTimeout(callback,delay),
    clearTimeout:id=>timers.clearTimeout?timers.clearTimeout(id):globalThis.clearTimeout(id),
  };
}
