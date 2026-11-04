import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountCinematicStudio,createCinematicTransport} from '../src/cinematic-studio.js';
import {cinematicReply} from '../src/cinematic-protocol.js';

const drain=async()=>{await new Promise(resolve=>setImmediate(resolve));};
const worldCamera={position:[107,14,193],target:[100,11,200],fov:.7},playerPosition=[100,10,200];
function fixture(t,{nativeTransport=false,responseField='state',previewTimeoutMs,reply,href='https://game.test/ArcherPreviewSite/cinematic-studio.html'}={}){
  const {window,document}=parseHTML('<html><body><main id="root"></main></body></html>'),root=document.querySelector('#root'),saved=new Map(),commands=[],clipboard=[];
  const downloads=[],revoked=[],navigation=[],handlers=new Map(),studioWindow={location:{href,origin:'https://game.test',assign:url=>navigation.push(url)},URL:{createObjectURL:blob=>{const url='blob:download-'+downloads.length;downloads.push({url,blob});return url;},revokeObjectURL:url=>revoked.push(url)},navigator:{clipboard:{writeText:async text=>clipboard.push(text)}},addEventListener:(type,fn)=>{if(type==='message')handlers.set(type,fn);else window.addEventListener(type,fn);},removeEventListener:(type,fn)=>{if(type==='message')handlers.delete(type);else window.removeEventListener(type,fn);}};
  // linkedom's select value is a getter; browsers provide this standard setter.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(value){for(const option of this.querySelectorAll('option')){if(option.getAttribute('value')===String(value))option.setAttribute('selected','');else option.removeAttribute('selected');}}});
  let state='ready',time=0;const previewListeners=new Set();
  const send=async(command,payload={})=>{commands.push({command,payload});if(command==='load')state='ready';if(command==='play')state='playing';if(command==='pause')state='paused';if(command==='stop')state='cancelled';if(command==='seek')time=payload.time;return reply?.(command,payload)??{ok:true,[responseField]:state,time,camera:worldCamera,playerPosition,focusPosition:playerPosition,saved:command==='save-scene',gameUrl:'https://game.test/ArcherPreviewSite/index.html?release=moonforest-0.1&cinematic=1&scene='+encodeURIComponent(payload.document?.cutsceneId??'')};};send.onEvent=listener=>{previewListeners.add(listener);return ()=>previewListeners.delete(listener);};
  const studio=mountCinematicStudio(root,{window:studioWindow,previewTimeoutMs,storage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)},...(nativeTransport?{}:{sendCommand:send})});t.after(()=>studio.destroy());
  const click=async action=>{root.querySelector(`[data-action="${action}"]`).dispatchEvent(new window.Event('click',{bubbles:true}));await drain();};
  return {window,root,studio,saved,commands,clipboard,click,handlers,downloads,revoked,navigation,emit:async value=>Promise.all([...previewListeners].map(listener=>listener(value))),previewListeners};
}

test('dedicated studio authors shots with undo/redo, persists/reopens the same JSON and defers all preview loading',async t=>{
  const f=fixture(t),original=f.studio.getDocument();assert.equal(f.commands.length,0);assert.equal(f.root.querySelector('iframe').getAttribute('src'),null);
  await f.click('shot-add');assert.equal(f.studio.getDocument().shots.length,2);assert.equal(f.studio.getDocument().duration,9);
  await f.click('shot-copy');assert.equal(f.studio.getDocument().shots.length,3);await f.click('undo');assert.equal(f.studio.getDocument().shots.length,2);await f.click('redo');assert.equal(f.studio.getDocument().shots.length,3);
  await f.click('shot-up');await f.click('shot-delete');assert.equal(f.studio.getDocument().shots.length,2);
  await f.click('save');const saved=f.studio.getDocument();await f.click('new');const fresh=f.studio.getDocument();assert.notEqual(fresh.cutsceneId,original.cutsceneId,'new work must not overwrite the preceding saved scene');assert.deepEqual({...fresh,cutsceneId:original.cutsceneId},original);await f.click('reopen');assert.deepEqual(f.studio.getDocument(),saved);
  assert.equal(f.commands.length,0,'catalog/authoring operations never create an engine or load a model');
});

