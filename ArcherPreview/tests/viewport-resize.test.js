import test from 'node:test';
import assert from 'node:assert/strict';
import {observeViewportSize} from '../src/viewport-resize.js';
import {isInstalledDisplay} from '../src/app-display.js';
import {renderPixelRatio} from '../src/render-policy.js';

function fixture(t,{width=393,height=852,observer=true,mobile=true,pixelRatio=3}={}){
  const targets=[];
  const target=()=>{
    const value=new EventTarget(),listeners=new Map(),add=value.addEventListener.bind(value),remove=value.removeEventListener.bind(value);
    value.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);add(type,fn);};
    value.removeEventListener=(type,fn)=>{listeners.get(type)?.delete(fn);remove(type,fn);};
    value.listenerCount=()=>[...listeners.values()].reduce((sum,set)=>sum+set.size,0);targets.push(value);return value;
  };
  const host=target(),doc=target(),canvas={clientWidth:width,clientHeight:height};
  const frames=new Map(),timers=new Map(),calls=[],layouts=[],pending=[],buffers=[];
  let next=0,time=0,resizeObserver,observers=0,maxFrames=0,maxTimers=0;
  host.document=doc;host.performance={now:()=>time};host.devicePixelRatio=pixelRatio;
  host.matchMedia=()=>({matches:mobile});host.screen={orientation:target()};
  host.visualViewport=Object.assign(target(),{width,height:height-59,scale:1});
  host.requestAnimationFrame=fn=>{frames.set(++next,fn);maxFrames=Math.max(maxFrames,frames.size);return next;};
  host.cancelAnimationFrame=id=>frames.delete(id);
  host.setTimeout=(fn,delay=0)=>{timers.set(++next,{at:time+delay,fn});maxTimers=Math.max(maxTimers,timers.size);return next;};
  host.clearTimeout=id=>timers.delete(id);
  if(observer)host.ResizeObserver=class{
    constructor(fn){this.fn=fn;resizeObserver=this;observers++;}
    observe(value){assert.equal(value,canvas);}
    disconnect(){this.disconnected=true;}
  };
  const dispose=observeViewportSize(canvas,size=>{
    calls.push(size);const ratio=renderPixelRatio(size.pixelRatio,'high',mobile,85);
    buffers.push([Math.floor(size.width*ratio),Math.floor(size.height*ratio)]);
  },host,{onLayout:size=>layouts.push(size),onPending:size=>pending.push(size)});
  t.after(dispose);
  const flush=()=>{const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(time);};
  const advance=ms=>{
    const end=time+ms;let iterations=0;
    while(true){
      const due=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due)break;assert.ok(++iterations<100,'timer loop must stay bounded');
      time=due[1].at;timers.delete(due[0]);due[1].fn();flush();
    }
    time=end;
  };
  const resize=(w,h)=>{canvas.clientWidth=w;canvas.clientHeight=h;resizeObserver?.fn();host.visualViewport.dispatchEvent(new Event('resize'));host.dispatchEvent(new Event('resize'));flush();};
  return {host,doc,canvas,calls,layouts,pending,buffers,frames,timers,flush,advance,resize,settle:()=>advance(750),dispose,
    observer:()=>resizeObserver,stats:()=>({maxFrames,maxTimers,observers,listeners:targets.reduce((sum,value)=>sum+value.listenerCount(),0)})};
}

test('first measurement is immediate and unchanged landscape reversal only refreshes safe-area layout',t=>{
  const f=fixture(t,{width:852,height:393});f.flush();
  assert.equal(f.calls.length,1);assert.equal(f.pending.length,0);assert.equal(f.timers.size,0);
  f.host.dispatchEvent(new Event('orientationchange'));f.flush();f.settle();
  assert.equal(f.calls.length,1);assert.equal(f.pending.length,0);assert.equal(f.dispose.isSettling(),false);assert.ok(f.layouts.length>=2);
  assert.deepEqual(f.layouts.at(-1),{width:852,height:393,pixelRatio:3});
  assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
});

