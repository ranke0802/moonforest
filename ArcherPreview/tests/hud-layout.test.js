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
 const extra=document.createElement('div');extra.innerHTML='<section id="boss-hud"></section><div id="joystick"></div><button id="map-travel"></button><div class="chapter-story"></div><div class="chapter-context"></div>';root.append(extra);
 for(const id of ['chapter-dialog','summon-dialog','minimap-travel-dialog','help-dialog','diagnostic-detail-dialog','boss-pattern-dialog','character-style-dialog']){const node=document.createElement('dialog');node.id=id;root.append(node);}
 const top=root.querySelector('.top-actions');for(const id of ['fps','bag','journal','summon','fullscreen','settings']){const child=document.createElement('button');child.dataset.topAction=id;top.append(child);}
 const geometry=new Map();HUD_GROUPS.forEach((g,i)=>{const node=root.querySelector(g.selector),combat=i>=6;if(!node)return;geometry.set(node,{x:combat?800+(i%2)*90:20+i*75,y:combat?400+Math.floor((i-6)/2)*90:20+i*50,width:combat?80:100,height:combat?80:40});node.getBoundingClientRect=()=>{const b=geometry.get(node),s=Number(node.style.scale||1),[dx,dy]=String(node.style.translate||'0 0').split(' ').map(parseFloat);const width=b.width*s,height=b.height*s,left=b.x+(dx||0)+(b.width-width)/2,top=b.y+(dy||0)+(b.height-height)/2;return {left,top,width,height,right:left+width,bottom:top+height};};});
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
test('layout documents strictly validate numbers, schema and movable combat controls',()=>{
 const data={version:1,items:defaultHudLayout()};data.items.attack.x=.8;data.items.attack.y=-.7;assert.deepEqual(parseHudLayout(data).attack,{x:.8,y:-.7,scale:1});
 for(const change of [v=>v.version=2,v=>delete v.items.gold,v=>v.items.health.x=NaN,v=>v.items.attack.scale=9,v=>v.items.gold.fake=1,v=>v.items.health.x='1',v=>v.items.foo={}]){const v=structuredClone(data);change(v);assert.throws(()=>parseHudLayout(v));}
});
test('viewport resolver preserves neutral authored placement and clips moved groups inside screen',()=>{
 const g=HUD_GROUPS[0],b={x:20,y:20,width:200,height:40},v={width:1000,height:600};assert.deepEqual(resolveHudBox(g,{x:0,y:0,scale:1},b,v),{x:0,y:0,scale:1});
 for(const [x,y]of [[-1,-1],[1,1]]){const r=resolveHudBox(g,{x,y,scale:1.4},b,v);assert.ok(b.x+b.width/2+r.x*v.width-b.width*r.scale/2>=7.999);assert.ok(b.y+b.height/2+r.y*v.height-b.height*r.scale/2>=7.999);assert.ok(b.x+b.width/2+r.x*v.width+b.width*r.scale/2<=992.001);}
 const attack=HUD_GROUPS.find(g=>g.id==='attack'),a=resolveHudBox(attack,{x:1,y:1,scale:.85},{x:300,y:300,width:48,height:48},v);assert.ok(a.x>0);assert.ok(a.y>0);assert.ok(a.scale*48>=44);
});
test('popup position and size are saved with HUD layout',()=>{
 const f=fixture();f.ui.open();f.choose('chapterDialog');f.set('x',10);f.set('scale',110);f.command('save');
 const saved=JSON.parse(f.storage.getItem(HUD_LAYOUT_KEY));assert.equal(saved.items.chapterDialog.x,.1);assert.equal(saved.items.chapterDialog.scale,1.1);
 f.ui.dispose();const next=fixture(f.storage);assert.equal(next.ui.inspect().items.chapterDialog.scale,1.1);next.ui.dispose();
});
test('a closed popup has an inert draggable preview and saves its placement',()=>{
 const f=fixture(),source=f.root.querySelector('#chapter-dialog'),clone=source.cloneNode.bind(source);
 source.getBoundingClientRect=()=>({left:0,top:0,right:0,bottom:0,width:0,height:0});
 source.cloneNode=(deep)=>{const copy=clone(deep);copy.getBoundingClientRect=()=>({left:250,top:150,right:450,bottom:350,width:200,height:200});return copy;};
 f.ui.open();f.choose('chapterDialog');const preview=f.dialog.querySelector('#hud-layout-preview #chapter-dialog');assert.ok(preview);assert.ok(preview.hasAttribute('inert'));assert.ok(preview.hasAttribute('open'));
 f.event(f.dialog,'pointerdown',{pointerId:4,pointerType:'mouse',button:0,clientX:350,clientY:250});
 f.event(f.dialog,'pointermove',{pointerId:4,pointerType:'mouse',clientX:400,clientY:280});
 f.event(f.dialog,'pointerup',{pointerId:4,pointerType:'mouse'});f.command('save');
 const saved=JSON.parse(f.storage.getItem(HUD_LAYOUT_KEY));assert.equal(saved.items.chapterDialog.x,.05);assert.equal(saved.items.chapterDialog.y,.05);assert.equal(source.hasAttribute('open'),false);f.ui.dispose();
});
test('a popup component is editable in the preview and never applied to a different screen or item',()=>{
 const f=fixture(),source=f.root.querySelector('#chapter-dialog');source.dataset.screen='bag';source.innerHTML='<section><button data-chapter="item" data-id="apple">사과</button></section>';const clone=source.cloneNode.bind(source);
 source.getBoundingClientRect=()=>({left:0,top:0,right:0,bottom:0,width:0,height:0});
 source.cloneNode=deep=>{const copy=clone(deep);copy.getBoundingClientRect=()=>({left:200,top:100,right:600,bottom:500,width:400,height:400});copy.querySelector('button').getBoundingClientRect=()=>({left:300,top:200,right:360,bottom:260,width:60,height:60});return copy;};
 f.ui.open();f.choose('chapterDialog');f.dialog.querySelector('[data-hud-components]').checked=true;
 f.event(f.dialog,'pointerdown',{pointerId:7,pointerType:'mouse',button:0,clientX:330,clientY:230});f.event(f.dialog,'pointermove',{pointerId:7,pointerType:'mouse',clientX:380,clientY:260});f.event(f.dialog,'pointerup',{pointerId:7,pointerType:'mouse'});f.command('save');
 const saved=JSON.parse(f.storage.getItem(HUD_LAYOUT_KEY)),key=Object.keys(saved.items).find(k=>k.startsWith('component:chapterDialog:bag:'));assert.ok(key);assert.equal(saved.items[key].x,.05);assert.equal(saved.items[key].y,.05);assert.equal(source.querySelector('button').style.translate,'50px 30px');
 source.querySelector('button').dataset.id='different';source.querySelector('button').style.translate='';f.ui.refresh();f.flush();assert.equal(source.querySelector('button').style.translate,'');f.ui.dispose();
});
test('neutral layout preserves original style, and never schedules continuous frame work',()=>{
 const f=fixture();for(const g of HUD_GROUPS){const node=f.root.querySelector(g.selector);if(!node)continue;assert.equal(node.style.translate,'');assert.equal(node.style.scale,'');}assert.equal(f.stats().frameCalls,0);f.resize();f.resize();assert.equal(f.stats().frameCalls,1);f.flush();assert.equal(f.stats().frameCalls,1);f.ui.dispose();
});
test('save, reload and cancel use independent game storage and reset held input at editor boundaries',()=>{
 const saved=store(),f=fixture(saved);f.setReady(false);assert.equal(f.ui.open(),false);f.setReady(true);assert.equal(f.ui.open(),true);assert.equal(f.ui.isOpen(),true);f.choose('health');f.set('x',10);f.set('scale',120);f.command('save');assert.equal(f.ui.isOpen(),false);assert.equal(f.stats().resets,2);assert.equal(f.stats().paused,2);assert.ok(saved.getItem(HUD_LAYOUT_KEY));assert.equal(saved.getItem('moonforest-ui-proposal-layout-v1'),undefined);
 const r=fixture(saved);assert.equal(r.ui.inspect().items.health.x,.1);r.ui.open();r.choose('health');r.set('x',-30);r.command('cancel');assert.equal(r.ui.inspect().items.health.x,.1);f.ui.dispose();r.ui.dispose();
});
test('combat buttons can move and reset independently',()=>{
 const f=fixture();f.ui.open();for(const id of ['shield','potion','dodge','attack']){f.choose(id);f.set('scale',115);f.set('x',10);assert.equal(f.dialog.querySelector('[data-hud-field="x"]').disabled,false);}f.command('save');assert.equal(f.ui.inspect().items.attack.x,.1);f.ui.open();f.command('reset-all');f.command('save');assert.deepEqual(f.ui.inspect().items,defaultHudLayout());f.ui.dispose();
});
test('drag events in editing top layer move HUD without invoking the underlying combat button',()=>{
 const f=fixture();let attack=0;f.root.querySelector('#attack-button').addEventListener('pointerdown',()=>attack++);f.ui.open();f.event(f.dialog,'pointerdown',{button:0,pointerId:1,clientX:60,clientY:40});f.event(f.dialog,'pointermove',{pointerId:1,clientX:160,clientY:100});f.event(f.dialog,'pointercancel',{pointerId:1});f.command('save');assert.equal(f.ui.inspect().items.health.x,.1);assert.equal(f.ui.inspect().items.health.y,.1);assert.equal(attack,0);f.ui.dispose();
});
test('directly pointing at another visible UI selects and moves that item',()=>{
 const f=fixture(),node=f.root.querySelector('#dot-minimap'),box=f.geometry.get(node);f.ui.open();
 const x=box.x+box.width/2,y=box.y+box.height/2;
 f.event(f.dialog,'pointerdown',{button:0,pointerId:7,pointerType:'mouse',clientX:x,clientY:y});
 f.event(f.dialog,'pointermove',{pointerId:7,pointerType:'mouse',clientX:x+100,clientY:y+30});f.event(f.dialog,'pointerup',{pointerId:7});f.command('save');
 assert.equal(f.ui.inspect().items.map.x,.1);assert.equal(f.ui.inspect().items.map.y,.05);assert.equal(f.ui.inspect().items.health.x,0);f.ui.dispose();
});
test('mouse corner drag and touch pinch resize the selected HUD group',()=>{
 const f=fixture();f.ui.open();
 f.event(f.dialog,'pointerdown',{button:0,pointerId:1,pointerType:'mouse',clientX:20,clientY:60});
 f.event(f.dialog,'pointermove',{pointerId:1,pointerType:'mouse',clientX:2,clientY:68});f.event(f.dialog,'pointerup',{pointerId:1});
 f.command('save');assert.ok(f.ui.inspect().items.health.scale>1);f.ui.open();f.command('reset-all');
 f.event(f.dialog,'pointerdown',{button:0,pointerId:2,pointerType:'touch',clientX:40,clientY:40});
 f.event(f.dialog,'pointerdown',{button:0,pointerId:3,pointerType:'touch',clientX:80,clientY:40});
 f.event(f.dialog,'pointermove',{pointerId:3,pointerType:'touch',clientX:96,clientY:40});f.event(f.dialog,'pointerup',{pointerId:3});
 f.command('save');assert.equal(f.ui.inspect().items.health.scale,1.4);f.ui.dispose();
});
test('invalid import is non-destructive; valid import restores all groups and exports editable data',()=>{
 const f=fixture();f.ui.open();const area=f.dialog.querySelector('textarea');area.value='{"version":99}';f.command('import');assert.match(f.dialog.querySelector('#hud-layout-status').textContent,/올바른/);const items=defaultHudLayout();items.map.x=-.2;area.value=JSON.stringify({version:1,items});f.command('import');area.select=()=>{};f.command('export');assert.equal(JSON.parse(area.value).items.map.x,-.2);f.command('save');assert.equal(f.ui.inspect().items.map.x,-.2);f.ui.dispose();
});
test('layout download emits a JSON file with the current edited positions',async t=>{
 const f=fixture(),create=URL.createObjectURL,revoke=URL.revokeObjectURL,anchor=f.root.ownerDocument.defaultView.HTMLAnchorElement.prototype.click;let captured,name;
 URL.createObjectURL=blob=>{captured=blob;return 'blob:hud-test';};URL.revokeObjectURL=()=>{};f.root.ownerDocument.defaultView.HTMLAnchorElement.prototype.click=function(){name=this.download;};
 t.after(()=>{URL.createObjectURL=create;URL.revokeObjectURL=revoke;f.root.ownerDocument.defaultView.HTMLAnchorElement.prototype.click=anchor;f.ui.dispose();});
 f.ui.open();f.choose('attack');f.set('x',10);f.command('download');assert.equal(name,'moonforest-hud-layout.json');assert.equal(JSON.parse(await captured.text()).items.attack.x,.1);
});
test('unavailable storage keeps usable session settings and reports lack of persistence',()=>{
 const f=fixture({getItem(){throw Error('blocked');},setItem(){throw Error('quota');}});f.ui.open();f.choose('gold');f.set('x',10);f.command('save');assert.equal(f.ui.inspect().items.gold.x,.1);assert.match(f.stats().lastMessage,/이번 접속/);const copy=f.ui.inspect();copy.items.gold.x=0;assert.equal(f.ui.inspect().items.gold.x,.1);f.ui.dispose();
});
test('native close and Escape cancellation discard drafts and release pause',()=>{
 for(const mode of ['cancel','close']){const f=fixture();f.ui.open();f.choose('map');f.set('x',10);if(mode==='cancel')f.event(f.dialog,'cancel');else f.dialog.close();assert.equal(f.ui.isOpen(),false);assert.equal(f.ui.inspect().items.map.x,0);assert.equal(f.stats().paused,2);f.ui.dispose();}
});