test('studio validation/import preview keeps invalid AI JSON out of history; prompt copy performs no provider call',async t=>{
  const f=fixture(t);await f.click('ai-import');const invalid={...f.studio.getDocument(),version:99};
  assert.equal(f.studio.checkImport(JSON.stringify(invalid)).valid,false);assert.equal(f.root.querySelector('[data-action="import-apply"]').disabled,true);
  const next=f.studio.getDocument();next.cutsceneId='neutral-imported';assert.equal(f.studio.checkImport(JSON.stringify(next)).valid,true);assert.notEqual(f.studio.getDocument().cutsceneId,'neutral-imported');f.studio.applyImport();assert.equal(f.studio.getDocument().cutsceneId,'neutral-imported');
  f.root.querySelector('[data-field="request"]').value='A gentle neutral dolly.';await f.click('ai-copy');assert.equal(f.clipboard.length,1);assert.match(f.clipboard[0],/A gentle neutral dolly/);assert.equal(f.commands.length,0);
});

test('studio sends the same validated file to the game host and scrubs without reloading it; camera capture commits a key',async t=>{
  const f=fixture(t);await f.studio.loadPreview();assert.equal(f.commands.filter(c=>c.command==='load').length,1);assert.deepEqual(f.commands.find(c=>c.command==='load').payload.document,f.studio.getDocument());assert.deepEqual(f.studio.getDocument().anchor.position,playerPosition);
  const time=f.root.querySelector('[data-field="time"]');time.value='2';time.dispatchEvent(new f.window.Event('input'));await drain();assert.equal(f.commands.filter(c=>c.command==='load').length,1);assert.equal(f.commands.at(-1).command,'seek');
  await f.click('capture-from');assert.deepEqual(f.studio.getDocument().shots[0].from,{position:[7,4,-7],target:[0,1,0],fov:.7});
  await f.click('capture-to');assert.equal(f.commands.filter(c=>c.command==='load').length,1,'capturing an end key must preserve the user-adjusted live camera instead of reloading the edited draft');
  await f.click('validate');assert.match(f.root.querySelector('[data-view="status"]').textContent,/작업에 문제가 없습니다/);
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
    const f=fixture(t,{nativeTransport:true}),frame=f.root.querySelector('iframe'),posts=[],source={postMessage(message){posts.push(message);f.handlers.get('message')?.({source,origin:'https://game.test',data:cinematicReply(message.requestId,{state:'ready',time:0,camera:worldCamera,playerPosition})});}};
    Object.defineProperty(frame,'contentWindow',{configurable:true,value:source});
    const loading=f.studio.loadPreview();assert.match(frame.src,/cinematicPreview=1/);
    const ready=()=>f.handlers.get('message')({source,origin:'https://game.test',data:cinematicReply('host-ready',{ready:true,mapId:'village'})});
    if(early)ready();frame.dispatchEvent(new f.window.Event('load'));await drain();
    if(!early){assert.equal(posts.length,0);ready();}
    await loading;assert.equal(posts.filter(message=>message.command==='load').length,1);assert.deepEqual(posts.find(message=>message.command==='load').document,f.studio.getDocument());assert.equal(posts[0].command,'capture-camera');
    ready();assert.equal(posts.filter(message=>message.command==='load').length,1,'duplicate readiness does not retransmit a load');
  });
});

