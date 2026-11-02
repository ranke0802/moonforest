import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createLoadingView,loadingErrorRecord,needsModuleReload} from '../src/loading-view.js';
import {createFrameDiagnostics} from '../src/frame-diagnostics.js';
import {LoadDiagnostics} from '../src/load-diagnostics.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(writeText){const {document,window}=parseHTML(html),get=id=>document.getElementById(id),view=createLoadingView(document,{clipboard:writeText?{writeText}:null});const box=get('loading-diagnostics-export');let selected=0;box.select=()=>selected++;return {document,window,get,view,click:()=>get('copy-loading-diagnostics').dispatchEvent(new window.Event('click')),get selected(){return selected;}};}

test('loading failure exposes actual error and copies full diagnostics with performance HUD disabled',async()=>{
 let copied,time=0;const f=fixture(async value=>copied=JSON.parse(value)),loads=new LoadDiagnostics(()=>time),diagnostics=createFrameDiagnostics({doc:f.document,storage:{getItem:()=> '0'},loads,metadata:()=>({character:'warrior-v5',bundle:'./assets/current.js',ktxWorker:{status:'ready'},resourceDownloads:{downloadBytes:0}}),memory:()=>({jsUsedBytes:null})});
 f.view.setDiagnostics(()=>diagnostics.snapshot());loads.begin('동굴');loads.phase('download');time=12;loads.finish('Illegal invocation');f.view.begin();const error=Object.assign(new TypeError('Illegal invocation'),{code:'TEST_CODE',stage:'manifest'});f.view.fail('불러오기 실패','진단을 전달해 주세요.',{error,phase:loads.snapshot().failedPhase});
 assert.equal(diagnostics.enabled,false);assert.equal(f.get('loading').hidden,false);assert.equal(f.get('copy-loading-diagnostics').hidden,false);assert.match(f.get('loading-error-message').textContent,/TypeError: Illegal invocation/);assert.match(f.get('loading-error-stack').textContent,/loading-error-diagnostics/);f.click();await flush();
 assert.equal(copied.character,'warrior-v5');assert.equal(copied.bundle,'./assets/current.js');assert.equal(copied.failure.name,'TypeError');assert.equal(copied.failure.message,error.message);assert.equal(copied.failure.stack,error.stack);assert.equal(copied.failure.code,'TEST_CODE');assert.equal(copied.failure.phase,'download');assert.equal(copied.loading.failedPhase,'download');assert.equal(copied.resourceDownloads.downloadBytes,0);assert.equal(copied.ktxWorker.status,'ready');assert.match(f.get('loading-copy-status').textContent,/복사했습니다/);
});

for(const denial of [true,false])test(`clipboard ${denial?'denial':'absence'} offers selectable diagnostic text inside the visible failure curtain`,async()=>{
 const f=fixture(denial?async()=>{throw Error('Denied');}:null);f.view.setDiagnostics(()=>({bundle:'test',loading:{phase:'error'}}));f.view.fail('오류','실패',{error:new Error('<img src=x onerror=bad()>'),phase:'setup'});f.click();await flush();assert.equal(f.get('loading-diagnostics-export').hidden,false);assert.equal(f.selected,1);assert.equal(f.get('loading-diagnostics-export').hasAttribute('readonly'),true);assert.equal(f.get('loading-error-message').querySelector('img'),null);const data=JSON.parse(f.get('loading-diagnostics-export').value);assert.equal(data.failure.message,'<img src=x onerror=bad()>');assert.equal(f.get('loading-diagnostics-export').closest('#loading'),f.get('loading'));
});

test('late clipboard completion cannot replace the UI of a retry or a newer failure',async()=>{
 let reject;const f=fixture(()=>new Promise((_r,j)=>reject=j));f.view.fail('old','old',{error:new Error('first')});f.click();f.view.begin();reject(Error('late denied'));await flush();assert.equal(f.get('loading-error').hidden,true);assert.equal(f.get('copy-loading-diagnostics').hidden,true);assert.equal(f.get('loading-copy-status').textContent,'');assert.equal(f.get('loading-diagnostics-export').hidden,true);
 f.view.fail('second','new',{error:new Error('second')});f.click();f.view.fail('third','newer',{error:new Error('third')});reject(Error('late denied'));await flush();assert.match(f.get('loading-error-message').textContent,/third/);assert.equal(f.get('copy-loading-diagnostics').disabled,false);assert.equal(f.get('loading-copy-status').textContent,'');
});

