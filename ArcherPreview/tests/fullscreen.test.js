import test from 'node:test';
import assert from 'node:assert/strict';
import { fullscreenOwnerDocument,setupFullscreen } from '../src/fullscreen.js';
class Button extends EventTarget {
 constructor(){super();this.textContent='전체화면';this.attributes={};}
 contains(target){return target===this;}
 setAttribute(key,value){this.attributes[key]=value;}
}
function fixture(t,{supported=true,reject=false,standalone=false,userAgent='',displayMode='browser'}={}){
 const saved=Object.fromEntries(['document','screen','navigator','matchMedia'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const doc=new EventTarget(),button=new Button(),root={},reports=[];let entries=0,exits=0;
 Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 Object.defineProperty(globalThis,'screen',{configurable:true,value:{orientation:{type:'landscape-primary',lock:async()=>{},unlock(){}}}});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{standalone,userAgent}});
 Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:query=>({matches:query===`(display-mode: ${displayMode})`})});
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

test('home-screen mode keeps the fullscreen control visible and explains its installed state',async t=>{
 const {doc,button,stats,reports}=fixture(t,{standalone:true});
 assert.equal(button.hidden,false);
 doc.dispatchEvent(new Event('pointerup'));button.dispatchEvent(new Event('click'));await flush();
 assert.deepEqual(stats(),{entries:0,exits:0});assert.match(reports[0],/전체화면으로 실행 중/);
});

test('manifest standalone mode is recognized even without navigator.standalone',async t=>{
 const {doc,button,stats}=fixture(t,{displayMode:'standalone'});
 assert.equal(button.hidden,false);doc.dispatchEvent(new Event('pointerup'));await flush();
 assert.equal(stats().entries,0);
});

test('unsupported iPhone browser explains how to open the home-screen app',async t=>{
 const {button,reports}=fixture(t,{supported:false,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit Safari'});
 assert.equal(button.hidden,false);button.dispatchEvent(new Event('click'));await flush();
 assert.match(reports[0],/Safari.*공유.*홈 화면에 추가/);
});

test('a framed HUD follows the shell fullscreen state and releases shell listeners on disposal',async t=>{
 const {doc,button,dispose}=fixture(t);dispose();
 const shell=new EventTarget(),root={};shell.documentElement=root;shell.fullscreenElement=root;
 doc.defaultView={parent:{__moonforestShell:{},document:shell}};
 assert.equal(fullscreenOwnerDocument(doc),shell);
 const seen=[];
 root.requestFullscreen=async()=>{shell.fullscreenElement=root;shell.dispatchEvent(new Event('fullscreenchange'));};
 shell.exitFullscreen=async()=>{shell.fullscreenElement=null;shell.dispatchEvent(new Event('fullscreenchange'));};
 const stop=setupFullscreen(button,()=>{},{
  owner:fullscreenOwnerDocument(doc),labels:active=>({name:'Fullscreen',title:active?'Exit fullscreen.':'Enter fullscreen.'}),
  onSync:b=>seen.push(b.attributes['aria-pressed']),
 });
 assert.equal(button.title,'Exit fullscreen.');assert.equal(button.attributes['aria-label'],'Fullscreen');assert.equal(seen.at(-1),'true');
 button.dispatchEvent(new Event('click'));await flush();
 assert.equal(shell.fullscreenElement,null);assert.equal(button.title,'Enter fullscreen.');assert.equal(seen.at(-1),'false');
 button.dispatchEvent(new Event('click'));await flush();assert.equal(shell.fullscreenElement,root);assert.equal(doc.fullscreenElement,null);
 const count=seen.length;stop();stop();shell.dispatchEvent(new Event('fullscreenchange'));assert.equal(seen.length,count);
 doc.defaultView={get parent(){throw Error('cross-origin');}};assert.equal(fullscreenOwnerDocument(doc),doc);
});