test('map reset retires old requests, rejects stale-map handshakes and keeps one bounded queued-command deadline',async()=>{
  const handlers=new Map(),posts=[],source={postMessage:message=>posts.push(message)},origin='https://game.test',window={location:{origin},addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:type=>handlers.delete(type)},send=createCinematicTransport({window,frame:{contentWindow:source},timeoutMs:30});
  const ready=(mapId,ready=true)=>handlers.get('message')({source,origin,data:cinematicReply('host-ready',{ready,mapId})});
  ready('village');const old=send('load',{document:{}}),retired=assert.rejects(old,/맵이 변경/);assert.equal(posts.length,1);
  send.reset('witch-cave');await retired;const fresh=send('load',{document:{}});ready('village');ready('witch-cave',false);assert.equal(posts.length,1);
  ready('witch-cave');ready('witch-cave');assert.equal(posts.length,2);handlers.get('message')({source,origin,data:cinematicReply(posts[1].requestId,{state:'ready'})});await fresh;
  send.reset('village');const expired=send('load',{document:{}});await assert.rejects(expired,/시간이 초과/);ready('village');assert.equal(posts.length,2,'a timed-out queued load is never replayed');send.dispose();
});

test('first-use buttons show a chosen map and actor, capture, play, save/reopen a real file and open it in the game',async t=>{
  for(const responseField of ['state','status'])await t.test(responseField,async t=>{
    const f=fixture(t,{responseField}),q=field=>f.root.querySelector(`[data-field="${field}"]`);
    assert.equal(f.commands.length,0);assert.equal(f.studio.getDocument().actors.length,0);assert.equal(q('definition').value,'hooded-goblin.standard');
    for(const detail of f.root.querySelectorAll('.advanced'))assert.equal(detail.hasAttribute('open'),false);
    const basic=f.root.cloneNode(true);for(const detail of basic.querySelectorAll('details'))detail.remove();assert.doesNotMatch(basic.textContent,/JSON|CLI|schema|카탈로그|quaternion|FOV/);
    q('map').value='monster-forest';q('map').dispatchEvent(new f.window.Event('change'));await drain();assert.equal(f.commands.length,0);
    await f.click('load');assert.equal(f.commands[0].command,'capture-camera','live map view is captured before any cinematic camera can replace it');assert.equal(f.studio.getDocument().mapId,'monster-forest');assert.deepEqual(f.studio.getDocument().anchor.position,playerPosition);assert.deepEqual(f.studio.evaluate(0).camera,worldCamera);
    const before=f.commands.filter(c=>c.command==='load').length;await f.click('actor-add');let document=f.studio.getDocument();assert.equal(document.actors.length,1);assert.equal(document.actors[0].assetId,'hooded-goblin');assert.deepEqual(document.actors[0].position,[0,0,0]);assert.equal(f.commands.filter(c=>c.command==='load').length,before+1,'actor addition is immediately visible through the shared host');
    f.root.querySelector('[data-move="오른쪽 →"]').click();await drain();assert.equal(f.studio.getDocument().actors[0].position[0],.5);
    const motion=f.root.querySelector('[data-view="actor-basic"] select');motion.value='Walking';motion.dispatchEvent(new f.window.Event('change'));await drain();assert.equal(f.studio.getDocument().tracks.animations[0].clipId,'Walking');
    await f.click('capture-from');document=f.studio.getDocument();assert.deepEqual(document.shots[0].from,document.shots[0].to);await f.click('play');assert.equal(f.commands.at(-1).command,'play');await f.click('pause');assert.equal(f.commands.at(-1).command,'pause');await f.click('stop');assert.equal(f.commands.at(-1).command,'seek');assert.equal(f.commands.at(-1).payload.time,0);
    let clicked;const observe=event=>{if(event.target.tagName==='A')clicked={connected:event.target.isConnected,name:event.target.getAttribute('download'),href:event.target.getAttribute('href')};};f.root.ownerDocument.addEventListener('click',observe);t.after(()=>f.root.ownerDocument.removeEventListener('click',observe));
    await f.click('export');assert.equal(clicked.connected,true,'download link is connected when the user click is dispatched');assert.match(clicked.name,/\.moonforest-scene$/);assert.equal(f.revoked.length,0,'download URL survives the click task');const text=await f.downloads[0].blob.text();assert.ok(text.endsWith('\n'));assert.deepEqual(JSON.parse(text),f.studio.getDocument());
    await f.click('new');await f.click('import');const file=q('file');Object.defineProperty(file,'files',{configurable:true,value:[{size:new TextEncoder().encode(text).length,text:async()=>text}]});file.dispatchEvent(new f.window.Event('change'));await drain();assert.equal(f.root.querySelector('[data-action="import-apply"]').disabled,false);await f.click('import-apply');assert.deepEqual(f.studio.getDocument(),JSON.parse(text));
    await f.click('game-save');const save=f.commands.findLast(c=>c.command==='save-scene');assert.deepEqual(save.payload.document,f.studio.getDocument());assert.equal(f.navigation.length,0,'saving does not navigate or trigger normal-game playback');await f.click('game-play');assert.equal(f.navigation.length,1);assert.match(f.navigation[0],/cinematic=1/);assert.equal(f.commands.filter(c=>c.command==='save-scene').length,1,'opening the unchanged saved scene does not save twice');
    f.studio.destroy();assert.deepEqual(f.revoked,[f.downloads[0].url],'destroy retires pending download URL/timer exactly once');
  });
});

