import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseHTML} from 'linkedom';
import {actualMapFixture,sha} from './phase3-verification-fixtures.mjs';
import {acquireGameToolLease} from '../../src/game-tool-lease.js';

// This probe starts with canvas.dispatchEvent. Neither Scene simulation APIs,
// direct observable notification nor replaced picking functions are used.
const sourceFiles=['src/world.js','src/game-tool-lease.js','src/tool-camera-input.js'];
const sourceHashes=Object.fromEntries(sourceFiles.map(name=>[name,sha(readFileSync(new URL('../../'+name,import.meta.url)))]));
const baselineCommit='da44cea24a513134499d54c3239b27db2ce3b62e';
const baselineSource=execFileSync('git',['show',baselineCommit+':ArcherPreview/src/game-tool-lease.js'],{encoding:'utf8'});
const absoluteInput=new URL('../../src/tool-camera-input.js',import.meta.url).href;
const {acquireGameToolLease:baselineAcquire}=await import('data:text/javascript;base64,'+Buffer.from(baselineSource.replace("'./tool-camera-input.js'",JSON.stringify(absoluteInput))).toString('base64'));
const cases=[],settle=()=>new Promise(resolve=>setImmediate(resolve));

async function run(label,acquire){
 const {window,document}=parseHTML('<html><body><main id="app"><canvas tabindex="0"></canvas><aside>HUD</aside></main></body></html>'),root=document.querySelector('#app'),canvas=root.querySelector('canvas'),saved=new Map();
 class Pointer extends window.Event{constructor(type,options={}){super(type,{bubbles:true,cancelable:true});Object.assign(this,{button:type==='pointermove'?-1:0,buttons:type==='pointerup'?0:1,pointerId:1,pointerType:'mouse',clientX:0,clientY:0,altKey:false,ctrlKey:false,shiftKey:false,metaKey:false,...options});}}
 for(const [key,value]of Object.entries({window,document,navigator:{userAgent:'Chrome independent canvas-input fixture',platform:'Win32',maxTouchPoints:4},PointerEvent:Pointer,MouseEvent:Pointer,matchMedia:()=>({matches:false})})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 window.PointerEvent=Pointer;window.MouseEvent=Pointer;window.matchMedia=globalThis.matchMedia;
 let focused=null;canvas.focus=()=>focused=canvas;Object.defineProperty(document,'activeElement',{configurable:true,get:()=>focused});
 const rect={left:47,top:31,width:640,height:360,right:687,bottom:391},captures=new Set();canvas.getBoundingClientRect=()=>rect;canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);
 let f,lease;try{
  f=actualMapFixture();const {engine,scene,world}=f,camera=world.camera;engine._renderingCanvas=canvas;engine.getInputElement=()=>canvas;engine.getInputElementClientRect=()=>rect;engine.getRenderingCanvasClientRect=()=>rect;engine.getHostWindow=()=>window;engine.getHardwareScalingLevel=()=>.5;
  assert.equal(scene._inputManager._alreadyAttached,false,'actual createWorld disconnects gameplay DOM input');assert.deepEqual([scene.skipPointerDownPicking,scene.skipPointerMovePicking,scene.skipPointerUpPicking],[true,true,true]);
  const traffic=[];scene.onPrePointerObservable.add(info=>traffic.push({type:info.type,event:info.event.type,x:info.localPosition.x,y:info.localPosition.y}));let domEvents=0;for(const type of ['pointerdown','pointermove','pointerup'])canvas.addEventListener(type,()=>domEvents++);
  const state={ready:true,loading:false,dead:false,hidden:false,settings:false,failed:false},input={suspended:false,setSuspended(value){this.suspended=value;}},audio={suspended:false,voices:new Set(),beds:{desired:{},request(){}},stopAll(){},setSuspended(value){this.suspended=value;}};
  const initial={alpha:camera.alpha,beta:camera.beta,radius:camera.radius,target:camera.getTarget().asArray()};lease=acquire({world,root,canvas,input,audio,getState:()=>state,setReady:value=>state.ready=value,resetInput(){},reconcile(){}},{freeCamera:true,hideHud:true,owner:'independent-dom-probe'});
  const attachedDuring=scene._inputManager._alreadyAttached,dispatch=(type,x,y,extra={})=>canvas.dispatchEvent(new Pointer(type,{clientX:rect.left+x,clientY:rect.top+y,...extra})),frame=()=>{camera.update();camera.getViewMatrix(true);camera.getProjectionMatrix(true);};
  frame();dispatch('pointerdown',350,180);dispatch('pointermove',425,210);dispatch('pointerup',425,210);await settle();frame();const afterOrbit={alpha:camera.alpha,beta:camera.beta};
  // Clear orbit inertia before separately measuring native right-drag panning.
  camera.inertialAlphaOffset=camera.inertialBetaOffset=0;const beforePan=camera.getTarget().asArray();dispatch('pointerdown',350,180,{button:2,buttons:2});dispatch('pointermove',395,205,{buttons:2});dispatch('pointerup',395,205,{button:2,buttons:0});await settle();frame();const afterPan=camera.getTarget().asArray();
  let leftPanMode=null;if(lease.setCameraMode){camera.inertialPanningX=camera.inertialPanningY=0;lease.setCameraMode('pan');const before=camera.getTarget().asArray(),angles=[camera.alpha,camera.beta];dispatch('pointerdown',350,180);dispatch('pointermove',395,205);dispatch('pointerup',395,205);await settle();frame();leftPanMode={before,after:camera.getTarget().asArray(),anglesBefore:angles,anglesAfter:[camera.alpha,camera.beta],mode:lease.cameraMode};assert.notDeepEqual(leftPanMode.after,before);assert.deepEqual(leftPanMode.anglesAfter,angles);}
  const preBeforeRelease=traffic.length;lease.release('complete');lease=null;const detachedAfter=scene._inputManager._alreadyAttached===false;dispatch('pointerdown',340,180);dispatch('pointermove',390,200);dispatch('pointerup',390,200);await settle();
  const result={label,domEvents,attachedDuring,preEventsDuringLease:preBeforeRelease,preEventsAfterRelease:traffic.length-preBeforeRelease,traffic,initial,afterOrbit,beforePan,afterPan,leftPanMode,orbitMoved:afterOrbit.alpha!==initial.alpha||afterOrbit.beta!==initial.beta,panMoved:JSON.stringify(afterPan)!==JSON.stringify(beforePan),detachedAfter,cameraRestored:camera.alpha===initial.alpha&&camera.beta===initial.beta&&camera.radius===initial.radius&&JSON.stringify(camera.getTarget().asArray())===JSON.stringify(initial.target),nativeSceneInputOwnerReleased:!world.nativeSceneInputOwner,cssRect:rect,renderSize:[engine.getRenderWidth(),engine.getRenderHeight()],hardwareScalingLevel:engine.getHardwareScalingLevel()};
  if(label==='deployed-baseline'){assert.equal(result.domEvents,9);assert.equal(result.preEventsDuringLease,0);assert.equal(result.orbitMoved,false);assert.equal(result.panMoved,false);}else{assert.equal(result.attachedDuring,true);assert.ok(result.preEventsDuringLease>=6);assert.equal(result.orbitMoved,true);assert.equal(result.panMoved,true);assert.equal(result.detachedAfter,true);assert.equal(result.preEventsAfterRelease,0);assert.equal(result.cameraRestored,true);assert.equal(result.nativeSceneInputOwnerReleased,true);assert.ok(traffic.some(row=>row.x===425&&row.y===210),'native input subtracts CSS client rect at DPR2');}
  return {passed:true,...result};
 }finally{lease?.release('fixture-cleanup');f?.dispose();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}
for(const [label,acquire]of [['deployed-baseline',baselineAcquire],['current-source',acquireGameToolLease]]){try{cases.push(await run(label,acquire));}catch(error){cases.push({label,passed:false,error:error.stack});}}
const sourceUnchanged=sourceFiles.every(name=>sourceHashes[name]===sha(readFileSync(new URL('../../'+name,import.meta.url)))),report={generatedAt:new Date().toISOString(),passed:sourceUnchanged&&cases.every(row=>row.passed),baselineCommit,baselineLeaseSha256:sha(baselineSource),sourceHashes,sourceUnchanged,cases,scope:'Independent actual createWorld + canvas DOM event dispatch + Babylon WebDeviceInputSystem/SceneInputManager/native ArcRotateCamera. No direct Observable notifications, Scene.simulatePointer calls or picking replacements. Linkedom supplies DOM events and a declared offset client rect/DPR2; NullEngine does not prove browser layout, trusted event behavior, GPU rendering or end-user usability.'};writeFileSync(new URL('phase3-verification-canvas-delivery.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
