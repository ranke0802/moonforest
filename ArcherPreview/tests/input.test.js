import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaygroundInput } from '../src/input.js';
import { WarriorV2Controller } from '../src/warrior-v2.js';

class Surface {
  constructor() { this.events = new Map(); this.style = {}; this.hidden = true; this.captured = new Set(); }
  addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(fn); }
  emit(name, props = {}) { const event = { type: name, preventDefault() {}, target: this, ...props }; for (const fn of this.events.get(name) || []) fn(event); }
  focus() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 800 }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
}
function setup(callbacks = {}) {
  const elements = Object.fromEntries(['#joystick', '#joystick-knob', '#joystick-hint'].map(id => [id, new Surface()]));
  globalThis.window = new Surface();
  globalThis.document = new Surface();
  document.querySelector = selector => elements[selector] || null;
  const canvas = new Surface(), camera = { alpha: 1, beta: 1, radius: 5 };
  const input = new PlaygroundInput(canvas, camera, { canMove: () => true, ...callbacks });
  function pointer(name, id, x, y) { canvas.emit(name, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y }); }
  return { input, camera, canvas, elements, pointer };
}

test('E uses one potion per fresh press and ignores autorepeat and form typing',()=>{
  let uses=0;setup({potion:()=>uses++});
  const event={code:'KeyE',target:{tagName:'BODY'},repeat:false};
  window.emit('keydown',event);window.emit('keydown',{...event,repeat:true});window.emit('keydown',event);
  assert.equal(uses,1);window.emit('keyup',{code:'KeyE'});window.emit('keydown',event);assert.equal(uses,2);
  window.emit('keyup',{code:'KeyE'});window.emit('keydown',{...event,target:{tagName:'INPUT'}});assert.equal(uses,2);
});

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

test('DOM stub: joystick stays separate while one camera touch orbits and two only pinch', () => {
  const { input, camera, pointer } = setup();
  pointer('pointerdown', 1, 150, 650);
  pointer('pointermove', 1, 180, 620);
  const stick = { ...input.stick };
  pointer('pointerdown', 2, 700, 250);
  pointer('pointermove', 2, 720, 250);
  assert.equal(camera.alpha, 1.1, 'single camera touch orbits while the joystick remains held');
  const angles = { alpha: camera.alpha, beta: camera.beta };
  pointer('pointerdown', 3, 850, 250);
  assert.equal(input.cameraPointers.size, 2);
  assert.equal(input.cameraPointers.has(1), false);
  pointer('pointermove', 3, 900, 270);
  assert.ok(camera.radius < 5, 'spreading fingers zooms closer');
  assert.equal(camera.alpha, angles.alpha, 'pinch must not orbit horizontally');
  assert.equal(camera.beta, angles.beta, 'pinch must not orbit vertically');
  assert.deepEqual(input.panOffset, { x: 0, y: 0, z: 0 });
  assert.deepEqual(input.stick, stick, 'camera gesture cannot change joystick value');
  pointer('pointerup', 2, 720, 250);
  const alpha = camera.alpha;
  pointer('pointermove', 3, 920, 270);
  assert.equal(camera.alpha, alpha + .1, 'remaining camera touch resumes orbit from its latest position');
  assert.equal(input.joystickPointer, 1);
});

test('DOM stub: single-touch pan mode works but two fingers never pan or orbit', () => {
  const { input, camera, pointer } = setup();
  input.cameraMode = 'pan';
  pointer('pointerdown', 2, 650, 200);
  pointer('pointermove', 2, 670, 220);
  assert.equal(camera.alpha, 1); assert.equal(camera.beta, 1);
  assert.ok(Math.hypot(input.panOffset.x, input.panOffset.z) > 0);
  assert.ok(input.panOffset.y > 0);
  const offset = { ...input.panOffset };
  pointer('pointerdown', 3, 850, 220);
  pointer('pointermove', 2, 690, 240);
  pointer('pointermove', 3, 870, 240);
  assert.deepEqual(input.panOffset, offset, 'moving the two-touch center must not pan');
  assert.equal(camera.alpha, 1); assert.equal(camera.beta, 1);
  assert.ok(Math.abs(camera.radius - 5) < 1e-12, 'translating both fingers keeps the final zoom unchanged');
  const radius = camera.radius;
  pointer('pointermove', 3, 950, 240);
  assert.ok(camera.radius < radius);
  assert.deepEqual(input.panOffset, offset);
});

