import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {Vector3} from '@babylonjs/core';
import {FrameLoop} from '../src/frame-loop.js';
import {createLoadingView} from '../src/loading-view.js';
import {LoadDiagnostics} from '../src/load-diagnostics.js';
import {createMapTransition} from '../src/map-transition.js';

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
const loadSource=namedFunction('loadCharacter'),healthSource=namedFunction('assertFrameHealthy');
const frameSource=between('  frameLoop=new FrameLoop(','\n  const dialogObserver=');
const mapSource=between('  mapTransition=createMapTransition({','\n  bindMapPortal();');
const retrySource=source.split('\n').find(line=>line.includes("$('#retry-load').addEventListener('click', loadCharacter)"));assert.ok(retrySource);

async function until(check,message){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setImmediate(resolve));}assert.fail(message);}

// Execute the actual main loader, RAF guard, playback reconciliation and map
// callbacks in one closure. Only asset/network/audio and GPU draw boundaries
// are injected; readiness/RAF promises and retry DOM events retain ordering.
function fixture(){
 const dom=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),doc=dom.document;doc.hidden=false;
 for(const id of ['motion-speed-dialog','help-dialog','summon-dialog','boss-pattern-dialog','character-style-dialog'])if(!doc.getElementById(id)){const dialog=doc.createElement('dialog');dialog.id=id;doc.body.append(dialog);}
 const $=selector=>doc.querySelector(selector),loadingView=createLoadingView(doc),raf=[],engineCallbacks=new Set();
 const engine={getCaps:()=>({}),runRenderLoop:callback=>engineCallbacks.add(callback),stopRenderLoop:callback=>engineCallbacks.delete(callback)};
 let now=0;
 const loadDiagnostics=new LoadDiagnostics(()=>++now),gate={stage:null,reached:null,release:null,hold(stage){this.stage=stage;this.reached=null;this.release=null;},clear(){this.stage=null;this.reached=null;this.release=null;},at(stage){if(this.stage!==stage)return Promise.resolve();this.reached=stage;return new Promise(resolve=>{this.release=resolve;});}};
 class PlayerNode{constructor(){this.position=Vector3.Zero();this.rotation=Vector3.Zero();this.scaling=Vector3.One();}dispose(){this.disposed=true;}}
 class Animator{constructor(){this.durations={};}dispose(){}transition(){}update(){}}
 class Controller{constructor(){}cancelAttack(){}}
 class Equipment{dispose(){}}
 const world={cave:true,mapId:'cave',environment:{},scene:{render:noop},camera:{alpha:0,radius:10,setTarget:noop,getViewMatrix:noop,getProjectionMatrix:noop},terrain:{place:noop,heightAt:()=>0},sky:{load:async()=>{}},shadows:{addShadowCaster:noop,removeShadowCaster:noop},lighting:{registerMeshes:noop,follow:noop},caveFog:{update:noop},caveCamera:{endFrame:noop},villageStreaming:{active:false},releaseEnvironment:async()=>{}};
 const config={model:'player.glb',animations:{},speeds:{},scale:1},location={href:'https://example.test/?character=warrior-v5'},history={replaceState(_state,_title,url){location.href=String(url);}};
 const boss={hide:noop,allPooled:[],combat:{hp:500},potions:{remaining:3},activateResident:async()=>{},playerNodes:{}};
 const dependencies={FrameLoop,createMapTransition:options=>createMapTransition({...options,frame:async()=>{}}),world,engine,boss,loadingView,loadDiagnostics,Vector3,TransformNode:PlayerNode,CharacterAnimator:Animator,WarriorEquipment:Equipment,WarriorV2Controller:Controller,NativeWarriorController:Controller,CharacterController:Controller,
  document:doc,$,loading:$('#loading'),canvas:{focus:noop,setAttribute:noop},location,history,gate,console:{error:noop},
  initializeResourceCache:async()=>{},playerTextureManifest:()=> 'player',prepareStartupResources:async()=>config,fetch:async()=>({ok:true,json:async()=>config}),migrateCachedGlb:async()=>{},
  loadVillage:async()=>{},loadVillageTrainingTarget:async()=>{},loadTrainingGround:async()=>{},SceneLoader:{LoadAssetContainerAsync:async()=>({meshes:[],transformNodes:[],animationGroups:[],addAllToScene:noop,dispose:noop})},
  applyPlayerDetail:noop,applyCharacterSurfaceStyle:noop,attachCharacterOutlines:noop,applyAttackSpeed:noop,readAttackSpeed:()=>1,equipmentChoices:{},
  motionSpeedControls:{apply:noop,setVisible:noop,isOpen:()=>false},deathScreen:{isOpen:()=>false},audio:{stopAll:noop,setEnvironment:noop,setSuspended:noop,play:noop},actionAudio:{reset:noop},
  updateButtons:noop,cancelAttackInput:noop,input:{reset:noop,panOffset:{x:0,y:0,z:0}},goldLoot:{clearDrops:noop},goldLootView:{clear:noop},strikeSampler:{reset:noop},projectiles:{clear:noop},training:{setSelected:noop,relocate:noop},
  resetCamera:noop,syncCaveFog:noop,prepareElenaReview:()=>gate.at('model'),waitForSceneReady:()=>gate.at('scene'),prepareMapResources:()=>gate.at('map-download'),
  bindMapPortal:noop,carryPortalPose:noop,cameraFollow:{focus:()=>Vector3.Zero()},cameraPitch:{follow:noop},applyRenderQuality:noop,
  frameDiagnostics:{beginFrame:noop,endFrame:noop,mapChanged:noop,suspend:noop},text:noop,
  requestAnimationFrame:callback=>{raf.push(callback);return raf.length;},consumeTravel:()=>null,travelStorage:{},
  replaceWorldMap:(w,destination)=>{w.mapId=destination==='warrior-v5'?'cave':destination==='warrior-v4'?'forest':'village';w.cave=w.mapId==='cave';w.environment={};},
 };
 const runtime=Function(...Object.keys(dependencies),`
  let character='warrior-v5',ready=false,loadingAsset=false,frameFailure=null,frameLoop,mapTransition=null;
  let config=null,container=null,actor=null,animator=null,controller=null,equipment=null,maxInfluences=0;
  let arrowNode,arrowMesh,reviewFocus,playerHead,shieldNode,swordNode,combatResult=null,shotTarget=null,shotActionId=null,hiddenArrowForAction=null,mapPortal=null;
  const villageReview=null,villageReviewEnabled=false,villageOverview=false,mapDeparture=null,attackSources=new Set(),elapsed=0,qualityMode='high',VertexBuffer={MatricesWeightsExtraKind:'unused'};
  const isWarrior=()=>true,isV2=()=>true,isVillage=()=>true,isForest=()=>character==='warrior-v4',isCave=()=>character==='warrior-v5';
  const mapSpawn=()=>({x:0,y:0,z:0});let reconcilePlayback=()=>{},nextDrawError=null;
  const render=()=>{if(nextDrawError){const error=nextDrawError;nextDrawError=null;throw error;}};
  ${healthSource}\n${loadSource}\n${frameSource}\n${mapSource}\n${retrySource}
  reconcilePlayback=syncPlayback;syncPlayback();
  return {load:loadCharacter,get transition(){return mapTransition;},get frameLoop(){return frameLoop;},
   injectFailure(){nextDrawError=new TypeError('_uniforms[e] is undefined');frameLoop.draw(.016);},
   snapshot(){return {ready,loading:loadingAsset,failed:frameLoop.failed,running:frameLoop.running,frameError:frameFailure?.message??null};}};
 `)(...Object.values(dependencies));
 return {dom,doc,raf,gate,runtime,loadDiagnostics,loadingView,engineCallbacks};
}

