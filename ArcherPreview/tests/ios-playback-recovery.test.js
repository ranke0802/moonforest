import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,TransformNode,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {CharacterAnimator} from '../src/animation.js';
import {WarriorV2Controller,V2_LABELS} from '../src/warrior-v2.js';
import {FrameLoop} from '../src/frame-loop.js';
import {RenderActivity} from '../src/render-policy.js';
import {createLoadingView} from '../src/loading-view.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const block=(start,end)=>main.slice(main.indexOf(start)+start.length,main.indexOf(end,main.indexOf(start))).trim().replace(/;$/,'');
const syncSource=block('const syncPlayback=','\n  const dialogObserver');
const restoreSource=block('const restorePlayback=','\n  window.addEventListener(\'pageshow\'');
const wakeSource=block('const wakeRendering=','\n  for(const event');
const renderSource=main.slice(main.indexOf('function render(dt)'),main.indexOf('\nfunction bindMapPortal'));
function evaluate(source,env){return Function('env','with(env){return ('+source+');}')(env);}
function playback(){
 let wall=0;const queued=new Set(),engine={runRenderLoop:fn=>queued.add(fn),stopRenderLoop:fn=>queued.delete(fn),getFps:()=>30,getRenderWidth:()=>780,getRenderHeight:()=>1688},nodes=Object.fromEntries(['help-dialog','summon-dialog','boss-pattern-dialog','character-style-dialog'].map(id=>[id,{open:false}]));
 const state={document:{hidden:false},mapDeparture:{departing:false},mapTransition:{busy:false},motionSpeedControls:{isOpen:()=>false},deathScreen:{isOpen:()=>false},$:s=>nodes[s.slice(1)],input:{reset(){}},cancelAttackInput(){},text(){},frameDiagnostics:{suspend(){}},audio:{setSuspended(v){this.suspended=v;}},engine,renderActivity:new RenderActivity(true,()=>wall),qualityMode:'high'};
 const loop=state.frameLoop=new FrameLoop(engine,()=>{},()=>wall);state.syncPlayback=evaluate(syncSource,state);state.reconcilePlayback=state.syncPlayback;
 return {state,loop,queued,nodes,wake:evaluate(wakeSource,state),restore:evaluate(restoreSource,state),time:t=>wall=t,tick:t=>{wall=t;for(const fn of [...queued])fn();}};
}

test('iOS suspended startup, pageshow and touch recover one simulation loop without advancing hidden/modal/dead games',()=>{
 const f=playback();let simulation=0;f.loop.draw=dt=>simulation+=dt;
 f.state.document.hidden=true;f.state.syncPlayback();assert.equal(f.queued.size,0);
 // Loading completes after the earlier visibility event, but no pageshow follows.
 f.state.document.hidden=false;f.wake();assert.equal(f.loop.running,true);f.tick(5000);assert.equal(simulation,0);f.tick(5033);assert.ok(simulation>0);
 // Model WebKit dropping its RAF registration while our flag still says running.
 f.queued.clear();f.time(7000);f.wake();assert.equal(f.queued.size,1);const before=simulation;f.tick(7010);assert.equal(simulation,before);f.tick(7043);assert.ok(simulation>before);
 for(let n=0;n<12;n++)f.restore();assert.equal(f.queued.size,1,'focus/pageshow never duplicate callbacks');
 for(const paused of ['modal','death','hidden','failure']){
  f.nodes['help-dialog'].open=paused==='modal';f.state.deathScreen.isOpen=()=>paused==='death';f.state.document.hidden=paused==='hidden';f.loop.failed=paused==='failure';
  f.restore();f.time(20000);f.wake();assert.equal(f.queued.size,0,paused);const at=simulation;f.tick(20033);assert.equal(simulation,at,paused);
 }
});

test('reveal followed by a startup/frame failure restores the curtain and actionable error instead of a frozen scene',()=>{
 const {document}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),view=createLoadingView(document);
 view.begin();view.reveal();assert.equal(document.getElementById('loading').hidden,true);
 view.fail('게임 실행이 중단되었습니다','source failure');assert.equal(document.documentElement.dataset.loading,'true');assert.equal(document.getElementById('loading').hidden,false);assert.equal(document.getElementById('retry-load').hidden,false);assert.equal(document.getElementById('loading-text').textContent,'source failure');
 view.begin();assert.equal(document.getElementById('loading').classList.contains('error'),false);view.reveal();
});

