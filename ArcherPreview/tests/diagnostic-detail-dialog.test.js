import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createFrameDiagnostics} from '../src/frame-diagnostics.js';
import {FrameLoop} from '../src/frame-loop.js';
import {PlayerCombat} from '../src/player-combat.js';

function fixture({clipboardFails=false,stored='1',legacyExpanded=false}={}){
 const {document:doc,window}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
 for(const id of ['summon-dialog','boss-pattern-dialog','character-style-dialog'])if(!doc.getElementById(id)){const element=doc.createElement('dialog');element.id=id;doc.getElementById('app').append(element);}
 const fps=doc.createElement('span');fps.id='live-fps';doc.getElementById('app').append(fps);doc.hidden=false;
 if(legacyExpanded){const panel=doc.getElementById('frame-diagnostics');panel.dataset.expanded='true';panel.classList.add('expanded','is-expanded');panel.style.height='380px';panel.style.width='420px';panel.style.pointerEvents='auto';doc.getElementById('diagnostic-expand').setAttribute('aria-expanded','true');for(const node of [doc.getElementById('diagnostic-boss-comparison'),doc.querySelector('.diagnostic-general'),doc.getElementById('diagnostic-render'),doc.getElementById('diagnostic-gpu')])panel.append(node);}
 let time=0,copied;const callbacks=new Set(),transitions=[];
 const diagnostic=createFrameDiagnostics({doc,storage:{getItem:()=>stored,setItem:(_key,value)=>stored=value},now:()=>time,onCollecting:v=>transitions.push(v),renderMetrics:()=>({drawCalls:123,sceneMs:7,gpu:{status:'unsupported',meanMs:null,latest:null}}),clipboard:{writeText:async value=>{if(clipboardFails)throw Error('denied');copied=JSON.parse(value);}}});
 const loop=new FrameLoop({runRenderLoop:cb=>callbacks.add(cb),stopRenderLoop:cb=>callbacks.delete(cb)},()=>{diagnostic.beginFrame(true,30);diagnostic.endFrame();},()=>time);
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replaceAll('\r\n','\n'),start=main.indexOf('const syncPlayback='),end=main.indexOf('\n  const dialogObserver',start),source=main.slice(start+'const syncPlayback='.length,end).trim().replace(/;$/,'');
 const combat=new PlayerCombat();combat.hp=317;
 const env={boss:{combat},minimapTravel:null,uiTest:null,document:doc,mapDeparture:{departing:false},mapTransition:{busy:false},motionSpeedControls:{isOpen:()=>doc.getElementById('motion-speed-dialog').open},deathScreen:{isOpen:()=>false},$:selector=>doc.querySelector(selector),input:{reset(){}},cancelAttackInput(){},text:(selector,text)=>{doc.querySelector(selector).textContent=text;},frameLoop:loop,frameDiagnostics:diagnostic,audio:{setSuspended(){}}};
 const sync=Function('env','with(env){return ('+source+');}')(env);
 for(const dialog of doc.querySelectorAll('dialog')){dialog.open=false;dialog.showModal=()=>{dialog.open=true;sync();};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));sync();};}
 for(const box of doc.querySelectorAll('textarea')){box.focus=()=>box.focused=true;box.select=()=>box.selected=true;}
 const click=id=>doc.getElementById(id).dispatchEvent(new window.Event('click',{bubbles:true}));
 return {doc,window,combat,diagnostic,loop,transitions,sync,click,tick:at=>{time=at;for(const callback of [...callbacks])callback();},setTime:at=>time=at,copy:()=>copied,stored:()=>stored};
}

test('actual main pause callback treats diagnostic detail as a modal and resumed frames exclude inspection time',async()=>{
 const f=fixture();f.sync();f.tick(0);f.tick(33);f.tick(66);f.combat.passiveRecovery.elapsed=1.9;
 f.setTime(80);f.click('diagnostic-expand');assert.equal(f.doc.getElementById('diagnostic-detail-dialog').open,true);assert.equal(f.loop.running,false);assert.equal(f.doc.getElementById('live-fps').textContent,'일시정지');assert.match(f.doc.getElementById('diagnostic-fps').textContent,/일시정지/);assert.equal(f.doc.getElementById('frame-diagnostics').dataset.expanded,'false');
 f.tick(6000);assert.equal(f.loop.running,false);assert.equal(f.combat.hp,317);assert.equal(f.combat.passiveRecovery.elapsed,0);f.click('diagnostic-detail-done');assert.equal(f.loop.running,true);assert.equal(f.doc.getElementById('diagnostic-expand').getAttribute('aria-expanded'),'false');
 f.tick(6033);f.tick(6066);await f.doc.getElementById('copy-frame-diagnostics').dispatchEvent(new f.window.Event('click'));await Promise.resolve();assert.ok(f.copy().summary.maxMs<34);assert.equal(f.copy().recentDelays.length,0);assert.deepEqual(f.transitions,[true,false,true]);
});

