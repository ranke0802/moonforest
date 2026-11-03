import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {HUD_GROUPS,HUD_LAYOUT_KEY,defaultHudLayout,parseHudLayout,resolveHudBox,setupHudLayout} from '../src/hud-layout.js';

const store=()=>{const values=new Map();return {values,getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};};
function fixture(storage=store()){
 const {document,window}=parseHTML('<html><body><main id="app"><section class="top-actions"></section><section id="player-hud"></section><output id="gold-balance"></output><div class="chapter-stack"></div><aside id="dot-minimap"></aside><aside id="frame-diagnostics"></aside><button id="guard-button"></button><button id="potion-button"></button><button id="dodge-button"></button><button id="attack-button"></button><dialog id="motion-speed-dialog"><div><div id="camera-follow-options"></div></div></dialog></main></body></html>');
 const root=document.querySelector('#app'),frame={left:0,top:0,width:1000,height:600};let paused=0,resets=0,ready=true,lastMessage='',frameCalls=0;
 const create=document.createElement.bind(document);document.createElement=tag=>{const node=create(tag);if(tag==='dialog')modal(node);return node;};
 function modal(node){Object.defineProperty(node,'open',{get:()=>node.hasAttribute('open')});node.showModal=()=>node.setAttribute('open','');node.close=()=>{node.removeAttribute('open');node.dispatchEvent(new window.Event('close'));};}
 modal(document.querySelector('#motion-speed-dialog'));
 const geometry=new Map();HUD_GROUPS.forEach((g,i)=>{const node=root.querySelector(g.selector);geometry.set(node,{x:g.locked?800+(i%2)*90:20+i*75,y:g.locked?400+Math.floor((i-6)/2)*90:20+i*50,width:g.locked?80:100,height:g.locked?80:40});node.getBoundingClientRect=()=>{const b=geometry.get(node),s=Number(node.style.scale||1),[dx,dy]=String(node.style.translate||'0 0').split(' ').map(parseFloat);const width=b.width*s,height=b.height*s,left=b.x+(dx||0)+(b.width-width)/2,top=b.y+(dy||0)+(b.height-height)/2;return {left,top,width,height,right:left+width,bottom:top+height};};});
 root.getBoundingClientRect=()=>({...frame,right:frame.left+frame.width,bottom:frame.top+frame.height});
 const queue=new Map();window.requestAnimationFrame=fn=>{frameCalls++;queue.set(frameCalls,fn);return frameCalls;};window.cancelAnimationFrame=id=>queue.delete(id);
 let resize;window.ResizeObserver=class{constructor(fn){resize=fn;}observe(){}disconnect(){}};
 // Linkedom has no browser select setter or pointer capture. These adapters
 // model their contracts; this is a DOM/lifecycle test, not browser rendering.
 const selectPrototype=Object.getPrototypeOf(create('select'));Object.defineProperty(selectPrototype,'value',{configurable:true,get(){return this.getAttribute('data-test-value')??this.querySelector('option')?.value;},set(v){this.setAttribute('data-test-value',v);}});
 const ui=setupHudLayout({root,storage,getReady:()=>ready,resetInput:()=>resets++,onPauseChange:()=>paused++,onClose:v=>lastMessage=v});
 const dialog=document.querySelector('#hud-layout-dialog');dialog.setPointerCapture=()=>{};dialog.releasePointerCapture=()=>{};
 const event=(node,type,props={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,props);node.dispatchEvent(e);return e;};
 const choose=id=>{const select=dialog.querySelector('select');select.value=id;event(select,'change');};
 const set=(key,value)=>{const n=dialog.querySelector(`[data-hud-field="${key}"]`);n.value=String(value);event(n,'input');};
 const command=name=>event(dialog.querySelector(`[data-hud-command="${name}"]`),'click');
 return {ui,root,dialog,storage,geometry,frame,event,choose,set,command,setReady:v=>ready=v,flush(){for(const [id,fn]of [...queue]){queue.delete(id);fn();}},resize:()=>resize(),stats:()=>({paused,resets,lastMessage,frameCalls})};
}
test('layout documents strictly validate numbers, schema, version and fixed combat centers',()=>{
 const data={version:1,items:defaultHudLayout()};data.items.attack.x=.8;data.items.attack.y=-.7;assert.deepEqual(parseHudLayout(data).attack,{x:0,y:0,scale:1});
 for(const change of [v=>v.version=2,v=>delete v.items.gold,v=>v.items.health.x=NaN,v=>v.items.attack.scale=9,v=>v.items.gold.fake=1,v=>v.items.health.x='1',v=>v.items.foo={}]){const v=structuredClone(data);change(v);assert.throws(()=>parseHudLayout(v));}
});
test('viewport resolver preserves neutral authored placement and clips moved groups inside screen',()=>{
 const g=HUD_GROUPS[0],b={x:20,y:20,width:200,height:40},v={width:1000,height:600};assert.deepEqual(resolveHudBox(g,{x:0,y:0,scale:1},b,v),{x:0,y:0,scale:1});
 for(const [x,y]of [[-1,-1],[1,1]]){const r=resolveHudBox(g,{x,y,scale:1.4},b,v);assert.ok(b.x+b.width/2+r.x*v.width-b.width*r.scale/2>=7.999);assert.ok(b.y+b.height/2+r.y*v.height-b.height*r.scale/2>=7.999);assert.ok(b.x+b.width/2+r.x*v.width+b.width*r.scale/2<=992.001);}
 const attack=HUD_GROUPS.at(-1),a=resolveHudBox(attack,{x:1,y:1,scale:.85},{x:300,y:300,width:48,height:48},v);assert.equal(a.x,0);assert.equal(a.y,0);assert.ok(a.scale*48>=44);
});
test('neutral layout preserves original style, and never schedules continuous frame work',()=>{
 const f=fixture();for(const g of HUD_GROUPS){const node=f.root.querySelector(g.selector);assert.equal(node.style.translate,'');assert.equal(node.style.scale,'');}assert.equal(f.stats().frameCalls,0);f.resize();f.resize();assert.equal(f.stats().frameCalls,1);f.flush();assert.equal(f.stats().frameCalls,1);f.ui.dispose();
});
test('save, reload and cancel use independent game storage and reset held input at editor boundaries',()=>{
 const saved=store(),f=fixture(saved);f.setReady(false);assert.equal(f.ui.open(),false);f.setReady(true);assert.equal(f.ui.open(),true);assert.equal(f.ui.isOpen(),true);f.choose('health');f.set('x',10);f.set('scale',120);f.command('save');assert.equal(f.ui.isOpen(),false);assert.equal(f.stats().resets,2);assert.equal(f.stats().paused,2);assert.ok(saved.getItem(HUD_LAYOUT_KEY));assert.equal(saved.getItem('moonforest-ui-proposal-layout-v1'),undefined);
 const r=fixture(saved);assert.equal(r.ui.inspect().items.health.x,.1);r.ui.open();r.choose('health');r.set('x',-30);r.command('cancel');assert.equal(r.ui.inspect().items.health.x,.1);f.ui.dispose();r.ui.dispose();
});
test('four combat buttons keep their centers through scale, import and reset',()=>{
 const f=fixture();f.ui.open();for(const g of HUD_GROUPS.filter(g=>g.locked)){const node=f.root.querySelector(g.selector),before=node.getBoundingClientRect();f.choose(g.id);f.set('scale',115);f.set('x',40);const after=node.getBoundingClientRect();assert.equal(after.left+after.width/2,before.left+before.width/2);assert.equal(after.top+after.height/2,before.top+before.height/2);assert.equal(f.dialog.querySelector('[data-hud-field="x"]').disabled,true);}f.command('reset-all');f.command('save');assert.deepEqual(f.ui.inspect().items,defaultHudLayout());f.ui.dispose();
});
test('drag events in editing top layer move HUD without invoking the underlying combat button',()=>{
 const f=fixture();let attack=0;f.root.querySelector('#attack-button').addEventListener('pointerdown',()=>attack++);f.ui.open();f.event(f.dialog,'pointerdown',{button:0,pointerId:1,clientX:30,clientY:30});f.event(f.dialog,'pointermove',{pointerId:1,clientX:130,clientY:90});f.event(f.dialog,'pointercancel',{pointerId:1});f.command('save');assert.equal(f.ui.inspect().items.health.x,.1);assert.equal(f.ui.inspect().items.health.y,.1);assert.equal(attack,0);f.ui.dispose();
});
test('invalid import is non-destructive; valid import restores all groups and exports editable data',()=>{
 const f=fixture();f.ui.open();const area=f.dialog.querySelector('textarea');area.value='{"version":99}';f.command('import');assert.match(f.dialog.querySelector('#hud-layout-status').textContent,/올바른/);const items=defaultHudLayout();items.map.x=-.2;area.value=JSON.stringify({version:1,items});f.command('import');area.select=()=>{};f.command('export');assert.equal(JSON.parse(area.value).items.map.x,-.2);f.command('save');assert.equal(f.ui.inspect().items.map.x,-.2);f.ui.dispose();
});
test('unavailable storage keeps usable session settings and reports lack of persistence',()=>{
 const f=fixture({getItem(){throw Error('blocked');},setItem(){throw Error('quota');}});f.ui.open();f.choose('gold');f.set('x',10);f.command('save');assert.equal(f.ui.inspect().items.gold.x,.1);assert.match(f.stats().lastMessage,/이번 접속/);const copy=f.ui.inspect();copy.items.gold.x=0;assert.equal(f.ui.inspect().items.gold.x,.1);f.ui.dispose();
});
test('native close and Escape cancellation discard drafts and release pause',()=>{
 for(const mode of ['cancel','close']){const f=fixture();f.ui.open();f.choose('map');f.set('x',10);if(mode==='cancel')f.event(f.dialog,'cancel');else f.dialog.close();assert.equal(f.ui.isOpen(),false);assert.equal(f.ui.inspect().items.map.x,0);assert.equal(f.stats().paused,2);f.ui.dispose();}
});