test('failed preparation is visible for either response shape and the next explicit open retries',async t=>{
  for(const field of ['state','status'])await t.test(field,async t=>{
    let fail=true;const f=fixture(t,{reply:command=>({[field]:command==='load'&&fail?'error':'ready',camera:worldCamera,playerPosition})});await f.click('load');assert.match(f.root.querySelector('[data-view="status"]').textContent,/장면을 열지 못했습니다/);assert.equal(f.root.querySelector('[data-view="status"]').classList.contains('error'),true);fail=false;await f.click('load');assert.match(f.root.querySelector('[data-view="status"]').textContent,/장면을 열었습니다/);
  });
});

test('missing iframe load/readiness is bounded and a failed iframe can be explicitly retried',async t=>{
  const f=fixture(t,{nativeTransport:true,previewTimeoutMs:20}),frame=f.root.querySelector('iframe'),source={postMessage:()=>{}};Object.defineProperty(frame,'contentWindow',{configurable:true,value:source});await f.click('load');await new Promise(resolve=>setTimeout(resolve,30));assert.match(f.root.querySelector('[data-view="status"]').textContent,/시간이 초과/);assert.equal(frame.hidden,false);assert.equal(f.root.querySelector('[data-view="empty"]').hidden,true);
  const retried=f.studio.loadPreview(),rejected=assert.rejects(retried,/맵 화면을 열지 못했습니다/);frame.dispatchEvent(new f.window.Event('error'));await rejected;assert.equal(frame.hasAttribute('data-map'),false);
  const posts=[];source.postMessage=message=>{posts.push(message);f.handlers.get('message')({source,origin:'https://game.test',data:cinematicReply(message.requestId,{status:'ready',camera:worldCamera,playerPosition})});};const ready=()=>f.handlers.get('message')({source,origin:'https://game.test',data:cinematicReply('host-ready',{ready:true,mapId:'village'})});const final=f.studio.loadPreview();ready();await final;assert.equal(frame.dataset.map,'village');
  frame.dispatchEvent(new f.window.Event('error'));const recovered=f.studio.loadPreview();ready();await recovered;assert.equal(posts.filter(message=>message.command==='load').length,2,'an error after preparation invalidates the cached document, so reopening really reloads');
});

