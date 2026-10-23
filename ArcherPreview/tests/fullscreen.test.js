import test from 'node:test';
import assert from 'node:assert/strict';
import { setupFullscreen } from '../src/fullscreen.js';
class Button extends EventTarget {
 constructor(){super();this.textContent='전체화면';this.attributes={};}
 contains(target){return target===this;}
 setAttribute(key,value){this.attributes[key]=value;}
}
function fixture(t,{supported=true,reject=false}={}){
 const saved={document:Object.getOwnPropertyDescriptor(globalThis,'document'),screen:Object.getOwnPropertyDescriptor(globalThis,'screen')};
 const doc=new EventTarget(),button=new Button(),root={},reports=[];let entries=0,exits=0;
 Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 Object.defineProperty(globalThis,'screen',{configurable:true,value:{orientation:{type:'landscape-primary',lock:async()=>{},unlock(){}}}});
 doc.documentElement=root;doc.fullscreenElement=null;
 if(supported)root.requestFullscreen=async()=>{entries++;if(reject)throw new Error('not allowed');doc.fullscreenElement=root;doc.dispatchEvent(new Event('fullscreenchange'));};
 doc.exitFullscreen=async()=>{exits++;doc.fullscreenElement=null;doc.dispatchEvent(new Event('fullscreenchange'));};
 const dispose=setupFullscreen(button,message=>reports.push(message),{autoEnter:true});
 t.after(()=>{dispose();for(const [name,descriptor] of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
 return {doc,button,reports,stats:()=>({entries,exits}),dispose};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('first gesture enters fullscreen once; manual exit stays exited through later gestures',async t=>{
 const {doc,button,stats}=fixture(t);assert.equal(stats().entries,0);
 doc.dispatchEvent(new Event('pointerup'));await flush();
 assert.equal(stats().entries,1);assert.equal(button.textContent,'화면 축소');assert.equal(button.attributes['aria-pressed'],'true');
 button.dispatchEvent(new Event('click'));await flush();
 assert.equal(stats().exits,1);assert.equal(button.textContent,'전체화면');
 doc.dispatchEvent(new Event('pointerup'));await flush();assert.equal(stats().entries,1);
 button.dispatchEvent(new Event('click'));await flush();assert.equal(stats().entries,2);
});
test('denied automatic entry is quiet, unlocks the button and allows a manual retry',async t=>{
 const {doc,button,reports,stats}=fixture(t,{reject:true});
 doc.dispatchEvent(new Event('pointerup'));await flush();assert.equal(reports.length,0);assert.equal(button.disabled,false);
 button.dispatchEvent(new Event('click'));await flush();assert.equal(stats().entries,2);assert.equal(reports.length,1);
});
test('unsupported fullscreen and disposed listeners do not attempt automatic entry',async t=>{
 const {doc,button,stats,reports,dispose}=fixture(t,{supported:false});
 doc.dispatchEvent(new Event('pointerup'));await flush();assert.equal(stats().entries,0);
 button.dispatchEvent(new Event('click'));await flush();assert.equal(reports.length,1);
 dispose();button.dispatchEvent(new Event('click'));doc.dispatchEvent(new Event('pointerup'));await flush();assert.equal(reports.length,1);
});
