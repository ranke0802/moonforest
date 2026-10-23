import { normalizedStick } from './controller.js';

export class PlaygroundInput {
  constructor(canvas, camera, callbacks) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks;
    this.keys = new Set();
    this.stick = { x: 0, y: 0 };
    this.stickIntent = { x: 0, y: 0 };
    this.joystickPointer = null;
    this.cameraPointers = new Map();
    this.mousePointer = null;
    this.mouseAttackPointer = null;
    this.mouseButtons = 0;
    this.mouseChordReleased = false;
    this.cameraMode = 'orbit';
    this.panOffset = { x: 0, y: 0, z: 0 };
    this.knob = document.querySelector('#joystick-knob');
    this.joystick = document.querySelector('#joystick');
    this.hint = document.querySelector('#joystick-hint');
    this.abort = new AbortController();
    const opts = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', e => this.pointerDown(e), opts);
    canvas.addEventListener('pointermove', e => this.pointerMove(e), opts);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, e => this.pointerUp(e), opts);
    canvas.addEventListener('contextmenu', e => e.preventDefault(), opts);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.getBoundingClientRect().height : 1;
      this.zoom(Math.exp(Math.max(-.5, Math.min(.5, e.deltaY * unit * .0025))));
    }, { ...opts, passive: false });
    window.addEventListener('keydown', e => this.keyDown(e), opts);
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'KeyJ') this.callbacks.setAttackHeld?.(false);
    }, opts);
    window.addEventListener('blur', () => this.reset(), opts);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); }, opts);
  }
  keyDown(e) {
    if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const controls = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyH', 'KeyK', 'KeyR', 'KeyF', 'KeyE', 'Space'];
    if (!controls.includes(e.code)) return;
    e.preventDefault();
    const wasDown = this.keys.has(e.code);
    this.keys.add(e.code);
    if(!wasDown&&!e.repeat&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.code))this.callbacks.move?.();
    if (e.code === 'KeyJ') {
      if (!wasDown && !e.repeat) {
        if (this.callbacks.setAttackHeld) this.callbacks.setAttackHeld(true);
        else this.callbacks.attack?.();
      }
    } else if (!wasDown&&!e.repeat) ({ KeyH: this.callbacks.hit, KeyK: this.callbacks.death, KeyR: this.callbacks.revive, KeyF: this.callbacks.guard, KeyE: this.callbacks.potion, Space: this.callbacks.dodge }[e.code])?.();
  }
  pointerDown(e) {
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'mouse') { this.mousePointer = e.pointerId; this.updateMouseButtons(e); return; }
    const box = this.canvas.getBoundingClientRect();
    const inMoveZone = e.clientX - box.left < box.width * .42 && e.clientY - box.top > box.height * .55;
    if (e.pointerType === 'touch' && inMoveZone && this.joystickPointer === null && this.callbacks.canMove()) {
      this.joystickPointer = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.joystick.style.left = `${e.clientX - box.left}px`;
      this.joystick.style.top = `${e.clientY - box.top}px`;
      this.joystick.hidden = false;
      this.hint.style.opacity = 0;
      this.moveStick(e);
    } else {
      this.cameraPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, button: e.button });
      this.gesture = this.measureGesture();
    }
  }
  pointerMove(e) {
    if (e.pointerType === 'mouse') {
      if (this.mousePointer === e.pointerId && this.canvas.hasPointerCapture(e.pointerId)) this.updateMouseButtons(e);
      return;
    }
    if (e.pointerId === this.joystickPointer) { this.moveStick(e); return; }
    const previous = this.cameraPointers.get(e.pointerId);
    if (!previous) return;
    const previousGesture = this.gesture;
    this.cameraPointers.set(e.pointerId, { ...previous, x: e.clientX, y: e.clientY });
    // Pen drags orbit; the mode switch applies to touch.
    if (e.pointerType !== 'touch') this.drag(e.clientX - previous.x, e.clientY - previous.y, previous.button === 1);
    else {
      const now = this.measureGesture();
      if (!now) this.drag(e.clientX - previous.x, e.clientY - previous.y, this.cameraMode === 'pan');
      else if (previousGesture && now.distance > 5 && previousGesture.distance > 5) {
        // A pinch changes distance only, even when its center moves or pan mode is selected.
        this.zoom(previousGesture.distance / now.distance);
      }
    }
    this.gesture = this.measureGesture();
  }
  updateMouseButtons(e) {
    // Pointer events report extra button presses/releases as pointermove.
    // Read the bitmask so attacking and orbiting can happen together.
    const buttons = e.buttons ?? (e.type === 'pointerup' ? 0 : e.button === 2 ? 2 : e.button === 1 ? 4 : 1);
    this.mouseChordReleased = Boolean(buttons && (this.mouseButtons & ~buttons));
    this.mouseButtons = buttons;
    if (buttons & 1) {
      if (this.mouseAttackPointer === null) {
        this.mouseAttackPointer = e.pointerId;
        if (this.callbacks.setAttackHeld) this.callbacks.setAttackHeld(true, `mouse:${e.pointerId}`);
        else this.callbacks.attack?.();
      }
    } else if (this.mouseAttackPointer === e.pointerId) {
      this.mouseAttackPointer = null;
      this.callbacks.setAttackHeld?.(false, `mouse:${e.pointerId}`);
    }
    const button = buttons & 2 ? 2 : buttons & 4 ? 1 : null;
    const previous = this.cameraPointers.get(e.pointerId);
    if (button === null) this.cameraPointers.delete(e.pointerId);
    else {
      if (previous?.button === button && e.type === 'pointermove') this.drag(e.clientX - previous.x, e.clientY - previous.y, button === 1);
      this.cameraPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: 'mouse', button });
    }
  }
  measureGesture() {
    const pointers = [...this.cameraPointers.values()].filter(pointer => pointer.type === 'touch');
    if (pointers.length < 2) return null;
    const [a, b] = pointers;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  moveStick(e) {
    const v = normalizedStick(e.clientX - this.origin.x, e.clientY - this.origin.y);
    this.stick = { x: v.x, y: v.y };
    // Re-engaging or deliberately changing the stick counts as new movement, not finger jitter.
    if(Math.hypot(v.x,v.y)<=.08)this.stickIntent={x:0,y:0};
    else if(Math.hypot(this.stickIntent.x,this.stickIntent.y)<=.08||Math.hypot(v.x-this.stickIntent.x,v.y-this.stickIntent.y)>.25){
      this.stickIntent={x:v.x,y:v.y};this.callbacks.move?.();
    }
    this.knob.style.transform = `translate(${v.knobX}px,${v.knobY}px)`;
  }
  pointerUp(e) {
    // Some browsers also drop capture when one button of a chord is released.
    // Continue the remaining button, but still cancel on blur or pointercancel.
    if (e.type === 'lostpointercapture' && this.mousePointer === e.pointerId && this.mouseChordReleased && e.buttons === this.mouseButtons) {
      this.mouseChordReleased = false;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (this.mousePointer === e.pointerId) { this.mousePointer = null; this.mouseButtons = 0; this.mouseChordReleased = false; }
    if (this.mouseAttackPointer === e.pointerId) {
      this.mouseAttackPointer = null;
      if (e.type === 'pointerup') this.callbacks.setAttackHeld?.(false, `mouse:${e.pointerId}`);
      else if (this.callbacks.cancelAttackInput) this.callbacks.cancelAttackInput(`mouse:${e.pointerId}`);
      else this.callbacks.setAttackHeld?.(false, `mouse:${e.pointerId}`);
    }
    if (e.pointerId === this.joystickPointer) { this.stick = { x: 0, y: 0 }; this.stickIntent={x:0,y:0}; this.joystickPointer = null; this.joystick.hidden = true; this.hint.style.opacity = 1; }
    this.cameraPointers.delete(e.pointerId);
    this.gesture = this.measureGesture();
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  }
  drag(dx, dy, pan) {
    if (!pan) {
      this.camera.alpha += dx * .005;
      this.camera.beta = Math.max(.25, Math.min(1.48, this.camera.beta - dy * .005));
    } else {
      const scale = this.camera.radius * .0013;
      const rightX = Math.sin(this.camera.alpha), rightZ = -Math.cos(this.camera.alpha);
      this.panOffset.x -= rightX * dx * scale;
      this.panOffset.z -= rightZ * dx * scale;
      this.panOffset.y += dy * scale;
      this.panOffset.y = Math.max(-.8, Math.min(2.5, this.panOffset.y));
      const radius = Math.hypot(this.panOffset.x, this.panOffset.z);
      if (radius > 4) { this.panOffset.x *= 4 / radius; this.panOffset.z *= 4 / radius; }
    }
  }
  zoom(factor) { this.camera.radius = Math.max(this.camera.lowerRadiusLimit ?? .8, Math.min(this.camera.upperRadiusLimit ?? 14, this.camera.radius * factor)); }
  value() {
    const down = (...codes) => codes.some(c => this.keys.has(c));
    let x = this.stick.x + Number(down('KeyD', 'ArrowRight')) - Number(down('KeyA', 'ArrowLeft'));
    let y = this.stick.y + Number(down('KeyW', 'ArrowUp')) - Number(down('KeyS', 'ArrowDown'));
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) { x /= magnitude; y /= magnitude; }
    return { x, y, run: down('ShiftLeft', 'ShiftRight') };
  }
  reset() {
    this.keys.clear(); this.stick = { x: 0, y: 0 }; this.joystickPointer = null; this.cameraPointers.clear(); this.gesture = null; this.joystick.hidden = true; this.hint.style.opacity = 1;
    this.mousePointer = null; this.mouseAttackPointer = null;
    this.mouseButtons = 0; this.mouseChordReleased = false;
    this.stickIntent={x:0,y:0};
    if(this.callbacks.cancelAttackInput)this.callbacks.cancelAttackInput();
    else this.callbacks.setAttackHeld?.(false);
  }
  dispose() { this.reset(); this.abort.abort(); }
}
