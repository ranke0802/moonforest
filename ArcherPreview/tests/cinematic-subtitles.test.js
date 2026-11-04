import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {createCinematicSubtitles} from '../src/cinematic-subtitles.js';
import {createCinematicDraft,validateCinematicDocument,evaluateCinematic} from '../src/cinematic-document.js';
import {setupGameCinematics} from '../src/cinematic-game.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';

function draft(){const value=createCinematicDraft({catalogRevision:ASSET_CATALOG.revision,cutsceneId:'subtitle:test'});value.tracks.subtitles=[{start:0,end:6,text:'아래 자막'},{start:0,end:6,text:'가운데 글자',placement:'center',position:{x:25,y:35}}];return value;}
function domFixture(t,{preview=true}={}){
 const {document,window}=parseHTML('<html><body><main><canvas></canvas></main></body></html>'),root=document.querySelector('main'),canvas=root.querySelector('canvas'),edits=[],captures=new Set(),context={document:draft(),mapId:'village',state:'ready',time:0,generation:1,enabled:true,detached:false,retained:false,lease:{active:true,paused:false,isCurrent:()=>true}};
 canvas.getBoundingClientRect=()=>({left:47,top:31,width:960,height:540});let raf=0;window.requestAnimationFrame=()=>{raf++;throw new Error('No RAF ownership');};
 const api=createCinematicSubtitles({root,canvas,preview,getContext:()=>context,onEdit:value=>{edits.push(value);}});
 const render=()=>{api.render(evaluateCinematic(context.document,context.time).subtitles);for(const node of root.querySelectorAll('[data-subtitle-index]')){node.getBoundingClientRect=()=>{const row=api.inspect().cues.find(row=>String(row.subtitleIndex)===node.dataset.subtitleIndex),position=row.position??{x:50,y:node.closest('.cinematic-center-text')?50:88};return {left:47+position.x*9.6-60,top:31+position.y*5.4-15,width:120,height:30};};node.setPointerCapture=id=>captures.add(id);node.hasPointerCapture=id=>captures.has(id);node.releasePointerCapture=id=>captures.delete(id);}};render();
 function fire(node,type,x,y,extra={}){const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{clientX:x,clientY:y,pointerId:7,button:0,...extra});node.dispatchEvent(event);return event;}
 const cue=index=>root.querySelector(`[data-subtitle-index="${index}"]`);t.after(()=>api.dispose());return {api,root,canvas,document,window,context,edits,captures,render,fire,cue,get raf(){return raf;}};
}

test('optional subtitle positions validate strictly, serialize, and preserve legacy evaluation shape',()=>{
 const references={catalog:ASSET_CATALOG},value=draft(),result=validateCinematicDocument(value,references);assert.equal(result.valid,true);assert.deepEqual(evaluateCinematic(result.document,0).subtitles[0],{text:'아래 자막',start:0,end:6});
 const roundtrip=validateCinematicDocument(JSON.stringify(result.document),references);assert.equal(roundtrip.valid,true);assert.deepEqual(roundtrip.document.tracks.subtitles[1].position,{x:25,y:35});const frame=evaluateCinematic(roundtrip.document,0);frame.subtitles[1].position.x=90;assert.equal(roundtrip.document.tracks.subtitles[1].position.x,25);
 for(const position of [null,[],{}, {x:0}, {x:-.01,y:50},{x:101,y:50},{x:50,y:Infinity},{x:NaN,y:50},{x:'50',y:50},{x:50,y:50,z:0}]){const invalid=draft();invalid.tracks.subtitles[0].position=position;assert.equal(validateCinematicDocument(invalid,references).valid,false,JSON.stringify(position));}
 for(const position of [{x:0,y:100},{x:100,y:0}]){value.tracks.subtitles[0].position=position;assert.equal(validateCinematicDocument(value,references).valid,true);}
});

