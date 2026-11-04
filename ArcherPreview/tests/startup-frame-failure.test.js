import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {Observable,Vector3} from '@babylonjs/core';
import {FrameLoop} from '../src/frame-loop.js';
import {createLoadingView} from '../src/loading-view.js';
import {LoadDiagnostics} from '../src/load-diagnostics.js';
import {createMapTransition,carryPortalPose} from '../src/map-transition.js';
import {configurePlayerSize,WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {MapLoadLifetime} from '../src/map-load-lifetime.js';
import {applyPlainsViewDistance} from '../src/plains-view-distance.js';
import {setupMinimapTravel} from '../src/minimap-travel.js';
import {travelWaypoint} from '../src/map-waypoints.js';
import {releaseSelectionValue} from '../src/release-route.js';
import {selectPlayerTextureProfile,playerTextureCapabilities} from '../src/player-texture-profile.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const noop=()=>{},results=[];
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,`main callback not found: ${start}`);return source.slice(a,b).replaceAll('import.meta.env.BASE_URL',"'/'");}
function namedFunction(name){
 const marker=`function ${name}(`,at=source.indexOf(marker);assert.ok(at>=0,`main function not found: ${name}`);
 const start=source.slice(at-6,at)==='async '?at-6:at,open=source.indexOf('{',at);let depth=0,quote=null,lineComment=false,blockComment=false;
 for(let i=open;i<source.length;i++){
  const c=source[i],next=source[i+1];
  if(lineComment){if(c==='\n')lineComment=false;continue;}
  if(blockComment){if(c==='*'&&next==='/'){blockComment=false;i++;}continue;}
  if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote=null;continue;}
  if(c==='/'&&next==='/'){lineComment=true;i++;continue;}if(c==='/'&&next==='*'){blockComment=true;i++;continue;}
  if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
  if(c==='{')depth++;else if(c==='}'&&!--depth)return source.slice(start,i+1).replaceAll('import.meta.env.BASE_URL',"'/'");
 }
 assert.fail(`unterminated main function: ${name}`);
}
const loadSource=namedFunction('loadCharacter'),healthSource=namedFunction('assertFrameHealthy'),retryFunctionSource=namedFunction('retryLoading');
const frameSource=between('  frameLoop=new FrameLoop(','\n  const dialogObserver=');
const mapSource=between('  mapTransition=createMapTransition({','\n  bindMapPortal();');
const retrySource=source.split('\n').find(line=>line.includes("$('#retry-load').addEventListener('click', retryLoading)"));assert.ok(retrySource);

async function until(check,message){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setImmediate(resolve));}assert.fail(message);}

