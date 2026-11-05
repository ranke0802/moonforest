import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,Vector3,TransformNode} from '@babylonjs/core';
import {setupGameCinematics} from '../src/cinematic-game.js';
import {createCinematicDraft,evaluateCinematic} from '../src/cinematic-document.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {cinematicCommand} from '../src/cinematic-protocol.js';

const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(t,{preview=true,ready=true,raw=null,readyTimeoutMs=1000,hero=false}={}){
 const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>'),root=document.getElementById('app'),engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('camera',1,1,10,Vector3.Zero(),scene),state={ready},messages=[],listeners=new Map(),values=new Map();if(raw)values.set('moonforest-0.1:cinematics:registered:v1',raw);
 const win={parent:{postMessage:(value,origin)=>messages.push({value,origin})},location:new URL('https://game.example/sub/index.html?release=moonforest-0.1'),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}},storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const world={scene,camera,mapId:'village',toolGeneration:0,async acquireToolLease(options){state.ready=false;const lease={owner:options.owner,active:true,isCurrent:()=>lease.active&&world.toolLease===lease,stopAudio(){},playAudio(){return true;},release(){if(!lease.active)return;lease.active=false;if(world.toolLease===lease)world.toolLease=null;state.ready=true;},options};world.toolLease=lease;return lease;}};
 const playerNode=hero?new TransformNode('live-game-player',scene):null;
 const api=setupGameCinematics({root,world,getPlayer:()=>playerNode,getState:()=>state,storage,window:win,preview,readyTimeoutMs});
 const draft=createCinematicDraft({catalogRevision:ASSET_CATALOG.revision,mapId:'village',cutsceneId:'neutral:test'});
 t.after(async()=>{await api.dispose();scene.dispose();engine.dispose();});
 return {api,world,camera,state,root,document,window,win,messages,listeners,storage,values,draft,playerNode,send:(command,id,payload={})=>listeners.get('message')?.({source:win.parent,origin:win.location.origin,data:cinematicCommand(command,id,payload)})};
}
test('same-scene game bridge gates readiness, rejects spoofed sources and samples the shared timeline',async t=>{
 const f=fixture(t,{ready:false});assert.equal(f.messages[0].value.ready,false);
 f.listeners.get('message')({source:{},origin:f.win.location.origin,data:cinematicCommand('load','spoof',{document:f.draft})});await settle();assert.equal(f.api.player.state,'idle');
 f.send('load','load',{document:f.draft});await settle();assert.equal(f.api.inspect().pendingReady,true);f.state.ready=true;f.api.notifyReady();await settle();assert.equal(f.api.player.state,'ready');assert.equal(f.messages.find(row=>row.value.requestId==='load').value.ok,true);
 f.send('play','play');await settle();f.world.toolLease.options.onFrame(.2);const expected=evaluateCinematic(f.draft,.2);assert.equal(f.api.player.time,.2);assert.ok(Vector3.Distance(f.camera.position,Vector3.FromArray(expected.camera.position))<1e-7);
 f.send('capture-camera','capture');await settle();assert.deepEqual(f.messages.find(row=>row.value.requestId==='capture').value.camera.position,f.camera.position.asArray());
 f.world.toolLease.options.onPause(true);assert.equal(f.api.player.state,'paused');f.world.toolLease.options.onFrame(.1);assert.equal(f.api.player.time,.2);f.world.toolLease.options.onPause(false);assert.equal(f.api.player.state,'playing');
 f.send('stop','stop');await settle();assert.equal(f.world.toolLease,null);assert.equal(f.state.ready,true);assert.equal(f.api.host.inspect().active,false);
 await f.api.dispose();assert.equal(f.listeners.size,0);
});
test('superseded and timed-out readiness requests cannot later acquire a scene',async t=>{
 const f=fixture(t,{ready:false,readyTimeoutMs:20}),first=f.api.load(f.draft),firstRejected=assert.rejects(first,{name:'AbortError'});for(let i=0;i<50&&!f.api.inspect().pendingReady;i++)await Promise.resolve();assert.equal(f.api.inspect().pendingReady,true);const second=f.api.load({...f.draft,cutsceneId:'neutral:second'}),secondRejected=assert.rejects(second,/준비 대기/);await firstRejected;await secondRejected;assert.equal(f.api.inspect().pendingReady,false);assert.equal(f.world.toolLease,undefined);f.state.ready=true;f.api.notifyReady();await settle();assert.equal(f.api.host.inspect().active,false);
 const before=f.api.load(f.draft);await before;const bad={...f.draft,duration:Infinity};await assert.rejects(f.api.load(bad));assert.equal(f.api.player.state,'ready','invalid replacement preserves the valid scene lease');
});
test('corrupted browser registry is isolated; explicit registration survives reopen with the same IDs',async t=>{
 const f=fixture(t,{preview:false,raw:JSON.stringify({version:1,documents:{bad:null}})});assert.match(f.root.querySelector('[data-status]').textContent,/등록본을 읽지/);assert.equal(f.root.querySelector('[data-registered]').children.length,0);
 const input=f.root.querySelector('[data-import]');Object.defineProperty(input,'files',{value:[new Blob([JSON.stringify(f.draft)],{type:'application/json'})],configurable:true});await input.onchange({target:input});
 f.root.querySelector('[data-action="register"]').dispatchEvent(new f.window.Event('click',{bubbles:true}));await settle();const saved=JSON.parse(f.storage.getItem('moonforest-0.1:cinematics:registered:v1'));assert.equal(saved.documents['neutral:test'].cutsceneId,'neutral:test');assert.equal(saved.documents['neutral:test'].actors.length,0);
 await f.api.dispose();const again=setupGameCinematics({root:f.root,world:f.world,getState:()=>f.state,getPlayer:()=>null,storage:f.storage,window:f.win});assert.equal(f.root.querySelector('[data-registered]').children.length,1);await again.dispose();
});
test('studio game-save reopens the exact selected scene through visible game controls without file conversion',async t=>{
 const f=fixture(t),saved=await f.api.execute({command:'save-scene',document:f.draft});assert.equal(saved.saved,true);const address=new URL(saved.gameUrl);assert.equal(address.searchParams.get('scene'),f.draft.cutsceneId);assert.equal(address.searchParams.get('character'),'warrior-v3');assert.equal(address.searchParams.get('cinematic'),'1');assert.equal(f.api.player.state,'idle','saving does not start a cinematic');
 await f.api.dispose();f.win.location=address;const game=setupGameCinematics({root:f.root,world:f.world,getState:()=>f.state,getPlayer:()=>null,storage:f.storage,window:f.win});t.after(()=>game.dispose());await settle();assert.equal(game.player.state,'ready');assert.equal(game.player.document.cutsceneId,f.draft.cutsceneId);const play=f.root.querySelector('[data-action="play"]');assert.equal(play.disabled,false);play.dispatchEvent(new f.window.Event('click',{bubbles:true}));await settle();assert.equal(game.player.state,'playing');const stop=f.root.querySelector('[data-action="stop"]');stop.dispatchEvent(new f.window.Event('click',{bubbles:true}));await settle();assert.equal(f.world.toolLease,null);assert.equal(f.state.ready,true);assert.doesNotMatch(f.root.querySelector('.cinematic-game').textContent,/node scripts|JSON|레지스트리/);
});

