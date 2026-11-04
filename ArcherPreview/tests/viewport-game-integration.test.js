import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Observable} from '@babylonjs/core/Misc/observable.js';
import {observeViewportSize} from '../src/viewport-resize.js';
import {PlaygroundInput} from '../src/input.js';
import {renderPixelRatio,RenderActivity} from '../src/render-policy.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const applyIndex=main.indexOf('function applyRenderQuality()');
const bindingIndex=main.indexOf('  const viewportResize=world.viewportResize=observeViewportSize(');
const disposeStatement='  world.scene.onDisposeObservable.addOnce(viewportResize);';
assert.ok(applyIndex>0&&bindingIndex>0,'production render policy and owned viewport binding must exist');
const applySource=main.slice(applyIndex,main.indexOf('\nfunction toast(',applyIndex));
const bindingSource=main.slice(bindingIndex,main.indexOf(disposeStatement,bindingIndex)+disposeStatement.length);

// Real game input, viewport observer, render policy and extracted main wiring.
// The controlled engine records Babylon's integer CSS/scaling buffer contract;
// this fixture does not measure actual browser allocation, rendering or GPU time.
function fixture(t,{mobile=true,width=832,height=384,pixelRatio=2}={}){
  const signalListeners=new WeakMap();
  class Surface{
    constructor(){this.events=new Map();this.style={};this.hidden=false;this.tagName='DIV';this.captured=new Set();}
    addEventListener(type,fn,{signal}={}){
      if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);
      if(signal){
        let listeners=signalListeners.get(signal);
        if(!listeners){listeners=new Set();signalListeners.set(signal,listeners);signal.addEventListener('abort',()=>{for(const item of listeners)item.target.removeEventListener(item.type,item.fn);listeners.clear();},{once:true});}
        listeners.add({target:this,type,fn});
      }
    }
    removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
    emit(type,properties={}){const event={type,target:this,preventDefault(){this.defaultPrevented=true;},...properties};for(const fn of this.events.get(type)??[])fn(event);return event;}
    focus(){}getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth??832,height:this.clientHeight??384};}
    setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}releasePointerCapture(id){this.captured.delete(id);}
  }
  let now=0,next=0,level=1,held=false,resets=0,projections=0,invalidates=0,observerCount=0,observer;
  let maxFrames=0,maxTimers=0;
  const frames=new Map(),timers=new Map(),buffers=[],captures=[],trace=[];
  const win=new Surface(),doc=new Surface(),canvas=new Surface();canvas.tagName='CANVAS';Object.assign(canvas,{clientWidth:width,clientHeight:height});
  const elements=Object.fromEntries(['#joystick','#joystick-knob','#joystick-hint'].map(id=>[id,new Surface()]));
  doc.querySelector=selector=>elements[selector]??null;
  Object.assign(win,{document:doc,devicePixelRatio:pixelRatio,performance:{now:()=>now},matchMedia:()=>({matches:mobile}),screen:{orientation:new Surface()},visualViewport:new Surface()});
  win.requestAnimationFrame=fn=>{frames.set(++next,fn);maxFrames=Math.max(maxFrames,frames.size);return next;};
  win.cancelAnimationFrame=id=>frames.delete(id);
  win.setTimeout=(fn,delay)=>{timers.set(++next,{fn,at:now+delay});maxTimers=Math.max(maxTimers,timers.size);return next;};
  win.clearTimeout=id=>timers.delete(id);
  win.ResizeObserver=class{constructor(fn){this.fn=fn;observer=this;observerCount++;}observe(target){assert.equal(target,canvas);}disconnect(){this.disconnected=true;}};
  const inGlobals=fn=>{const oldWindow=globalThis.window,oldDocument=globalThis.document;globalThis.window=win;globalThis.document=doc;try{return fn();}finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}};
  const input=inGlobals(()=>new PlaygroundInput(canvas,{alpha:1,beta:1,radius:5},{canMove:()=>true,setAttackHeld:value=>{held=value;},cancelAttackInput:()=>{held=false;}}));
  const reset=input.reset.bind(input);input.reset=()=>{resets++;trace.push({type:'input-reset',at:now});reset();};
  const allocate=()=>{const entry={at:now,css:[canvas.clientWidth,canvas.clientHeight],buffer:[Math.floor(canvas.clientWidth/level),Math.floor(canvas.clientHeight/level)],ratio:1/level};buffers.push(entry);trace.push({type:'buffer',...entry});};
  const engine={maxFPS:30,getHardwareScalingLevel:()=>level,setHardwareScalingLevel(value){level=value;allocate();},resize:allocate};
  const activity=new RenderActivity(mobile,()=>now);activity.setTargetFps(60);
  const world={scene:{onDisposeObservable:new Observable()},lighting:{setQuality:quality=>assert.equal(quality,'high')}};
  const env={canvas,engine,window:win,document:doc,world,input,observeViewportSize,renderPixelRatio,renderActivity:activity,qualityMode:'high',touchDevice:mobile,renderScaleControl:{value:85},renderViewportKey:'',mapDeparture:null,mapTransition:{busy:false},
    resizeScreenProjection(){projections++;},$:()=>({value:''}),frameLoop:{invalidate(){invalidates++;}},
    sceneDiagnostics:{requestDrawCpuCapture(reason){const entry={type:'capture',reason,at:now,buffer:buffers.at(-1)?.buffer,held};captures.push(entry);trace.push(entry);return true;}},
  };
  const api=Function('env','with(env){'+applySource+'\n'+bindingSource+';return {apply:applyRenderQuality,viewportResize};}')(env);
  const flush=()=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);};
  const advance=ms=>{const end=now+ms;let count=0;while(true){const due=[...timers].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;assert.ok(++count<100,'viewport work must remain bounded');now=due[1].at;timers.delete(due[0]);due[1].fn();flush();}now=end;};
  const resize=(w,h)=>{canvas.clientWidth=w;canvas.clientHeight=h;observer.fn();win.emit('resize');win.visualViewport.emit('resize');flush();};
  const key=(type='keydown')=>inGlobals(()=>win.emit(type,{code:'KeyJ',target:canvas,repeat:false}));
  t.after(()=>{api.viewportResize();input.dispose();});
  const visibility=hidden=>{doc.hidden=hidden;inGlobals(()=>doc.emit('visibilitychange'));};
  return {win,doc,canvas,input,world,engine,env,...api,flush,advance,resize,key,visibility,buffers,captures,trace,frames,timers,
    held:()=>held,resets:()=>resets,projections:()=>projections,invalidates:()=>invalidates,
    stats:()=>({maxFrames,maxTimers,observerCount,disconnected:observer.disconnected===true})};
}