// Execute the actual main loader, RAF guard, playback reconciliation and map
// callbacks in one closure. Only asset/network/audio and GPU draw boundaries
// are injected; readiness/RAF promises and retry DOM events retain ordering.
function fixture({caps={maxTextureSize:4096,astc:{}},playerNavigator={userAgent:'Android SM-S911'}}={}){
 const dom=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),doc=dom.document;doc.hidden=false;
 for(const id of ['motion-speed-dialog','help-dialog','summon-dialog','boss-pattern-dialog','character-style-dialog'])if(!doc.getElementById(id)){const dialog=doc.createElement('dialog');dialog.id=id;doc.body.append(dialog);}
 for(const dialog of doc.querySelectorAll('dialog'))dialog.open=false;
 const $=selector=>doc.querySelector(selector),loadingView=createLoadingView(doc),raf=[],engineCallbacks=new Set(),audioStates=[];
 const listeners=new Map();for(const node of [doc,...doc.querySelectorAll('*')]){
  const add=node.addEventListener.bind(node),remove=node.removeEventListener.bind(node),types=new Map();listeners.set(node,types);
  node.addEventListener=(type,callback,...args)=>{if(!types.has(type))types.set(type,new Set());types.get(type).add(callback);return add(type,callback,...args);};
  node.removeEventListener=(type,callback,...args)=>{types.get(type)?.delete(callback);return remove(type,callback,...args);};
 }
 const listenerCount=()=>[...listeners.values()].reduce((n,types)=>n+[...types.values()].reduce((m,set)=>m+set.size,0),0);
 let clockTime=0,timerId=0;const pendingTimers=new Map(),timerClock={now:()=>clockTime,setTimeout:(fn,ms)=>{pendingTimers.set(++timerId,{fn,at:clockTime+ms});return timerId;},clearTimeout:id=>pendingTimers.delete(id),advance(ms){clockTime+=ms;for(const [id,timer]of [...pendingTimers])if(timer.at<=clockTime){pendingTimers.delete(id);timer.fn();}},get size(){return pendingTimers.size;}};
 const owned={actors:new Set(),animators:new Set(),equipment:new Set(),containers:new Set(),lifetimeListeners:new Set(),lateDisposed:0,sceneRenders:0,inputResets:0};
 const engine={getCaps:()=>caps,runRenderLoop:callback=>engineCallbacks.add(callback),stopRenderLoop:callback=>engineCallbacks.delete(callback)},playerManifestUrls=[];
 let now=0;
 const loadDiagnostics=new LoadDiagnostics(()=>++now),gate={stage:null,errorStage:null,errorFactory:null,counts:{},reached:null,release:null,late:null,timeoutStage:null,hold(stage){this.stage=stage;this.reached=null;this.release=null;},clear(){this.stage=null;this.errorStage=null;this.errorFactory=null;this.reached=null;this.release=null;this.timeoutStage=null;},at(stage){
  this.counts[stage]=(this.counts[stage]??0)+1;if(this.errorStage===stage)return Promise.reject(this.errorFactory?.()??Error('injected '+stage+' failure'));
  if(this.timeoutStage===stage){this.timeoutStage=null;this.reached=stage;const lifetime=new MapLoadLifetime({timeoutMs:45000,timers:timerClock,stage:stage==='map-download'?'download':'model'}),signal=lifetime.signal,add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
   signal.addEventListener=(type,fn,...args)=>{owned.lifetimeListeners.add(fn);return add(type,fn,...args);};signal.removeEventListener=(type,fn,...args)=>{owned.lifetimeListeners.delete(fn);return remove(type,fn,...args);};
   return lifetime.run(()=>new Promise(resolve=>{this.late=()=>resolve({dispose(){owned.lateDisposed++;}});}),{onLate:value=>value.dispose()}).finally(()=>lifetime.close());
  }
  if(this.stage!==stage)return Promise.resolve();this.reached=stage;return new Promise(resolve=>{this.release=resolve;});
 }};
 class PlayerNode{constructor(){this.position=Vector3.Zero();this.rotation=Vector3.Zero();this.scaling=Vector3.One();owned.actors.add(this);}dispose(){this.disposed=true;owned.actors.delete(this);}}
 class Animator{constructor(){this.durations={};owned.animators.add(this);}dispose(){owned.animators.delete(this);}transition(){}update(){}}
 class Controller{constructor(){}cancelAttack(){}}
 class Equipment{constructor(_container,choices){this.choices={...choices};owned.equipment.add(this);}dispose(){owned.equipment.delete(this);}}
 const world={cave:true,mapId:'cave',environment:{},scene:{onDisposeObservable:new Observable(),render(){owned.sceneRenders++;}},camera:{alpha:0,beta:1.18,radius:10,setTarget:noop,getViewMatrix:noop,getProjectionMatrix:noop},terrain:{place:noop,heightAt:()=>0},sky:{load:()=>gate.at('sky')},shadows:{addShadowCaster:noop,removeShadowCaster:noop},lighting:{registerMeshes:noop,follow:noop},caveFog:{update:noop},caveCamera:{endFrame:noop},villageStreaming:{active:false},releaseEnvironment:()=>gate.at('release'),cancelResourceDownloads(){gate.cancelledDownloads=(gate.cancelledDownloads??0)+1;}};
 const input={pressed:new Set(),reset(){owned.inputResets++;this.pressed.clear();},panOffset:{x:0,y:0,z:0}};
 const config={model:'player.glb',animations:{},speeds:{},scale:1},location={href:'https://example.test/?character=warrior-v5'},history={replaceState(_state,_title,url){location.href=String(url);}};
 const boss={hide:noop,allPooled:[],combat:{hp:500},potions:{remaining:3},activateResident:async()=>{},playerNodes:{}};
 const hudLayout={visible:false,closes:0,isOpen(){return this.visible;},close(){this.closes++;this.visible=false;}};
 const dependencies={releaseSelectionValue,releaseEnabled:false,FrameLoop,setupMinimapTravel,travelWaypoint,hudLayout,updatePlainsBoundaryAtmosphere:noop,staminaFeedback:{reset:noop,advance:noop},applyPlayerFlash:noop,attackPointerTypes:new Map(),applyPlainsViewDistance,plainsViewDistanceControl:{value:1.2},configurePlayerSize,WARRIOR_DIMENSIONS,createMapTransition:options=>createMapTransition({...options,frame:async()=>{}}),world,engine,boss,loadingView,loadDiagnostics,Vector3,TransformNode:PlayerNode,CharacterAnimator:Animator,WarriorEquipment:Equipment,WarriorV2Controller:Controller,NativeWarriorController:Controller,CharacterController:Controller,
  document:doc,$,loading:$('#loading'),canvas:{focus:noop,setAttribute:noop},location,history,gate,console:{error:noop},
  initializeResourceCache:async()=>{},playerTextureCapabilities,selectPlayerTextureProfile:(character,engineCaps)=>selectPlayerTextureProfile(character,engineCaps,playerNavigator),prepareStartupResources:async(_world,url)=>{playerManifestUrls.push(url.href);return config;},fetch:async()=>({ok:true,json:async()=>config}),migrateCachedGlb:async()=>{},
  loadVillage:()=>gate.at('map-model'),loadVillageTrainingTarget:async()=>{},loadTrainingGround:async()=>{},SceneLoader:{LoadAssetContainerAsync:async()=>{const value={meshes:[],transformNodes:[],animationGroups:[],addAllToScene:noop,dispose(){owned.containers.delete(this);}};owned.containers.add(value);return value;}},
  applyPlayerDetail:noop,applyCharacterSurfaceStyle:noop,attachCharacterOutlines:noop,applyAttackSpeed:noop,readAttackSpeed:()=>1,equipmentChoices:{sword:'violet-silver',shield:'teal-bronze'},
  motionSpeedControls:{apply:noop,setVisible:noop,isOpen:()=>false},deathScreen:{isOpen:()=>false},audio:{stopAll:noop,setEnvironment:noop,setSuspended:value=>audioStates.push(value),play:noop},actionAudio:{reset:noop},
  updateButtons:noop,cancelAttackInput:noop,input,goldLoot:{clearDrops:noop},goldLootView:{clear:noop},strikeSampler:{reset:noop},projectiles:{clear:noop},training:{setSelected:noop,relocate:noop},
  resetCamera:noop,syncCaveFog:noop,prepareElenaReview:()=>gate.at('model'),leaveElenaReview:noop,waitForSceneReady:()=>gate.at('scene'),prepareMapResources:()=>gate.at('map-download'),
  bindMapPortal:noop,carryPortalPose,cameraFollow:{focus:()=>Vector3.Zero()},cameraPitch:{follow:noop,setBodyScale:noop},applyRenderQuality:()=>{if(gate.errorStage==='finish')throw Error('injected finish failure');},
  frameDiagnostics:{beginFrame:noop,endFrame:noop,mapChanged:noop,suspend:noop},text:noop,
  requestAnimationFrame:callback=>{raf.push(callback);return raf.length;},consumeTravel:()=>null,travelStorage:{},equipmentStorage:{},readMapResume:()=>null,restoreMapCamera:noop,saveMapPosition:noop,showMinimap:noop,minimap:{hide:noop},
  replaceWorldMap:(w,destination)=>{w.mapId=destination==='warrior-v5'?'cave':destination==='warrior-v4'?'forest':destination==='warrior-plains'?'great-plains':'village';w.cave=w.mapId==='cave';w.environment={};},
 };
 const runtime=Function(...Object.keys(dependencies),`
  const uiTest=null,uiTestEnabled=false,chapterQuests=null,journeyStorage=equipmentStorage;let character='warrior-v5',ready=false,loadingAsset=false,frameFailure=null,frameLoop,mapTransition=null,mapLoadingGeneration,minimapTravel,resumePose=null;
  let config=null,container=null,actor=null,animator=null,controller=null,equipment=null,maxInfluences=0,playerTextureSelection=null;
  let arrowNode,arrowMesh,reviewFocus,playerHead,shieldNode,swordNode,combatResult=null,shotTarget=null,shotActionId=null,hiddenArrowForAction=null,mapPortal=null;
  const villageReview=null,villageReviewEnabled=false,villageOverview=false,mapDeparture=null,attackSources=new Set(),elapsed=0,qualityMode='high',VertexBuffer={MatricesWeightsExtraKind:'unused'};
  const isWarrior=()=>true,isV2=()=>true,isVillage=()=>true,isForest=()=>character==='warrior-v4',isPlains=()=>character==='warrior-plains',isCave=()=>character==='warrior-v5';
  const mapSpawn=()=>({x:0,y:0,z:0});let reconcilePlayback=()=>{},nextDrawError=null;
  const render=()=>{if(nextDrawError){const error=nextDrawError;nextDrawError=null;throw error;}};
  ${healthSource}\n${loadSource}\n${retryFunctionSource}\n${frameSource}\n${mapSource}\n${retrySource}
  reconcilePlayback=syncPlayback;syncPlayback();
  return {load:loadCharacter,reconcile:syncPlayback,get transition(){return mapTransition;},get frameLoop(){return frameLoop;},get playerTextureSelection(){return playerTextureSelection;},
   injectFailure(){nextDrawError=new TypeError('_uniforms[e] is undefined');frameLoop.draw(.016);},
   playerState(){return {character,actor,equipment,controller,hp:boss.combat.hp,potions:boss.potions.remaining};},
   snapshot(){return {ready,loading:loadingAsset,failed:frameLoop.failed,running:frameLoop.running,frameError:frameFailure?.message??null};}};
 `)(...Object.values(dependencies));
 return {dom,doc,raf,gate,runtime,loadDiagnostics,loadingView,engineCallbacks,audioStates,world,input,boss,hudLayout,owned,timerClock,listenerCount,caps,playerManifestUrls};
}