test('concurrent cues retain independent positions and legacy text; centered fixed cues have no transformed ancestor',t=>{
 const f=domFixture(t);f.context.document.tracks.subtitles.push({start:0,end:6,text:'<img src=x onerror=alert(1)>',placement:'center',position:{x:75,y:65}},{start:0,end:6,text:'둘째 아래 줄'});f.render();
 assert.equal(f.root.querySelector('.cinematic-subtitles').textContent,'아래 자막\n둘째 아래 줄');assert.equal(f.root.querySelector('.cinematic-center-text').textContent,'가운데 글자\n<img src=x onerror=alert(1)>');assert.equal(f.root.querySelector('img'),null);assert.equal(f.cue(1).style.left,'287px');assert.equal(f.cue(2).style.left,'767px');assert.equal(f.cue(0).style.position,'');
 for(let node=f.cue(1).parentElement;node;node=node.parentElement)assert.ok(!node.style?.transform||node.style.transform==='none','fixed subtitle must have no transformed ancestor');
 const legacy={start:0,end:6,text:'짧은 가운데 글자',placement:'center'};f.context.document.tracks.subtitles.push(legacy);f.render();assert.equal(f.root.querySelector('.cinematic-center-text').style.alignItems,'center');assert.equal(f.cue(4).style.maxWidth,'100%');
 f.api.render(['예전 문자열']);assert.equal(f.root.querySelector('.cinematic-subtitles').textContent,'예전 문자열');assert.equal(f.root.querySelector('[data-subtitle-index]').style.pointerEvents,'none');assert.equal(f.raf,0);
});

test('native bubbling pointer drag reuses its cue node, isolates input, samples final UP and commits one indexed identity',t=>{
 const f=domFixture(t),node=f.cue(1);let gamePointers=0;for(const type of ['pointerdown','pointermove','pointerup'])f.root.addEventListener(type,()=>gamePointers++);
 assert.equal(f.fire(node,'pointerdown',287,220).defaultPrevented,true);f.render();assert.equal(f.cue(1),node);assert.equal(f.api.inspect().dragging,true);f.fire(node,'pointermove',431,274);f.fire(node,'pointerup',527,301);
 assert.equal(gamePointers,0);assert.equal(f.edits.length,1);assert.deepEqual(f.edits[0],{mapId:'village',cutsceneId:'subtitle:test',time:0,subtitleIndex:1,position:{x:50,y:50},cue:{start:0,end:6,text:'가운데 글자',placement:'center',previousPosition:{x:25,y:35}}});assert.equal(f.captures.size,0);assert.deepEqual(f.context.document.tracks.subtitles[1].position,{x:25,y:35},'DOM helper does not mutate timeline data');
});

test('touch endpoint without MOVE clamps the full measured text inside offset canvas bounds',t=>{
 const f=domFixture(t),node=f.cue(0);f.fire(node,'pointerdown',527,506.2,{pointerType:'touch'});f.fire(node,'pointerup',-500,2000,{pointerType:'touch'});assert.equal(f.edits.length,1);assert.deepEqual(f.edits[0].position,{x:6.25,y:97.222222});assert.equal(f.edits[0].cue.previousPosition,null);assert.equal(node.style.left,'107px');assert.ok(Math.abs(parseFloat(node.style.top)-556)<1e-5);
});

test('cancel, blur and Escape restore the original cue and never create history edits',t=>{
 const f=domFixture(t),node=f.cue(1),left=node.style.left,top=node.style.top;
 for(const end of ['pointercancel','blur','Escape']){f.fire(node,'pointerdown',287,220);f.fire(node,'pointermove',527,301);if(end==='pointercancel')f.fire(node,end,527,301);else if(end==='blur')f.window.dispatchEvent(new f.window.Event('blur'));else{const event=new f.window.Event('keydown');event.code='Escape';f.window.dispatchEvent(event);}assert.equal(f.api.inspect().dragging,false);assert.equal(node.style.left,left);assert.equal(node.style.top,top);assert.equal(f.captures.size,0);}
 assert.equal(f.edits.length,0);
});

test('playing, ordinary game, detached or stale ownership cannot commit; retained completion stays editable',t=>{
 const f=domFixture(t),node=f.cue(1),attempt=()=>{f.fire(node,'pointerdown',287,220);f.fire(node,'pointerup',527,301);};f.context.state='playing';f.api.refresh();assert.equal(node.style.pointerEvents,'none');attempt();assert.equal(f.edits.length,0);
 f.context.state='completed';f.api.refresh();attempt();assert.equal(f.edits.length,0);f.context.retained=true;f.api.refresh();attempt();assert.equal(f.edits.length,1);
 for(const change of [()=>f.context.detached=true,()=>f.context.lease.paused=true,()=>f.context.lease.active=false,()=>f.context.generation++,()=>f.context.mapId='plains',()=>f.context.time=.1,()=>f.context.document=structuredClone(f.context.document)]){Object.assign(f.context,{state:'paused',detached:false,mapId:'village',time:0});Object.assign(f.context.lease,{active:true,paused:false});f.api.refresh();f.fire(node,'pointerdown',527,301);change();f.fire(node,'pointerup',600,350);assert.equal(f.api.inspect().dragging,false);assert.equal(f.edits.length,1);}
 const ordinary=domFixture(t,{preview:false});ordinary.fire(ordinary.cue(1),'pointerdown',287,220);ordinary.fire(ordinary.cue(1),'pointerup',527,301);assert.equal(ordinary.edits.length,0);assert.equal(ordinary.cue(1).style.pointerEvents,'none');
});