test('real main rotation wiring preserves fresh input and commits only final exact 85% buffers before requesting its probe',t=>{
  const f=fixture(t);f.flush();assert.deepEqual(f.buffers.map(entry=>entry.buffer),[[1414,652]]);assert.equal(f.resets(),0);
  f.key();assert.equal(f.held(),true);f.win.emit('orientationchange');assert.equal(f.world.viewportResize.isSettling(),true);
  f.advance(60);assert.equal(f.resets(),0);assert.equal(f.captures.length,1);
  f.resize(384,740);assert.equal(f.resets(),1);assert.equal(f.held(),false);f.key();assert.equal(f.held(),true);
  f.advance(40);f.resize(384,780);f.advance(40);f.resize(384,808);f.advance(40);f.resize(384,832);
  f.advance(124);assert.equal(f.buffers.length,1);assert.equal(f.captures.length,1);f.advance(1);
  assert.deepEqual(f.buffers.map(entry=>entry.buffer),[[1414,652],[652,1414]]);assert.equal(f.resets(),1);assert.equal(f.held(),true);
  assert.deepEqual(f.captures.at(-1),{type:'capture',reason:'viewport-commit',at:305,buffer:[652,1414],held:true});
  assert.ok(f.trace.findIndex(event=>event.type==='buffer'&&event.at===305)<f.trace.findIndex(event=>event.type==='capture'&&event.at===305));
  assert.equal(f.viewportResize.isSettling(),true);f.advance(195);assert.equal(f.viewportResize.isSettling(),false);
  f.win.screen.orientation.emit('change');f.resize(832,352);assert.equal(f.resets(),2);f.key();
  f.advance(40);f.resize(832,370);f.advance(40);f.resize(832,384);f.advance(125);f.advance(295);
  assert.deepEqual(f.buffers.map(entry=>entry.buffer),[[1414,652],[652,1414],[1414,652]]);
  assert.equal(f.captures.length,3);assert.equal(f.resets(),2);assert.equal(f.held(),true);assert.equal(f.viewportResize.isSettling(),false);
  assert.equal(f.env.renderScaleControl.value,85);assert.equal(f.env.qualityMode,'high');assert.equal(f.engine.maxFPS,60);
  for(let repeat=0;repeat<10;repeat++)f.apply();assert.equal(f.buffers.length,3);
  assert.ok(f.stats().maxFrames<=1);assert.ok(f.stats().maxTimers<=1);assert.equal(f.stats().observerCount,1);
});