test('authoring completion keeps the scene and separate centered descriptions editable without returning to gameplay',async t=>{
 const f=fixture(t,{hero:true}),node=f.playerNode;assert.equal(node.isEnabled(),false);assert.equal(f.root.dataset.cinematicPreview,'true');
 f.draft.duration=.2;f.draft.shots[0].end=.2;f.draft.tracks.subtitles=[{start:0,end:.2,text:'고블린\n숲을 지키는 몬스터',placement:'center'},{start:0,end:.2,text:'아래 자막'}];
 await f.api.load(f.draft);const lease=f.world.toolLease,actorResources=f.api.host.inspect().actors;
 assert.equal(f.root.querySelector('.cinematic-center-text').textContent,'고블린\n숲을 지키는 몬스터');assert.equal(f.root.querySelector('.cinematic-subtitles').textContent,'아래 자막');
 await f.api.execute({command:'play'});lease.options.onFrame(.25);assert.equal(f.api.player.state,'completed');assert.equal(f.api.inspect().retained,true);assert.equal(f.world.toolLease,lease);assert.equal(lease.active,true);assert.equal(f.state.ready,false);assert.equal(node.isEnabled(),false);
 const revised=structuredClone(f.draft);revised.tracks.subtitles[0].text='수정한 설명';await f.api.execute({command:'patch-document',document:revised});assert.equal(f.root.querySelector('.cinematic-center-text').textContent,'수정한 설명');
 await f.api.execute({command:'seek',time:.1});assert.equal(f.api.player.state,'paused');await f.api.execute({command:'play'});lease.options.onFrame(.25);assert.equal(f.api.player.state,'completed');assert.equal(f.world.toolLease,lease);assert.equal(f.api.host.inspect().actors,actorResources);
 await f.api.execute({command:'stop'});assert.equal(f.world.toolLease,null);assert.equal(node.isEnabled(),false,'outer preview isolation survives explicit scene release');assert.equal(f.root.querySelector('.cinematic-center-text').textContent,'');
 await f.api.dispose();assert.equal(node.isEnabled(),true);assert.equal(f.root.dataset.cinematicPreview,undefined);assert.equal(f.root.querySelector('.cinematic-center-text'),null);
});

