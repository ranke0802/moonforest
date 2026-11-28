import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
import {createContextRecovery,createContextRecoveryNotice} from '../src/context-recovery.js';

function fixture(options={}){
 const observable=()=>{const items=new Set();return {add:fn=>(items.add(fn),fn),remove:fn=>items.delete(fn),emit(){for(const fn of [...items])fn();},get size(){return items.size;}};};
 const engine={onContextLostObservable:observable(),onContextRestoredObservable:observable()},calls=[],timers=new Map();let next=0;
 const recovery=createContextRecovery(engine,{setTimer:fn=>(timers.set(++next,fn),next),clearTimer:id=>timers.delete(id),onLost:()=>calls.push('lost'),onRestored:()=>calls.push('restored'),onTimeout:()=>calls.push('timeout'),...options});
 return {engine,calls,timers,recovery,expire(){for(const fn of [...timers.values()])fn();}};
}

test('context loss pauses once, restore cancels deadline, repeated cycles do not accumulate observers',()=>{
 const f=fixture();assert.equal(f.recovery.blocked,false);f.engine.onContextLostObservable.emit();f.engine.onContextLostObservable.emit();assert.deepEqual(f.calls,['lost']);assert.equal(f.timers.size,1);assert.equal(f.recovery.blocked,true);
 f.engine.onContextRestoredObservable.emit();assert.equal(f.recovery.blocked,false);assert.equal(f.timers.size,0);assert.deepEqual(f.calls,['lost','restored']);
 f.engine.onContextLostObservable.emit();f.engine.onContextRestoredObservable.emit();assert.equal(f.recovery.snapshot().losses,2);assert.equal(f.engine.onContextLostObservable.size,1);f.recovery.dispose();assert.equal(f.engine.onContextLostObservable.size,0);assert.equal(f.engine.onContextRestoredObservable.size,0);
});

test('timeout remains paused even after late restore, disposal releases pending timer',()=>{
 const f=fixture();f.engine.onContextLostObservable.emit();f.expire();assert.equal(f.recovery.snapshot().state,'failed');f.engine.onContextRestoredObservable.emit();assert.deepEqual(f.calls,['lost','timeout']);assert.equal(f.recovery.blocked,true);
 const fresh=fixture();fresh.engine.onContextLostObservable.emit();fresh.recovery.dispose();assert.equal(fresh.timers.size,0);fresh.engine.onContextRestoredObservable.emit();assert.deepEqual(fresh.calls,['lost']);
});

test('owned resource failure is read after all native restore observers and stops playback', async()=>{
 let ready=true;
 const success=fixture({restoreReady:()=>ready});
 ready=false;
 success.engine.onContextRestoredObservable.add(()=>{ready=true;});
 success.engine.onContextLostObservable.emit();
 success.engine.onContextRestoredObservable.emit();
 assert.equal(success.recovery.blocked,true);
 await Promise.resolve();
 assert.deepEqual(success.calls,['lost','restored']);
 assert.equal(success.recovery.blocked,false);
 assert.equal(success.timers.size,0);

 const failure=fixture({restoreReady:()=>ready});
 failure.engine.onContextRestoredObservable.add(()=>{ready=false;});
 failure.engine.onContextLostObservable.emit();
 failure.engine.onContextRestoredObservable.emit();
 await Promise.resolve();
 assert.deepEqual(failure.calls,['lost','timeout']);
 assert.equal(failure.recovery.snapshot().state,'failed');
 assert.equal(failure.recovery.blocked,true);
 assert.equal(failure.timers.size,0);
});

test('recovery notice blocks dismissal, offers explicit retry only after failure, and owns its DOM lifetime',()=>{
 const {document,window}=parseHTML('<html><body></body></html>');let reloads=0;const notice=createContextRecoveryNotice(document,{reload:()=>reloads++}),panel=document.querySelector('dialog'),button=panel.querySelector('button');
 notice.show();assert.equal(panel.hasAttribute('open'),true);assert.equal(button.hidden,true);const event=new window.Event('cancel',{cancelable:true});panel.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 notice.fail();assert.equal(button.hidden,false);assert.match(panel.textContent,/진행과 리소스는 지우지 않습니다/);button.click();assert.equal(reloads,1);notice.hide();assert.equal(panel.hasAttribute('open'),false);notice.dispose();assert.equal(document.body.children.length,0);
});

const html=readFileSync(new URL('../moonforest-0.2.html',import.meta.url),'utf8');
function startup(){
 const {document}=parseHTML(html),listeners=new Map(),timers=new Map(),replaced=[];let next=0;
 const window={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:(key,fn)=>{if(listeners.get(key)===fn)listeners.delete(key);}};
 const location={href:'https://example.test/moonforest-0.2.html?character=warrior-v5&rev=abc#play',replace:href=>replaced.push(href)};
 const script=html.match(/<script id="moonforest-startup-guard">([\s\S]*?)<\/script>/)[1];
 runInNewContext(script,{window,document,location,URL,Date,setTimeout:fn=>(timers.set(++next,fn),next),clearTimeout:id=>timers.delete(id)});
 return {document,window,listeners,timers,replaced,error(){listeners.get('error')?.({target:{tagName:'SCRIPT'}});}};
}
test('entry module network/parse failure shows fallback before game modules run and manual retry preserves route',()=>{
 const f=startup();f.error();assert.equal(f.document.getElementById('loading-error').hidden,false);assert.match(f.document.getElementById('loading-error-message').textContent,/MoonForest 0.2.*abc/);assert.equal(f.document.getElementById('retry-load').hidden,false);assert.equal(f.replaced.length,0);
 f.document.getElementById('retry-load').click();assert.equal(f.replaced.length,1);const url=new URL(f.replaced[0]);assert.equal(url.searchParams.get('character'),'warrior-v5');assert.equal(url.searchParams.get('rev'),'abc');assert.equal(url.hash,'#play');assert.ok(url.searchParams.has('_reload'));
});
test('entry no-response deadline is bounded; successful or late module entry removes fallback retry listener',()=>{
 const f=startup();for(const fn of f.timers.values())fn();assert.match(f.document.getElementById('loading-error-message').textContent,/30초/);f.window.__moonforestStartup.entered();f.document.getElementById('retry-load').click();assert.equal(f.replaced.length,0);assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
 const success=startup();success.window.__moonforestStartup.entered();assert.equal(success.timers.size,0);assert.equal(success.window.__moonforestStartup,undefined);
});
test('main integrates recovery without unpausing settings/death or changing 0.1 restore behavior',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.match(main,/if\(versionRoute.release==='moonforest-0.2'\)\{/);assert.match(main,/paused=document.hidden\|\|settingsOpen\|\|deathScreen.isOpen\(\)[^;]+contextRecovery\?\.blocked===true/);assert.match(main,/function render\(dt\) \{\s*if\(contextRecovery\?\.blocked\)return;/);assert.match(main,/else engine.onContextRestoredObservable.add/);
});
