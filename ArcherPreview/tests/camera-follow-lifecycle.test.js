import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,TransformNode,Vector3} from '@babylonjs/core';
import {CameraFollow,setupCameraFollowControls,STABLE_PLAYER_FOCUS_HEIGHT} from '../src/camera-follow.js';
import {CameraPitch,setupCameraPitchControls} from '../src/camera-pitch.js';
import {CameraZoom,setupCameraZoomControls} from '../src/camera-zoom.js';
import {setupSettingsPanel} from '../src/settings-panel.js';
import {setupDeathScreen} from '../src/death-screen.js';
import {CharacterController} from '../src/controller.js';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {createMapTransition,carryPortalPose} from '../src/map-transition.js';
import {isWorldCharacter,worldSpawn} from '../src/map-route.js';
import {VILLAGE_SPAWN} from '../src/village-layout.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,`main callback not found: ${start}`);return source.slice(a,b);}
const resetSource=between('function resetCamera()','async function loadCharacter()');
const restartSource=between('function resetBeforeBoss()','function setAttackHeld(');
const focusSource=between('function syncCameraFocus(','function render(dt)');
const actionSource=between('const actions = {','\nfunction startDefense');
const mapSource=between('mapTransition=createMapTransition({','\n  bindMapPortal();').replaceAll('import.meta.env.BASE_URL',"'/'");
const bootSource=between('  cameraFollow=new CameraFollow(','  world.villageOverview=');
const deathSource=source.split('\n').find(line=>line.startsWith('const deathScreen=setupDeathScreen('));
assert.ok(deathSource);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const saved=()=>{const values=new Map(),writes=[];return {writes,getItem:key=>values.get(key),setItem(key,value){values.set(key,value);writes.push({key,value});}};};
const noop=()=>{};
const results=[];

