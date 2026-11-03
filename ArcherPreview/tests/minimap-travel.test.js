import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {MINIMAP_REGIONS,minimapTravelBlocked,setupMinimapTravel} from '../src/minimap-travel.js';
import {createMapTransition,carryPortalPose} from '../src/map-transition.js';
import {worldSpawn} from '../src/map-route.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}){
 const {document,window}=parseHTML('<html><body><main id="app"><aside id="map"><strong>마을</strong><canvas></canvas><small>● 나 · ◆ 포탈</small></aside><dialog id="other"></dialog></main></body></html>');
 const create=document.createElement.bind(document);document.createElement=(name,...args)=>{
  const element=create(name,...args);if(name==='dialog'){
   Object.defineProperty(element,'open',{get(){return this.hasAttribute('open');}});
   element.showModal=()=>element.setAttribute('open','');element.close=()=>{if(!element.open)return;element.removeAttribute('open');queueMicrotask(()=>element.dispatchEvent(new window.Event('close')));};
  }return element;
 };
 const state={character:'warrior-v3',ready:true,loading:false,busy:false,dead:false,captured:false,healing:false,enemies:0,...options.state},root=document.getElementById('app'),element=document.getElementById('map'),requests=[],pause=[];
 let resets=0,href='https://example.test/play/?character=warrior-v3&uiTest=1&quality=high',api;
 api=setupMinimapTravel({element,root,getState:()=>state,getHref:()=>href,onTravel:async url=>requests.push(url),resetInput:()=>resets++,onPauseChange:()=>pause.push(api.isOpen()),...options});
 const click=selector=>{const target=root.querySelector(selector);assert.ok(target,selector);target.dispatchEvent(new window.Event('click',{bubbles:true}));};
 return {api,document,window,root,element,state,requests,pause,click,get resets(){return resets;},setHref:value=>href=value};
}

test('a minimap tap opens four accessible regions, keeps the current one selected, and back/Escape resume once',async t=>{
 const f=fixture();t.after(()=>f.api.dispose());
 f.click('.minimap-travel-launch span');assert.equal(f.api.isOpen(),true);assert.deepEqual(f.pause,[true]);assert.equal(f.resets,1);
 const launcher=f.root.querySelector('.minimap-travel-launch');assert.equal(launcher.type,'button');assert.equal(launcher.getAttribute('aria-haspopup'),'dialog');assert.equal(launcher.getAttribute('aria-expanded'),'true');
 assert.equal(f.root.querySelectorAll('[data-region]').length,4);
 for(const region of MINIMAP_REGIONS){const button=f.root.querySelector(`[data-region="${region.character}"]`);assert.equal(button.querySelector('strong').textContent,region.label);assert.equal(button.disabled,region.character===f.state.character);}
 f.click('footer [data-region-close]');await tick();assert.equal(f.api.isOpen(),false);assert.deepEqual(f.pause,[true,false]);assert.equal(launcher.getAttribute('aria-expanded'),'false');assert.equal(f.requests.length,0);
 f.click('.minimap-travel-launch');f.root.querySelector('#minimap-travel-dialog').dispatchEvent(new f.window.Event('cancel',{cancelable:true}));await tick();assert.equal(f.api.isOpen(),false);assert.deepEqual(f.pause,[true,false,true,false]);
});

test('travel safety is checked again at selection, while other dialogs and loading never open another modal',async t=>{
 const f=fixture();t.after(()=>f.api.dispose());
 for(const update of [{loading:true},{busy:true},{ready:false},{character:'archer'}]){const original={...f.state};Object.assign(f.state,update);f.click('.minimap-travel-launch');assert.equal(f.api.isOpen(),false);Object.assign(f.state,original);}
 f.document.getElementById('other').setAttribute('open','');f.click('.minimap-travel-launch');assert.equal(f.api.isOpen(),false);f.document.getElementById('other').removeAttribute('open');
 f.click('.minimap-travel-launch');
 for(const update of [{enemies:1},{dead:true},{captured:true},{healing:true},{busy:true},{ready:false}]){
  const original={...f.state};Object.assign(f.state,update);f.click('[data-region="warrior-v4"]');assert.equal(f.requests.length,0);assert.ok(f.root.querySelector('[role="status"]').textContent);assert.ok(minimapTravelBlocked(f.state));Object.assign(f.state,original);
  f.api.close();await tick();f.click('.minimap-travel-launch');
 }
 f.api.close();await tick();Object.assign(f.state,{enemies:1});f.click('.minimap-travel-launch');assert.equal(f.api.isOpen(),true);assert.ok([...f.root.querySelectorAll('[data-region]')].every(button=>button.disabled));assert.match(f.root.querySelector('[role="status"]').textContent,/전투/);
});

