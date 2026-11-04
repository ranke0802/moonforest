import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ShieldHoldSources,bindShieldHoldButton} from '../src/shield-hold-input.js';
import {PlaygroundInput} from '../src/input.js';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {FrameLoop} from '../src/frame-loop.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const shieldIndex=main.indexOf('const shieldInput=new ShieldHoldSources(');
const actionIndex=main.indexOf('  guard() {');
assert.ok(shieldIndex>0&&actionIndex>0,'production shield ownership and actions must exist');
const shieldSource=main.slice(shieldIndex,main.indexOf('let toastTimer;',shieldIndex));
const actionsSource=main.slice(actionIndex,main.indexOf('  dodge() {',actionIndex));
const durations={idle:2,run:1,slash:1.5,attack:3,judgment:4.33,shieldPush:2.37,dodge:2.46};

class Surface {
  constructor() { this.events=new Map();this.style={};this.hidden=true;this.disabled=false;this.captured=new Set();this.tagName='DIV'; }
  addEventListener(type,listener,options={}) {
    if(!this.events.has(type))this.events.set(type,[]);
    this.events.get(type).push(listener);
    options.signal?.addEventListener('abort',()=>this.events.set(type,this.events.get(type).filter(fn=>fn!==listener)),{once:true});
  }
  emit(type,properties={}) {
    const event={type,target:this,cancelable:true,defaultPrevented:false,preventDefault(){if(this.cancelable)this.defaultPrevented=true;},...properties};
    for(const listener of this.events.get(type)??[])listener(event);
    return event;
  }
  focus() {}
  getBoundingClientRect() { return {left:0,top:0,width:1000,height:800}; }
  setPointerCapture(id) { if(this.captureThrows)throw new Error('Capture unavailable');this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id);this.emit('lostpointercapture',{pointerId:id}); }
}

function fixture({v2=true,captureThrows=false}={}) {
  const win=new Surface(),doc=new Surface();globalThis.window=win;globalThis.document=doc;
  const elements=Object.fromEntries(['#joystick','#joystick-knob','#joystick-hint'].map(selector=>[selector,new Surface()]));
  doc.querySelector=selector=>elements[selector]??null;
  const canvas=new Surface(),button=new Surface(),label=new Surface(),root=new Surface(),outside=new Surface();
  canvas.tagName='CANVAS';canvas.closest=selector=>selector==='#app'?root:null;
  button.closest=label.closest=selector=>selector==='#guard-button'?button:null;
  const text={nodeType:3,parentElement:label};
  root.contains=target=>[canvas,button,label,text].includes(target);button.captureThrows=captureThrows;
  let now=0,last=null,legacyGuards=0,resets=0,recoilCancels=0;
  const controller=new WarriorV2Controller({durations,holdNow:()=>now});
  controller.toggleGuard=()=>legacyGuards++;
  const quests=[],boss={active:false,playerAlive:true,playerHp:100,playerReaction:{cancelRecoil(){recoilCancels++;}}};
  const production=new Function('ShieldHoldSources','controller','strikeSampler','boss','chapterQuests','isV2','startDefense','updateButtons',
    `const ready=true;${shieldSource}\nconst actions={${actionsSource}};return {actions,shieldInput};`)(
      ShieldHoldSources,controller,{reset(){resets++;}},boss,{action:action=>quests.push(action)},()=>v2,
      kind=>{if(kind==='shieldPush')controller.shieldPush();},()=>{},
    );
  const {actions,shieldInput}=production;
  const input=new PlaygroundInput(canvas,{alpha:0,beta:1,radius:5},{
    canMove:()=>true,
    move:()=>controller.requestMovement(),
    setShieldHeld:actions.setShieldHeld,cancelShieldInput:actions.cancelShieldInput,isHudShieldHeld:actions.isHudShieldHeld,
    setAttackHeld:held=>controller.setAttackHeld(held),cancelAttackInput:()=>controller.cancelAttackInput(),
  });
  const binding=bindShieldHoldButton(button,{setHeld:actions.setShieldHeld,cancel:actions.cancelShieldInput,tap:actions.guard,now:()=>now,windowTarget:win});
  const loop=new FrameLoop({stopRenderLoop(){},runRenderLoop(){}},dt=>{if(dt)last=controller.update(dt,input.value());},()=>now);loop.frame();
  const step=ms=>{now+=ms;loop.frame();return last;};
  const advance=ms=>{while(ms>0){const portion=Math.min(ms,50);step(portion);ms-=portion;}};
  const down=(pointerId=7,pointerType='touch')=>button.emit('pointerdown',{button:0,pointerId,pointerType});
  const up=(pointerId=7,pointerType='touch')=>button.emit('pointerup',{button:0,pointerId,pointerType});
  const key=(type,code='KeyF',properties={})=>win.emit(type,{code,target:canvas,repeat:false,...properties});
  const close=()=>{binding.dispose();input.dispose();};
  return {controller,input,shieldInput,actions,binding,win,doc,canvas,button,label,text,root,outside,elements,quests,boss,
    step,advance,down,up,key,close,last:()=>last,legacyGuards:()=>legacyGuards,resets:()=>resets,recoilCancels:()=>recoilCancels};
}