test('clear/dispose release captured pointers and listeners without timers, resurrection or wheel interception',t=>{
 const f=domFixture(t),node=f.cue(1);let wheel=0;f.root.addEventListener('wheel',()=>wheel++);f.fire(node,'wheel',287,220,{ctrlKey:true});assert.equal(wheel,1);f.fire(node,'pointerdown',287,220);f.fire(node,'pointermove',527,301);f.api.clear();assert.equal(f.captures.size,0);assert.equal(f.api.inspect().nodes,0);assert.equal(f.edits.length,0);f.render();const fresh=f.cue(1);f.fire(fresh,'pointerdown',287,220);f.api.dispose();f.api.dispose();f.fire(fresh,'pointerup',527,301);f.render();assert.equal(f.root.querySelector('.cinematic-subtitles'),null);assert.equal(f.api.inspect().nodes,0);assert.equal(f.edits.length,0);assert.equal(f.raf,0);
});

test('live game controller applies a completed drag immediately, posts guarded identity and preserves save/seek/replay positions',async t=>{
 const {document,window}=parseHTML('<html><body><main id="app"><canvas></canvas></main></body></html>'),root=document.querySelector('main'),canvas=root.querySelector('canvas'),engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('camera',1,1,10,Vector3.Zero(),scene),state={ready:true},messages=[],store=new Map();canvas.getBoundingClientRect=()=>({left:47,top:31,width:960,height:540});camera.inputs.attachedToElement=true;
 engine.getRenderingCanvas=()=>canvas;
 const win={parent:{postMessage:value=>messages.push(value)},location:new URL('https://game.example/index.html'),addEventListener(){},removeEventListener(){}},world={scene,camera,mapId:'village',async acquireToolLease(options){state.ready=false;const lease={owner:options.owner,active:true,paused:false,isCurrent:()=>lease.active,attachCamera(){camera.inputs.attachedToElement=true;},stopAudio(){},playAudio(){},options,release(){lease.active=false;world.toolLease=null;state.ready=true;}};world.toolLease=lease;return lease;}},storage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)};
 const api=setupGameCinematics({root,world,getPlayer:()=>null,getState:()=>state,window:win,storage,preview:true});t.after(async()=>{await api.dispose();scene.dispose();engine.dispose();});await api.load(draft());const node=root.querySelector('[data-subtitle-index="1"]');node.getBoundingClientRect=()=>({left:227,top:205,width:120,height:30});
 const fire=(type,x,y)=>{const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{clientX:x,clientY:y,pointerId:1,button:0});node.dispatchEvent(event);};const cameraBefore=camera.position.asArray();fire('pointerdown',287,220);fire('pointerup',527,301);const event=messages.find(row=>row.requestId==='subtitle-edited');assert.equal(event.ok,true);assert.deepEqual(event.position,{x:50,y:50});assert.deepEqual(event.cue,{start:0,end:6,text:'가운데 글자',placement:'center',previousPosition:{x:25,y:35}});assert.deepEqual(api.player.document.tracks.subtitles[1].position,{x:50,y:50});assert.deepEqual(camera.position.asArray(),cameraBefore);
 node.getBoundingClientRect=()=>({left:parseFloat(node.style.left)-60,top:parseFloat(node.style.top)-15,width:120,height:30});fire('pointerdown',527,301);fire('pointerup',623,355);const second=messages.filter(row=>row.requestId==='subtitle-edited')[1];assert.deepEqual(second.cue.previousPosition,{x:50,y:50},'a second drag before any sample uses the latest position identity');assert.deepEqual(second.position,{x:60,y:60});
 api.saveScene(api.player.document);assert.equal(JSON.parse([...store.values()][0]).documents['subtitle:test'].tracks.subtitles[1].position.y,60);await api.execute({command:'seek',time:1});assert.deepEqual(evaluateCinematic(api.player.document,1).subtitles[1].position,{x:60,y:60});await api.execute({command:'play'});assert.equal(node.style.pointerEvents,'none');await api.execute({command:'pause'});assert.equal(node.style.pointerEvents,'auto');api.leaveMap();assert.equal(root.querySelector('[data-subtitle-index]'),null);
});
