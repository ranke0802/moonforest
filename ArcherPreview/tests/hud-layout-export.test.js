import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {defaultHudLayout,HUD_LAYOUT_KEY,parseHudLayout,setupHudLayout} from '../src/hud-layout.js';
import {releaseStorage} from '../src/release-storage.js';

// DOM/lifecycle coverage only: no browser automation or render/device claims.
function fixture(t,{storage,downloadError=false,urlError=false}={}){
 const {document,window}=parseHTML('<html><body><main id="app" data-ui-test data-raster-hud="v1" data-hud-input="pc"><nav class="top-actions"><button id="motion-speed-toggle">설정</button></nav><section id="player-hud"></section><output id="gold-balance"></output><div class="chapter-stack"></div><aside id="dot-minimap"></aside><button id="guard-button"></button><button id="potion-button"></button><button id="dodge-button"></button><button id="attack-button"></button><dialog id="motion-speed-dialog"><div><div id="camera-follow-options"></div></div></dialog></main></body></html>');
 const root=document.querySelector('#app'),create=document.createElement.bind(document),values=new Map(),downloads=[],blobs=new Map(),revoked=[],messages=[];
 storage??={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const modal=node=>{Object.defineProperty(node,'open',{get:()=>node.hasAttribute('open')});node.showModal=()=>node.setAttribute('open','');node.close=()=>{node.removeAttribute('open');node.dispatchEvent(new window.Event('close'));};};
 modal(root.querySelector('#motion-speed-dialog'));document.createElement=tag=>{const node=create(tag);if(tag==='dialog')modal(node);if(tag==='textarea')node.select=()=>{};return node;};
 // Linkedom lacks select.value assignment, layout, pointer capture and downloads.
 const selectProto=Object.getPrototypeOf(create('select'));Object.defineProperty(selectProto,'value',{configurable:true,get(){return this.getAttribute('data-test-value')??this.querySelector('option')?.value;},set(value){this.setAttribute('data-test-value',value);}});
 root.getBoundingClientRect=()=>({left:0,top:0,width:1280,height:720,right:1280,bottom:720});
 for(const node of root.querySelectorAll('section,output,aside,button,.chapter-stack,.top-actions'))node.getBoundingClientRect=()=>({left:20,top:40,width:100,height:50,right:120,bottom:90});
 let nextFrame=0;const frames=new Map();window.requestAnimationFrame=fn=>(frames.set(++nextFrame,fn),nextFrame);window.cancelAnimationFrame=id=>frames.delete(id);
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,anchorProto=window.HTMLAnchorElement.prototype,oldClick=anchorProto.click;
 URL.createObjectURL=blob=>{if(urlError)throw Error('object URL unavailable');const url='blob:hud-export-'+blobs.size;blobs.set(url,blob);return url;};URL.revokeObjectURL=url=>revoked.push(url);
 anchorProto.click=function(){downloads.push({anchor:this,url:this.href,inside:!!this.closest('#hud-layout-dialog'),connected:this.isConnected});if(downloadError)throw Error('download blocked');};
 const ui=setupHudLayout({root,storage,onClose:message=>messages.push(message)}),dialog=root.querySelector('#hud-layout-dialog');dialog.setPointerCapture=()=>{};dialog.releasePointerCapture=()=>{};
 const event=(node,type,props={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,props);node.dispatchEvent(e);return e;};
 const button=command=>dialog.querySelector(`[data-hud-command="${command}"]`),command=name=>button(name).click(),area=()=>dialog.querySelector('#hud-layout-json'),status=()=>dialog.querySelector('#hud-layout-status').textContent;
 const choose=id=>{const select=dialog.querySelector('#hud-layout-selection');select.value=id;event(select,'change');};
 const field=(key,value)=>{const node=dialog.querySelector(`[data-hud-field="${key}"]`);node.value=String(value);event(node,'input');};
 const importText=items=>{area().value=JSON.stringify({version:1,items});command('import');};
 const file=async file=>{const input=dialog.querySelector('input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:[file]});event(input,'change');await new Promise(resolve=>setImmediate(resolve));};
 t.after(()=>{ui.dispose();URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;anchorProto.click=oldClick;});
 return {root,dialog,ui,storage,downloads,blobs,revoked,messages,event,button,command,area,status,choose,field,importText,file};
}

test('primary save-and-JSON command is outside folds and exports the same full-precision 5x draft it persists',async t=>{
 const f=fixture(t);f.ui.open();const primary=f.button('download');assert.ok(primary);assert.equal(primary.closest('details'),null,'primary file command must be directly accessible');assert.match(primary.textContent,/저장/);
 const items=defaultHudLayout();items.attack={x:.123456789,y:-.234567891,scale:5};items.health={x:-.050001,y:.073456789,scale:1.17};f.importText(items);f.command('download');
 assert.equal(f.ui.isOpen(),true,'file export keeps editing available');assert.equal(f.downloads.length,1);const {url}=f.downloads[0],exported=JSON.parse(await f.blobs.get(url).text()),persisted=JSON.parse(f.storage.getItem(HUD_LAYOUT_KEY));
 assert.deepEqual(exported,persisted);assert.deepEqual(parseHudLayout(exported),items);assert.deepEqual(f.ui.inspect().items,items);
 f.command('cancel');f.ui.open();assert.deepEqual(f.ui.inspect().items,items);const reset=defaultHudLayout();reset.attack.x=-.4;f.importText(reset);f.importText(exported.items);f.command('save');assert.deepEqual(f.ui.inspect().items,items);
});

test('download link stays inside the active editor and retains its URL until replacement or disposal',async t=>{
 const f=fixture(t);f.ui.open();f.command('download');const first=f.downloads[0];assert.equal(first.inside,true);assert.equal(first.connected,true);assert.equal(first.anchor.download,'moonforest-hud-layout.json');assert.equal(first.anchor.hidden,false);assert.equal(first.anchor.isConnected,true);assert.equal(first.anchor.href,first.url);assert.deepEqual(f.revoked,[]);
 f.choose('attack');f.field('x',10);f.command('download');const second=f.downloads[1];assert.deepEqual(f.revoked,[first.url]);assert.equal(JSON.parse(await f.blobs.get(second.url).text()).items.attack.x,.1);f.ui.dispose();assert.deepEqual(f.revoked,[first.url,second.url]);
});

test('blocked file click leaves persisted data, raw JSON and an explicit in-dialog fallback link',async t=>{
 const f=fixture(t,{downloadError:true});f.ui.open();f.choose('attack');f.field('x',10);assert.doesNotThrow(()=>f.command('download'));const data=JSON.parse(f.area().value);assert.equal(data.items.attack.x,.1);assert.deepEqual(data,JSON.parse(f.storage.getItem(HUD_LAYOUT_KEY)));
 const fallback=f.dialog.querySelector('a[download="moonforest-hud-layout.json"]');assert.ok(fallback);assert.equal(fallback.hidden,false);assert.ok(f.blobs.has(fallback.href));assert.ok(fallback.isConnected);assert.match(f.status(),/다운로드|파일|링크/);assert.equal(f.ui.isOpen(),true);
});

test('object URL failure still exposes current JSON and leaves editor controls usable',t=>{
 const f=fixture(t,{urlError:true});f.ui.open();f.choose('attack');f.field('x',10);assert.doesNotThrow(()=>f.command('download'));assert.equal(JSON.parse(f.area().value).items.attack.x,.1);assert.equal(f.ui.isOpen(),true);assert.ok(f.status());f.field('x',20);f.command('save');assert.equal(f.ui.inspect().items.attack.x,.2);
});

test('ordinary cancel, invalid JSON and file chooser cancellation never commit a draft',async t=>{
 const f=fixture(t);f.ui.open();f.choose('attack');f.field('x',10);f.command('cancel');assert.equal(f.ui.inspect().items.attack.x,0);assert.equal(f.storage.getItem(HUD_LAYOUT_KEY),null);
 f.ui.open();f.area().value='{"version":99}';f.command('import');assert.match(f.status(),/올바른/);await f.file(undefined);f.command('cancel');assert.equal(f.ui.inspect().items.attack.x,0);assert.equal(f.downloads.length,0);
});

test('a previous editor session cannot import an asynchronously resolved file into a reopened draft',async t=>{
 const f=fixture(t);f.ui.open();let resolve;const oldItems=defaultHudLayout();oldItems.attack.x=.6;
 const pending=f.file({size:100,text:()=>new Promise(done=>{resolve=done;})});await new Promise(done=>setImmediate(done));f.command('cancel');f.ui.open();f.choose('attack');f.field('x',10);resolve(JSON.stringify({version:1,items:oldItems}));await pending;f.command('save');assert.equal(f.ui.inspect().items.attack.x,.1);
});

test('a no-op release storage wrapper reports session-only save while preserving the applied layout',t=>{
 const f=fixture(t,{storage:releaseStorage(undefined,'moonforest-0.2')});f.ui.open();f.choose('attack');f.field('x',10);f.command('save');
 assert.equal(f.ui.inspect().items.attack.x,.1);assert.equal(f.ui.inspect().storageAvailable,false);assert.equal(f.storage.getItem(HUD_LAYOUT_KEY),null);assert.match(f.messages.at(-1),/이번 접속/);
 f.ui.open();f.command('save');assert.equal(f.ui.inspect().items.attack.x,.1);assert.equal(f.ui.inspect().storageAvailable,false);
});

test('clipboard-unavailable copy exposes selected current JSON without saving or discarding the draft',async t=>{
 const f=fixture(t);f.ui.open();f.choose('attack');f.field('x',10);f.command('copy');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(JSON.parse(f.area().value).items.attack.x,.1);assert.match(f.status(),/복사/);assert.equal(f.ui.isOpen(),true);assert.equal(f.storage.getItem(HUD_LAYOUT_KEY),null);
 for(let node=f.area().parentElement;node&&node!==f.dialog;node=node.parentElement)if(node.tagName==='DETAILS')assert.equal(node.open,true,'manual copy text must be visible');
 f.command('save');assert.equal(f.ui.inspect().items.attack.x,.1);
});
