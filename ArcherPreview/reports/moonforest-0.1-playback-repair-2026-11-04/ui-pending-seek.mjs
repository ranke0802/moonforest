import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {FrameLoop} from '../../src/frame-loop.js';
import {createAuthoringFixture,until,settle,sha} from '../moonforest-0.1-cinematic-authoring-2026-11-04/verification-fixture.mjs';

const files=['src/cinematic-studio.js','src/cinematic-game.js','src/cinematic-player.js','src/cinematic-scene-host.js','src/cinematic-interaction.js','src/frame-loop.js','src/main.js'];
const hashes=()=>Object.fromEntries(files.map(path=>[path,sha(readFileSync(new URL('../../'+path,import.meta.url)))]));
const before=hashes(),cases=[],fixed=process.argv.includes('--fixed');let f,loop;
try{
 console.log('ui probe: imports ready');
 f=await createAuthoringFixture();
 console.log('ui probe: actual fixture ready');
 await f.click('actor-add');
 await until(()=>f.api?.player.document?.actors.length===1&&!f.button('actor-add').disabled,'real cold actor ready');
 const root=f.parentDom.root,field=root.querySelector('[data-field="time"]'),clock=()=>root.querySelector('[data-view="time"]').textContent;
 // The actual Babylon callback gate, actual FrameLoop dt, extracted production
 // main render, actual lease/host and actual player are all in this path.
 // Only RAF scheduling/time is controlled, because this is Node (no browser).
 let now=1000;f.engine._queueNewFrame=()=>123;f.engine._windowIsBackground=false;f.engine.renderEvenInBackground=true;
 loop=new FrameLoop(f.engine,dt=>f.frame(dt),()=>now);loop.setPaused(false);
 const frames=count=>{const start=loop.frames;for(let i=0;i<count;i++){now+=100;f.engine._renderLoop(now);}return loop.frames-start;};
 await f.click('play');assert.equal(f.api.player.state,'playing');
 const nativeFrames=frames(4);assert.equal(nativeFrames,4);assert.ok(f.api.player.time>.29);
 cases.push({name:'actual engine callbacks and FrameLoop advance player through production main render',passed:true,nativeFrames,time:f.api.player.time});
 await f.click('stop');await until(()=>f.api.player.time===0&&f.api.player.state==='paused','reset to paused0');
 const post=f.parent.win.postMessage;let held,heldPlay,seekRequest;
 f.parent.win.postMessage=(message,target)=>{
  const request=f.traffic.findLast(row=>row.direction==='request'&&row.requestId===message.requestId);
  if(!held&&request?.command==='seek'&&!seekRequest){seekRequest=request;held={message,target};return;}
  if(request?.command==='play'){heldPlay={message,target};return;}
  return post(message,target);
 };
 const start=f.traffic.length;
 field.value='0';field.dispatchEvent(new f.parentDom.window.Event('input',{bubbles:true}));
 await until(()=>held,'first real seek ACK held at transport boundary');
 field.value='0';field.dispatchEvent(new f.parentDom.window.Event('input',{bubbles:true}));await settle();
 f.button('play').click();
 if(fixed){await settle();assert.equal(heldPlay,undefined,'Play waits for active coalesced seek');assert.equal(f.traffic.slice(start).some(row=>row.direction==='request'&&row.command==='play'),false);post(held.message,held.target);}
 await until(()=>f.api.player.state==='playing'&&heldPlay,'real Play executes while first seek is unresolved');
 assert.equal(f.api.player.time,0);
 // Deliver both genuine replies in the same message batch. Their await
 // continuations allow the old seek's coalesced follow-up to see "playing".
 if(!fixed)post(held.message,held.target);post(heldPlay.message,heldPlay.target);await settle();
 if(fixed){
  assert.equal(f.api.player.state,'playing');const afterFrames=frames(8);assert.equal(afterFrames,8);assert.ok(f.api.player.time>.69);await new Promise(resolve=>setTimeout(resolve,575));await settle();const bounds=f.handles().flatMap(row=>row.meshes).filter(mesh=>mesh.showBoundingBox).length;assert.equal(bounds,0);assert.match(f.status(),/재생 중/);assert.ok(Number.parseFloat(clock())>.69);
  const requests=f.traffic.slice(start).filter(row=>row.direction==='request').map(row=>({command:row.command,time:row.time})),playIndex=requests.findIndex(row=>row.command==='play');assert.equal(requests.slice(playIndex+1).some(row=>row.command==='pause'||row.command==='seek'),false);
  cases.push({name:'queued seeks drain before Play and positive native frames advance matching UI clock',passed:true,actualState:f.api.player.state,actualTime:f.api.player.time,uiStatus:f.status(),uiClock:clock(),selectedBoundingBoxes:bounds,nativePositiveDtFrames:afterFrames,requests});
 }else{
 await until(()=>f.api.player.state==='paused','coalesced seek resumes after play ACK');
 const afterFrames=frames(8);assert.equal(afterFrames,8);assert.equal(f.api.player.time,0);
 await new Promise(resolve=>setTimeout(resolve,575));await settle();
 const bounds=f.handles().flatMap(row=>row.meshes).filter(mesh=>mesh.showBoundingBox).length;
 assert.match(f.status(),/재생 중/);assert.match(clock(),/^0\.00/);assert.ok(bounds>0);
 const traffic=f.traffic.slice(start).map(row=>({direction:row.direction,requestId:row.requestId,command:row.command,state:row.state,time:row.time,ok:row.ok}));
 assert.ok(traffic.some(row=>row.direction==='request'&&row.command==='pause'));
 cases.push({name:'queued seek can pause a successfully acknowledged Play; poll leaves false playing label',passed:true,heldRequestId:seekRequest.requestId,actualState:f.api.player.state,actualTime:f.api.player.time,uiStatus:f.status(),uiClock:clock(),selectedBoundingBoxes:bounds,positiveDtFramesAfterRace:afterFrames,traffic});
 }
 f.parent.win.postMessage=post;
 assert.deepEqual(hashes(),before);
 writeFileSync(new URL(fixed?'./ui-pending-seek-fixed.json':'./ui-pending-seek.json',import.meta.url),JSON.stringify({baseline:'e649384',fixed,passed:true,sourceHashes:before,cases,scope:{real:['paired authenticated postMessage transport','Studio DOM controls','createWorld/NullEngine','default scoped model loading of shipped goblin','CinematicPlayer/SceneHost/GameToolLease','Babylon native _renderLoop callback gate','FrameLoop dt','source-extracted production main render'],controlled:['hold genuine seek/play ACKs to represent asynchronous delivery','RAF requester and monotonic frame timestamps','Node DOM canvas bounds','decoded local GLTF buffer boundary, no texture pixels','audio output'],limits:['proves an independent UI race, not which branch caused the user screenshot','does not instantiate full main startup/reconcile; native background-focus gate is checked separately','no browser, WebGL pixel or wall-clock FPS claim']}},null,2)+'\n');
 console.log(fixed?'PASS fixed real UI: pending seeks drain; playing clock advances; selection bounds hidden':'PASS real connected UI pending-seek race: player paused0, UI playing0, selected bounds visible');
}finally{loop?.setPaused(true);await f?.close();}