test('native transport keeps the Studio revision in the child host and saved-game URLs, including the fallback',async t=>{
  for(const returnedAddress of [true,false])await t.test(returnedAddress?'host URL':'fallback URL',async t=>{
    const revision='delivery-fix-2',f=fixture(t,{nativeTransport:true,href:'https://game.test/ArcherPreviewSite/cinematic-studio.html?rev='+revision+'&unrelated=do-not-copy#tools'}),frame=f.root.querySelector('iframe'),posts=[],source={postMessage(message){posts.push(message);const gameUrl=returnedAddress&&message.command==='save-scene'?'./index.html?release=moonforest-0.1&character=warrior-plains&cinematic=1&scene='+message.document.cutsceneId+'&rev=old-host':undefined;f.handlers.get('message')({source,origin:'https://game.test',data:cinematicReply(message.requestId,{state:'ready',camera:worldCamera,playerPosition,saved:message.command==='save-scene',...(gameUrl?{gameUrl}:{})})});}};
    Object.defineProperty(frame,'contentWindow',{configurable:true,value:source});const map=f.root.querySelector('[data-field="map"]');map.value='great-plains';map.dispatchEvent(new f.window.Event('change'));await drain();const loading=f.studio.loadPreview(),child=new URL(frame.src);assert.equal(child.pathname,'/ArcherPreviewSite/index.html');assert.equal(child.searchParams.get('rev'),revision);assert.equal(child.searchParams.get('character'),'warrior-plains');assert.equal(child.searchParams.get('cinematicPreview'),'1');assert.equal(child.searchParams.has('unrelated'),false);assert.equal(child.hash,'');assert.equal(posts.length,0);
    f.handlers.get('message')({source,origin:'https://game.test',data:cinematicReply('host-ready',{ready:true,mapId:'great-plains'})});await loading;await f.click('game-save');assert.match(f.root.querySelector('[data-view="status"]').textContent,/이 브라우저의 게임에 저장/);assert.equal(f.navigation.length,0);await f.click('game-play');const game=new URL(f.navigation[0]);assert.equal(game.pathname,'/ArcherPreviewSite/index.html');assert.equal(game.searchParams.get('rev'),revision);assert.equal(game.searchParams.get('scene'),f.studio.getDocument().cutsceneId);assert.equal(game.searchParams.get('character'),'warrior-plains');assert.equal(game.searchParams.get('cinematic'),'1');assert.equal(game.searchParams.has('cinematicPreview'),false);
  });
});

test('cold Add snapshots the clicked choice synchronously, disables duplicates and focuses each spaced addition including the third actor',async t=>{
 let release,first=true;const gate=new Promise(resolve=>release=resolve),f=fixture(t,{reply:command=>command==='capture-camera'&&first?(first=false,gate):undefined}),choice=f.root.querySelector('[data-field="definition"]'),add=f.root.querySelector('[data-action="actor-add"]');
 choice.value='hooded-goblin.standard';add.click();choice.value='guardian-bear.standard';await drain();assert.equal(add.disabled,true);assert.match(add.textContent,/추가하는 중/);add.dispatchEvent(new f.window.Event('click',{bubbles:true}));assert.equal(f.commands.filter(row=>row.command==='capture-camera').length,1);
 release({state:'ready',camera:worldCamera,playerPosition,focusPosition:playerPosition});await drain();assert.equal(f.studio.getDocument().actors.length,1);assert.equal(f.studio.getDocument().actors[0].actorDefinitionId,'hooded-goblin.standard','a dropdown change before readiness must not change the already-clicked actor');assert.equal(add.disabled,false);
 await f.click('actor-add');await f.click('actor-add');const actors=f.studio.getDocument().actors;assert.equal(actors.length,3);assert.deepEqual(actors.map(actor=>actor.actorDefinitionId),['hooded-goblin.standard','guardian-bear.standard','guardian-bear.standard']);assert.equal(new Set(actors.map(actor=>JSON.stringify(actor.position))).size,3);assert.deepEqual(f.commands.filter(row=>row.command==='focus-actor').map(row=>row.payload.actorId),actors.map(actor=>actor.actorId));assert.match(f.root.querySelector('[data-view="status"]').textContent,/시점 저장/);
});

test('a failed Add rolls back only its new actor and permits a clean explicit retry',async t=>{
 let fail=true;const f=fixture(t,{reply:(command,payload)=>{if(command==='load'&&payload.document.actors.length&&fail)throw new Error('injected actor source failure');}});await f.click('actor-add');assert.equal(f.studio.getDocument().actors.length,0);assert.equal(f.root.querySelector('[data-action="actor-add"]').disabled,false);assert.equal(f.root.querySelector('[data-view="status"]').classList.contains('error'),true);fail=false;await f.click('actor-add');assert.equal(f.studio.getDocument().actors.length,1);assert.equal(f.commands.at(-1).command,'focus-actor');
});