async function flushFrame(f){await until(()=>f.raf.length>0,'expected a pending presentation RAF');f.raf.shift()();await Promise.resolve();}
async function success(f,{retry=false}={}){
 f.gate.clear();let job;
 if(retry)f.doc.querySelector('#retry-load').dispatchEvent(new f.dom.window.Event('click'));else job=f.runtime.load();
 await flushFrame(f);await flushFrame(f);if(job)await job;else await until(()=>!f.runtime.snapshot().loading,'retry did not settle');
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

test('actual loading view keeps the runtime error latched until an explicit new begin',()=>{
 const f=fixture();f.loadingView.begin();f.loadingView.fail('게임 실행이 중단되었습니다','_uniforms[e] is undefined');
 assert.equal(f.loadingView.reveal(),false);assert.equal(f.doc.querySelector('#loading').hidden,false);assert.equal(f.doc.documentElement.dataset.loading,'true');
 f.loadingView.begin();assert.equal(f.doc.querySelector('#loading').classList.contains('error'),false);f.loadingView.reveal();assert.equal(f.doc.querySelector('#loading').hidden,true);
 results.push({kind:'loading-view',errorLatch:true,explicitBeginResetsLatch:true});
});

test.after(()=>{
 const path=new URL('../reports/ios-uniform-fix/',import.meta.url);mkdirSync(path,{recursive:true});
 writeFileSync(new URL('startup-validation.json',path),JSON.stringify({mainSourceSha256:createHash('sha256').update(source).digest('hex'),scope:'Actual main.js loadCharacter, assertFrameHealthy, FrameLoop draw guard/playback callback, map prepare/load/finish/onError callbacks and retry button binding; actual loading DOM, loading view, load diagnostics, frame loop and transition modules. Network/model/audio and GPU draw are injected boundaries.',expectedCases:8,completedCases:results.length,success:results.length===8,results,browserAutomation:false,physicalDeviceTested:false,limitations:'Deterministic CPU/DOM async-interleaving tests. Does not claim a real iPhone/S23 GPU shader render, visual review or thermal measurement.'},null,2)+'\n');
});
