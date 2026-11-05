import test from 'node:test';
import assert from 'node:assert/strict';
import {PlaygroundInput} from '../src/input.js';

class Surface {
  constructor() { this.events=new Map();this.style={};this.hidden=true;this.captured=new Set();this.tagName='DIV'; }
  addEventListener(type,fn,options={}) {
    if(!this.events.has(type))this.events.set(type,[]);
    this.events.get(type).push(fn);
    options.signal?.addEventListener('abort',()=>this.events.set(type,this.events.get(type).filter(listener=>listener!==fn)),{once:true});
  }
  emit(type,properties={}) {
    const event={type,target:this,cancelable:true,defaultPrevented:false,preventDefault(){if(this.cancelable)this.defaultPrevented=true;},...properties};
    for(const listener of this.events.get(type)??[])listener(event);
    return event;
  }
  focus() {}
  getBoundingClientRect() { return {left:0,top:0,width:1000,height:800}; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}

function fixture(overrides={}) {
  const win=new Surface(),doc=new Surface();
  globalThis.window=win;globalThis.document=doc;
  const elements=Object.fromEntries(['#joystick','#joystick-knob','#joystick-hint'].map(selector=>[selector,new Surface()]));
  doc.querySelector=selector=>elements[selector]??null;
  const root=new Surface(),canvas=new Surface(),button=new Surface(),label=new Surface(),otherButton=new Surface();
  canvas.tagName='CANVAS';canvas.closest=selector=>selector==='#app'?root:null;
  button.closest=label.closest=selector=>selector==='#guard-button'?button:null;
  const text={nodeType:3,parentElement:label};
  root.contains=target=>[canvas,button,label,text,otherButton].includes(target);
  const calls=[],sources=new Map(),queries=[];
  const callbacks={
    canMove:()=>true,
    setShieldHeld(held,source='keyboard',pointerType) {
      calls.push({held,source,pointerType});
      if(held)sources.set(source,pointerType);else sources.delete(source);
    },
    cancelShieldInput(source) {
      calls.push({cancel:source??'all'});
      if(source)sources.delete(source);else sources.clear();
    },
    isHudShieldHeld(pointerType) {
      queries.push(pointerType);
      const types=[...sources].filter(([source])=>source.startsWith('button:')).map(([,type])=>type);
      return types.some(type=>type!=='mouse')&&(!!pointerType||!types.includes('mouse'));
    },
    ...overrides,
  };
  const input=new PlaygroundInput(canvas,{alpha:1,beta:1,radius:5},callbacks);
  const press=(properties={})=>win.emit('keydown',{code:'KeyF',target:canvas,repeat:false,...properties});
  const release=()=>win.emit('keyup',{code:'KeyF'});
  const holdHud=(pointerType='touch',pointerId=7)=>callbacks.setShieldHeld(true,`button:${pointerId}`,pointerType);
  return {input,win,doc,elements,root,canvas,button,label,text,otherButton,calls,sources,queries,press,release,holdHud};
}

test('F uses one held shield press and a keyboard-owned release, ignoring autorepeat',()=>{
  let legacy=0;const f=fixture({guard:()=>legacy++});
  f.press();f.press({repeat:true});f.press({repeat:true});f.press();
  assert.deepEqual(f.calls,[{held:true,source:'keyboard',pointerType:undefined}]);
  assert.equal(f.input.keys.has('KeyF'),true);assert.equal(legacy,0);
  f.win.emit('keyup',{code:'KeyW'});assert.equal(f.calls.length,1);
  f.release();assert.deepEqual(f.calls.at(-1),{held:false,source:'keyboard',pointerType:undefined});
  assert.equal(f.sources.size,0);assert.equal(f.input.keys.has('KeyF'),false);
  f.press();assert.equal(f.calls.length,3);assert.equal(f.calls.at(-1).held,true);f.input.dispose();
});

test('F retains the legacy one-shot guard fallback and ignores form or modal input',()=>{
  let guards=0;const f=fixture({setShieldHeld:undefined,guard:()=>guards++});
  f.press();f.press({repeat:true});f.press();assert.equal(guards,1);
  f.release();f.press();assert.equal(guards,2);f.release();
  for(const tagName of ['INPUT','TEXTAREA','SELECT'])f.press({target:{tagName}});
  f.elements['dialog[open]']={};f.press();assert.equal(guards,2);f.input.dispose();
});

test('shield holds cancel without a tap release at every application lifecycle boundary',()=>{
  const causes={
    reset:f=>f.input.reset(),
    blur:f=>f.win.emit('blur'),
    pagehide:f=>f.win.emit('pagehide'),
    hidden:f=>{f.doc.hidden=true;f.doc.emit('visibilitychange');},
    suspend:f=>f.input.setSuspended(true),
    dispose:f=>f.input.dispose(),
    contextmenu:f=>f.doc.emit('contextmenu',{target:f.otherButton}),
  };
  for(const [cause,cancel] of Object.entries(causes)) {
    const f=fixture();f.press();f.holdHud();cancel(f);
    assert.equal(f.sources.size,0,cause);assert.equal(f.input.keys.has('KeyF'),false,cause);
    assert.deepEqual(f.calls.slice(-1),[{cancel:'all'}],cause);
    assert.equal(f.calls.some(call=>call.held===false),false,`${cause} became a release`);
    const count=f.calls.length;f.press({repeat:true});assert.equal(f.calls.length,count,`${cause} resumed from autorepeat`);
    if(cause!=='dispose')f.input.dispose();
  }
});

test('suspended shield input requires a fresh press after gameplay resumes',()=>{
  const f=fixture();f.press();f.input.setSuspended(true);const count=f.calls.length;
  f.press();assert.equal(f.calls.length,count);assert.equal(f.sources.size,0);
  f.input.setSuspended(false);f.press({repeat:true});assert.equal(f.sources.size,0);
  f.release();f.press();assert.equal(f.sources.has('keyboard'),true);f.input.dispose();
});

test('keyboard shield release preserves independently owned HUD shield sources',()=>{
  const f=fixture();f.press();f.holdHud('touch',7);f.holdHud('pen',8);f.release();
  assert.deepEqual([...f.sources.keys()],['button:7','button:8']);
  f.canvas.emit('pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:700});
  f.win.emit('pointercancel',{pointerId:1,pointerType:'touch'});
  assert.deepEqual([...f.sources.keys()],['button:7','button:8'],'cancelling an independent stick touch erased the HUD shield');
  f.input.dispose();
});

test('prevented mobile shield menus preserve held sources, movement and camera gestures',()=>{
  for(const pointerType of ['touch','pen',undefined])for(const textTarget of [false,true]) {
    const f=fixture();f.press();f.holdHud(pointerType??'touch');
    f.canvas.emit('pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:700});
    f.canvas.emit('pointermove',{pointerId:1,pointerType:'touch',clientX:140,clientY:660});
    f.canvas.emit('pointerdown',{pointerId:2,pointerType:'touch',clientX:700,clientY:200});
    const movement=f.input.value(),before=[...f.sources];
    const event=f.doc.emit('contextmenu',{target:textTarget?f.text:f.label,pointerType,button:2});
    assert.equal(event.defaultPrevented,true);assert.deepEqual([...f.sources],before);
    assert.deepEqual(f.queries,[pointerType]);assert.deepEqual(f.input.value(),movement);
    assert.equal(f.input.joystickPointer,1);assert.equal(f.input.cameraPointers.has(2),true);
    f.input.dispose();
  }
});

test('unpreventable, mouse, unrelated, or unowned shield menus cancel instead of masquerading as a mobile hold',()=>{
  for(const reason of ['native','mouse','mouse-compat','mixed-compat','other-ui','keyboard-only','no-hold']) {
    const f=fixture();
    if(reason==='keyboard-only')f.press();
    else if(reason!=='no-hold')f.holdHud(reason==='mouse-compat'?'mouse':'touch');
    if(reason==='mixed-compat')f.holdHud('mouse',8);
    const event=f.doc.emit('contextmenu',{
      target:reason==='other-ui'?f.otherButton:f.label,
      pointerType:reason==='mouse'?'mouse':['mouse-compat','mixed-compat','keyboard-only','no-hold'].includes(reason)?undefined:'touch',
      cancelable:reason!=='native',
    });
    assert.equal(event.defaultPrevented,reason!=='native',reason);
    assert.equal(f.sources.size,0,reason);assert.deepEqual(f.calls.at(-1),{cancel:'all'},reason);
    assert.equal(f.calls.some(call=>call.held===false),false,reason);f.input.dispose();
  }
});

test('HUD pointerout inside the game preserves shield holds while a real window exit cancels them',()=>{
  for(const boundary of ['pointerout','mouseout','bounds']) {
    const f=fixture();f.press();f.holdHud();
    for(const type of ['pointerout','mouseout'])f.win.emit(type,{pointerType:'mouse',relatedTarget:null,target:f.label,clientX:500,clientY:300});
    f.win.emit('pointerout',{pointerType:'touch',relatedTarget:null,target:f.label,clientX:1010,clientY:300});
    assert.equal(f.sources.size,2,'an internal HUD update or touch exit erased the shield');
    if(boundary==='bounds')f.win.emit('pointermove',{pointerType:'mouse',clientX:1010,clientY:300});
    else f.win.emit(boundary,{pointerType:'mouse',relatedTarget:null,target:f.label,clientX:1010,clientY:300});
    assert.equal(f.sources.size,0,boundary);assert.deepEqual(f.calls.at(-1),{cancel:'all'},boundary);
    f.input.dispose();
  }
});
