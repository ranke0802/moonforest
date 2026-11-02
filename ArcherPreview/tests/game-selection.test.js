import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {setupGameSelection} from '../src/game-selection.js';

function fixture(){
  const dom=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),doc=dom.document,root=doc.getElementById('app');
  return {doc,root,window:dom.window,control:setupGameSelection(root),event(target,type){const event=new dom.window.Event(type,{bubbles:true,cancelable:true});target.dispatchEvent(event);return event;}};
}

test('actual game/HUD root blocks selection and drag from nested spans, text nodes and images only inside app',()=>{
  const f=fixture(),label=f.doc.createElement('div');label.innerHTML='<span>HP <b>500</b></span><img alt="map">';f.root.append(label);
  for(const target of [f.doc.getElementById('viewport'),label,label.querySelector('b'),label.querySelector('b').firstChild,label.querySelector('img')])for(const type of ['selectstart','dragstart'])assert.equal(f.event(target,type).defaultPrevented,true);
  const outside=f.doc.createElement('p');outside.textContent='Outside app report';f.doc.body.append(outside);assert.equal(f.event(outside,'selectstart').defaultPrevented,false);
  f.control.dispose();assert.equal(f.event(label,'selectstart').defaultPrevented,false);
});

test('text/number input, readonly diagnostic export and inherited editable text keep native selection/copy editing',()=>{
  const f=fixture(),dialog=f.doc.createElement('dialog');dialog.innerHTML='<input id="plain"><input type="text"><input type="number"><input type="search"><input type="email"><input type="password"><input type="tel"><input type="url"><textarea readonly>diagnostic JSON</textarea><div contenteditable="true"><span><b>editable</b></span><span contenteditable="false">HUD</span><div contenteditable="false"><span contenteditable="plaintext-only"><i>inner edit</i></span></div></div>';f.root.append(dialog);
  for(const target of [...dialog.querySelectorAll('input,textarea'),dialog.querySelector('b'),dialog.querySelector('b').firstChild,dialog.querySelector('i')])for(const type of ['selectstart','dragstart'])assert.equal(f.event(target,type).defaultPrevented,false,`${target.localName??'text node'} ${type}`);
  const readonly=f.doc.getElementById('frame-diagnostics-export');assert.ok(readonly);assert.equal(f.event(readonly,'selectstart').defaultPrevented,false);assert.equal(f.event(readonly,'copy').defaultPrevented,false);
  assert.equal(f.event(dialog.querySelector('[contenteditable="false"]'),'selectstart').defaultPrevented,true);
  for(const target of [dialog.querySelector('input'),dialog.querySelector('textarea'),dialog.querySelector('b')])for(const type of ['beforeinput','input','copy','cut','paste','keydown'])assert.equal(f.event(target,type).defaultPrevented,false);
  f.control.dispose();
});

test('delegated policy covers dialogs mounted later and leaves native controls, buttons, range and scrolling alone',()=>{
  const f=fixture(),dialog=f.doc.createElement('dialog');dialog.innerHTML='<p><span>Late options</span></p><select><option selected>Boss</option><option>Bear</option></select><input type="range" min="0" max="2" value="1"><button>Apply</button>';f.root.append(dialog);
  assert.equal(f.event(dialog.querySelector('span'),'selectstart').defaultPrevented,true);
  for(const target of dialog.querySelectorAll('select,option'))for(const type of ['selectstart','dragstart','pointerdown','click','change'])assert.equal(f.event(target,type).defaultPrevented,false);
  let clicks=0;dialog.querySelector('button').addEventListener('click',()=>clicks++);
  for(const target of [dialog,dialog.querySelector('input'),dialog.querySelector('button')])for(const type of ['pointerdown','pointermove','pointerup','touchstart','touchmove','touchend','keydown','keyup','click','input','change','wheel','scroll'])assert.equal(f.event(target,type).defaultPrevented,false);
  assert.equal(clicks,1);assert.equal(dialog.querySelector('input').value,'1');f.control.dispose();
});

test('root setup is idempotent and dispose removes exactly the three owned listeners',()=>{
  const {document:doc,window}=parseHTML('<main id="app"><span>HUD</span></main>'),root=doc.getElementById('app'),added=[],removed=[];
  const add=root.addEventListener.bind(root),remove=root.removeEventListener.bind(root);root.addEventListener=(...args)=>{added.push(args);return add(...args);};root.removeEventListener=(...args)=>{removed.push(args);return remove(...args);};
  const first=setupGameSelection(root),second=setupGameSelection(root);assert.equal(first,second);assert.deepEqual(added.map(a=>a[0]),['selectstart','dragstart','contextmenu']);
  first.dispose();second.dispose();assert.equal(removed.length,3);for(let i=0;i<3;i++)assert.equal(removed[i][1],added[i][1]);
  const event=new window.Event('selectstart',{bubbles:true,cancelable:true});root.firstChild.dispatchEvent(event);assert.equal(event.defaultPrevented,false);
  const third=setupGameSelection(root);assert.notEqual(third,first);assert.equal(added.length,6);third.dispose();assert.doesNotThrow(()=>setupGameSelection(null).dispose());
});

test('context menus are prevented on canvas, HUD and late UI dialogs but not outside the game',()=>{
 const f=fixture(),dialog=f.doc.createElement('dialog');dialog.innerHTML='<button><span>menu</span></button><textarea>diagnostic</textarea>';f.root.append(dialog);
 for(const target of [f.doc.getElementById('viewport'),dialog.querySelector('span'),dialog.querySelector('textarea')])assert.equal(f.event(target,'contextmenu').defaultPrevented,true);
 assert.equal(f.event(dialog.querySelector('textarea'),'copy').defaultPrevented,false);
 const outside=f.doc.createElement('div');f.doc.body.append(outside);assert.equal(f.event(outside,'contextmenu').defaultPrevented,false);
 f.control.dispose();assert.equal(f.event(dialog,'contextmenu').defaultPrevented,false);
});
