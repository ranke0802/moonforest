import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountCinematicStudio,createCinematicTransport} from '../src/cinematic-studio.js';
import {cinematicReply} from '../src/cinematic-protocol.js';

const drain=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(t,{nativeTransport=false}={}){
  const {window,document}=parseHTML('<html><body><main id="root"></main></body></html>'),root=document.querySelector('#root'),saved=new Map(),commands=[],clipboard=[];
  const handlers=new Map(),studioWindow={location:{href:'https://game.test/ArcherPreviewSite/cinematic-studio.html',origin:'https://game.test'},navigator:{clipboard:{writeText:async text=>clipboard.push(text)}},addEventListener:(type,fn)=>{if(type==='message')handlers.set(type,fn);else window.addEventListener(type,fn);},removeEventListener:(type,fn)=>{if(type==='message')handlers.delete(type);else window.removeEventListener(type,fn);}};
  // linkedom's select value is a getter; browsers provide this standard setter.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(value){for(const option of this.querySelectorAll('option')){if(option.getAttribute('value')===String(value))option.setAttribute('selected','');else option.removeAttribute('selected');}}});
  let state='ready',time=0;
  const send=async(command,payload={})=>{commands.push({command,payload});if(command==='load')state='ready';if(command==='play')state='playing';if(command==='pause')state='paused';if(command==='stop')state='cancelled';if(command==='seek')time=payload.time;return {ok:true,state,time,camera:{position:[7,4,-7],target:[0,1,0],fov:.7}};};
  const studio=mountCinematicStudio(root,{window:studioWindow,storage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)},...(nativeTransport?{}:{sendCommand:send})});t.after(()=>studio.destroy());
  const click=async action=>{root.querySelector(`[data-action="${action}"]`).dispatchEvent(new window.Event('click',{bubbles:true}));await drain();};
  return {window,root,studio,saved,commands,clipboard,click,handlers};
}

test('dedicated studio authors shots with undo/redo, persists/reopens the same JSON and defers all preview loading',async t=>{
  const f=fixture(t),original=f.studio.getDocument();assert.equal(f.commands.length,0);assert.equal(f.root.querySelector('iframe').getAttribute('src'),null);
  await f.click('shot-add');assert.equal(f.studio.getDocument().shots.length,2);assert.equal(f.studio.getDocument().duration,9);
  await f.click('shot-copy');assert.equal(f.studio.getDocument().shots.length,3);await f.click('undo');assert.equal(f.studio.getDocument().shots.length,2);await f.click('redo');assert.equal(f.studio.getDocument().shots.length,3);
  await f.click('shot-up');await f.click('shot-delete');assert.equal(f.studio.getDocument().shots.length,2);
  await f.click('save');const saved=f.studio.getDocument();await f.click('new');assert.deepEqual(f.studio.getDocument(),original);await f.click('reopen');assert.deepEqual(f.studio.getDocument(),saved);
  assert.equal(f.commands.length,0,'catalog/authoring operations never create an engine or load a model');
});

test('studio validation/import preview keeps invalid AI JSON out of history; prompt copy performs no provider call',async t=>{
  const f=fixture(t);await f.click('ai-import');const invalid={...f.studio.getDocument(),version:99};
  assert.equal(f.studio.checkImport(JSON.stringify(invalid)).valid,false);assert.equal(f.root.querySelector('[data-action="import-apply"]').disabled,true);
  const next=f.studio.getDocument();next.cutsceneId='neutral-imported';assert.equal(f.studio.checkImport(JSON.stringify(next)).valid,true);assert.notEqual(f.studio.getDocument().cutsceneId,'neutral-imported');f.studio.applyImport();assert.equal(f.studio.getDocument().cutsceneId,'neutral-imported');
  f.root.querySelector('[data-field="request"]').value='A gentle neutral dolly.';await f.click('ai-copy');assert.equal(f.clipboard.length,1);assert.match(f.clipboard[0],/A gentle neutral dolly/);assert.equal(f.commands.length,0);
});

test('studio sends the same validated file to the game host and scrubs without reloading it; camera capture commits a key',async t=>{
  const f=fixture(t);await f.studio.loadPreview();assert.equal(f.commands.filter(c=>c.command==='load').length,1);assert.deepEqual(f.commands[0].payload.document,f.studio.getDocument());
  const time=f.root.querySelector('[data-field="time"]');time.value='2';time.dispatchEvent(new f.window.Event('input'));await drain();assert.equal(f.commands.filter(c=>c.command==='load').length,1);assert.equal(f.commands.at(-1).command,'seek');
  await f.click('capture-from');assert.deepEqual(f.studio.getDocument().shots[0].from,{position:[7,4,-7],target:[0,1,0],fov:.7});
  await f.click('capture-to');assert.equal(f.commands.filter(c=>c.command==='load').length,1,'capturing an end key must preserve the user-adjusted live camera instead of reloading the edited draft');
  await f.click('validate');assert.match(f.root.querySelector('[data-view="status"]').textContent,/프로젝트 파일은 아직 변경되지/);
});

