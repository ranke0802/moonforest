import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createFrameDiagnostics} from '../src/frame-diagnostics.js';
import {BossDiagnostics,bossComparisonLines} from '../src/boss-diagnostics.js';
import {setupSummonPanel} from '../src/summon-panel.js';
import {PlayerCombat} from '../src/player-combat.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const source=(start,end)=>main.slice(main.indexOf(start)+start.length,main.indexOf(end,main.indexOf(start))).trim().replace(/;$/,'');
const syncSource=source('const syncPlayback=','\n  const dialogObserver'),restoreSource=source('const restorePlayback=','\n  window.addEventListener(\'pageshow\'');
function fixture(){
 const {document:doc}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
 const previous=globalThis.document;try{globalThis.document=doc;setupSummonPanel();}finally{globalThis.document=previous;}
 // These separately mounted settings panels do not participate in summoning.
 for(const id of ['boss-pattern-dialog','character-style-dialog'])if(!doc.getElementById(id)){const dialog=doc.createElement('dialog');dialog.id=id;doc.body.append(dialog);}
 let time=0,copied,drawCalls=80;const paused=[],world={hidden:false},state={dead:false};
 const diagnostic=createFrameDiagnostics({doc,storage:{getItem:()=> '1'},now:()=>time,memory:()=>({jsUsedBytes:35100000}),renderMetrics:()=>({drawCalls,sceneMs:3,animationMs:1}),context:()=>({camera:[0,1,8],position:[0,0],targetFps:30}),clipboard:{writeText:async text=>copied=JSON.parse(text)}});
 const combat=new PlayerCombat();combat.hp=317;
 const env={boss:{combat},hudLayout:null,minimapTravel:null,uiTest:null,document:world,mapDeparture:{departing:false},mapTransition:{busy:false},motionSpeedControls:{isOpen:()=>false},deathScreen:{isOpen:()=>state.dead},$:selector=>doc.querySelector(selector),input:{reset(){}},cancelAttackInput(){},text(){},frameLoop:{failed:false,setPaused:v=>paused.push(v),restart(){}},frameDiagnostics:diagnostic,audio:{setSuspended(){}}};
 env.world={};const evaluate=text=>Function('env','with(env){return ('+text+');}')(env);
 const sync=evaluate(syncSource);env.syncPlayback=sync;const restore=evaluate(restoreSource);
 const frame=at=>{time=at;diagnostic.beginFrame(true,30);time+=4;diagnostic.endFrame();};
 const baseline=()=>{for(let i=0;i<=100;i++)frame(i*40);};
 const summon=async()=>{diagnostic.bossEvent({type:'begin',label:'비탄의 마녀',mode:'reuse'});diagnostic.bossEvent({type:'ready'});drawCalls=140;doc.querySelector('#summon-dialog').open=false;sync();const start=time;for(let i=1;i<=130;i++)frame(start+i*40);await doc.querySelector('#copy-frame-diagnostics').dispatchEvent(new doc.defaultView.Event('click'));await Promise.resolve();return copied;};
 return {doc,world,state,combat,diagnostic,env,paused,sync,restore,frame,baseline,summon,setTime:value=>time=value};
}

test('actual summon-modal pause preserves the preceding play window even after a long selection',async()=>{
 const f=fixture();f.baseline();f.combat.passiveRecovery.elapsed=1.9;f.doc.querySelector('#summon-dialog').open=true;f.setTime(4100);f.sync();assert.equal(f.paused.at(-1),true);assert.equal(f.combat.passiveRecovery.elapsed,0);assert.equal(f.combat.hp,317);
 f.setTime(21000);f.sync();f.restore();f.diagnostic.beginFrame(false,30);f.diagnostic.endFrame();const report=await f.summon(),s=report.bossComparison;
 assert.equal(s.baselineReady,true);assert.equal(s.comparisonAvailable,true);assert.equal(s.baselineSource,'before-summon-menu');assert.equal(s.baselineAgeMs,16900);
 assert.equal(s.before.drawCalls.mean,80);assert.equal(s.after.drawCalls.mean,140);assert.equal(s.delta.drawCalls,60);assert.equal(s.delta.jsUsedBytes,0,'zero is a heap delta, not the heap usage');assert.equal(s.memoryBefore.jsUsedBytes,35100000);
 assert.equal(s.status,'complete');assert.ok(s.after.frameMs.max<41,'modal time never enters measured frame intervals');assert.match(report.measurement,/delta.jsUsedBytes is the before\/after difference/);assert.match(f.doc.querySelector('#diagnostic-boss-note').textContent,/소환창 전 표본/);
});

for(const reason of ['hidden','settings','death','map'])test(`a ${reason} change discards frozen summon baseline`,async()=>{
 const f=fixture();f.baseline();f.doc.querySelector('#summon-dialog').open=true;f.setTime(4100);f.sync();
 if(reason==='hidden'){f.world.hidden=true;f.sync();f.world.hidden=false;}
 if(reason==='settings'){f.doc.querySelector('#help-dialog').open=true;f.sync();f.doc.querySelector('#help-dialog').open=false;}
 if(reason==='death'){f.state.dead=true;f.sync();f.state.dead=false;}
 if(reason==='map')f.diagnostic.mapChanged();
 const s=(await f.summon()).bossComparison;assert.equal(s.baselineReady,false);assert.equal(s.comparisonAvailable,false);assert.equal(s.delta.drawCalls,null);assert.match(bossComparisonLines(s).title,/이전 표본 부족/);
});

test('resumed play replaces frozen samples and first-entry comparisons never invent zero costs',()=>{
 const d=new BossDiagnostics(),frame={frameMs:40,cpuMs:4,drawCalls:80,targetFps:30};
 for(let t=0;t<=4000;t+=40)d.frame(t,frame,{},()=>({}));d.suspend({preserveBaseline:true,at:4100});
 d.frame(10000,{...frame,drawCalls:120},{},()=>({}));d.event({type:'begin'},10010,{});assert.equal(d.snapshot().baselineSource,'recent-play');assert.equal(d.snapshot().before.drawCalls.mean,120);
 d.reset();d.event({type:'begin'},20000,{jsUsedBytes:35100000});d.event({type:'ready'},20001,{});
 for(let t=20040;t<=25200;t+=40)d.frame(t,frame,{jsUsedBytes:35100000},()=>({}));const s=d.snapshot();assert.equal(s.status,'complete');assert.equal(s.delta.cpuMs,null);assert.equal(s.delta.jsUsedBytes,0);assert.equal(s.comparisonAvailable,false);assert.match(bossComparisonLines(s).title,/등장 후 기록 완료 · 이전 표본 부족/);
});