async function flushFrame(f){await until(()=>f.raf.length>0,'expected a pending presentation RAF');f.raf.shift()();await Promise.resolve();}
async function success(f,{retry=false}={}){
 f.gate.clear();let job;
 if(retry)f.doc.querySelector('#retry-load').dispatchEvent(new f.dom.window.Event('click'));else job=f.runtime.load();
 await flushFrame(f);await flushFrame(f);if(job)await job;else await until(()=>!f.runtime.snapshot().loading&&!f.runtime.transition.busy,'retry did not settle');
 assert.deepEqual(f.runtime.snapshot(),{ready:true,loading:false,failed:false,running:true,frameError:null});
 assert.equal(f.doc.querySelector('#loading').hidden,true);assert.equal(f.doc.documentElement.dataset.loading,undefined);
 assert.equal(f.loadDiagnostics.snapshot().phase,'complete');assert.equal(f.engineCallbacks.size,1,'retry resumes one RAF callback');
}

function assertFailed(f){
 assert.deepEqual(f.runtime.snapshot(),{ready:false,loading:false,failed:true,running:false,frameError:'_uniforms[e] is undefined'});
 assert.equal(f.doc.querySelector('#loading').hidden,false,'runtime failure curtain remains visible');assert.equal(f.doc.documentElement.dataset.loading,'true');
 assert.equal(f.doc.querySelector('#loading').classList.contains('error'),true);assert.equal(f.doc.querySelector('#retry-load').hidden,false);
 assert.match(f.doc.querySelector('#loading-text').textContent,/_uniforms\[e\]/,'original runtime error is preserved');
 assert.equal(f.loadDiagnostics.snapshot().phase,'error','failed startup cannot be recorded as complete');
 assert.match(f.loadDiagnostics.snapshot().error,/_uniforms\[e\]/);assert.equal(f.engineCallbacks.size,0,'failed loop stays stopped');
}