test('production shield HUD blocks a short press, then starts one 20 stamina push on release',()=>{
  const f=fixture();f.down();
  assert.equal(f.controller.shieldPending,true);assert.equal(f.controller.shieldHeld,true);assert.equal(f.controller.stamina,100);
  const pending=f.step(100);assert.equal(pending.shieldPending,true);assert.equal(pending.moving,false);assert.equal(pending.freezeOnExit,true);
  assert.equal(f.controller.serial,1);assert.equal(f.controller.stamina,100);assert.deepEqual(f.quests,[]);
  f.up();assert.equal(f.controller.action?.state,'shieldPush');assert.equal(f.controller.shieldPending,false);assert.equal(f.controller.guarding,false);
  assert.equal(f.controller.stamina,80);assert.equal(f.controller.serial,1);assert.equal(f.shieldInput.sources.size,0);assert.deepEqual(f.quests,['shieldPush']);
  assert.equal(f.resets(),1);assert.equal(f.recoilCancels(),1);
  f.up();f.win.emit('pointerup',{pointerId:7,pointerType:'touch'});assert.equal(f.controller.stamina,80);assert.equal(f.controller.serial,1);
  f.advance(3000);assert.equal(f.controller.action,null);assert.equal(f.controller.serial,1);f.close();
});

test('production held shield drains exactly 5 per second after its threshold and release never pushes',()=>{
  const f=fixture();f.down();f.advance(200);assert.equal(f.controller.guarding,true);assert.equal(f.controller.stamina,100);
  f.advance(1000);assert.ok(Math.abs(f.controller.stamina-95)<1e-8);assert.equal(f.last().clipTime,.5);assert.equal(f.last().freezeOnExit,true);
  const serial=f.controller.serial;f.up();assert.equal(f.controller.action,null);assert.equal(f.controller.shieldHeld,false);
  assert.equal(f.controller.stamina,95);assert.equal(f.controller.serial,serial);assert.deepEqual(f.quests,[]);
  f.step(10);assert.equal(f.controller.state,'idle');assert.equal(f.controller.serial,serial);f.close();
});

test('keyboard and multiple HUD shield sources keep the stance until the final source releases',()=>{
  const f=fixture();f.key('keydown');f.down(7);f.down(8,'pen');f.advance(300);
  assert.deepEqual([...f.shieldInput.sources.keys()],['keyboard','button:7','button:8']);assert.equal(f.controller.serial,1);
  f.key('keyup');assert.equal(f.controller.guarding,true);assert.equal(f.controller.shieldHeld,true);assert.equal(f.shieldInput.sources.size,2);
  f.up(7);assert.equal(f.controller.guarding,true);assert.equal(f.shieldInput.sources.size,1);
  f.up(8,'pen');assert.equal(f.controller.action,null);assert.equal(f.controller.shieldHeld,false);assert.equal(f.shieldInput.sources.size,0);
  assert.equal(f.controller.serial,1);assert.deepEqual(f.quests,[]);f.close();
});

test('short pointer cancellation, capture loss, blur and lifecycle reset never become a shield tap',()=>{
  for(const reason of ['pointercancel','lostpointercapture','window-cancel','blur','pagehide','reset','hidden','suspend']) {
    const f=fixture();f.down();f.step(100);assert.equal(f.controller.shieldPending,true);
    if(reason==='pointercancel'||reason==='lostpointercapture')f.button.emit(reason,{pointerId:7,pointerType:'touch'});
    else if(reason==='window-cancel')f.win.emit('pointercancel',{target:f.outside,pointerId:7,pointerType:'touch'});
    else if(reason==='reset')f.input.reset();
    else if(reason==='hidden'){f.doc.hidden=true;f.doc.emit('visibilitychange');}
    else if(reason==='suspend')f.input.setSuspended(true);
    else f.win.emit(reason);
    assert.equal(f.controller.action,null,reason);assert.equal(f.controller.shieldHeld,false,reason);assert.equal(f.shieldInput.sources.size,0,reason);
    f.up();f.advance(400);assert.equal(f.controller.serial,1,reason);assert.equal(f.controller.stamina,100,reason);assert.deepEqual(f.quests,[],reason);f.close();
  }
});

test('window release outside the shield ends the owned press when pointer capture is unavailable',()=>{
  for(const held of [false,true]) {
    const f=fixture({captureThrows:true});assert.doesNotThrow(()=>f.down());assert.equal(f.button.captured.size,0);
    f.advance(held?500:100);f.win.emit('pointerup',{target:f.outside,pointerId:7,pointerType:'touch'});
    assert.equal(f.shieldInput.sources.size,0);assert.equal(f.controller.shieldHeld,false);
    assert.equal(f.controller.action?.state,held?undefined:'shieldPush');assert.equal(f.quests.length,held?0:1);
    assert.ok(Math.abs(f.controller.stamina-(held?98.5:80))<1e-8);
    const stamina=f.controller.stamina;f.up();assert.equal(f.controller.stamina,stamina);assert.equal(f.controller.serial,1);f.close();
  }
});