test('DOM stub: adding and removing a camera touch rebases without angle or zoom jumps', () => {
  const { camera, pointer } = setup();
  pointer('pointerdown', 1, 600, 200);
  pointer('pointermove', 1, 620, 210);
  assert.equal(camera.alpha, 1.1); assert.equal(camera.beta, .95); assert.equal(camera.radius, 5);
  pointer('pointerdown', 2, 820, 210);
  assert.deepEqual(camera, { alpha: 1.1, beta: .95, radius: 5 });
  pointer('pointermove', 1, 600, 210);
  assert.equal(camera.alpha, 1.1); assert.equal(camera.beta, .95);
  assert.ok(Math.abs(camera.radius - 5 * 200 / 220) < 1e-12);
  const radius = camera.radius;
  pointer('pointerup', 2, 820, 210);
  pointer('pointermove', 1, 600, 210);
  assert.deepEqual(camera, { alpha: 1.1, beta: .95, radius });
  pointer('pointermove', 1, 610, 200);
  assert.equal(camera.alpha, 1.1 + .05); assert.equal(camera.beta, 1); assert.equal(camera.radius, radius);
  pointer('pointerdown', 3, 900, 300);
  pointer('pointermove', 3, 900, 300);
  assert.equal(camera.radius, radius, 'new pinch starts at its current separation');
});

test('DOM stub: a third touch cannot orbit and replacing the pinch pair rebases its distance', () => {
  const { camera, pointer } = setup();
  pointer('pointerdown', 1, 600, 200);
  pointer('pointerdown', 2, 800, 200);
  pointer('pointerdown', 3, 900, 300);
  pointer('pointermove', 3, 950, 350);
  assert.deepEqual(camera, { alpha: 1, beta: 1, radius: 5 });
  pointer('pointerup', 1, 600, 200);
  pointer('pointermove', 3, 950, 350);
  assert.deepEqual(camera, { alpha: 1, beta: 1, radius: 5 });
  pointer('pointermove', 3, 1000, 400);
  assert.ok(camera.radius < 5); assert.equal(camera.alpha, 1); assert.equal(camera.beta, 1);
});

test('DOM stub: left attacks without orbit, right orbits, middle pans, wheel and keys remain available', () => {
  const held = [];
  const { input, camera, canvas } = setup({ setAttackHeld: value => held.push(value) });
  const mouse = (name, x, y, button = 0) => canvas.emit(name, { pointerId: 8, pointerType: 'mouse', button, clientX: x, clientY: y });
  mouse('pointerdown', 600, 200); mouse('pointermove', 620, 210);
  assert.equal(camera.alpha, 1); assert.equal(camera.beta, 1); assert.deepEqual(held, [true]);
  mouse('pointerup', 620, 210);
  assert.deepEqual(held, [true, false]);
  mouse('pointerdown', 620, 210, 2); mouse('pointermove', 640, 230, 2);
  assert.equal(camera.alpha, 1.1); assert.equal(camera.beta, .9); assert.equal(input.panOffset.x, 0);
  mouse('pointerup', 640, 230, 2);
  mouse('pointerdown', 640, 230, 1); mouse('pointermove', 660, 250, 1);
  assert.equal(camera.alpha, 1.1); assert.equal(camera.beta, .9); assert.notEqual(input.panOffset.x, 0);
  assert.deepEqual(held, [true, false], 'right and middle buttons cannot trigger attacks');
  canvas.emit('wheel', { deltaY: 100 });
  assert.ok(camera.radius > 5);
  window.emit('keydown', { code: 'KeyW', target: { tagName: 'BODY' } });
  window.emit('keydown', { code: 'ShiftLeft', target: { tagName: 'BODY' } });
  assert.deepEqual(input.value(), { x: 0, y: 1, run: true });
  window.emit('keyup', { code: 'KeyW' }); window.emit('keyup', { code: 'ShiftLeft' });
  assert.deepEqual(input.value(), { x: 0, y: 0, run: false });
});