test('actual 8K iOS player is posed before reveal and moves through the real render callback after a suspended startup',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;t.after(()=>{scene.dispose();engine.dispose();});
 const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('warrior-v3-ios.json',base))),packed=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(packed.gltf);
 assert.equal(config.textureProfile.maxSize,8192);
 for(const name of ['extensionsUsed','extensionsRequired'])gltf[name]=(gltf[name]??[]).filter(n=>n!=='EXT_meshopt_compression');
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+packed.files.get(b.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json:gltf},'');asset.addAllToScene();t.after(()=>loader.dispose());
 const actor=new TransformNode('actual-ios-player',scene);actor.scaling.setAll(config.scale);for(const n of new Set([...asset.meshes,...asset.transformNodes]))if(!n.parent)n.parent=actor;
 const animator=new CharacterAnimator(asset.animationGroups,config.animations),controller=new WarriorV2Controller({durations:animator.durations,speeds:config.speeds});t.after(()=>animator.dispose());
 const rest=asset.transformNodes.map(n=>n.rotationQuaternion?.clone());
 const prime=block("    animator.transition('idle', { clipTime: 0, loop: true });", "    $('#sword-select')");
 Function('animator',"animator.transition('idle',{clipTime:0,loop:true});"+prime)(animator);scene._animate(0);
 const posed=asset.transformNodes.filter((n,i)=>rest[i]&&n.rotationQuaternion&&!rest[i].equalsWithEpsilon(n.rotationQuaternion,1e-5)).length;assert.ok(posed>10,'real idle is sampled without waiting for RAF');
 const {document}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),camera=new ArcRotateCamera('ios-camera',1.2,1.18,17,Vector3.Zero(),scene);
 let movement={x:0,y:0},hudFrames=0;const f=playback(),noop=()=>{},world={scene,camera,tick:noop,terrain:{place:p=>{p.y=0;}},lighting:{follow:noop}};
 // CPU simulation uses the real app callback and model; no WebGL/phone GPU claim.
 scene.render=()=>{scene._animate(0);camera.getViewMatrix(true);scene.updateTransformMatrix(true);};
 const env={...f.state,Vector3,character:'warrior-v3',ready:true,simulateFrame:false,elapsed:0,statusTime:0,world,actor,container:asset,config,animator,controller,elenaReview:null,qualityMode:'high',input:{value:()=>movement,cameraPointers:new Map()},isV2:()=>true,isWarrior:()=>true,isVillage:()=>true,
 boss:{playerReaction:{update:()=>0},active:false,playerAlive:true,combatCount:0,loading:false,grab:{active:false},encounters:[],update:noop},applyHitFlash:noop,constrainPlayerPosition:noop,attackSources:new Set(),shotActionId:null,shotTarget:null,hiddenArrowForAction:null,arrowMesh:null,
 training:{update:noop,setSelected:noop},projectiles:{update:noop},actionAudio:{player:noop,boss:noop},goldLoot:{drops:[],update:()=>[]},goldLootView:{sync:noop,project:noop},damageNumbers:{update:noop},syncCameraFocus:noop,syncCaveFog:noop,faceHeading:noop,updateButtons:noop,mapPortal:null,screenProjection:{beginFrame:noop},updateHealthBars:()=>hudFrames++,V2_LABELS,combatResult:null,frameDiagnostics:{mark:()=>0,measure:noop},
 $:s=>document.querySelector(s),text:noop};
 const render=evaluate(renderSource,env);f.loop.draw=render;f.state.document.hidden=true;f.state.syncPlayback();
 render(0);assert.equal(hudFrames,1,'the first HUD is valid even when RAF is suspended');
 f.state.document.hidden=false;f.wake();f.tick(1000);movement={x:0,y:1};const start=actor.position.clone();for(let i=1;i<=60;i++)f.tick(1000+i*1000/30);
 assert.ok(Vector3.Distance(start,actor.position)>3,'real controller and render move the player after recovery');assert.equal(animator.current,'run');assert.ok(animator.active.get('run').clipTime>0);assert.ok(hudFrames>60);
 t.diagnostic(JSON.stringify({scope:'CPU player/render lifecycle; no browser automation or physical GPU test',posedBones:posed,travelMetres:Vector3.Distance(start,actor.position),frames:hudFrames}));
});

test('the actual game frame guard exposes one failure, stops work, and requires an explicit reload',t=>{
 const f=playback(),{document}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),loadingView=createLoadingView(document),noop=()=>{};
 loadingView.reveal();t.mock.method(console,'error',noop);
 const start=main.indexOf('  frameLoop=new FrameLoop(engine,dt=>{'),end=main.indexOf('\n  const syncPlayback',start),source=main.slice(start+'  frameLoop='.length,end).trim().replace(/;$/,'');
 const env={...f.state,FrameLoop,loadingView,loadDiagnostics:{finish:noop},ready:true,loadingAsset:false,frameFailure:null,world:{},input:{reset:noop},cancelAttackInput:noop,updateButtons:noop,frameDiagnostics:{beginFrame:noop,endFrame:noop,suspend:noop},render(){throw Error('test frame failure');}};
 env.frameLoop=evaluate(source,env);env.frameLoop.setPaused(false);for(const cb of [...f.queued])cb();
 assert.equal(env.ready,false);assert.equal(env.frameLoop.failed,true);assert.equal(f.queued.size,0);assert.equal(env.frameFailure.message,'test frame failure');assert.equal(document.getElementById('loading').hidden,false);assert.match(document.getElementById('loading-text').textContent,/test frame failure/);
 evaluate(syncSource,env)();assert.equal(f.queued.size,0,'ordinary touches never auto-retry a failed frame');
});
