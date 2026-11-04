import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {parseAst} from 'rolldown/parseAst';
import {_CommonInit,_CommonDispose} from '@babylonjs/core/Engines/engine.common.js';
import {FrameLoop} from '../../src/frame-loop.js';
import {acquireGameToolLease} from '../../src/game-tool-lease.js';
import {playerDimensions} from '../../src/player-dimensions.js';
import {createAuthoringFixture,until,settle,sha} from '../moonforest-0.1-cinematic-authoring-2026-11-04/verification-fixture.mjs';

console.log('Native scheduling verification starting');
const main=execFileSync('git',['show','e649384:ArcherPreview/src/main.js'],{encoding:'utf8'}),nodes=[];
function walk(node){if(!node||typeof node!=='object')return;if(node.type)nodes.push(node);for(const value of Object.values(node))if(Array.isArray(value)){for(const child of value)walk(child);}else if(value&&typeof value==='object')walk(value);}
walk(parseAst(main));console.log('Main AST collected',nodes.length);
const renderNode=nodes.find(n=>n.type==='FunctionDeclaration'&&n.id?.name==='render'),syncNode=nodes.find(n=>n.type==='VariableDeclarator'&&n.id?.name==='syncPlayback'),loopNode=nodes.find(n=>n.type==='AssignmentExpression'&&n.left?.name==='frameLoop'&&n.right?.callee?.name==='FrameLoop'),policyNode=nodes.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.object?.name==='engine'&&n.expression.left.property?.name==='renderEvenInBackground');
assert.ok(renderNode&&syncNode&&loopNode&&policyNode);
const source=n=>main.slice(n.start,n.end),cases=[],sources=Object.fromEntries(['main.js','frame-loop.js','game-tool-lease.js','cinematic-game.js','cinematic-player.js','cinematic-studio.js'].map(name=>['src/'+name,sha(readFileSync(new URL('../../src/'+name,import.meta.url)))]));
let f,registered=false,frameLoop,draws=0,attempts=0,requests=0,nextId=1;const pending=new Map();
const output={baselinePolicyCommit:'e649384',baselineMainSha256:sha(main),scope:'Independent real Babylon native blur/focus and engine frame gate; exact baseline main render, FrameLoop registration, syncPlayback and real lease reconcile; actual default actor load/host and Studio transport. A rerun uses current imported player/host/UI modules with the captured baseline main policy.',limitations:['NullEngine: no WebGL/pixel/device performance evidence','DOM blur/focus events are dispatched, not trusted browser events','requestAnimationFrame is a bounded host queue; Babylon runRenderLoop/_renderLoop/_processFrame and maxFPS gates execute unchanged','Existing resource fixture uses actual local model geometry/skin/clips but omits materials/images'],sourceHashes:sources,cases};
const record=(name,details)=>{cases.push({name,passed:true,...details});console.log('PASS '+name);};
try{
 f=await createAuthoringFixture();const {world,engine,canvas,input,audio}=f,document=f.childDom.document,win=f.childDom.window;
 Object.defineProperty(document,'hidden',{configurable:true,value:false,writable:true});
 for(const id of ['summon-dialog','help-dialog','boss-pattern-dialog','character-style-dialog','diagnostic-detail-dialog','motion-speed-dialog','death-dialog']){const node=document.createElement('dialog');node.id=id;node.open=false;f.childDom.root.append(node);}
 const context={world,engine,canvas,input,audio,FrameLoop,document,window:win,actor:f.hero,boss:f.battle,playerDimensions,mapDeparture:null,mapTransition:{busy:false,failed:false},cinematicAuthoringPreview:true,simulateFrame:false,frameLoop:null,frameDiagnostics:{beginFrame(){},endFrame(){},suspend(){}},hudLayout:null,minimapTravel:null,uiTest:null,motionSpeedControls:{isOpen:()=>false},deathScreen:{isOpen:()=>false},cancelAttackInput(){},updateButtons(){},loadDiagnostics:{finish(){}},loadingView:{fail(){}},frameFailure:null,text(){},console,$:selector=>document.querySelector(selector),get ready(){return f.state.ready;},set ready(v){f.state.ready=v;},get loadingAsset(){return f.state.loadingAsset;}};
 context.render=runInNewContext('('+source(renderNode)+')',context);
 runInNewContext(source(loopNode),context);frameLoop=context.frameLoop;const actualDraw=frameLoop.draw;frameLoop.draw=dt=>{draws++;actualDraw(dt);};
 const syncPlayback=runInNewContext('('+source(syncNode.init)+')',context);
 world.acquireToolLease=async options=>acquireGameToolLease({world,root:f.childDom.root,canvas,input,audio,getState:f.getState,setReady:v=>f.state.ready=v,resetInput:()=>input.reset(),reconcile:syncPlayback},options);
 engine.maxFPS=60;engine.customAnimationFrameRequester={requestAnimationFrame:callback=>{const id=nextId++;pending.set(id,callback);requests++;return id;},cancelAnimationFrame:id=>pending.delete(id)};
 _CommonInit(engine,canvas,{audioEngine:false});registered=true;runInNewContext(source(policyNode),{engine});
 const pump=async count=>{for(let i=0;i<count;i++){await new Promise(r=>setTimeout(r,20));const item=pending.entries().next().value;assert.ok(item,'native engine queues next frame');pending.delete(item[0]);attempts++;item[1](performance.now());}};
 syncPlayback();await pump(2);assert.equal(frameLoop.running,true);assert.ok(draws>0);
 await f.click('actor-add');await until(()=>f.api?.player.state==='ready'&&!f.button('actor-add').disabled,'actual cold actor preparation');await settle();assert.equal(f.modelRequests(),1);
 await f.click('capture-from');await settle();
 win.dispatchEvent(new win.Event('blur'));assert.equal(engine._windowIsBackground,true);assert.equal(document.hidden,false);
 const before={draws,frames:frameLoop.frames,time:f.api.player.time,requests,attempts};
 await f.click('play');await until(()=>f.api.player.state==='playing','actual Studio play command accepted');await pump(8);await new Promise(r=>setTimeout(r,550));
 const frozen={draws,frames:frameLoop.frames,time:f.api.player.time,state:f.api.player.state,parentStatus:f.status(),parentTime:f.parentDom.root.querySelector('[data-view="time"]').textContent,requests,attempts,running:frameLoop.running,pending:pending.size,documentHidden:document.hidden,windowIsBackground:engine._windowIsBackground,renderEvenInBackground:engine.renderEvenInBackground};
 assert.equal(frozen.time,0);assert.equal(frozen.draws,before.draws);assert.equal(frameLoop.running,true);assert.equal(frozen.state,'playing');assert.match(frozen.parentStatus,/재생 중/);
 record('Visible iframe native window blur freezes actual scheduled engine callbacks while parent says playing0',{before,after:frozen,actualModelProof:f.sourceProof,mainPolicy:source(policyNode),exactSourceHashes:{render:sha(source(renderNode)),syncPlayback:sha(source(syncNode.init)),frameLoopRegistration:sha(source(loopNode))}});
 win.dispatchEvent(new win.Event('focus'));assert.equal(engine._windowIsBackground,false);await pump(5);assert.ok(f.api.player.time>0);assert.ok(draws>before.draws);
 record('Native window focus reopens unchanged Babylon frame gate and clock advances',{time:f.api.player.time,draws,frames:frameLoop.frames});
 await f.api.execute({command:'pause'});await f.api.execute({command:'seek',time:0});
 engine.renderEvenInBackground=true;win.dispatchEvent(new win.Event('blur'));await f.click('play');await pump(8);assert.ok(f.api.player.time>.05);assert.equal(document.hidden,false);
 record('Preview-only background-render candidate keeps visible unfocused iframe advancing',{time:f.api.player.time,draws,frames:frameLoop.frames,windowIsBackground:engine._windowIsBackground});
 document.hidden=true;syncPlayback();assert.equal(frameLoop.running,false);assert.equal(f.api.player.state,'paused');assert.equal(pending.size,0);
 const hiddenTime=f.api.player.time;await new Promise(r=>setTimeout(r,50));assert.equal(f.api.player.time,hiddenTime);
 document.hidden=false;syncPlayback();await pump(5);assert.equal(frameLoop.running,true);assert.equal(f.api.player.state,'playing');assert.ok(f.api.player.time>hiddenTime);
 record('Exact main document-hidden reconcile still pauses scheduler/lease and resumes without hidden-time jump',{hiddenTime,resumedTime:f.api.player.time,running:frameLoop.running});
}catch(error){output.error=error.stack;console.error(error.stack);process.exitCode=1;}
finally{frameLoop?.setPaused(true);if(registered)_CommonDispose(f.engine,f.canvas);await f?.close();output.passed=!output.error&&cases.every(c=>c.passed);output.recordedAt=new Date().toISOString();mkdirSync(new URL('.',import.meta.url),{recursive:true});writeFileSync(new URL('verification-native-engine.json',import.meta.url),JSON.stringify(output,null,2)+'\n');}