test('iPhone rotation uses the full final canvas after its CSS dimensions stop changing',t=>{
  const f=fixture(t);f.flush();assert.deepEqual(f.calls[0],{width:393,height:852,pixelRatio:3});
  f.host.dispatchEvent(new Event('orientationchange'));f.flush();
  f.host.visualViewport.width=852;f.host.visualViewport.height=334;f.resize(852,393);
  assert.equal(f.calls.length,1);assert.equal(f.pending.length,1);assert.equal(f.dispose.isSettling(),true);
  f.advance(124);assert.equal(f.calls.length,1);f.advance(1);
  assert.deepEqual(f.calls.at(-1),{width:852,height:393,pixelRatio:3});assert.equal(f.dispose.isSettling(),true);
  f.settle();assert.equal(f.dispose.isSettling(),false);assert.equal(f.calls.length,2,'later fallback probes must not allocate the buffer again');
});

test('an unchanged rotation watch wakes a subscription waiter without input reset or buffer allocation',async t=>{
  const f=fixture(t,{width:832,height:384});f.flush();const notifications=[];
  f.host.dispatchEvent(new Event('orientationchange'));
  assert.equal(f.dispose.isSettling(),true);assert.equal(f.dispose.snapshot().watching,true);assert.equal(f.dispose.snapshot().pending,null);
  const settled=new Promise(resolve=>{const unsubscribe=f.dispose.subscribe(state=>{notifications.push(state);if(!state.settling){unsubscribe();resolve();}});});
  f.flush();f.advance(499);assert.equal(f.dispose.isSettling(),true);assert.equal(notifications.length,0);
  f.advance(1);await settled;
  assert.equal(f.dispose.isSettling(),false);assert.equal(notifications.length,1);assert.equal(notifications[0].watching,false);
  assert.equal(f.pending.length,0);assert.equal(f.calls.length,1);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
});

test('texture admission is blocked before the first rotated CSS measurement and through the delayed-layout watch',t=>{
  const f=fixture(t,{width:832,height:384});f.flush();let admissions=0;
  const admit=()=>{if(!f.dispose.isSettling())admissions++;};
  const states=[];const unsubscribe=f.dispose.subscribe(state=>{states.push([state.settling,state.watching]);if(!state.settling)admit();});
  f.host.dispatchEvent(new Event('orientationchange'));admit();assert.equal(admissions,0);
  f.flush();f.advance(200);admit();assert.equal(admissions,0);assert.equal(f.pending.length,0);assert.equal(f.calls.length,1);
  f.resize(384,832);assert.equal(f.pending.length,1);f.advance(125);admit();
  assert.equal(f.calls.length,2);assert.equal(f.dispose.snapshot().pending,null);assert.equal(admissions,0);
  f.advance(175);assert.equal(admissions,1);assert.deepEqual(states,[[true,true],[false,false]]);
  assert.ok(f.stats().maxFrames<=1);assert.ok(f.stats().maxTimers<=1);unsubscribe();
});

test('hidden and disposed watch-only states notify subscribers and release all scheduled work',t=>{
  for(const reason of ['hidden','dispose']){
    const f=fixture(t),states=[];f.flush();f.dispose.subscribe(state=>states.push([state.settling,state.disposed]));
    f.host.dispatchEvent(new Event('pageshow'));assert.equal(f.dispose.isSettling(),true);
    if(reason==='hidden'){f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));}else f.dispose();
    assert.deepEqual(states,[[true,false],[false,reason==='dispose']]);assert.equal(f.dispose.isSettling(),false);
    assert.equal(f.pending.length,0);assert.equal(f.calls.length,1);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
  }
});