test('diagnostic capture failure preserves the original error and engine failures retain copy without a broken retry button',async()=>{
 let copied;const f=fixture(async value=>copied=JSON.parse(value));f.view.setDiagnostics(()=>{throw Error('context unavailable');});f.view.fail('3D 시작 실패','새로고침',{error:new Error('WebGL unavailable'),phase:'engine-initialization',retry:false});f.click();await flush();assert.equal(copied.failure.message,'WebGL unavailable');assert.equal(copied.diagnosticCaptureError.message,'context unavailable');assert.equal(f.get('retry-load').hidden,true);assert.equal(f.get('copy-loading-diagnostics').hidden,false);assert.equal(f.view.reveal(),false);
});

test('error serialization bounds cause chains and normal preparation/reveal hides diagnostic controls',()=>{
 const a=new Error('a'),b=new Error('b');a.cause=b;b.cause=a;assert.doesNotThrow(()=>JSON.stringify(loadingErrorRecord(a)));const f=fixture();f.view.fail('x','x',{error:a});f.view.begin();f.view.download({total:0,loaded:0,ratio:1,complete:true});assert.equal(f.get('loading-error').hidden,true);assert.equal(f.get('copy-loading-diagnostics').hidden,true);f.view.reveal();assert.equal(f.get('loading').hidden,true);
 assert.match(html,/#loading-diagnostics-export\{[^}]*user-select:text/);assert.match(html,/@media\(max-height:450px\)/);
});

test('stale module failure offers one manual page refresh and preserves map/UI query and resource cache',async()=>{
 let copied;const f=fixture(async value=>copied=JSON.parse(value)),navigations=[];
 const cause=new TypeError('Failed to fetch dynamically imported module: https://example.test/assets/old-loader.js');
 const error=Object.assign(new Error('바닥 준비 실패',{cause}),{textureRole:'color',resourceUrl:'https://example.test/assets/content/file.ktx2',loaderMessage:cause.message,repairStatus:'skipped-module'});
 f.view.fail('실패','다시 시도',{error,phase:'ground'});
 assert.equal(f.view.failed,true);assert.equal(f.get('retry-load').textContent,'페이지 새로 불러오기');assert.equal(navigations.length,0);
 assert.match(f.get('loading-error-stack').textContent,/old-loader/);f.click();await flush();
 assert.equal(copied.failure.recovery,'reload-page');assert.equal(copied.failure.textureRole,'color');assert.equal(copied.failure.resourceUrl,error.resourceUrl);assert.equal(copied.failure.loaderMessage,cause.message);
 const page={href:'https://example.test/?character=warrior-v5&uiTest=1&arrival=portal&from=warrior-v4#game',replace:url=>navigations.push(url)};
 assert.equal(f.view.retryPageIfRequired(page,()=>1234),true);assert.equal(f.view.retryPageIfRequired(page,()=>4567),true);assert.equal(navigations.length,1);
 const target=new URL(navigations[0]);assert.equal(target.searchParams.get('character'),'warrior-v5');assert.equal(target.searchParams.get('uiTest'),'1');assert.equal(target.searchParams.get('from'),'warrior-v4');assert.equal(target.searchParams.get('_reload'),'1234');assert.equal(target.hash,'#game');
 f.view.begin();assert.equal(f.view.failed,false);assert.equal(f.view.retryPageIfRequired(page),false);
 f.view.fail('중단','다시 시도',{error:Error('네트워크 응답 없음')});assert.equal(f.view.retryPageIfRequired(page),false);assert.equal(f.get('retry-load').textContent,'다시 불러오기');
});

test('module recovery classification supports mobile engines and does not refresh ordinary texture or timeout failures',()=>{
 for(const message of ['Failed to fetch dynamically imported module','error loading dynamically imported module','Importing a module script failed.'])assert.equal(needsModuleReload(new Error('Texture failed',{cause:Error(message)})),true);
 for(const error of [Error('Invalid KTX texture'),Error('Network request failed'),Object.assign(Error('시간 초과'),{name:'TimeoutError'})])assert.equal(needsModuleReload(error),false);
 const circular=Error('not a module error');circular.cause=circular;assert.equal(needsModuleReload(circular),false);
});