test('same-size 180 degree rotation refreshes layout and gates textures without canceling game input or sampling a resize',t=>{
  const f=fixture(t);f.flush();f.key();const before=f.projections(),states=[];
  f.viewportResize.subscribe(state=>states.push(state.settling));f.win.emit('orientationchange');
  assert.equal(f.viewportResize.isSettling(),true);assert.equal(f.viewportResize.snapshot().pending,null);
  f.flush();f.advance(500);
  assert.deepEqual(states,[true,false]);assert.equal(f.held(),true);assert.equal(f.resets(),0);
  assert.equal(f.buffers.length,1);assert.equal(f.captures.length,1);assert.ok(f.projections()>before);
  assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
});

test('real visibility resume gates texture admission before delayed CSS changes and preserves the fresh post-change hold',t=>{
  const f=fixture(t);f.flush();f.visibility(true);const hiddenResets=f.resets();
  f.visibility(false);assert.equal(f.world.viewportResize.isSettling(),true);
  let admitted=0;const admit=()=>{if(!f.world.viewportResize.isSettling())admitted++;};
  f.flush();f.advance(200);admit();assert.equal(admitted,0);assert.equal(f.buffers.length,1);assert.equal(f.resets(),hiddenResets);
  f.resize(384,832);assert.equal(f.resets(),hiddenResets+1);f.key();f.advance(125);admit();
  assert.equal(admitted,0);assert.equal(f.held(),true);assert.deepEqual(f.buffers.at(-1).buffer,[652,1414]);
  f.advance(175);admit();assert.equal(admitted,1);assert.equal(f.held(),true);assert.equal(f.resets(),hiddenResets+1);
  assert.equal(f.captures.at(-1).reason,'viewport-commit');assert.equal(f.captures.at(-1).at,325);
});

test('desktop main binding remains next-frame responsive and applies DPR changes without duplicate allocations',t=>{
  const f=fixture(t,{mobile:false});f.flush();f.key();f.resize(1000,600);
  assert.equal(f.viewportResize.isSettling(),false);assert.equal(f.resets(),1);assert.deepEqual(f.buffers.at(-1).buffer,[1700,1020]);
  f.key();f.resize(1000,600);assert.equal(f.held(),true);assert.equal(f.buffers.length,2);assert.equal(f.captures.length,2);
  f.win.devicePixelRatio=1.5;f.win.emit('resize');f.flush();assert.equal(f.resets(),2);
  // Integer division by the reciprocal scaling level can round just below the
  // mathematical size; retain the renderer's actual integer backing contract.
  assert.deepEqual(f.buffers.at(-1).buffer,[1274,764]);assert.ok(Math.abs(f.buffers.at(-1).ratio-1.275)<1e-12);
  assert.equal(f.env.renderScaleControl.value,85);assert.equal(f.engine.maxFPS,60);
  assert.equal(f.timers.size,0);assert.equal(f.captures.at(-1).reason,'viewport-commit');
});

test('the production scene disposal observer cancels pending resize and cannot clear a fresh hold or request late probes',t=>{
  const f=fixture(t);f.flush();f.win.emit('orientationchange');f.resize(384,832);f.key();
  assert.equal(f.viewportResize.isSettling(),true);assert.equal(f.resets(),1);assert.equal(f.held(),true);
  f.world.scene.onDisposeObservable.notifyObservers();assert.equal(f.viewportResize.snapshot().disposed,true);assert.equal(f.stats().disconnected,true);
  f.win.emit('resize');f.win.visualViewport.emit('resize');f.win.emit('pageshow');f.flush();f.advance(1000);
  assert.equal(f.buffers.length,1);assert.equal(f.captures.length,1);assert.equal(f.resets(),1);assert.equal(f.held(),true);
  assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);assert.equal(f.viewportResize.isSettling(),false);
});