for(const stage of ['model','scene','first-raf','second-raf'])test(`actual main startup failure during ${stage} stays failed; retry DOM starts a successful new generation`,async()=>{
 const f=fixture(),loop=f.runtime.frameLoop;
 if(stage==='model'||stage==='scene')f.gate.hold(stage);
 const job=f.runtime.load();
 if(stage==='model'||stage==='scene')await until(()=>f.gate.reached===stage,`did not reach ${stage}`);
 else {await until(()=>f.raf.length>0,'did not reach presentation RAF');if(stage==='second-raf')await flushFrame(f);}
 f.runtime.injectFailure();
 if(f.gate.release)f.gate.release();else {if(stage==='first-raf')await flushFrame(f);await flushFrame(f);}
 await job;assertFailed(f);const failure=f.runtime.snapshot();await success(f,{retry:true});assert.strictEqual(f.runtime.frameLoop,loop);
 results.push({kind:'startup',stage,failure,retry:f.runtime.snapshot(),retryViaActualDom:true});
});

for(const stage of ['map-download','scene','second-raf'])test(`actual map callbacks preserve a frame failure during ${stage}`,async()=>{
 const f=fixture();await success(f);
 if(stage!=='second-raf')f.gate.hold(stage);
 const job=f.runtime.transition.travel('https://example.test/?character=warrior-v4&arrival=portal');
 if(stage==='second-raf'){await flushFrame(f);await until(()=>f.raf.length>0,'map did not reach final RAF');}
 else await until(()=>f.gate.reached===stage,`map did not reach ${stage}`);
 f.runtime.injectFailure();if(f.gate.release)f.gate.release();else await flushFrame(f);
 assert.equal(await job,false);assertFailed(f);assert.equal(f.runtime.transition.failed,true);
 results.push({kind:'map-transition',stage,failure:f.runtime.snapshot()});
});

for(const stage of ['release','map-download','finish'])test(`actual main ${stage} failure remains paused until explicit reload succeeds; return travel then works`,async()=>{
 const f=fixture();await success(f);f.gate.errorStage=stage;
 const travel=f.runtime.transition.travel('https://example.test/?character=warrior-v4&arrival=portal');
 if(stage==='finish'){await flushFrame(f);await flushFrame(f);}assert.equal(await travel,false);assert.equal(f.runtime.transition.busy,false);assert.equal(f.runtime.transition.failed,true);assert.equal(f.runtime.snapshot().ready,false);assert.equal(f.runtime.frameLoop.running,false);assert.equal(f.doc.querySelector('#loading').hidden,false);assert.equal(f.audioStates.at(-1),true,'finish failure cannot leave newly selected destination music playing');
 // Modal close and foreground return cannot resume a partially replaced map.
 f.doc.hidden=true;f.runtime.reconcile();f.doc.hidden=false;f.runtime.reconcile();assert.equal(f.runtime.frameLoop.running,false);assert.equal(f.engineCallbacks.size,0);assert.equal(f.audioStates.at(-1),true,'foreground/settings reconciliation preserves the audio failure latch');
 assert.equal(await f.runtime.transition.travel('https://example.test/?character=warrior-v5'),false,'failed latch never retries automatically');
 if(stage==='finish'){
  f.gate.clear();f.doc.hidden=true;const retry=f.runtime.load();await flushFrame(f);await flushFrame(f);await retry;assert.equal(f.runtime.snapshot().ready,true);assert.equal(f.runtime.transition.failed,false);assert.equal(f.runtime.frameLoop.running,false,'successful hidden reload stays paused');f.doc.hidden=false;f.runtime.reconcile();assert.equal(f.runtime.frameLoop.running,true);
 }else await success(f,{retry:true});
 assert.equal(f.runtime.transition.failed,false);assert.equal(f.runtime.transition.busy,false);assert.equal(f.audioStates.at(-1),false);
 const back=f.runtime.transition.travel('https://example.test/?character=warrior-v5&arrival=portal');await flushFrame(f);await flushFrame(f);assert.equal(await back,true);assert.equal(f.runtime.frameLoop.running,true);assert.equal(f.doc.querySelector('#loading').hidden,true);
 results.push({kind:'map-explicit-recovery',stage,busyLatchReleased:true,errorLatchUntilSuccessfulReload:true,hiddenReloadPolicy:stage==='finish',returnTravel:true});
});