test('late pointer and keyboard releases after global reset cannot create a push or end a newer hold',()=>{
  const f=fixture();f.down(7);f.key('keydown');f.step(100);f.input.reset();
  assert.equal(f.controller.action,null);assert.equal(f.shieldInput.sources.size,0);
  f.down(8);const action=f.controller.action;f.up(7);f.key('keyup');
  assert.strictEqual(f.controller.action,action);assert.equal(f.controller.shieldPending,true);assert.deepEqual([...f.shieldInput.sources.keys()],['button:8']);
  f.advance(250);f.up(8);assert.equal(f.controller.action,null);assert.equal(f.controller.serial,2);assert.deepEqual(f.quests,[]);f.close();
});

test('an exhausted touch remains owned until release and a fresh touch can guard after regeneration',()=>{
  for(const initial of [0,1]) {
    const f=fixture();f.controller.stamina=initial;f.down();
    if(initial)f.advance(400);
    assert.equal(f.controller.stamina,0);assert.equal(f.controller.shieldExhausted,true);assert.equal(f.controller.shieldHeld,true);assert.equal(f.shieldInput.sources.size,1);
    const serial=f.controller.serial,rejected=f.controller.staminaRejectSerial;
    f.down();f.advance(1000);assert.equal(f.controller.action,null);assert.equal(f.controller.serial,serial);assert.equal(f.controller.staminaRejectSerial,rejected);
    assert.ok(f.controller.stamina>=14.9,'idle exhausted stance should recover stamina without reactivating itself');
    f.up();assert.equal(f.controller.shieldHeld,false);assert.equal(f.controller.shieldExhausted,false);assert.equal(f.shieldInput.sources.size,0);
    f.down();assert.equal(f.controller.shieldPending,true);assert.equal(f.controller.serial,serial+1);
    f.advance(300);assert.equal(f.controller.guarding,true);f.up();assert.equal(f.controller.action,null);assert.deepEqual(f.quests,[]);f.close();
  }
});

test('a heavy sword hold charges during shield guard and executes once after shield release',()=>{
  const f=fixture();f.down();f.advance(200);f.key('keydown','KeyJ');f.advance(500);
  assert.equal(f.controller.guarding,true);assert.equal(f.controller.queuedAttack,'judgment');assert.equal(f.controller.serial,1);
  f.key('keyup','KeyJ');f.advance(200);assert.equal(f.controller.queuedAttack,'judgment');assert.equal(f.controller.action?.state,'shieldPush');
  const stamina=f.controller.stamina;f.up();assert.equal(f.controller.action,null);assert.equal(f.controller.queuedAttack,'judgment');
  f.step(10);assert.equal(f.controller.action?.state,'judgment');assert.equal(f.controller.serial,2);assert.equal(f.controller.stamina,stamina-30);assert.deepEqual(f.quests,[]);
  f.advance(6000);assert.equal(f.controller.serial,2);assert.equal(f.controller.action,null);f.close();
});

test('real shield source ownership preserves suppressed touch menus and cancels ambiguous mouse compatibility menus',()=>{
  const cases=[
    {types:['touch'],pointerType:'touch',preserve:true},
    {types:['touch'],pointerType:undefined,preserve:true},
    {types:['touch','mouse'],pointerType:'touch',preserve:true},
    {types:['touch','mouse'],pointerType:undefined,preserve:false},
    {types:['mouse'],pointerType:undefined,preserve:false},
    {types:['touch'],pointerType:'mouse',preserve:false},
    {types:['touch'],pointerType:'touch',cancelable:false,preserve:false},
  ];
  for(const scenario of cases) {
    const f=fixture();scenario.types.forEach((type,index)=>f.down(7+index,type));f.advance(300);
    const event=f.doc.emit('contextmenu',{target:f.text,pointerType:scenario.pointerType,cancelable:scenario.cancelable??true,button:2});
    assert.equal(event.defaultPrevented,scenario.cancelable??true);
    assert.equal(f.controller.guarding,scenario.preserve,JSON.stringify(scenario));assert.equal(f.controller.shieldHeld,scenario.preserve);
    assert.equal(f.shieldInput.sources.size,scenario.preserve?scenario.types.length:0);
    if(!scenario.preserve){scenario.types.forEach((type,index)=>f.up(7+index,type));assert.equal(f.controller.action,null);assert.deepEqual(f.quests,[]);}
    f.close();
  }
});

test('production non-v2 F action calls the legacy guard exactly once per fresh press',()=>{
  const f=fixture({v2:false});f.key('keydown');f.key('keydown','KeyF',{repeat:true});f.key('keydown','KeyF',{repeat:true});
  assert.equal(f.legacyGuards(),1);assert.equal(f.shieldInput.sources.size,0);assert.equal(f.controller.shieldHeld,false);
  f.key('keyup');assert.equal(f.legacyGuards(),1);f.key('keydown');assert.equal(f.legacyGuards(),2);f.close();
});