// main creates WebGL at module load. Evaluate its real boot/action/transition/
// restart callbacks together, replacing only network, audio and UI boundaries.
// The camera, world-map replacement, preference class, DOM events, controller,
// death dialog and transition ordering below are their production modules.
function fixture(t,{storage=saved(),character='warrior-v3'}={}){
 const dom=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),doc=dom.document,priorDocument=globalThis.document;globalThis.document=doc;
 t.after(()=>{globalThis.document=priorDocument;});setupSettingsPanel();doc.hidden=false;
 // Other panels are dynamically created by their own modules; only their
 // open/closed DOM boundary participates in the production map callback.
 for(const id of ['summon-dialog','boss-pattern-dialog','character-style-dialog'])if(!doc.getElementById(id)){const dialog=doc.createElement('dialog');dialog.id=id;doc.body.append(dialog);}
 for(const dialog of doc.querySelectorAll('dialog')){
  dialog.showModal=function(){this.open=true;this.setAttribute('open','');};dialog.close=function(){this.open=false;this.removeAttribute('open');};
 }
 doc.querySelector('#death-restart').focus=noop;
 const engine=new NullEngine(),trainingScene=character==='archer'?new Scene(engine):null;
 const world=trainingScene?{scene:trainingScene,camera:new ArcRotateCamera('training-camera',1,1.18,4.8,Vector3.Zero(),trainingScene),terrain:{place:p=>{p.y=0;}},sky:{}}:createWorld(engine,{village:true,warrior:true,touchDevice:true});
 const actor=new TransformNode('lifecycle-player',world.scene),head=new TransformNode('lifecycle-animated-head',world.scene);head.parent=actor;head.position.y=1.6;
 // The map callback's screen-ready draws are a GPU/asset boundary here. Keep
 // actual camera matrices without asking NullEngine to draw unready scenery.
 world.scene.render=()=>{world.camera.getViewMatrix(true);world.camera.getProjectionMatrix(true);world.scene.updateTransformMatrix(true);};
 t.after(()=>engine.dispose());world.villageStreaming={active:true};world.sky.load=async()=>{};world.releaseEnvironment=async()=>{};
 const controller=character==='archer'?new CharacterController():new WarriorV2Controller({durations:{idle:2,run:1,slash:1,attack:1,judgment:2,shieldPush:1,dodge:2}});
 const pitch=new CameraPitch(world.camera,{warrior:character!=='archer'}),zoom=new CameraZoom(world.camera),pitchControls=setupCameraPitchControls(pitch,{doc});
 const counters={constructors:0,revivals:0,restarts:0,mapReleases:0,mapLoads:0,inputResets:0,invalidations:0,renderPauses:0};
 const location={href:'https://example.test/?character='+character,search:'?character='+character},history={replaceState(_state,_title,url){location.href=String(url);location.search=new URL(location.href).search;}};
 class TrackedCameraFollow extends CameraFollow{constructor(options){super(options);counters.constructors++;}}
 const input={panOffset:{x:0,y:0,z:0},reset(){counters.inputResets++;}},audio={stopAll:noop,setEnvironment:noop,setSuspended:noop,play:noop};
 const boss={allPooled:[],hide:noop,nearestTarget:()=>null,resetBattle(){counters.restarts++;},activateResident:async()=>true};
 const originalRevive=controller.revive?.bind(controller);if(originalRevive)controller.revive=()=>{counters.revivals++;return originalRevive();};
 const boundary={CameraFollow:TrackedCameraFollow,setupCameraFollowControls,setupCameraZoomControls,setupCameraPitchControls,setupDeathScreen,Vector3,world,actor,playerHead:head,controller,cameraPitch:pitch,cameraZoom:zoom,cameraPitchControls:pitchControls,equipmentStorage:storage,input,boss,
  initialCharacter:character,isWorldCharacter,worldSpawn,VILLAGE_SPAWN,replaceWorldMap,carryPortalPose,
  createMapTransition:options=>createMapTransition({...options,frame:async()=>{}}),
  audio,actionAudio:{reset:noop},updateButtons:noop,toast:noop,canvas:{focus:noop},config:{forwardYaw:0},container:{meshes:[]},applyHitFlash:noop,
  goldLoot:{clearDrops:noop},goldLootView:{clear:noop},strikeSampler:{reset:noop},projectiles:{clear:noop},training:{setSelected:noop,relocate:noop},
  frameDiagnostics:{mapChanged:noop,suspend:noop,refresh:noop},loadDiagnostics:{begin:noop,phase:noop,download:noop,stream:noop,finish:noop},loadingView:{begin:noop,preparing:noop,download:noop,stream:noop,reveal:noop},
  frameLoop:{setPaused(){counters.renderPauses++;},invalidate(){counters.invalidations++;}},renderActivity:{wake:noop},animator:{transition:noop,update:noop},cancelAttackInput:noop,
  prepareMapResources:async()=>{},loadVillage:async w=>{counters.mapLoads++;w.environment={};},waitForSceneReady:async()=>{},prepareElenaReview:async()=>{},bindMapPortal:noop,applyRenderQuality:noop,
  motionSpeedControls:{isOpen:()=>false},requestAnimationFrame:callback=>callback(),document:doc,location,history,innerWidth:852,console,
  $:selector=>doc.querySelector(selector),syncCaveFog:()=>{},loading:{classList:{add:noop}},counters};
 const runtime=Function(...Object.keys(boundary),`
  let character=initialCharacter,ready=true,loadingAsset=false,cameraFollow,mapTransition;
  let combatResult=null,shotActionId=null,elenaReview=null,mapPortal=null;const attackSources=new Set(),mapDeparture=null;
  const villageOverview=false,villageHorizon=false;
  const isWarrior=()=>character!=='archer',isV2=()=>character==='warrior-v2'||isWorldCharacter(character),isVillage=()=>isWorldCharacter(character),isCave=()=>character==='warrior-v5',isForest=()=>character==='warrior-v4';
  const mapSpawn=()=>worldSpawn(character,location.search,VILLAGE_SPAWN);
  ${resetSource}\n${restartSource}\n${focusSource}\n${actionSource}\n${deathSource}\n${bootSource}\n${mapSource}
  return {actions,resetCamera,resetBeforeBoss,syncCameraFocus,deathScreen,
   get follow(){return cameraFollow;},get transition(){return mapTransition;},get character(){return character;},get ready(){return ready;},
   setReady(value){ready=value;},setHeadHeight(value){playerHead.position.y=value;},setControllerDeath(){controller.dead=true;}};
 `)(...Object.values(boundary));
 return {dom,doc,engine,world,actor,head,controller,input,storage,counters,runtime,checkbox:doc.getElementById('camera-follow-motion')};
}

function assertChoice(f,mode,instance,writes){
 assert.strictEqual(f.runtime.follow,instance,'main callbacks retain the original preference instance');
 assert.equal(f.runtime.follow.settings.followMotion,mode);assert.equal(f.checkbox.checked,mode);
 assert.equal(f.counters.constructors,1,'map/restart does not reconstruct CameraFollow');assert.equal(f.storage.writes.length,writes,'lifecycle cannot overwrite the saved checkbox');
 f.runtime.syncCameraFocus(0,{snap:true});const c=f.world.camera;c.getViewMatrix(true);
 near(c.target.y,f.actor.position.y+(mode?1.57:STABLE_PLAYER_FOCUS_HEIGHT));
}