test('actual loading view keeps the runtime error latched until an explicit new begin',()=>{
 const f=fixture();f.loadingView.begin();f.loadingView.fail('게임 실행이 중단되었습니다','_uniforms[e] is undefined');
 assert.equal(f.loadingView.reveal(),false);assert.equal(f.doc.querySelector('#loading').hidden,false);assert.equal(f.doc.documentElement.dataset.loading,'true');
 f.loadingView.begin();assert.equal(f.doc.querySelector('#loading').classList.contains('error'),false);f.loadingView.reveal();assert.equal(f.doc.querySelector('#loading').hidden,true);
 results.push({kind:'loading-view',errorLatch:true,explicitBeginResetsLatch:true});
});

for(const stage of ['release','map-model','map-download'])test(`actual map ${stage} timeout offers same-destination manual retry without reloading the player`,async()=>{
 const f=fixture();await success(f);const previous=f.runtime.playerState();f.gate.errorStage=stage;
 const code=stage==='map-download'?'MAP_SETUP_TIMEOUT':'MAP_MODEL_TIMEOUT';
 f.gate.errorFactory=()=>Object.assign(Error('맵 준비 시간이 초과되었습니다.'),{name:'TimeoutError',code,timeoutMs:45000});
 const target='https://example.test/?character=warrior-v4&arrival=portal';assert.equal(await f.runtime.transition.travel(target),false);
 assert.match(f.doc.querySelector('#loading-title').textContent,/시간이 초과/);assert.equal(f.doc.querySelector('#retry-load').textContent,'맵 이동 다시 시도');assert.equal(f.doc.querySelector('#retry-load').hidden,false);
 assert.equal(f.runtime.transition.inspect().lastFailure.code,code);assert.equal(f.runtime.transition.inspect().lastFailure.timeoutMs,45000);assert.equal(f.runtime.transition.inspect().retryAvailable,true);
 assert.equal(f.runtime.snapshot().running,false);assert.equal(f.audioStates.at(-1),true);assert.equal(f.doc.querySelector('#loading').hidden,false);
 assert.equal(f.gate.cancelledDownloads,2,'departure cancels old traffic and timeout cancels the failed attempt traffic');
 const counts={...f.gate.counts};for(let i=0;i<20;i++)f.runtime.reconcile();assert.deepEqual(f.gate.counts,counts,'no automatic retry while waiting for a user');
 f.gate.clear();f.doc.querySelector('#retry-load').dispatchEvent(new f.dom.window.Event('click'));f.doc.querySelector('#retry-load').dispatchEvent(new f.dom.window.Event('click'));
 await flushFrame(f);await flushFrame(f);await until(()=>!f.runtime.snapshot().loading&&!f.runtime.transition.busy,'manual map retry did not finish');
 assert.equal(f.runtime.playerState().character,'warrior-v4');assert.equal(f.runtime.playerState().actor,previous.actor);assert.equal(f.runtime.playerState().equipment,previous.equipment);assert.equal(f.runtime.playerState().hp,previous.hp);assert.equal(f.runtime.playerState().potions,previous.potions);
 assert.equal(f.runtime.transition.inspect().retryCount,1,'double click starts only one explicit attempt');assert.equal(f.runtime.transition.failed,false);assert.equal(f.runtime.snapshot().running,true);assert.equal(f.doc.querySelector('#loading').hidden,true);assert.equal(f.audioStates.at(-1),false);
 results.push({kind:'map-timeout-manual-retry',stage,sameDestination:true,playerIdentityAndResourcesPreserved:true,automaticRetries:0,manualRetries:1});
});

test('actual forest transition prepares map while bounded sky work is pending, revealing only after both finish',async()=>{
 const f=fixture();await success(f);f.gate.hold('sky');const previous=f.runtime.playerState();
 const before=f.gate.counts['map-model']??0,job=f.runtime.transition.travel('https://example.test/?character=warrior-v4&arrival=portal');
 await until(()=>f.gate.reached==='sky'&&(f.gate.counts['map-model']??0)>before,'map preparation should progress independently of sky');
 assert.equal(f.runtime.snapshot().ready,false);assert.equal(f.doc.querySelector('#loading').hidden,false);assert.equal(f.raf.length,0);
 f.gate.release();await flushFrame(f);await flushFrame(f);assert.equal(await job,true);assert.equal(f.runtime.snapshot().ready,true);
 assert.equal(f.runtime.playerState().actor,previous.actor);assert.equal(f.runtime.playerState().hp,previous.hp);assert.equal(f.runtime.playerState().potions,previous.potions);
 results.push({kind:'overlapped-sky-and-map-preparation',mapPreparedBeforeSky:true,curtainUntilBothReady:true,playerIdentityAndResourcesPreserved:true});
});

