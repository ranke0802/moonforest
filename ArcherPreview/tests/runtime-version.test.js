import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {setupRuntimeVersionPanel,runningAppBundle,deployedAppBundle} from '../src/runtime-version.js';
import {setupSettingsPanel} from '../src/settings-panel.js';

const PAGE='https://ranke0802.github.io/moonforest/ArcherPreviewSite/?character=warrior-v5&rev=old',PREFIX='/moonforest/ArcherPreviewSite/assets/';
const html=(id='RUN123')=>`<!doctype html><img src="models/never.glb"><iframe src="other-page"></iframe><script crossorigin type="module" src="${PREFIX}index-${id}.js"></script>`;
const response=(body=html(),options={})=>new Response(body,{status:200,headers:{'Content-Type':'text/html; charset=utf-8'},...options});
function fixture({fetcher=async()=>response(),setTimer,clearTimer}={}){
 const {document:doc,window}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8'));doc.querySelector('script[type="module"][src]').setAttribute('src',PREFIX+'index-RUN123.js?original=kept');
 const host=doc.createElement('div');host.id='version-host';doc.getElementById('app').append(host);let calls=0,request;
 const control=setupRuntimeVersionPanel({doc,host,pageUrl:PAGE,fetcher:(...args)=>{calls++;request=args;return fetcher(...args);},setTimer,clearTimer});
 return {doc,window,host,control,calls:()=>calls,request:()=>request};
}

test('only same-origin app assets/index hash module entries qualify; comments, other roots and models are ignored',()=>{
 const f=fixture();assert.equal(runningAppBundle(f.doc,PAGE).id,'RUN123');assert.equal(deployedAppBundle(html('NEXT_9-a'),PAGE).path,PREFIX+'index-NEXT_9-a.js');
 assert.equal(deployedAppBundle(`<!-- ${html('FAKE')} -->${html('RUN123')}`,PAGE).id,'RUN123');
 for(const src of ['https://evil.example'+PREFIX+'index-X.js','/other/assets/index-X.js',PREFIX+'model.glb',PREFIX+'index-X.js/extra','javascript:alert(1)'])assert.equal(deployedAppBundle(`<script type="module" src="${src}"></script>`,PAGE),null);
 assert.equal(deployedAppBundle(html('ONE')+html('TWO'),PAGE),null);assert.equal(deployedAppBundle('<script type="module" src="assets/index-ONE.js" src="assets/index-TWO.js"></script>',PAGE),null);f.control.dispose();
});

test('setup and settings interaction fetch nothing; explicit current check requests index once and preserves running bundle/game DOM',async()=>{
 const f=fixture(),canvas=f.doc.getElementById('viewport'),attack=f.doc.getElementById('attack-button'),source=f.doc.querySelector('script[type="module"][src]').getAttribute('src');
 assert.equal(f.calls(),0);f.control.element.querySelector('details').open=true;assert.equal(f.calls(),0);
 const result=await f.control.check();assert.equal(result.state,'current');assert.equal(f.calls(),1);const [url,options]=f.request();assert.equal(url,'https://ranke0802.github.io/moonforest/ArcherPreviewSite/index.html');assert.equal(options.cache,'no-cache');assert.equal(options.redirect,'error');assert.equal(options.signal.aborted,false);
 assert.equal(f.doc.querySelectorAll('iframe').length,0,'fetched page never mounts HTML resources');assert.equal(f.doc.getElementById('viewport'),canvas);assert.equal(f.doc.getElementById('attack-button'),attack);assert.equal(f.doc.querySelector('script[type="module"][src]').getAttribute('src'),source);assert.match(f.doc.getElementById('runtime-version-status').textContent,/현재 배포 버전과 같습니다/);f.control.dispose();
});

test('overlapping clicks share one promise; outdated result gives manual post-combat advice without reload',async()=>{
 let reply;const f=fixture({fetcher:()=>new Promise(resolve=>reply=resolve)}),first=f.control.check(),second=f.control.check();assert.equal(first,second);await Promise.resolve();assert.equal(f.calls(),1);assert.equal(f.doc.getElementById('check-runtime-version').disabled,true);
 f.doc.getElementById('check-runtime-version').dispatchEvent(new f.window.Event('click'));assert.equal(f.calls(),1);reply(response(html('NEW456')));const result=await first;assert.equal(result.state,'outdated');assert.match(f.doc.getElementById('runtime-version-status').textContent,/전투를 마친 뒤 새로고침/);assert.equal(f.doc.getElementById('check-runtime-version').disabled,false);assert.equal(f.calls(),1);f.control.dispose();
});

