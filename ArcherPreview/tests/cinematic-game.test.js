import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {setupGameCinematics} from '../src/cinematic-game.js';
import {createCinematicDraft,evaluateCinematic} from '../src/cinematic-document.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {cinematicCommand} from '../src/cinematic-protocol.js';

const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(t,{preview=true,ready=true,raw=null,readyTimeoutMs=1000}={}){
 const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>'),root=document.getElementById('app'),engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('camera',1,1,10,Vector3.Zero(),scene),state={ready},messages=[],listeners=new Map(),values=new Map();if(raw)values.set('moonforest-0.1:cinematics:registered:v1',raw);
 const win={parent:{postMessage:(value,origin)=>messages.push({value,origin})},location:new URL('https://game.example/sub/index.html?release=moonforest-0.1'),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}},storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const world={scene,camera,mapId:'village',toolGeneration:0,async acquireToolLease(options){state.ready=false;const lease={owner:options.owner,active:true,isCurrent:()=>lease.active&&world.toolLease===lease,stopAudio(){},playAudio(){return true;},release(){if(!lease.active)return;lease.active=false;if(world.toolLease===lease)world.toolLease=null;state.ready=true;},options};world.toolLease=lease;return lease;}};
 const api=setupGameCinematics({root,world,getPlayer:()=>null,getState:()=>state,storage,window:win,preview,readyTimeoutMs});
 const draft=createCinematicDraft({catalogRevision:ASSET_CATALOG.revision,mapId:'village',cutsceneId:'neutral:test'});
 t.after(async()=>{await api.dispose();scene.dispose();engine.dispose();});
 return {api,world,camera,state,root,document,window,win,messages,listeners,storage,values,draft,send:(command,id,payload={})=>listeners.get('message')?.({source:win.parent,origin:win.location.origin,data:cinematicCommand(command,id,payload)})};
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
 const f=fixture(t,{ready:false,readyTimeoutMs:20}),first=f.api.load(f.draft),firstRejected=assert.rejects(first,{name:'AbortError'});await settle();const second=f.api.load({...f.draft,cutsceneId:'neutral:second'}),secondRejected=assert.rejects(second,/준비 대기/);await firstRejected;await secondRejected;assert.equal(f.api.inspect().pendingReady,false);assert.equal(f.world.toolLease,undefined);f.state.ready=true;f.api.notifyReady();await settle();assert.equal(f.api.host.inspect().active,false);
 const before=f.api.load(f.draft);await before;const bad={...f.draft,duration:Infinity};await assert.rejects(f.api.load(bad));assert.equal(f.api.player.state,'ready','invalid replacement preserves the valid scene lease');
});
test('corrupted browser registry is isolated; explicit registration survives reopen with the same IDs',async t=>{
 const f=fixture(t,{preview:false,raw:JSON.stringify({version:1,documents:{bad:null}})});assert.match(f.root.querySelector('[data-status]').textContent,/등록본을 읽지/);assert.equal(f.root.querySelector('[data-registered]').children.length,0);
 const input=f.root.querySelector('[data-import]');Object.defineProperty(input,'files',{value:[{size:100,text:async()=>JSON.stringify(f.draft)}],configurable:true});await input.onchange({target:input});
 f.root.querySelector('[data-action="register"]').dispatchEvent(new f.window.Event('click',{bubbles:true}));await settle();const saved=JSON.parse(f.storage.getItem('moonforest-0.1:cinematics:registered:v1'));assert.equal(saved.documents['neutral:test'].cutsceneId,'neutral:test');assert.equal(saved.documents['neutral:test'].actors.length,0);
 await f.api.dispose();const again=setupGameCinematics({root:f.root,world:f.world,getState:()=>f.state,getPlayer:()=>null,storage:f.storage,window:f.win});assert.equal(f.root.querySelector('[data-registered]').children.length,1);await again.dispose();
});