for(const mode of [false,true])test(`actual main portal callbacks and death dialog restart retain followMotion=${mode} across repeated trips`,async t=>{
 const f=fixture(t),initial=f.runtime.follow;assert.equal(f.checkbox.checked,false);
 if(mode){f.checkbox.checked=true;f.checkbox.dispatchEvent(new f.dom.window.Event('change'));}
 const writes=f.storage.writes.length;assertChoice(f,mode,initial,writes);
 const sequence=['warrior-v4','warrior-v5','warrior-v4','warrior-v3'];let travels=0,restarts=0;
 for(let cycle=0;cycle<3;cycle++)for(const destination of sequence){
  const beforeAngle=f.world.camera.alpha+f.actor.rotation.y;
  assert.equal(await f.runtime.transition.travel(`https://example.test/?character=${destination}&arrival=portal`),true);travels++;
  assert.equal(f.runtime.character,destination);assert.equal(f.runtime.ready,true);near(Math.sin(f.world.camera.alpha+f.actor.rotation.y),Math.sin(beforeAngle));assertChoice(f,mode,initial,writes);
  f.world.camera.radius=9;f.world.camera.beta=1.2;f.input.panOffset={x:2,y:.4,z:-1};f.actor.position.x+=3;f.controller.captured=true;f.controller.staggerRemaining=2;
  f.doc.querySelector('#motion-speed-dialog').showModal();f.runtime.deathScreen.show();assert.equal(f.runtime.deathScreen.isOpen(),true);assert.equal(f.doc.querySelector('#motion-speed-dialog').open,false);
  f.doc.querySelector('#death-restart').dispatchEvent(new f.dom.window.Event('click'));await Promise.resolve();restarts++;
  assert.equal(f.runtime.deathScreen.isOpen(),false);assert.equal(f.controller.captured,false);assert.equal(f.controller.staggerRemaining,0);assert.deepEqual(f.input.panOffset,{x:0,y:0,z:0});assertChoice(f,mode,initial,writes);
 }
 const second=fixture(t,{storage:f.storage});assert.equal(second.checkbox.checked,mode,'actual boot/UI restores preference after a fresh application instance');assert.equal(second.runtime.follow.settings.followMotion,mode);
 assert.equal(second.storage.writes.length,writes,'boot restores without rewriting storage');
 results.push({followMotion:mode,actualPortalTravels:travels,deathDialogRestarts:restarts,preferenceConstructions:f.counters.constructors,preferenceWritesDuringLifecycle:0,freshBootRestored:true});
});

for(const mode of [false,true])test(`actual main actions.revive and resetCamera preserve followMotion=${mode} on the generic character path`,t=>{
 const f=fixture(t,{character:'archer'}),initial=f.runtime.follow;
 if(mode){f.checkbox.checked=true;f.checkbox.dispatchEvent(new f.dom.window.Event('change'));}
 const writes=f.storage.writes.length;
 for(let repeat=0;repeat<4;repeat++){
  f.controller.die();assert.equal(f.controller.dead,true);f.runtime.actions.revive();assert.equal(f.controller.dead,false);assert.equal(f.controller.state,'idle');
  f.runtime.resetCamera();assertChoice(f,mode,initial,writes);
 }
 assert.equal(f.counters.revivals,4);results.push({followMotion:mode,actualReviveActions:4,explicitCameraResets:4,preferenceWritesDuringLifecycle:0});
});

test.after(()=>{
 const path=new URL('../reports/elena-repeat-ios/',import.meta.url);mkdirSync(path,{recursive:true});
 writeFileSync(new URL('camera-validation.json',path),JSON.stringify({baseline:'d1ad05b',mainSourceSha256:createHash('sha256').update(source).digest('hex'),scope:'Actual main.js camera boot, settings callback, map transition callbacks, actions.revive, resetCamera, resetBeforeBoss and death-screen DOM lifecycle. Real Babylon NullEngine world/camera; I/O/audio/asset and screen draw boundaries injected.',expectedCases:4,completedCases:results.length,success:results.length===4,results,browserAutomation:false,physicalDeviceTested:false,limitations:'CPU/DOM lifecycle validation only. Not a rendered iPhone/S23 session or GPU/thermal measurement. Archer revive and warrior boss-death restart are separate production paths.'},null,2)+'\n');
});