const destinations=['warrior-plains','warrior-v4','warrior-v5','warrior-v4','warrior-plains','warrior-v3'];
const heading=state=>Math.atan2(Math.sin(state.actor.rotation.y+state.camera.alpha),Math.cos(state.actor.rotation.y+state.camera.alpha));
function ownedCounts(f){return Object.fromEntries(['actors','animators','equipment','containers','lifetimeListeners'].map(key=>[key,f.owned[key].size]));}
function warmPlayer(f){
 f.boss.combat.hp=317;f.boss.potions.remaining=1;const state=f.runtime.playerState();state.actor.rotation.y=.8;f.world.camera.alpha=.7;f.world.camera.beta=1.18;f.world.camera.radius=17;f.input.panOffset={x:.3,y:.2,z:-.4};
 return {...state,camera:f.world.camera,relation:heading({...state,camera:f.world.camera}),listeners:f.listenerCount(),textureSelection:f.runtime.playerTextureSelection};
}
function assertWarmState(f,previous,{paused=false}={}){
 const state=f.runtime.playerState();for(const key of ['actor','equipment','controller'])assert.strictEqual(state[key],previous[key],key+' must survive in-document map retry');
 assert.strictEqual(f.runtime.playerTextureSelection,previous.textureSelection,'warm travel retains the selected player graph');
 assert.equal(f.runtime.playerTextureSelection.manifest,'warrior-v3-mobile4k');
 assert.equal(state.hp,317);assert.equal(state.potions,1);assert.deepEqual(state.equipment.choices,{sword:'violet-silver',shield:'teal-bronze'});
 assert.equal(f.world.camera.radius,17);assert.equal(f.world.camera.beta,1.18);assert.ok(Math.abs(heading({...state,camera:f.world.camera})-previous.relation)<1e-12,'portal retry preserves player-back/camera relation');
 assert.ok(Math.abs(Math.hypot(f.input.panOffset.x,f.input.panOffset.z)-.5)<1e-12);assert.equal(f.input.panOffset.y,.2);
 assert.equal(f.runtime.snapshot().ready,true);assert.equal(f.runtime.snapshot().loading,false);assert.equal(f.runtime.snapshot().failed,false);assert.equal(f.runtime.snapshot().running,!paused);
 assert.equal(f.doc.querySelector('#loading').hidden,true);assert.equal(f.world.villageStreaming.active,true);assert.equal(f.raf.length,0);assert.equal(f.timerClock.size,0);
 assert.equal(f.listenerCount(),previous.listeners,'map travel must not rebind the retry DOM listener');assert.deepEqual(ownedCounts(f),{actors:1,animators:1,equipment:1,containers:1,lifetimeListeners:0});
 assert.equal(f.engineCallbacks.size,paused?0:1,'one engine loop when playing and none while paused');
}

test('actual main callbacks complete48 warm four-map transfers without player, camera or callback ownership growth',async()=>{
 const f=fixture();await success(f);const previous=warmPlayer(f),trace=[];
 for(let i=0;i<48;i++){
  const destination=destinations[i%destinations.length];f.input.pressed.add('KeyW');const job=f.runtime.transition.travel(`https://example.test/?character=${destination}&arrival=portal`);
  assert.equal(f.runtime.snapshot().ready,false);assert.equal(f.runtime.snapshot().running,false);assert.equal(f.input.pressed.size,0,'held movement must reset at departure');
  assert.equal(await f.runtime.transition.travel('https://example.test/?character=warrior-v5'),false,'an overlapping portal cannot start another map');
  await flushFrame(f);await flushFrame(f);assert.equal(await job,true);assert.equal(f.runtime.playerState().character,destination);assertWarmState(f,previous);
  // Use the actual engine callback left by main's FrameLoop after each transfer.
  const frames=f.runtime.frameLoop.frames;[...f.engineCallbacks][0]();assert.equal(f.runtime.frameLoop.frames,frames+1);assert.equal(f.runtime.snapshot().running,true);
  trace.push({trip:i+1,character:destination,phase:f.runtime.transition.inspect().phase,owned:ownedCounts(f),callbacks:f.engineCallbacks.size,listeners:f.listenerCount()});
 }
 results.push({kind:'warm-three-map-repeat',trips:48,trace,assetBoundary:'Resolved injected cached asset readiness; cache/network bytes are verified by separate resource tests, not this main-callback fixture.'});
});

