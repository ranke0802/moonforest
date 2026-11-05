import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PlaygroundInput} from '../src/input.js';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {FrameLoop} from '../src/frame-loop.js';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,Vector3} from '@babylonjs/core';
import {PlayerHitReaction} from '../src/hit-feedback.js';
import {StaminaFailureFeedback,applyPlayerFlash} from '../src/stamina-feedback.js';
import {parseHTML} from 'linkedom';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const inputFunctions=main.slice(main.indexOf('function setAttackHeld('),main.indexOf('function faceHeading('));
const binding=main.slice(main.indexOf('  let lastPointerAttack'),main.indexOf('  const releaseAttack'));
const feedbackSource=main.slice(main.indexOf('function updateButtons()'),main.indexOf('  const snapshot=',main.indexOf('function updateButtons()')))+'\n}';
const toastSource=main.slice(main.indexOf('function toast('),main.indexOf('function updateSummonControls('));
const durations={idle:2,run:1,slash:1.5,attack:3,judgment:4.33,shieldPush:2.37,dodge:2.46};
class Surface{
 constructor(){this.events=new Map();this.style={};this.hidden=true;this.captured=new Set();}
 addEventListener(name,fn,options={}){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(fn);options.signal?.addEventListener('abort',()=>this.events.set(name,this.events.get(name).filter(f=>f!==fn)),{once:true});}
 removeEventListener(name,fn){this.events.set(name,(this.events.get(name)??[]).filter(f=>f!==fn));}
 emit(type,properties={}){const e={type,target:this,defaultPrevented:false,cancelable:true,preventDefault(){if(this.cancelable)this.defaultPrevented=true;},...properties};for(const fn of this.events.get(type)??[])fn(e);return e;}
 focus(){}getBoundingClientRect(){return {left:0,top:0,width:1000,height:800};}setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}releasePointerCapture(id){this.captured.delete(id);}
}
function fixture(kind){
 const elements=Object.fromEntries(['#joystick','#joystick-knob','#joystick-hint'].map(key=>[key,new Surface()]));globalThis.window=new Surface();globalThis.document=new Surface();document.querySelector=key=>elements[key]??null;
 const root=new Surface(),canvas=new Surface(),attackButton=new Surface(),label={closest:selector=>selector==='#attack-button'?attackButton:null};
 root.contains=target=>target===canvas||target===attackButton||target===label;canvas.closest=()=>root;attackButton.closest=selector=>selector==='#attack-button'?attackButton:null;
 let now=0;const controller=new WarriorV2Controller({durations,holdNow:()=>now});controller.startAttack(kind);const attackSources=new Set();
 const production=new Function('attackSources','attackPointerTypes','controller','ready','boss','elenaReview',inputFunctions+';return {setAttackHeld,cancelAttackInput,isHudAttackHeld};')(attackSources,new Map(),controller,true,null,null);
 const input=new PlaygroundInput(canvas,{alpha:0,beta:1,radius:5},{canMove:()=>true,setAttackHeld:(held,source='keyboard')=>production.setAttackHeld(source,held),cancelAttackInput:production.cancelAttackInput,isHudAttackHeld:production.isHudAttackHeld});
 new Function('attackButton','ready','performance','setAttackHeld','cancelAttackInput','actions',binding)(attackButton,true,{now:()=>now},production.setAttackHeld,production.cancelAttackInput,{attack:()=>controller.attack()});
 const loop=new FrameLoop({stopRenderLoop(){},runRenderLoop(){}},dt=>controller.update(dt),()=>now);loop.frame();
 const step=ms=>{now+=ms;loop.frame();};return {controller,attackSources,input,attackButton,label,root,canvas,step,production};
}
test('prevented mobile context menu on the held HUD sword preserves the charged attack through recovery',()=>{
 for(const kind of ['slash','attack','judgment','dodge','shieldPush'])for(const early of [true,false])for(const release of [true,false])for(const pointerType of ['touch',undefined]){
  const f=fixture(kind),c=f.controller;f.attackButton.emit('pointerdown',{button:0,pointerId:7,pointerType:'touch'});
  for(let i=0;i<(early?6:16);i++)f.step(1000/30);
  const event=document.emit('contextmenu',{target:f.label,button:2,pointerType});assert.equal(event.defaultPrevented,true);assert.equal(c.held,true,`${kind} physical hold was erased`);
  for(let i=early?6:16;i<16;i++)f.step(1000/30);assert.equal(c.queuedAttack,'judgment');
  if(release)f.attackButton.emit('pointerup',{pointerId:7,pointerType:'touch'});
  for(let i=0;i<180&&c.serial<2;i++)f.step(1000/30);assert.equal(c.action?.state,'judgment');assert.equal(c.serial,2);
  f.attackButton.emit('pointerup',{pointerId:7,pointerType:'touch'});f.attackButton.emit('lostpointercapture',{pointerId:7,pointerType:'touch'});for(let i=0;i<160;i++)f.step(1000/30);assert.equal(c.serial,2);f.input.dispose();
 }
});
test('unrelated UI menus, unpreventable menus, blur and pointercancel still cancel the hold',()=>{
 for(const reason of ['other-ui','unpreventable','mouse-menu','mouse-compat','blur','pagehide','modal-reset','pointercancel']){
  const f=fixture('shieldPush'),c=f.controller;f.attackButton.emit('pointerdown',{button:0,pointerId:7,pointerType:reason==='mouse-compat'?'mouse':'touch'});for(let i=0;i<16;i++)f.step(1000/30);assert.equal(c.queuedAttack,'judgment');
  if(reason==='blur'||reason==='pagehide')window.emit(reason);else if(reason==='modal-reset')f.input.reset();else if(reason==='pointercancel')f.attackButton.emit('pointercancel',{pointerId:7});else document.emit('contextmenu',{target:reason==='other-ui'?f.root:f.label,cancelable:reason!=='unpreventable',pointerType:reason==='mouse-menu'?'mouse':reason==='mouse-compat'?undefined:'touch'});
  assert.equal(c.queuedAttack,null,reason);assert.equal(c.held,false);for(let i=0;i<150;i++)f.step(1000/30);assert.equal(c.serial,1);f.input.dispose();
 }
});
test('suppressed HUD menu does not release an independent movement or camera touch',()=>{
 const f=fixture('shieldPush');f.canvas.emit('pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:700});f.canvas.emit('pointermove',{pointerId:1,pointerType:'touch',clientX:140,clientY:660});f.canvas.emit('pointerdown',{pointerId:2,pointerType:'touch',clientX:700,clientY:200});
 const movement=f.input.value();f.attackButton.emit('pointerdown',{button:0,pointerId:7,pointerType:'touch'});for(let i=0;i<16;i++)f.step(1000/30);
 document.emit('contextmenu',{target:f.label,pointerType:'touch',button:2});assert.deepEqual(f.input.value(),movement);assert.equal(f.input.joystickPointer,1);assert.equal(f.input.cameraPointers.has(2),true);assert.equal(f.controller.queuedAttack,'judgment');f.input.dispose();
});
test('a compatibility mouse menu cannot be mistaken for touch when both devices hold the sword',()=>{
 for(const pointerType of ['touch',undefined]){
  const f=fixture('shieldPush');f.attackButton.emit('pointerdown',{button:0,pointerId:7,pointerType:'touch'});f.attackButton.emit('pointerdown',{button:0,pointerId:8,pointerType:'mouse'});for(let i=0;i<16;i++)f.step(1000/30);
  document.emit('contextmenu',{target:f.label,pointerType,button:2});assert.equal(f.controller.queuedAttack,pointerType==='touch'?'judgment':null);f.input.dispose();
 }
});
test('real sword HUD queues one heavy and spends stamina only at execution',()=>{
 for(const sufficient of [true,false]){
  const f=fixture('shieldPush'),c=f.controller;assert.equal(c.stamina,80);if(!sufficient)c.stamina=29;
  f.attackButton.emit('pointerdown',{button:0,pointerId:7,pointerType:'touch'});for(let i=0;i<16;i++)f.step(1000/30);
  assert.equal(c.queuedAttack,'judgment');assert.equal(c.stamina,sufficient?80:29);
  f.attackButton.emit('pointerup',{pointerId:7,pointerType:'touch'});
  for(let i=0;i<100&&c.action?.state==='shieldPush';i++)f.step(1000/30);
  assert.equal(c.serial,sufficient?2:1);assert.equal(c.staminaRejectSerial,sufficient?0:1);
  if(sufficient){assert.equal(c.action?.state,'judgment');assert.equal(c.stamina,50);}else assert.equal(c.queuedAttack,null);
  for(let i=0;i<120;i++)f.step(1000/30);assert.equal(c.serial,sufficient?2:1);f.input.dispose();
 }
});

test('actual held sword HUD rejection displays one exact message and one independent flash without repeated charges',t=>{
 const f=fixture('shieldPush'),c=f.controller,engine=new NullEngine(),scene=new Scene(engine),mesh=MeshBuilder.CreateBox('player',{},scene),material=new PBRMaterial('player-material',scene);mesh.material=material;t.after(()=>{f.input.dispose();scene.dispose();engine.dispose();});
 let now=0;const feedback=new StaminaFailureFeedback({now:()=>now}),reaction=new PlayerHitReaction(),messages=[],sounds=[],boss={playerReaction:reaction},container={meshes:[mesh]};
 const update=new Function('controller','staminaFeedback','toast','audio','applyPlayerFlash','container','boss',feedbackSource+';return updateButtons;')(c,feedback,message=>messages.push(message),{play:s=>sounds.push(s)},applyPlayerFlash,container,boss);
 c.stamina=29;update();f.attackButton.emit('pointerdown',{button:0,pointerId:7,pointerType:'touch'});
 for(let i=0;i<110;i++){now+=1000/30;f.step(1000/30);feedback.advance(1/30);applyPlayerFlash(container.meshes,reaction,feedback);update();if(messages.length)break;}
 assert.equal(c.staminaRejectSerial,1);assert.equal(c.serial,1);assert.deepEqual(messages,['스테미나가 부족합니다.']);assert.deepEqual(sounds,['ui_error']);assert.equal(mesh.renderOverlay,true);assert.strictEqual(mesh.material,material);
 for(let i=0;i<120;i++){now+=1000/30;f.step(1000/30);feedback.advance(1/30);applyPlayerFlash(container.meshes,reaction,feedback);update();}
 assert.equal(c.staminaRejectSerial,1);assert.equal(c.serial,1);assert.equal(messages.length,1);assert.equal(mesh.renderOverlay,false);assert.strictEqual(mesh.material,material);
});

test('failure feedback coalesces rapid attempts and never mutates the active damage reaction',t=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=MeshBuilder.CreateBox('player',{},scene),material=new PBRMaterial('player-material',scene);mesh.material=material;t.after(()=>{scene.dispose();engine.dispose();});
 let now=0,writes=0;const c=new WarriorV2Controller({durations}),feedback=new StaminaFailureFeedback({now:()=>now}),reaction=new PlayerHitReaction(),sounds=[],container={meshes:[mesh]},boss={playerReaction:reaction};
 const {document:doc}=parseHTML('<div id="root"><div id="toast" hidden></div></div>'),node=doc.getElementById('toast'),proxy=new Proxy(node,{set(target,key,value){if(key==='textContent')writes++;return Reflect.set(target,key,value);}});
 const toast=new Function('$','setTimeout','clearTimeout','staminaNoticeAnchor','let toastTimer;'+toastSource+';return toast;')(()=>proxy,()=>1,()=>{});
 const update=new Function('controller','staminaFeedback','toast','audio','applyPlayerFlash','container','boss',feedbackSource+';return updateButtons;')(c,feedback,toast,{play:s=>sounds.push(s)},applyPlayerFlash,container,boss);
 update();reaction.start(new Vector3(1,0,0),{flashDuration:.4});reaction.flashRemaining=.1;const before={remaining:reaction.remaining,flashRemaining:reaction.flashRemaining,direction:reaction.direction.clone()};
 c.stamina=0;assert.equal(c.dodge(),false);update();assert.equal(mesh.renderOverlay,true);assert.equal(mesh.overlayAlpha,.72);assert.equal(reaction.remaining,before.remaining);assert.equal(reaction.flashRemaining,before.flashRemaining);assert.ok(reaction.direction.equals(before.direction));
 for(let i=0;i<20;i++){now+=20;c.dodge();update();}assert.equal(writes,1);assert.equal(node.textContent,'스테미나가 부족합니다.');assert.equal(doc.getElementById('root').children.length,1);assert.equal(sounds.length,1);assert.equal(c.serial,0);
 feedback.advance(.2);applyPlayerFlash(container.meshes,reaction,feedback);assert.ok(Math.abs(mesh.overlayAlpha-.18)<1e-10,'existing hit flash remains after the resource flash ends');
 now=700;c.dodge();update();assert.equal(writes,2);assert.equal(node.textContent,'스테미나가 부족합니다.');assert.equal(doc.getElementById('root').children.length,1);assert.strictEqual(mesh.material,material);assert.equal(scene.materials.length,1);
});