test('wheel pixel and line units agree; right drag still rotates after touch pan mode', () => {
  const a=setup(); a.canvas.emit('wheel',{deltaY:-48,deltaMode:0});
  const b=setup(); b.canvas.emit('wheel',{deltaY:-3,deltaMode:1});
  assert.equal(a.camera.radius,b.camera.radius);
  b.input.cameraMode='pan';
  b.canvas.emit('pointerdown',{pointerId:1,pointerType:'mouse',button:2,clientX:500,clientY:300});
  b.canvas.emit('pointermove',{pointerId:1,pointerType:'mouse',button:2,clientX:600,clientY:300});
  assert.equal(b.camera.alpha,1.5); assert.equal(b.input.panOffset.x,0);
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

test('DOM stub: J hold starts once through held API without duplicate attack or key autorepeat', () => {
  const held = []; let attacks = 0, fallbackAttacks = 0;
  const { input } = setup({ setAttackHeld: value => { held.push(value); if (value) attacks++; }, attack: () => fallbackAttacks++ });
  const event = { code: 'KeyJ', target: { tagName: 'BODY' }, repeat: false };
  window.emit('keydown', event);
  assert.deepEqual(held, [true]); assert.equal(attacks, 1); assert.equal(input.keys.has('KeyJ'), true);
  window.emit('keydown', { ...event, repeat: true });
  window.emit('keydown', { ...event, repeat: true });
  assert.deepEqual(held, [true]); assert.equal(attacks, 1, 'OS autorepeat must not enqueue duplicate attacks');
  window.emit('keyup', { code: 'KeyW' });
  assert.deepEqual(held, [true], 'unrelated key release must not stop held attack');
  window.emit('keyup', { code: 'KeyJ' });
  assert.deepEqual(held, [true, false]); assert.equal(input.keys.has('KeyJ'), false); assert.equal(attacks, 1);
  window.emit('keydown', event);
  assert.deepEqual(held, [true, false, true]); assert.equal(attacks, 2);
  assert.equal(fallbackAttacks, 0, 'held API starts the attack, so the one-shot callback must not also fire');
});

test('DOM stub: without held API J falls back to one attack per press', () => {
  let attacks = 0;
  setup({ attack: () => attacks++ });
  const event = { code: 'KeyJ', target: { tagName: 'BODY' }, repeat: false };
  window.emit('keydown', event);
  window.emit('keydown', { ...event, repeat: true });
  assert.equal(attacks, 1);
  window.emit('keyup', { code: 'KeyJ' });
  window.emit('keydown', event);
  assert.equal(attacks, 2);
});

test('DOM stub: blur, hidden document, explicit reset and disposal release keyboard attack hold', () => {
  const held = []; let attacks = 0, fallbackAttacks = 0;
  const { input } = setup({ setAttackHeld: value => { held.push(value); if (value) attacks++; }, attack: () => fallbackAttacks++ });
  for (const release of [() => window.emit('blur'), () => { document.hidden = true; document.emit('visibilitychange'); }, () => input.reset(), () => input.dispose()]) {
    document.hidden = false;
    window.emit('keydown', { code: 'KeyJ', target: { tagName: 'BODY' }, repeat: false });
    assert.equal(held.at(-1), true);
    release();
    assert.equal(held.at(-1), false); assert.equal(input.keys.has('KeyJ'), false);
  }
  assert.deepEqual(held, [true, false, true, false, true, false, true, false]);
  assert.equal(attacks, 4, 'clearing held state must not fire a new attack');
  assert.equal(fallbackAttacks, 0);
});

test('DOM stub: typing J in a form does not start or hold an attack', () => {
  const held = []; let attacks = 0;
  setup({ setAttackHeld: value => held.push(value), attack: () => attacks++ });
  window.emit('keydown', { code: 'KeyJ', target: { tagName: 'INPUT' }, repeat: false });
  assert.deepEqual(held, []); assert.equal(attacks, 0);
});

test('focus/reset cancellation discards a pending attack instead of treating it as a tap release', () => {
  const calls=[];
  const {input}=setup({setAttackHeld:value=>calls.push(value?'press':'release'),cancelAttackInput:()=>calls.push('cancel')});
  for(const cancel of [()=>window.emit('blur'),()=>{document.hidden=true;document.emit('visibilitychange');},()=>input.reset(),()=>input.dispose()]){
    document.hidden=false;window.emit('keydown',{code:'KeyJ',target:{tagName:'BODY'},repeat:false});cancel();
    assert.deepEqual(calls.slice(-2),['press','cancel']);
  }
  assert.equal(calls.includes('release'),false);
});


function combatInput(){
  const c=new WarriorV2Controller({durations:{idle:2,run:1,slash:1.5,attack:3,judgment:4.33,shieldPush:2.37}});
  const controls=setup({move:()=>c.requestMovement(),setAttackHeld:v=>c.setAttackHeld(v),cancelAttackInput:()=>c.cancelAttackInput()});
  const press=(code,repeat=false)=>window.emit('keydown',{code,target:{tagName:'BODY'},repeat});
  const release=code=>window.emit('keyup',{code});
  return {...controls,c,press,release,tick:(dt=.016)=>c.update(dt,controls.input.value())};
}
test('direction keys and a new touch stick remain live through block stun and capture without moving the actor',()=>{
 for(const lock of ['blocked','captured'])for(const mode of ['keyboard','touch']){
  const {c,input,pointer,press,release,tick}=combatInput();c.durations.dodge=2;
  if(lock==='blocked')c.hit(.5,{force:true,reason:'blocked'});else c.capture();
  if(mode==='keyboard')press('ArrowRight');
  else {pointer('pointerdown',31,120,650);pointer('pointermove',31,174,650);}
  assert.ok(input.value().x>.9);assert.equal(tick(.1).speed,0);
  if(mode==='keyboard'){release('ArrowRight');press('ArrowUp');}
  else pointer('pointermove',31,120,596);
  assert.ok(input.value().y>.9);assert.equal(tick(.1).moving,false);
  assert.equal(c.dodge(),false);assert.equal(c.attack(),false);
  if(lock==='captured')c.releaseCapture();else tick(.31);
  assert.ok(input.value().y>.9,'unlock must preserve the currently held direction');
  assert.equal(c.dodge(),true);assert.equal(tick().state,'dodge');
 }
});
test('mouse: a short click attacks once; holding triggers Judgment without an extra release attack',()=>{
 const {c,canvas,camera,tick}=combatInput();
 const mouse=(name,buttons,x=600)=>canvas.emit(name,{pointerId:8,pointerType:'mouse',buttons,button:0,clientX:x,clientY:300});
 mouse('pointerdown',1);assert.equal(tick(.1).state,'idle');
 mouse('pointermove',1,650);assert.equal(camera.alpha,1);
 mouse('pointerup',0,650);assert.equal(tick().state,'slash');assert.equal(c.serial,1);
 tick(2);mouse('pointerdown',1);assert.equal(tick(.46).state,'judgment');assert.equal(c.serial,2);
 mouse('pointerup',0);tick(4);assert.equal(c.action,null);assert.equal(c.serial,2);
});

test('mouse: right and left buttons can be pressed and released in either order',()=>{
 for(const first of [1,2]){
  const calls=[];const {canvas,camera,input}=setup({setAttackHeld:(held,source)=>calls.push([held,source])});
  const mouse=(name,buttons,x)=>canvas.emit(name,{pointerId:8,pointerType:'mouse',buttons,button:-1,clientX:x,clientY:300});
  mouse('pointerdown',first,600);mouse('pointermove',3,600);mouse('pointermove',3,620);
  assert.equal(camera.alpha,1.1);assert.deepEqual(calls,[[true,'mouse:8']]);
  mouse('pointermove',first,620);
  canvas.captured.delete(8);
  canvas.emit('lostpointercapture',{pointerId:8,pointerType:'mouse',buttons:first});
  assert.equal(canvas.hasPointerCapture(8),true,'remaining chord button retains capture');
  if(first===1){assert.equal(input.cameraPointers.size,0);assert.equal(calls.length,1);}
  else{assert.equal(input.cameraPointers.size,1);assert.deepEqual(calls,[[true,'mouse:8'],[false,'mouse:8']]);}
  mouse('pointerup',0,620);assert.deepEqual(calls,[[true,'mouse:8'],[false,'mouse:8']]);
  assert.equal(input.cameraPointers.size,0);
 }
});

test('mouse: cancellation and focus loss discard pending taps and do not restart from stale movement',()=>{
 for(const cancel of ['pointercancel','lostpointercapture','blur']){
  const {c,canvas,tick}=combatInput();
  const event={pointerId:8,pointerType:'mouse',button:0,buttons:1,clientX:600,clientY:300};
  canvas.emit('pointerdown',event);tick(.1);
  if(cancel==='blur')window.emit('blur');else canvas.emit(cancel,event);
  canvas.emit('pointermove',{...event,clientX:650});tick(.6);
  canvas.emit('pointerup',{...event,buttons:0});tick();
  assert.equal(c.held,false);assert.equal(c.serial,0);assert.equal(c.action,null);
 }
});

test('keyboard: new movement cannot interrupt normal attack; tap buffer wins at completion',()=>{
 const {c,press,release,tick}=combatInput();press('KeyW');assert.equal(tick().state,'run');
 press('KeyJ');tick(.05);release('KeyJ');assert.equal(tick().state,'slash');
 press('KeyD');assert.equal(tick().state,'slash');
 press('KeyJ');tick(.05);release('KeyJ');assert.equal(tick().state,'slash');
 assert.equal(tick(.9).state,'attack');assert.equal(c.serial,2);
 assert.equal(tick(2).state,'run');assert.equal(c.serial,2);
});

test('keyboard: same-frame movement cannot erase a press; heavy buffers through recovery',()=>{
 const {c,press,release,tick}=combatInput();press('KeyJ');press('KeyW');release('KeyJ');assert.equal(tick().state,'slash');
 press('KeyJ');tick(.45);release('KeyJ');assert.equal(c.queuedAttack,'judgment');
 assert.equal(tick(.5).state,'judgment');assert.equal(c.serial,2);
 assert.equal(tick(3).state,'run');
});

test('touch stick: direction changes do not interrupt; releasing stick avoids delayed movement',()=>{
 const {c,pointer,press,release,tick}=combatInput();
 pointer('pointerdown',1,120,650);pointer('pointermove',1,174,650);assert.equal(tick().state,'run');
 press('KeyJ');tick(.05);release('KeyJ');assert.equal(tick().state,'slash');
 pointer('pointermove',1,120,596);assert.equal(tick().state,'slash');
 pointer('pointerup',1,120,596);assert.equal(tick(1).state,'idle');assert.equal(c.action,null);
 press('KeyJ');tick(.45);release('KeyJ');assert.equal(tick().state,'judgment');
 pointer('pointerdown',2,120,650);pointer('pointermove',2,120,596);assert.equal(tick().state,'judgment');
 assert.equal(tick(3).state,'run');
});
