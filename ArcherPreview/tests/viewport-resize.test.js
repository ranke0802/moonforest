import test from 'node:test';
import assert from 'node:assert/strict';
import { observeViewportSize } from '../src/viewport-resize.js';
import { isInstalledDisplay } from '../src/app-display.js';

function fixture(t, { width = 393, height = 852, observer = true } = {}) {
  const host = new EventTarget(), doc = new EventTarget(), canvas = { clientWidth: width, clientHeight: height };
  const frames = new Map(), timers = new Map(), calls = [];
  let next = 0, resizeObserver;
  host.document = doc;
  host.devicePixelRatio = 3;
  host.screen = { orientation: new EventTarget() };
  host.visualViewport = Object.assign(new EventTarget(), { width, height: height - 59, scale: 1 });
  host.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
  host.cancelAnimationFrame = id => frames.delete(id);
  host.setTimeout = fn => { timers.set(++next, fn); return next; };
  host.clearTimeout = id => timers.delete(id);
  if (observer) host.ResizeObserver = class {
    constructor(fn) { this.fn = fn; resizeObserver = this; }
    observe(target) { assert.equal(target, canvas); }
    disconnect() { this.disconnected = true; }
  };
  const dispose = observeViewportSize(canvas, size => calls.push(size), host);
  t.after(dispose);
  const flush = () => { const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(); };
  const settle = () => { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); flush(); };
  return { host, doc, canvas, calls, frames, timers, flush, settle, dispose, observer: () => resizeObserver };
}

test('iPhone 14 Pro portrait → landscape sizes the renderer from the full canvas, not the status-bar-reduced visual viewport', t => {
  const f = fixture(t); f.flush();
  assert.deepEqual(f.calls.at(-1), { width: 393, height: 852, pixelRatio: 3 });
  f.host.dispatchEvent(new Event('orientationchange'));
  f.flush(); // WebKit may report the previous portrait size for this event.
  assert.equal(f.calls.length, 1);
  f.canvas.clientWidth = 852; f.canvas.clientHeight = 393;
  f.host.visualViewport.width = 852; f.host.visualViewport.height = 334;
  f.observer().fn(); f.host.visualViewport.dispatchEvent(new Event('resize')); f.host.dispatchEvent(new Event('resize'));
  assert.equal(f.frames.size, 1); f.flush(); f.settle();
  assert.deepEqual(f.calls.at(-1), { width: 852, height: 393, pixelRatio: 3 });
  assert.equal(f.calls.length, 2);
});

test('browser toolbar and short landscape layouts remain below the former 380px minimum', t => {
  const f = fixture(t, { width: 852, height: 320 }); f.flush();
  f.canvas.clientHeight = 294; f.host.visualViewport.dispatchEvent(new Event('resize')); f.flush();
  assert.equal(f.calls.at(-1).height, 294);
  f.canvas.clientHeight = 393; f.observer().fn(); f.flush();
  assert.equal(f.calls.at(-1).height, 393);
});

test('event storms and unchanged resumed geometry never repeatedly allocate a render buffer', t => {
  const f = fixture(t); f.flush();
  for (let i = 0; i < 100; i++) { f.host.dispatchEvent(new Event('resize')); f.host.dispatchEvent(new Event('pageshow')); }
  assert.equal(f.frames.size, 1); assert.equal(f.timers.size, 2);
  f.flush(); f.settle(); assert.equal(f.calls.length, 1);
  f.host.devicePixelRatio = 2; f.host.dispatchEvent(new Event('resize')); f.flush();
  assert.equal(f.calls.length, 2); assert.equal(f.calls.at(-1).pixelRatio, 2);
});

test('home-screen resume catches delayed layout without ResizeObserver and ignores hidden/zero-sized frames', t => {
  const f = fixture(t, { observer: false }); f.flush();
  f.doc.hidden = true; f.canvas.clientHeight = 0; f.host.dispatchEvent(new Event('resize')); f.flush();
  assert.equal(f.calls.length, 1);
  f.doc.hidden = false; f.doc.dispatchEvent(new Event('visibilitychange')); f.flush();
  f.canvas.clientWidth = 852; f.canvas.clientHeight = 393; f.settle();
  assert.equal(f.calls.length, 2); assert.equal(f.calls.at(-1).height, 393);
});

test('dispose cancels rotation checks, observers and all resize listeners', t => {
  const f = fixture(t); f.host.dispatchEvent(new Event('pageshow')); f.dispose();
  f.host.dispatchEvent(new Event('resize')); f.host.visualViewport.dispatchEvent(new Event('resize'));
  f.flush(); f.settle();
  assert.equal(f.calls.length, 0); assert.equal(f.observer().disconnected, true);
  assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
});

test('installed display recognizes iOS legacy standalone and manifest display modes without guessing from user agent', () => {
  assert.equal(isInstalledDisplay({ navigator: { standalone: true } }), true);
  for (const mode of ['standalone', 'fullscreen']) assert.equal(isInstalledDisplay({ matchMedia: query => ({ matches: query === `(display-mode: ${mode})` }) }), true);
  assert.equal(isInstalledDisplay({ navigator: { userAgent: 'iPhone', standalone: false }, matchMedia: () => ({ matches: false }) }), false);
});