test('transport ignores spoofed origins/sources and clears pending command timers on disposal',async()=>{
  const handlers=new Map(),source={posts:[],postMessage(message){source.message=message;source.posts.push(message);}},window={location:{origin:'https://game.test'},addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:type=>handlers.delete(type)},frame={contentWindow:source};
  const send=createCinematicTransport({window,frame,timeoutMs:100}),promise=send('status');let settled=false;promise.then(()=>settled=true);
  assert.equal(source.posts.length,0,'commands wait for the lazy game bridge');
  handlers.get('message')({source:{},origin:'https://game.test',data:cinematicReply('host-ready',{ready:true,mapId:'village'})});
  handlers.get('message')({source,origin:'https://wrong.test',data:cinematicReply('host-ready',{ready:true,mapId:'village'})});
  handlers.get('message')({source,origin:'https://game.test',data:cinematicReply('host-ready',{ready:false,mapId:'village'})});assert.equal(source.posts.length,0);
  handlers.get('message')({source,origin:'https://game.test',data:cinematicReply('host-ready',{ready:true,mapId:'village'})});assert.equal(source.posts.length,1);
  handlers.get('message')({source:{},origin:'https://game.test',data:cinematicReply(source.message.requestId,{state:'ready'})});await drain();assert.equal(settled,false);
  handlers.get('message')({source,origin:'https://wrong.test',data:cinematicReply(source.message.requestId,{state:'ready'})});await drain();assert.equal(settled,false);
  handlers.get('message')({source,origin:'https://game.test',data:cinematicReply(source.message.requestId,{state:'ready'})});assert.equal((await promise).state,'ready');
  const pending=send('status');send.dispose();await assert.rejects(pending,/Studio closed/);assert.equal(handlers.size,0);
});

test('early readiness survives iframe load and late readiness flushes the queued document exactly once',async t=>{
  for(const early of [true,false])await t.test(early?'early':'late',async t=>{
    const f=fixture(t,{nativeTransport:true}),frame=f.root.querySelector('iframe'),posts=[],source={postMessage(message){posts.push(message);f.handlers.get('message')?.({source,origin:'https://game.test',data:cinematicReply(message.requestId,{state:'ready',time:0})});}};
    Object.defineProperty(frame,'contentWindow',{configurable:true,value:source});
    const loading=f.studio.loadPreview();assert.match(frame.src,/cinematicPreview=1/);
    const ready=()=>f.handlers.get('message')({source,origin:'https://game.test',data:cinematicReply('host-ready',{ready:true,mapId:'village'})});
    if(early)ready();frame.dispatchEvent(new f.window.Event('load'));await drain();
    if(!early){assert.equal(posts.length,0);ready();}
    await loading;assert.equal(posts.filter(message=>message.command==='load').length,1);assert.deepEqual(posts[0].document,f.studio.getDocument());
    ready();assert.equal(posts.filter(message=>message.command==='load').length,1,'duplicate readiness does not retransmit a load');
  });
});

test('map reset retires old requests, rejects stale-map handshakes and keeps one bounded queued-command deadline',async()=>{
  const handlers=new Map(),posts=[],source={postMessage:message=>posts.push(message)},origin='https://game.test',window={location:{origin},addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:type=>handlers.delete(type)},send=createCinematicTransport({window,frame:{contentWindow:source},timeoutMs:30});
  const ready=(mapId,ready=true)=>handlers.get('message')({source,origin,data:cinematicReply('host-ready',{ready,mapId})});
  ready('village');const old=send('load',{document:{}}),retired=assert.rejects(old,/map changed/);assert.equal(posts.length,1);
  send.reset('witch-cave');await retired;const fresh=send('load',{document:{}});ready('village');ready('witch-cave',false);assert.equal(posts.length,1);
  ready('witch-cave');ready('witch-cave');assert.equal(posts.length,2);handlers.get('message')({source,origin,data:cinematicReply(posts[1].requestId,{state:'ready'})});await fresh;
  send.reset('village');const expired=send('load',{document:{}});await assert.rejects(expired,/did not answer/);ready('village');assert.equal(posts.length,2,'a timed-out queued load is never replayed');send.dispose();
});