test('actual main repeated45s stage timeouts and double-click manual retries cannot let late old completion reveal a new map',async()=>{
 const f=fixture();await success(f);const previous=warmPlayer(f),trace=[];
 for(let i=0;i<12;i++){
  const stage=['release','map-download','map-model','scene'][i%4],destination=destinations[i%destinations.length],target=`https://example.test/?character=${destination}&arrival=portal`;
  f.gate.clear();f.gate.timeoutStage=stage;const failed=f.runtime.transition.travel(target);await until(()=>f.gate.reached===stage&&f.gate.late,'timeout producer not reached');
  const completeOld=f.gate.late;f.timerClock.advance(45000);assert.equal(await failed,false);assert.equal(f.runtime.transition.inspect().lastFailure.timeoutMs,45000);
  assert.equal(f.engineCallbacks.size,0);assert.equal(f.timerClock.size,0);assert.equal(f.owned.lifetimeListeners.size,0);assert.equal(f.doc.querySelector('#loading').hidden,false);
  const before={...f.gate.counts};for(let k=0;k<12;k++)f.runtime.reconcile();assert.deepEqual(f.gate.counts,before,'background/visibility reconciliation never retries automatically');
  const retryCount=f.runtime.transition.inspect().retryCount;f.gate.clear();f.gate.hold('scene');f.doc.querySelector('#retry-load').dispatchEvent(new f.dom.window.Event('click'));f.doc.querySelector('#retry-load').dispatchEvent(new f.dom.window.Event('click'));
  await until(()=>f.gate.reached==='scene','new manual retry did not reach its independent screen wait');assert.equal(f.runtime.transition.inspect().retryCount,retryCount+1);
  const environment=f.world.environment,diagnostic=f.loadDiagnostics.snapshot(),caption=f.doc.querySelector('#loading-text').textContent,disposed=f.owned.lateDisposed;
  completeOld();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.owned.lateDisposed,disposed+1,'MapLoadLifetime disposes the abandoned producer result');
  assert.strictEqual(f.world.environment,environment);const afterLate=f.loadDiagnostics.snapshot();for(const key of ['label','phase','setupMs','downloadMs','modelMs','bytes','cachedBytes'])assert.equal(afterLate[key],diagnostic[key],'old completion cannot alter diagnostic '+key);assert.ok(afterLate.screenMs>=diagnostic.screenMs,'the current screen-wait clock may continue');assert.equal(f.doc.querySelector('#loading-text').textContent,caption);assert.equal(f.doc.querySelector('#loading').hidden,false);assert.equal(f.engineCallbacks.size,0,'old completion cannot resume playback or reveal the new map');
  f.gate.release();await flushFrame(f);await flushFrame(f);await until(()=>!f.runtime.transition.busy,'manual retry remained busy');assert.equal(f.runtime.playerState().character,destination);assertWarmState(f,previous);
  trace.push({attempt:i+1,stage,timeoutMs:45000,manualRetryCount:f.runtime.transition.inspect().retryCount,lateResultsDisposed:f.owned.lateDisposed,pendingTimers:f.timerClock.size,lifetimeListeners:f.owned.lifetimeListeners.size});
 }
 results.push({kind:'main-timeout-retry-late-owner-repeat',attempts:12,trace,lateIsolationBoundary:'Actual MapLoadLifetime wraps a controlled old asset producer. GLTF/worker-specific late ownership is covered separately; this test verifies actual main callbacks/UI/RAF cannot be resumed by the abandoned Promise.'});
});

test('actual playback pauses for the HUD editor and map preparation closes it before resuming',async()=>{
 const f=fixture();await success(f);f.hudLayout.visible=true;f.runtime.reconcile();assert.equal(f.runtime.snapshot().running,false);assert.equal(f.engineCallbacks.size,0);assert.equal(f.audioStates.at(-1),true);
 f.gate.hold('scene');const job=f.runtime.transition.travel('https://example.test/?character=warrior-v4&arrival=portal');assert.equal(f.hudLayout.visible,false);assert.equal(f.hudLayout.closes,1);await until(()=>f.gate.reached==='scene','map screen wait not reached');assert.equal(f.runtime.snapshot().running,false);
 f.gate.release();await flushFrame(f);await flushFrame(f);assert.equal(await job,true);assert.equal(f.runtime.snapshot().running,true);assert.equal(f.engineCallbacks.size,1);assert.equal(f.audioStates.at(-1),false);
});

test('actual map finish respects hidden/settings state through18 transfers and restores exactly one playable loop',async()=>{
 const f=fixture();await success(f);const previous=warmPlayer(f),trace=[];
 for(let i=0;i<18;i++){
  f.gate.hold('scene');const destination=destinations[i%destinations.length],job=f.runtime.transition.travel(`https://example.test/?character=${destination}&arrival=portal`);await until(()=>f.gate.reached==='scene','scene wait not reached');
  const hidden=i%2===0;f.doc.hidden=hidden;f.doc.querySelector('#diagnostic-detail-dialog').open=!hidden;f.runtime.reconcile();assert.equal(f.runtime.snapshot().running,false);
  f.gate.release();await flushFrame(f);await flushFrame(f);assert.equal(await job,true);assertWarmState(f,previous,{paused:true});assert.equal(f.audioStates.at(-1),true);
  f.doc.hidden=false;f.doc.querySelector('#diagnostic-detail-dialog').open=false;f.runtime.reconcile();assertWarmState(f,previous);assert.equal(f.audioStates.at(-1),false);
  trace.push({trip:i+1,pausedBy:hidden?'document-hidden':'diagnostic-dialog',callbacksAfterResume:f.engineCallbacks.size});f.gate.clear();
 }
 results.push({kind:'main-repeated-pause-return',trips:18,trace});
});