test('all map choices use safe in-document arrivals and preserve player, equipment, camera, fullscreen and UI-test routing',async t=>{
 let f,href='https://example.test/play/?character=warrior-v3&uiTest=1&quality=high&elenaReview=1',paused=false;
 const actor={position:{x:5,z:5},rotation:{y:1.2},hp:287},equipment={weapon:'sword',armor:'plate'},camera={alpha:.8,beta:.9,radius:17},pan={x:1,y:.2,z:2},fullscreen={active:true},state={character:'warrior-v3',ready:true,enemies:0},events=[];
 const refs={actor,equipment,camera,fullscreen};
 const transition=createMapTransition({frame:async()=>{},prepare(){events.push('prepare');state.ready=false;paused=true;},release:async()=>events.push('release'),load:async url=>{
  events.push('load');const target=new URL(url),destination=target.searchParams.get('character'),previous=state.character;
  Object.assign(actor.position,worldSpawn(destination,target.search));carryPortalPose(actor,camera,pan,{from:previous,to:destination});state.character=destination;href=url;
 },finish(){events.push('finish');state.ready=true;paused=f.api.isOpen();}});
 f=fixture({getState:()=>({...state,busy:transition.busy}),getHref:()=>href,onTravel:url=>transition.travel(url),onPauseChange:()=>{if(!transition.busy)paused=f.api.isOpen()||transition.failed;}});t.after(()=>f.api.dispose());
 for(const destination of ['warrior-v5','warrior-v4','warrior-plains','warrior-v3','warrior-v4']){
  f.click('.minimap-travel-launch');assert.equal(paused,true);f.click(`[data-region="${destination}"]`);await tick();
  const url=new URL(href);assert.equal(url.searchParams.get('character'),destination);assert.equal(url.searchParams.get('arrival'),'portal');assert.equal(url.searchParams.get('uiTest'),'1');assert.equal(url.searchParams.get('quality'),'high');assert.equal(url.searchParams.has('elenaReview'),false);
  assert.deepEqual(actor.position,worldSpawn(destination,url.search));assert.equal(actor.hp,287);assert.strictEqual(actor,refs.actor);assert.strictEqual(equipment,refs.equipment);assert.deepEqual(equipment,{weapon:'sword',armor:'plate'});assert.strictEqual(camera,refs.camera);assert.equal(camera.beta,.9);assert.equal(camera.radius,17);assert.strictEqual(fullscreen,refs.fullscreen);assert.equal(fullscreen.active,true);assert.equal(f.api.isOpen(),false);assert.equal(paused,false);
 }
 assert.deepEqual(events,Array.from({length:5},()=>['prepare','release','load','finish']).flat());
});

test('rapid repeated selection enters one transition; failure stays paused and belongs to existing retry flow',async t=>{
 let f,release,paused=false,loads=0;const state={character:'warrior-v3',ready:true,enemies:0};
 const transition=createMapTransition({frame:async()=>{},prepare(){state.ready=false;paused=true;},release:()=>new Promise(resolve=>release=resolve),load:async()=>{loads++;throw Error('offline');},finish:()=>assert.fail('must keep the existing failure curtain')});
 f=fixture({getState:()=>({...state,busy:transition.busy||transition.failed}),onTravel:url=>transition.travel(url),onPauseChange:()=>{if(!transition.busy)paused=f.api.isOpen()||transition.failed;}});t.after(()=>f.api.dispose());
 f.click('.minimap-travel-launch');f.click('[data-region="warrior-v4"]');f.click('[data-region="warrior-v5"]');await tick();assert.equal(transition.busy,true);assert.equal(f.api.isOpen(),false);assert.equal(paused,true);
 release();await tick();assert.equal(loads,1);assert.equal(transition.failed,true);assert.equal(transition.inspect().retryAvailable,true);assert.equal(paused,true);f.click('.minimap-travel-launch');assert.equal(f.api.isOpen(),false);
});

test('repeated setup replaces its own controls without touching minimap canvas or leaving an open modal',async()=>{
 const f=fixture(),canvas=f.element.querySelector('canvas');f.click('.minimap-travel-launch');
 const next=setupMinimapTravel({element:f.element,root:f.root,getState:()=>f.state,onTravel:async()=>{}});await tick();assert.equal(f.api.isOpen(),false);assert.equal(f.root.querySelectorAll('#minimap-travel-dialog').length,1);assert.equal(f.element.querySelectorAll('.minimap-travel-launch').length,1);assert.strictEqual(f.element.querySelector('canvas'),canvas);
 next.dispose();next.dispose();assert.equal(f.root.querySelectorAll('#minimap-travel-dialog').length,0);assert.equal(f.element.querySelectorAll('.minimap-travel-launch').length,0);assert.strictEqual(f.element.querySelector('canvas'),canvas);
});

test('the minimap control has a local tap target and chooser bounds/touch targets respect mobile safe areas',()=>{
 const css=readFileSync(new URL('../src/dot-minimap.css',import.meta.url),'utf8'),main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(css,/\.minimap-travel-launch\{[^}]*pointer-events:auto/);assert.match(css,/minimap-travel-dialog[^}]*safe-area-inset-left/);assert.match(css,/minimap-travel-dialog button\{[^}]*min-height:44px/);assert.match(css,/orientation:landscape/);
 assert.match(main,/onTravel:url=>mapTransition\.travel\(url\)/);assert.match(main,/otherSettings=minimapTravel\?\.isOpen\(\)/);assert.match(main,/minimapTravel\?\.close\(\);minimap\.hide\(\)/);
});