test('recorded 85% landscape-to-portrait toolbar height steps and return allocate only final exact buffers',t=>{
  const f=fixture(t,{width:832,height:384,pixelRatio:2});f.flush();assert.deepEqual(f.buffers,[[1414,652]]);
  const notifications=[];const unsubscribe=f.dispose.subscribe(state=>notifications.push(state));
  f.host.dispatchEvent(new Event('orientationchange'));f.resize(384,740);
  f.advance(40);f.resize(384,780);f.advance(40);f.resize(384,808);f.advance(40);f.resize(384,832);
  assert.equal(f.calls.length,1);assert.equal(f.pending.length,1);assert.equal(f.dispose.isSettling(),true);
  assert.equal(f.dispose.snapshot().pending.height,832);f.advance(124);assert.equal(f.calls.length,1);f.advance(1);
  assert.deepEqual(f.buffers,[[1414,652],[652,1414]]);assert.equal(f.dispose.isSettling(),true);assert.equal(f.dispose.snapshot().pending,null);
  f.settle();assert.equal(f.calls.length,2);
  f.host.screen.orientation.dispatchEvent(new Event('change'));f.resize(832,352);
  f.advance(40);f.resize(832,370);f.advance(40);f.resize(832,384);f.advance(125);
  assert.deepEqual(f.buffers,[[1414,652],[652,1414],[1414,652]]);assert.equal(f.pending.length,2);
  f.settle();
  assert.deepEqual(notifications.map(state=>state.settling),[true,false,true,false]);
  assert.equal(f.calls.every(size=>size.pixelRatio===2),true);assert.equal(renderPixelRatio(2,'high',true,85),1.7);
  unsubscribe();assert.equal(f.calls.length,3);assert.ok(f.stats().maxFrames<=1);assert.ok(f.stats().maxTimers<=1);
});

test('mobile toolbar heights below 380px settle without a minimum or quiet-window resets from duplicate events',t=>{
  const f=fixture(t,{width:852,height:320});f.flush();f.resize(852,294);
  f.advance(100);for(let i=0;i<100;i++)f.host.visualViewport.dispatchEvent(new Event('resize'));f.flush();
  f.advance(25);assert.equal(f.calls.at(-1).height,294);assert.equal(f.calls.length,2);
  f.resize(852,393);f.advance(125);assert.equal(f.calls.at(-1).height,393);assert.equal(f.pending.length,2);
});

test('continuous actual mobile changes commit latest dimensions by the 500ms deadline',t=>{
  const f=fixture(t,{width:832,height:384});f.flush();f.resize(384,700);
  for(let i=1;i<=6;i++){f.advance(80);f.resize(384,700+i*10);}
  assert.equal(f.calls.length,1);assert.equal(f.dispose.snapshot().elapsedMs,480);
  f.advance(20);assert.equal(f.calls.length,2);assert.equal(f.calls.at(-1).height,760);assert.equal(f.dispose.isSettling(),false);
  assert.equal(f.pending.length,1);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
});

test('desktop fullscreen resize bursts coalesce and DPR changes retain exact measurements',t=>{
  const f=fixture(t,{mobile:false});f.flush();f.host.document.dispatchEvent(new Event('fullscreenchange'));f.resize(1000,600);f.advance(40);f.resize(1100,700);
  assert.equal(f.calls.length,1);f.advance(79);assert.equal(f.calls.length,1);f.advance(1);assert.equal(f.calls.length,2);assert.equal(f.calls.at(-1).width,1100);
  f.advance(130);assert.equal(f.dispose.isSettling(),false);assert.equal(f.timers.size,0);
  f.host.devicePixelRatio=2;f.host.dispatchEvent(new Event('resize'));f.flush();f.advance(80);
  assert.equal(f.calls.length,3);assert.equal(f.calls.at(-1).pixelRatio,2);assert.equal(f.pending.length,2);
});

test('mobile DPR-only changes settle and fullscreen bursts use one final allocation',t=>{
  const f=fixture(t);f.flush();f.host.devicePixelRatio=2;f.host.dispatchEvent(new Event('resize'));f.flush();
  assert.equal(f.dispose.isSettling(),true);f.advance(125);assert.equal(f.calls.at(-1).pixelRatio,2);
  f.doc.dispatchEvent(new Event('fullscreenchange'));f.doc.dispatchEvent(new Event('webkitfullscreenchange'));f.resize(852,340);
  f.advance(75);f.resize(852,393);f.advance(125);assert.equal(f.calls.length,3);assert.equal(f.calls.at(-1).height,393);
  f.settle();assert.equal(f.calls.length,3);assert.ok(f.stats().maxTimers<=1);assert.ok(f.stats().maxFrames<=1);
});