test('ordinary game completion restores its borrowed scene and clears center text',async t=>{
 const f=fixture(t,{preview:false,hero:true});f.draft.duration=.1;f.draft.shots[0].end=.1;f.draft.tracks.subtitles=[{start:0,end:.1,text:'몬스터 소개',placement:'center'}];
 await f.api.load(f.draft);await f.api.execute({command:'play'});f.world.toolLease.options.onFrame(.25);await settle();assert.equal(f.api.player.state,'completed');assert.equal(f.api.inspect().retained,false);assert.equal(f.world.toolLease,null);assert.equal(f.state.ready,true);assert.equal(f.playerNode.isEnabled(),true);assert.equal(f.root.querySelector('.cinematic-center-text').textContent,'');
 assert.equal(f.root.dataset.cinematicPreview,undefined);
});

test('hiding the ordinary cinematic viewer stops its lease and preserves the loaded and registered scene for reopening',async t=>{
 const f=fixture(t,{preview:false});await f.api.load(f.draft);f.api.saveScene(f.draft);const saved=f.storage.getItem('moonforest-0.1:cinematics:registered:v1'),panel=f.root.querySelector('.cinematic-game');await f.api.execute({command:'play'});
 const hiding=f.api.hide();assert.equal(panel.hidden,true);await hiding;assert.equal(f.world.toolLease,null);assert.equal(f.state.ready,true);assert.equal(f.api.inspect().pendingReady,false);assert.equal(f.storage.getItem('moonforest-0.1:cinematics:registered:v1'),saved);
 f.api.show();assert.equal(panel.hidden,false);await f.api.execute({command:'play'});assert.equal(f.api.player.state,'playing');assert.equal(f.api.player.document.cutsceneId,f.draft.cutsceneId);assert.equal(f.root.querySelector('[data-registered]').children.length,1);
});

test('a cinematic file import finishing after hide cannot reacquire gameplay or reopen its viewer',async t=>{
 const f=fixture(t,{preview:false}),bytes=new TextEncoder().encode(JSON.stringify(f.draft)),panel=f.root.querySelector('.cinematic-game'),input=f.root.querySelector('[data-import]');let finish,started=false;const gate=new Promise(resolve=>finish=resolve);t.after(()=>finish(bytes.buffer));
 Object.defineProperty(input,'files',{value:[{size:bytes.byteLength,arrayBuffer(){started=true;return gate;}}],configurable:true});const importing=input.onchange({target:input});await settle();assert.equal(started,true);
 await f.api.hide();assert.equal(panel.hidden,true);finish(bytes.buffer);await importing;await settle();assert.equal(panel.hidden,true);assert.equal(f.world.toolLease?.active??false,false);assert.equal(f.api.host.inspect().active,false);assert.equal(f.state.ready,true);
});

test('a stale import after OFF/ON cannot replace or stop the newly opened cinematic document',async t=>{
 const f=fixture(t,{preview:false}),input=f.root.querySelector('[data-import]'),oldBytes=new TextEncoder().encode(JSON.stringify(f.draft));let finish;const gate=new Promise(resolve=>finish=resolve);t.after(()=>finish(oldBytes.buffer));
 Object.defineProperty(input,'files',{value:[{size:oldBytes.byteLength,arrayBuffer:()=>gate}],configurable:true});const old=input.onchange({target:input});await settle();await f.api.hide();f.api.show();
 const next={...structuredClone(f.draft),cutsceneId:'neutral:new-after-on'};Object.defineProperty(input,'files',{value:[new Blob([JSON.stringify(next)],{type:'application/json'})],configurable:true});await input.onchange({target:input});assert.equal(f.api.player.document.cutsceneId,next.cutsceneId);const lease=f.world.toolLease;
 finish(oldBytes.buffer);await old;await settle();assert.equal(f.root.querySelector('.cinematic-game').hidden,false);assert.equal(f.api.player.document.cutsceneId,next.cutsceneId);assert.equal(f.world.toolLease,lease);assert.equal(lease.active,true);assert.equal(f.state.ready,false);assert.equal(input.disabled,false);
});