test('detail copy retains complete JSON and unavailable clipboard exposes a selectable readonly field inside visible modal',async()=>{
 const f=fixture({clipboardFails:true});f.sync();f.tick(0);f.tick(33);f.click('diagnostic-expand');
 await f.doc.getElementById('diagnostic-detail-copy').dispatchEvent(new f.window.Event('click'));await Promise.resolve();const box=f.doc.getElementById('diagnostic-detail-export');
 assert.equal(box.hidden,false);assert.equal(box.hasAttribute('readonly'),true);assert.equal(box.selected,true);const report=JSON.parse(box.value);assert.equal(report.version,4);assert.equal(report.renderMetrics.drawCalls,123);assert.equal(report.renderMetrics.gpu.status,'unsupported');assert.equal(report.renderMetrics.gpu.meanMs,null);assert.match(report.measurement,/not be added to CPU/);
 f.click('close-diagnostic-detail');f.click('diagnostic-expand');assert.equal(box.hidden,true,'previous fallback export never appears as a fresh record');
});

test('native-modal header and close/footer stay outside the scroll body; compact has only two metric lines and does not capture movement',()=>{
 const f=fixture(),dialog=f.doc.getElementById('diagnostic-detail-dialog'),body=dialog.querySelector('.diagnostic-detail-body'),panel=f.doc.getElementById('frame-diagnostics');
 assert.equal(panel.querySelectorAll('strong,span').length,2);assert.equal(panel.querySelector('details'),null);assert.equal(f.doc.getElementById('diagnostic-gpu').closest('dialog'),dialog);assert.equal(f.doc.getElementById('diagnostic-detail-copy').closest('.diagnostic-detail-body'),null);assert.equal(f.doc.getElementById('close-diagnostic-detail').closest('.diagnostic-detail-body'),null);assert.equal(f.doc.getElementById('diagnostic-fullscreen').closest('header'),dialog.querySelector('header'));assert.ok(body.contains(f.doc.getElementById('diagnostic-boss-comparison')));
 const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');assert.match(css,/#app > #frame-diagnostics\{[^}]*pointer-events:none/s);assert.match(css,/\.diagnostic-detail-body\{[^}]*overflow-y:auto/s);assert.match(css,/\.diagnostic-detail-dialog > header[^}]*flex-shrink:0/s);assert.match(css,/#app > #frame-diagnostics #diagnostic-expand\{[^}]*height:44px/s);
 for(const type of ['pointerdown','touchmove','keydown']){const event=new f.window.Event(type,{bubbles:true,cancelable:true});panel.dispatchEvent(event);assert.equal(event.defaultPrevented,false);}
});

test('legacy expanded DOM and serialized preference migrate to compact without opening a modal or losing enabled collection',async()=>{
 const f=fixture({stored:JSON.stringify({enabled:true,expanded:true}),legacyExpanded:true}),panel=f.doc.getElementById('frame-diagnostics'),dialog=f.doc.getElementById('diagnostic-detail-dialog');
 assert.equal(f.stored(),'1');assert.equal(f.diagnostic.enabled,true);assert.equal(panel.dataset.expanded,'false');assert.equal(panel.dataset.presentation,'compact');assert.equal(panel.classList.contains('expanded'),false);assert.equal(dialog.open,false);
 assert.equal(panel.style.height,'');assert.equal(panel.style.width,'');assert.equal(panel.style.pointerEvents,'');
 assert.equal(panel.querySelector('details'),null);assert.equal(f.doc.getElementById('diagnostic-gpu').closest('dialog'),dialog);assert.equal(f.doc.getElementById('diagnostic-expand').getAttribute('aria-expanded'),'false');
 f.sync();f.tick(0);panel.dataset.expanded='true';f.tick(33);assert.equal(panel.dataset.expanded,'false','a stale restore cannot expand the live HUD');
 f.click('diagnostic-expand');assert.equal(dialog.open,true);assert.equal(f.loop.running,false);f.click('diagnostic-detail-done');assert.equal(f.loop.running,true);
 f.diagnostic.mapChanged();assert.equal(panel.dataset.presentation,'compact');assert.equal(panel.dataset.expanded,'false');
 const mobile=readFileSync(new URL('../src/mobile-ui.css',import.meta.url),'utf8');assert.doesNotMatch(mobile,/\.frame-diagnostics\[data-expanded=true\]\{/);assert.match(mobile,/#app > #frame-diagnostics > :not\(#diagnostic-expand\):not\(#diagnostic-fps\):not\(#diagnostic-frame\)\{display:none!important\}/);
});

test('disabled legacy preference stays disabled even when expanded was true',()=>{
 const f=fixture({stored:JSON.stringify({enabled:false,expanded:true}),legacyExpanded:true});assert.equal(f.stored(),'0');assert.equal(f.diagnostic.enabled,false);assert.equal(f.doc.getElementById('frame-diagnostics').hidden,true);assert.equal(f.doc.getElementById('diagnostic-detail-dialog').open,false);
});
