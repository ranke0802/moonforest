import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {setupHudLayout,defaultHudLayout} from '../src/hud-layout.js';

function fixture(storage){
 const {document,window}=parseHTML('<html><body><main id="app"><button id="motion-speed-toggle">설정</button><div id="player-hud"></div><aside id="frame-diagnostics" hidden></aside><button id="attack-button"></button><dialog id="motion-speed-dialog"><div id="settings"><div id="camera-follow-options"></div></div></dialog></main></body></html>'),root=document.querySelector('#app');
 const create=document.createElement.bind(document);document.createElement=tag=>{const node=create(tag);if(tag==='dialog'){Object.defineProperty(node,'open',{get:()=>node.hasAttribute('open')});node.showModal=()=>node.setAttribute('open','');node.close=()=>{node.removeAttribute('open');node.dispatchEvent(new window.Event('close'));};}return node;};
 document.querySelector('#motion-speed-dialog').close=()=>document.querySelector('#motion-speed-dialog').removeAttribute('open');
 const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height}),frame={width:1000,height:600},diagnostics=document.querySelector('#frame-diagnostics');root.getBoundingClientRect=()=>rect(0,0,frame.width,frame.height);document.querySelector('#player-hud').getBoundingClientRect=()=>rect(10,10,100,40);document.querySelector('#attack-button').getBoundingClientRect=()=>rect(800,400,80,80);diagnostics.getBoundingClientRect=()=>diagnostics.hidden?rect(0,0,0,0):rect(20,100,140,60);
 let pending,resize;window.requestAnimationFrame=fn=>(pending=fn,1);window.cancelAnimationFrame=()=>{pending=null;};window.ResizeObserver=class{constructor(fn){resize=fn;}observe(){}disconnect(){}};
 const proto=Object.getPrototypeOf(create('select'));Object.defineProperty(proto,'value',{configurable:true,get(){return this.getAttribute('data-test-value')??this.querySelector('option')?.value;},set(v){this.setAttribute('data-test-value',v);}});
 let focused;const focusProto=Object.getPrototypeOf(create('button'));focusProto.focus=function(){focused=this;};proto.focus=function(){focused=this;};
 const ui=setupHudLayout({root,storage,getReady:()=>true}),dialog=root.querySelector('#hud-layout-dialog'),released=[];dialog.setPointerCapture=()=>{};dialog.releasePointerCapture=id=>released.push(id);
 const event=(node,type,properties={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,properties);node.dispatchEvent(e);};
 return {ui,root,dialog,event,released,frame,resize:()=>resize(),flush:()=>{const fn=pending;pending=null;fn?.();},getFocused:()=>focused};
}

test('unrelated pointer release or cancellation never interrupts the active HUD drag',()=>{
 for(const type of ['pointerup','pointercancel','lostpointercapture']){
  const f=fixture();f.ui.open();f.event(f.dialog,'pointerdown',{button:0,pointerId:1,clientX:30,clientY:30});f.event(f.dialog,'pointermove',{pointerId:1,clientX:130,clientY:30});f.event(f.dialog,type,{pointerId:2});f.event(f.dialog,'pointermove',{pointerId:1,clientX:230,clientY:30});f.event(f.dialog,'pointerup',{pointerId:1});
  f.event(f.dialog.querySelector('[data-hud-command="save"]'),'click');assert.equal(f.ui.inspect().items.health.x,.2,type);assert.deepEqual(f.released,[1]);f.ui.dispose();
 }
});

test('stored hidden diagnostics apply on reveal and recalculate once on resize',()=>{
 const items=defaultHudLayout();items.diagnostics.x=.2;const f=fixture({getItem:()=>JSON.stringify({version:1,items}),setItem:()=>{}}),node=f.root.querySelector('#frame-diagnostics');assert.equal(node.style.translate,'');
 node.hidden=false;f.resize();f.resize();f.flush();assert.equal(node.style.translate,'200px 0px');f.frame.width=800;f.resize();f.flush();assert.equal(node.style.translate,'160px 0px');assert.equal(f.ui.inspect().items.diagnostics.x,.2);f.ui.dispose();
});

test('closing the HUD editor restores focus outside the now-closed editor and settings dialog',()=>{
 const f=fixture();f.ui.open();assert.equal(f.getFocused()?.dataset.hudCommand,'save');f.event(f.dialog.querySelector('[data-hud-command="cancel"]'),'click');assert.notEqual(f.getFocused()?.dataset.hudCommand,'save');assert.ok(['motion-speed-toggle','viewport','open-hud-layout'].includes(f.getFocused()?.id));f.ui.dispose();
});