test('actual main frame failure/reload12times releases previous player wrappers and never accumulates a second input/render generation',async()=>{
 const f=fixture();await success(f);const trace=[];
 for(let i=0;i<12;i++){
  const stage=['model','scene','first-raf','second-raf'][i%4];f.gate.clear();if(stage==='model'||stage==='scene')f.gate.hold(stage);const job=f.runtime.load();
  if(stage==='model'||stage==='scene')await until(()=>f.gate.reached===stage,'reload gate missing');else{await until(()=>f.raf.length>0,'reload presentation missing');if(stage==='second-raf')await flushFrame(f);}
  f.runtime.injectFailure();if(f.gate.release)f.gate.release();else{if(stage==='first-raf')await flushFrame(f);await flushFrame(f);}await job;assertFailed(f);
  await success(f,{retry:true});assert.deepEqual(ownedCounts(f),{actors:1,animators:1,equipment:1,containers:1,lifetimeListeners:0});assert.equal(f.raf.length,0);assert.equal(f.timerClock.size,0);
  trace.push({iteration:i+1,stage,owned:ownedCounts(f),callbacks:f.engineCallbacks.size,listeners:f.listenerCount()});
 }
 assert.ok(trace.every(item=>item.listeners===trace[0].listeners));results.push({kind:'main-frame-error-reload-repeat',retries:12,trace});
});

test('ordinary initial asset failure stays paused across focus/settings changes and recovers on one manual retry',async()=>{
 const f=fixture();f.gate.errorStage='map-model';f.gate.errorFactory=()=>Object.assign(Error('마을 바닥 텍스처 실패'),{stage:'ground'});
 await f.runtime.load();
 assert.equal(f.runtime.snapshot().ready,false);assert.equal(f.runtime.snapshot().loading,false);assert.equal(f.runtime.snapshot().running,false);
 assert.equal(f.audioStates.at(-1),true);assert.equal(f.engineCallbacks.size,0);
 for(let i=0;i<4;i++){f.doc.hidden=i%2===0;f.runtime.reconcile();assert.equal(f.runtime.snapshot().running,false);}
 f.doc.hidden=false;f.gate.clear();await success(f,{retry:true});assert.equal(f.engineCallbacks.size,1);
});

test('actual main capability rejection records the gate inputs before downloads and manual retry selects the bounded player graph',async()=>{
 const f=fixture({caps:{maxTextureSize:1024,astc:{}}});await f.runtime.load();
 assert.equal(f.runtime.snapshot().ready,false);assert.equal(f.runtime.snapshot().loading,false);assert.equal(f.runtime.snapshot().running,false);
 assert.equal(f.runtime.playerTextureSelection.status,'selecting');assert.equal(f.runtime.playerTextureSelection.capabilities.maxTextureSize,1024);assert.equal(f.runtime.playerTextureSelection.capabilities.formats.astc,true);
 assert.match(f.loadDiagnostics.snapshot().error,/MAX_TEXTURE_SIZE=1024/);assert.match(f.loadDiagnostics.snapshot().error,/ASTC=yes/);
 assert.equal(f.playerManifestUrls.length,0,'unsupported capability never starts a player resource plan');assert.equal(f.owned.containers.size,0);assert.equal(f.owned.actors.size,0);assert.equal(f.engineCallbacks.size,0);
 for(let i=0;i<4;i++)f.runtime.reconcile();assert.equal(f.playerManifestUrls.length,0,'focus/settings reconciliation cannot retry the rejected plan');
 f.caps.maxTextureSize=4096;await success(f,{retry:true});
 assert.equal(f.runtime.playerTextureSelection.status,'selected');assert.equal(f.runtime.playerTextureSelection.manifest,'warrior-v3-mobile4k');assert.equal(f.runtime.playerTextureSelection.maxSize,4096);
 assert.deepEqual(f.playerManifestUrls,['https://example.test/assets/warrior-v3-mobile4k.json']);
 results.push({kind:'actual-main-player-capability-gate',rejectedMaxTextureSize:1024,downloadPlansBeforeManualRetry:0,manualRetryProfile:f.runtime.playerTextureSelection.manifest,explicitNavigator:'Android SM-S911'});
});

test.after(()=>{
 const path=new URL('../reports/ios-uniform-fix/',import.meta.url);mkdirSync(path,{recursive:true});
 const report={mainSourceSha256:createHash('sha256').update(source).digest('hex'),scope:'Actual main.js loadCharacter, assertFrameHealthy, FrameLoop draw guard/playback callback, map prepare/load/finish/onError callbacks and retry button binding; actual loading DOM, loading view, load diagnostics, frame loop, transition modules and player capability/profile policy with an explicit Android navigator. Network/model/audio and GPU draw are injected boundaries.',expectedCases:20,completedCases:results.length,success:results.length===20,results,browserAutomation:false,physicalDeviceTested:false,limitations:'Deterministic CPU/DOM async-interleaving tests. Ownership counters track the controlled player/asset/DOM/RAF fixture, not real device JS/GPU heap. Does not claim a real iPhone/S23 GPU shader render, visual review or thermal measurement.'};
 writeFileSync(new URL('startup-validation.json',path),JSON.stringify(report,null,2)+'\n');
 const warm=new URL('../reports/map-warm-repeat-2026-11-02/',import.meta.url);mkdirSync(warm,{recursive:true});writeFileSync(new URL('main-validation.json',warm),JSON.stringify(report,null,2)+'\n');
});