test('hidden transitions cancel pending work and resume detects delayed layout without ResizeObserver',t=>{
  const f=fixture(t,{observer:false});f.flush();f.resize(852,340);assert.equal(f.dispose.isSettling(),true);
  f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));f.canvas.clientHeight=0;
  assert.equal(f.dispose.isSettling(),false);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);f.advance(1000);assert.equal(f.calls.length,1);
  f.doc.hidden=false;f.doc.dispatchEvent(new Event('visibilitychange'));f.flush();f.advance(200);
  f.canvas.clientWidth=852;f.canvas.clientHeight=393;f.advance(175);
  assert.equal(f.calls.length,2);assert.equal(f.calls.at(-1).height,393);f.settle();assert.equal(f.timers.size,0);
});

test('a visible zero-sized canvas drops its expired deadline and resumes only with valid geometry',t=>{
  const f=fixture(t);f.flush();f.resize(852,393);assert.equal(f.dispose.isSettling(),true);
  f.canvas.clientHeight=0;f.advance(1000);
  assert.equal(f.calls.length,1);assert.equal(f.dispose.isSettling(),false);assert.equal(f.timers.size,0);
  f.resize(852,393);f.advance(125);assert.equal(f.calls.length,2);assert.equal(f.calls.at(-1).height,393);
});

test('disposal before the first measurement cancels initial and delayed checks',t=>{
  const f=fixture(t);f.host.dispatchEvent(new Event('pageshow'));f.dispose();f.flush();f.settle();
  assert.equal(f.calls.length,0);assert.equal(f.pending.length,0);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
  assert.equal(f.stats().listeners,0);assert.equal(f.observer().disconnected,true);
});

test('100 rotations and duplicate event storms retain one observer and bounded pending work',t=>{
  const f=fixture(t,{width:832,height:384});f.flush();const listeners=f.stats().listeners;
  for(let turn=0;turn<100;turn++){
    for(let event=0;event<20;event++){f.host.dispatchEvent(new Event('resize'));f.host.dispatchEvent(new Event('pageshow'));}
    assert.equal(f.frames.size,1);assert.equal(f.timers.size,1);
    f.resize(turn%2?832:384,turn%2?384:832);f.settle();
    assert.equal(f.dispose.isSettling(),false);assert.equal(f.stats().listeners,listeners);assert.equal(f.stats().observers,1);
    assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
  }
  assert.equal(f.calls.length,101);assert.ok(f.stats().maxTimers<=1);assert.ok(f.stats().maxFrames<=1);
  f.dispose();assert.equal(f.stats().listeners,0);assert.equal(f.observer().disconnected,true);
});

test('dispose cancels dimensions, timers, listeners and subscribers without a late allocation',t=>{
  const f=fixture(t);f.flush();const notifications=[];f.dispose.subscribe(state=>notifications.push(state));
  f.host.dispatchEvent(new Event('pageshow'));f.resize(852,393);assert.equal(f.dispose.isSettling(),true);
  const snapshot=f.dispose.snapshot();snapshot.committed.width=1;snapshot.pending.height=1;
  assert.equal(f.dispose.snapshot().committed.width,393);assert.equal(f.dispose.snapshot().pending.height,393);
  f.dispose();f.dispose();assert.equal(f.dispose.isSettling(),false);assert.equal(f.dispose.snapshot().disposed,true);
  assert.deepEqual(notifications.map(state=>[state.settling,state.disposed]),[[true,false],[false,true]]);
  f.host.dispatchEvent(new Event('resize'));f.host.visualViewport.dispatchEvent(new Event('resize'));f.flush();f.settle();
  assert.equal(f.calls.length,1);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);assert.equal(f.stats().listeners,0);
});

test('installed display recognizes legacy iOS and manifest display modes without user-agent guessing',()=>{
  assert.equal(isInstalledDisplay({navigator:{standalone:true}}),true);
  for(const mode of ['standalone','fullscreen'])assert.equal(isInstalledDisplay({matchMedia:query=>({matches:query===`(display-mode: ${mode})`})}),true);
  assert.equal(isInstalledDisplay({navigator:{userAgent:'iPhone',standalone:false},matchMedia:()=>({matches:false})}),false);
});