test('category and variant listboxes add certified static objects and camera controls issue explicit commands',async t=>{
 const f=fixture(t),category=f.root.querySelector('[data-field="actor-category"]'),choice=f.root.querySelector('[data-field="definition"]');let count=0;for(const [value,expected]of [['tree',4],['rock',2],['prop',3],['plant',4]]){category.value=value;category.dispatchEvent(new f.window.Event('change'));assert.equal(choice.children.length,expected);count+=choice.children.length;}assert.equal(count,13);category.value='tree';category.dispatchEvent(new f.window.Event('change'));choice.value=[...choice.children].find(option=>option.value.includes('forest-02-dead-tree')).value;await f.click('actor-add');const actor=f.studio.getDocument().actors[0];assert.equal(actor.assetId,'forest-02-dead-tree');assert.equal(actor.actorDefinitionId,undefined);assert.match(f.root.querySelector('[data-view="selection"]').textContent,/선택:/);
 await f.click('view-pan');assert.deepEqual(f.commands.at(-1),{command:'camera-mode',payload:{mode:'pan'}});assert.equal(f.root.querySelector('[data-action="view-pan"]').getAttribute('aria-pressed'),'true');await f.click('view-orbit');assert.deepEqual(f.commands.at(-1),{command:'camera-mode',payload:{mode:'orbit'}});await f.click('focus-actor');assert.deepEqual(f.commands.at(-1),{command:'focus-actor',payload:{actorId:actor.actorId}});
 const select=f.root.querySelector('[data-field="actor"]');select.value='0';select.dispatchEvent(new f.window.Event('change'));await drain();assert.deepEqual(f.commands.at(-1),{command:'select-actor',payload:{actorId:actor.actorId}});
});

test('authenticated native selection/drag converts world to local base or current-time track keys and patches without reload or focus',async t=>{
 const f=fixture(t);await f.click('actor-add');let document=f.studio.getDocument(),actorId=document.actors[0].actorId;document.anchor={position:[40,7,-20],rotation:[0,Math.SQRT1_2,0,Math.SQRT1_2]};f.studio.commit(document);await f.studio.loadPreview();const loads=f.commands.filter(row=>row.command==='load').length,focuses=f.commands.filter(row=>row.command==='focus-actor').length,metadata={mapId:document.mapId,cutsceneId:document.cutsceneId,actorId,time:2.5};
 await f.emit(cinematicReply('actor-selection',{...metadata,readOnly:false}));assert.equal(f.root.querySelector('[data-field="actor"]').value,'0');assert.equal(f.root.querySelector('[data-field="time"]').value,'2.5');
 const edited={...metadata,position:[45,9,-24],rotation:[0,Math.SQRT1_2,0,Math.SQRT1_2],scale:1.3};await f.emit(cinematicReply('actor-edited',edited));document=f.studio.getDocument();document.actors[0].position.forEach((n,index)=>assert.ok(Math.abs(n-[4,2,5][index])<1e-5));assert.ok(document.actors[0].rotation.every((n,index)=>Math.abs(n-[0,0,0,1][index])<1e-5));assert.equal(document.actors[0].scale,1.3);assert.equal(f.commands.at(-1).command,'patch-document');assert.equal(f.commands.filter(row=>row.command==='load').length,loads);assert.equal(f.commands.filter(row=>row.command==='focus-actor').length,focuses);
 const originalBase=structuredClone(document.actors[0]);document.tracks.transforms.push({actorId,keys:[{time:0,position:[0,0,0],rotation:[0,0,0,1],scale:1,interpolation:'linear'},{time:6,position:[0,0,0],rotation:[0,0,0,1],scale:1,interpolation:'linear'}]});f.studio.commit(document);await f.studio.loadPreview();await f.emit(cinematicReply('actor-edited',{...edited,time:3.25}));document=f.studio.getDocument();assert.deepEqual(document.actors[0],originalBase);assert.deepEqual(document.tracks.transforms[0].keys.map(key=>key.time),[0,3.25,6]);assert.equal(f.root.querySelector('[data-field="time"]').value,'3.25');assert.ok(f.studio.evaluate(3.25).actors[0].position.every((n,index)=>Math.abs(n-edited.position[index])<1e-5));
 const previous=JSON.stringify(document);for(const invalid of [{...edited,mapId:'witch-cave'},{...edited,mapId:undefined},{...edited,cutsceneId:'old-work'},{...edited,cutsceneId:undefined},{...edited,actorId:'missing'},{...edited,position:[NaN,0,0]}])await f.emit(cinematicReply('actor-edited',invalid));assert.equal(JSON.stringify(f.studio.getDocument()),previous);await f.click('game-save');assert.deepEqual(f.commands.findLast(row=>row.command==='save-scene').payload.document,document);f.studio.destroy();assert.equal(f.previewListeners.size,0);
});