test('failed or invalid responses give a single failure with no automatic retry or extra asset fetch',async()=>{
 for(const fetcher of [async()=>{throw Error('offline');},async()=>response(html(),{status:503}),async()=>response('{}',{headers:{'Content-Type':'application/json'}}),async()=>response('<html>No module</html>'),async()=>response('<script type="module" src="https://evil.test/assets/index-X.js"></script>')]){
  const f=fixture({fetcher});assert.equal((await f.control.check()).state,'error');await Promise.resolve();assert.equal(f.calls(),1);assert.match(f.doc.getElementById('runtime-version-status').textContent,/확인하지 못했습니다/);assert.equal(f.doc.getElementById('check-runtime-version').disabled,false);f.control.dispose();
 }
});

test('unexpected final response origin/path is rejected even when its HTML contains a plausible app bundle',async()=>{
 for(const url of ['https://evil.example/index.html','https://ranke0802.github.io/other/index.html']){
  const f=fixture({fetcher:async()=>{const r=response(html('NEW456'));Object.defineProperty(r,'url',{value:url});return r;}});assert.equal((await f.control.check()).state,'error');assert.equal(f.calls(),1);f.control.dispose();
 }
});

test('timeout aborts once and clears its timer even if the transport ignores abort',async()=>{
 let timer,cleared=0;const f=fixture({fetcher:()=>new Promise(()=>{}),setTimer:callback=>{timer=callback;return 7;},clearTimer:id=>{assert.equal(id,7);cleared++;}}),pending=f.control.check();await Promise.resolve();assert.equal(f.calls(),1);timer();const result=await pending;
 assert.equal(result.state,'error');assert.equal(result.timeout,true);assert.equal(f.request()[1].signal.aborted,true);assert.equal(cleared,1);assert.equal(f.calls(),1);assert.match(f.doc.getElementById('runtime-version-status').textContent,/시간이 초과/);f.control.dispose();
});

test('dispose settles a pending check, aborts it, and never changes detached DOM after late response',async()=>{
 let reply;const f=fixture({fetcher:()=>new Promise(resolve=>reply=resolve)}),pending=f.control.check();await Promise.resolve();const panel=f.control.element;f.control.dispose();const snapshot=panel.outerHTML;
 assert.equal((await pending).state,'disposed');assert.equal(f.request()[1].signal.aborted,true);assert.equal(f.doc.getElementById('runtime-version'),null);reply(response(html('TOO_LATE')));await Promise.resolve();await Promise.resolve();assert.equal(panel.outerHTML,snapshot);assert.equal((await f.control.check()).state,'disposed');assert.equal(f.calls(),1);
});

test('real settings reinitialization reuses the one panel without replacing controls or adding network work',async t=>{
 const {document:doc}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),prior=globalThis.document,priorFetch=globalThis.fetch;globalThis.document=doc;let calls=0;globalThis.fetch=()=>{calls++;return Promise.resolve(response());};t.after(()=>{globalThis.document=prior;globalThis.fetch=priorFetch;});Object.defineProperty(doc,'location',{value:{href:PAGE}});doc.querySelector('script[type="module"][src]').setAttribute('src',PREFIX+'index-RUN123.js');const fullscreen=doc.getElementById('fullscreen-button'),canvas=doc.getElementById('viewport');
 const first=setupSettingsPanel(),second=setupSettingsPanel();assert.equal(first,second);assert.equal(doc.querySelectorAll('#runtime-version').length,1);assert.equal(doc.querySelectorAll('.settings-sections').length,1);assert.equal(doc.querySelectorAll('#live-fps').length,1);assert.equal(doc.getElementById('fullscreen-button'),fullscreen);assert.equal(doc.getElementById('viewport'),canvas);assert.equal(first.element.closest('#current-state-settings').querySelector('summary').textContent,'현재 상태');assert.equal(first.element.querySelector('details').hasAttribute('open'),false);
 doc.getElementById('motion-speed-dialog').open=true;await Promise.resolve();assert.equal(calls,0,'opening settings is not permission to start a network check');first.dispose();const third=setupSettingsPanel();assert.notEqual(third,first);assert.equal(doc.querySelectorAll('#runtime-version').length,1);third.dispose();
});

test('unbuilt development entry never downloads HTML/models and stays a manual unsupported check',async()=>{
 const f=fixture();f.control.dispose();f.doc.querySelector('script[type="module"][src]').setAttribute('src','/src/main.js');let calls=0;const control=setupRuntimeVersionPanel({doc:f.doc,host:f.host,pageUrl:PAGE,fetcher:()=>{calls++;throw Error('no fetch expected');}});
 assert.equal((await control.check()).state,'unsupported');assert.equal(calls,0);control.dispose();
});
