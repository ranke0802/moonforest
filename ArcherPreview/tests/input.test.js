import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaygroundInput } from '../src/input.js';

class Surface {
  constructor() { this.events = new Map(); this.style = {}; this.hidden = true; this.captured = new Set(); }
  addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(fn); }
  emit(name, props = {}) { const event = { preventDefault() {}, target: this, ...props }; for (const fn of this.events.get(name) || []) fn(event); }
  focus() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 800 }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
}
function setup() {
  const elements = Object.fromEntries(['#joystick', '#joystick-knob', '#joystick-hint'].map(id => [id, new Surface()]));
  globalThis.window = new Surface();
  globalThis.document = new Surface();
  document.querySelector = selector => elements[selector] || null;
  const canvas = new Surface(), camera = { alpha: 1, beta: 1, radius: 5 };
  const input = new PlaygroundInput(canvas, camera, { canMove: () => true });
  function pointer(name, id, x, y) { canvas.emit(name, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y }); }
  return { input, camera, canvas, elements, pointer };
}

test('DOM stub: dynamic joystick originates at touch, moves, and resets on pointercancel', () => {
  const { input, elements, pointer } = setup();
  pointer('pointerdown', 1, 120, 650);
  assert.equal(input.joystickPointer, 1);
  assert.equal(elements['#joystick'].style.left, '120px');
  assert.equal(elements['#joystick'].hidden, false);
  pointer('pointermove', 1, 174, 596);
  const move = input.value();
  assert.ok(move.x > .7 && move.y > .7);
  assert.ok(Math.abs(Math.hypot(move.x, move.y) - 1) < 1e-12);
  pointer('pointercancel', 1, 174, 596);
  assert.equal(input.joystickPointer, null);
  assert.deepEqual(input.value(), { x: 0, y: 0, run: false });
  assert.equal(elements['#joystick'].hidden, true);
});

test('DOM stub: joystick and two camera pointers remain separate; orbit and pinch operate', () => {
  const { input, camera, pointer } = setup();
  pointer('pointerdown', 1, 150, 650);
  pointer('pointermove', 1, 180, 620);
  const stick = { ...input.stick };
  pointer('pointerdown', 2, 700, 250);
  pointer('pointermove', 2, 720, 250);
  assert.equal(camera.alpha, 1, 'single camera touch must not orbit');
  pointer('pointerdown', 3, 850, 250);
  assert.equal(input.cameraPointers.size, 2);
  assert.equal(input.cameraPointers.has(1), false);
  pointer('pointermove', 3, 900, 270);
  assert.ok(camera.radius < 5, 'spreading fingers zooms closer');
  assert.notEqual(camera.alpha, 1);
  assert.notEqual(camera.beta, 1);
  assert.deepEqual(input.stick, stick, 'camera gesture cannot change joystick value');
  pointer('pointerup', 2, 720, 250);
  const alpha = camera.alpha;
  pointer('pointermove', 3, 920, 270);
  assert.equal(camera.alpha, alpha, 'remaining single camera pointer must not continue orbit');
  assert.equal(input.joystickPointer, 1);
});

test('DOM stub: pan mode changes target offset rather than angles; pinch remains available', () => {
  const { input, camera, pointer } = setup();
  input.cameraMode = 'pan';
  pointer('pointerdown', 2, 650, 200);
  pointer('pointerdown', 3, 850, 200);
  pointer('pointermove', 2, 670, 220);
  pointer('pointermove', 3, 870, 220);
  assert.equal(camera.alpha, 1); assert.equal(camera.beta, 1);
  assert.ok(Math.hypot(input.panOffset.x, input.panOffset.z) > 0);
  assert.ok(input.panOffset.y > 0);
  const radius = camera.radius;
  pointer('pointermove', 3, 950, 220);
  assert.ok(camera.radius < radius);
});

test('DOM stub: lost capture and focus loss clear joystick/camera/key state', () => {
  const { input, canvas, elements, pointer } = setup();
  pointer('pointerdown', 1, 100, 650);
  pointer('pointermove', 1, 145, 650);
  canvas.captured.delete(1);
  canvas.emit('lostpointercapture', { pointerId: 1 });
  assert.equal(input.joystickPointer, null); assert.equal(input.stick.x, 0);
  pointer('pointerdown', 2, 750, 250);
  pointer('pointerdown', 3, 850, 250);
  input.keys.add('KeyW');
  window.emit('blur');
  assert.equal(input.cameraPointers.size, 0); assert.equal(input.keys.size, 0);
  assert.equal(elements['#joystick'].hidden, true);
});