test('transport event subscriptions reject spoofed/stale events and retire with reset/disposal',()=>{
 const handlers=new Map(),source={postMessage(){}},origin='https://game.test',send=createCinematicTransport({window:{location:{origin},addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:type=>handlers.delete(type)},frame:{contentWindow:source}}),events=[],emit=(data,extra={})=>handlers.get('message')?.({source,origin,data,...extra}),unsubscribe=send.onEvent(value=>events.push(value));send.reset('village');const event=cinematicReply('actor-selection',{actorId:'actor-1',mapId:'village'});emit(event);assert.equal(events.length,0);emit(cinematicReply('host-ready',{ready:true,mapId:'village'}));emit(event,{origin:'https://wrong.test'});emit(event,{source:{}});emit({...event,mapId:'witch-cave'});assert.equal(events.length,0);emit(event);assert.equal(events.length,1);unsubscribe();emit(event);assert.equal(events.length,1);send.onEvent(value=>events.push(value));send.reset('witch-cave');emit(event);assert.equal(events.length,1);send.dispose();assert.equal(handlers.size,0);
});

test('a pending actor-position capture cannot add or focus into a new, reopened or changed-map work',async t=>{
 for(const action of ['new','reopen','map'])await t.test(action,async t=>{
  let waiting=false,release;const gate=new Promise(resolve=>release=resolve),f=fixture(t,{reply:command=>command==='capture-camera'&&waiting?gate:undefined});await f.studio.loadPreview();await f.click('save');waiting=true;f.root.querySelector('[data-action="actor-add"]').click();await drain();assert.equal(f.root.querySelector('[data-action="actor-add"]').disabled,true);
  if(action==='map'){const select=f.root.querySelector('[data-field="map"]');select.value='monster-forest';select.dispatchEvent(new f.window.Event('change'));await drain();}else await f.click(action);
  const changed=f.studio.getDocument(),commands=f.commands.length;release({state:'ready',camera:worldCamera,playerPosition,focusPosition:playerPosition});await drain();assert.deepEqual(f.studio.getDocument(),changed);assert.equal(f.studio.getDocument().actors.length,0);assert.equal(f.commands.slice(commands).some(row=>row.command==='focus-actor'||row.command==='load'),false);assert.equal(f.root.querySelector('[data-action="actor-add"]').disabled,false);
 });
});

test('immediate file save waits for the pending native drag edit before taking its document snapshot',async t=>{
 const f=fixture(t);await f.click('actor-add');const document=f.studio.getDocument(),editing=f.emit(cinematicReply('actor-edited',{mapId:document.mapId,cutsceneId:document.cutsceneId,actorId:document.actors[0].actorId,time:1,position:[104,12,201],rotation:[0,0,0,1],scale:1}));f.root.querySelector('[data-action="export"]').click();await editing;await drain();assert.equal(f.downloads.length,1);const saved=JSON.parse(await f.downloads[0].blob.text());assert.deepEqual(saved,f.studio.getDocument());assert.deepEqual(saved.actors[0].position,[4,2,1]);
});
