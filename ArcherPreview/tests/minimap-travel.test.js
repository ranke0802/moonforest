import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {MINIMAP_REGIONS,minimapTravelBlocked,minimapTravelUrl,setupMinimapTravel,applyMinimapArrivalPose} from '../src/minimap-travel.js';
import {ELENA_SANCTUARY_WAYPOINT,travelWaypoint} from '../src/map-waypoints.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles,CAVE_ROUTES} from '../src/witch-cave-layout.js';
import {ELENA_HOME} from '../src/elena-spec.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {createMapTransition,carryPortalPose} from '../src/map-transition.js';
import {worldSpawn} from '../src/map-route.js';
import {DotMinimap} from '../src/dot-minimap.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('minimap arrival faces into each destination and puts camera behind player without changing zoom',()=>{
 for(const destination of ['warrior-v3','warrior-plains','warrior-v4','warrior-v5']){
  const position=worldSpawn(destination,'?arrival=portal&from=warrior-v3'),actor={rotation:{y:2}},camera={alpha:2,beta:.9,radius:17},pan={x:4,y:2,z:3};
  const yaw=applyMinimapArrivalPose(actor,camera,pan,{destination,position});assert.ok(Number.isFinite(yaw));assert.ok(Math.abs(Math.cos(camera.alpha)+Math.sin(yaw))<1e-10);assert.ok(Math.abs(Math.sin(camera.alpha)+Math.cos(yaw))<1e-10);assert.deepEqual(pan,{x:0,y:0,z:0});assert.equal(camera.radius,17);assert.equal(camera.beta,.9);
 }
 const actor={rotation:{}},camera={},pan={};const position=ELENA_SANCTUARY_WAYPOINT.position,yaw=applyMinimapArrivalPose(actor,camera,pan,{destination:'warrior-v5',position,waypoint:ELENA_SANCTUARY_WAYPOINT});assert.ok(Math.sin(yaw)<0&&Math.cos(yaw)<0);
});
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

test('a minimap tap opens five destinations in the requested order, keeps the current region selected, and back/Escape resume once',async t=>{
 const f=fixture();t.after(()=>f.api.dispose());
 f.click('.minimap-travel-launch span');assert.equal(f.api.isOpen(),true);assert.deepEqual(f.pause,[true]);assert.equal(f.resets,1);
 const launcher=f.root.querySelector('.minimap-travel-launch');assert.equal(launcher.type,'button');assert.equal(launcher.getAttribute('aria-haspopup'),'dialog');assert.equal(launcher.getAttribute('aria-expanded'),'true');
 assert.equal(f.root.querySelectorAll('[data-region]').length,5);
 assert.deepEqual([...f.root.querySelectorAll('[data-region]')].map(b=>b.querySelector('strong').textContent),['마을','대평원','마물의 숲','마녀의 동굴','비탄의 성소']);
 for(const region of MINIMAP_REGIONS){const button=f.root.querySelector(`[data-region="${region.id}"]`);assert.equal(button.querySelector('strong').textContent,region.label);assert.equal(button.disabled,!region.waypoint&&region.character===f.state.character);}
 f.click('footer [data-region-close]');await tick();assert.equal(f.api.isOpen(),false);assert.deepEqual(f.pause,[true,false]);assert.equal(launcher.getAttribute('aria-expanded'),'false');assert.equal(f.requests.length,0);
 f.click('.minimap-travel-launch');f.root.querySelector('#minimap-travel-dialog').dispatchEvent(new f.window.Event('cancel',{cancelable:true}));await tick();assert.equal(f.api.isOpen(),false);assert.deepEqual(f.pause,[true,false,true,false]);
});

test('actual chooser and warm minimap header show region names separately from destination notes',async t=>{
 const f=fixture();t.after(()=>f.api.dispose());f.click('.minimap-travel-launch');
 for(const [character,label,note]of [
  ['warrior-v3','마을','현재 지역'],['warrior-plains','대평원','길의 입구로 이동'],
  ['warrior-v4','마물의 숲','숲 입구로 이동'],['warrior-v5','마녀의 동굴','동굴 입구로 이동'],
 ]){
  const button=f.root.querySelector(`[data-region="${character}"]`);assert.equal(button.querySelector('strong').textContent,label);assert.equal(button.querySelector('small').textContent,note);assert.doesNotMatch(button.textContent,/undefined|null/);
 }
 f.api.close();await tick();f.state.character='warrior-plains';f.click('.minimap-travel-launch');
 const current=f.root.querySelector('[data-region="warrior-plains"]');assert.equal(current.querySelector('strong').textContent,'대평원');assert.equal(current.querySelector('small').textContent,'현재 지역');assert.equal(current.disabled,true);
 f.element.querySelector('canvas').getContext=()=>({});const map=new DotMinimap(f.element,{document:f.document});
 // The normal cached-raster path updates the real header without new rendering.
 map.cache.set('great-plains',{});map.cacheRevisions.set('great-plains',0);await map.setWorld({mapId:'great-plains'});assert.equal(f.element.querySelector('strong').textContent,'대평원');assert.equal(f.element.hidden,false);map.dispose();
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

test('sanctuary remains selectable inside the cave and requests only its explicit waypoint while clearing stale markers from ordinary choices',async t=>{
 let complete;const requests=[],pending=new Promise(resolve=>complete=resolve),f=fixture({state:{character:'warrior-v5'},onTravel:async url=>{requests.push(url);await pending;}});t.after(()=>f.api.dispose());
 f.setHref('https://example.test/play/?character=warrior-v5&uiTest=1&quality=high&elenaReview=battle');
 f.click('.minimap-travel-launch');assert.equal(f.root.querySelector('[data-region="warrior-v5"]').disabled,true);
 const sanctuary=f.root.querySelector('[data-region="elena-sanctuary"]');assert.equal(sanctuary.disabled,false);assert.equal(sanctuary.getAttribute('data-waypoint'),'elena-sanctuary');
 f.click('[data-region="elena-sanctuary"]');f.click('[data-region="elena-sanctuary"]');await tick();
 assert.equal(requests.length,1);assert.equal(f.api.isOpen(),false);const url=new URL(requests[0]);
 assert.equal(url.searchParams.get('character'),'warrior-v5');assert.equal(url.searchParams.get('waypoint'),'elena-sanctuary');assert.equal(url.searchParams.get('uiTest'),'1');assert.equal(url.searchParams.get('quality'),'high');assert.equal(url.searchParams.has('elenaReview'),false);
 assert.equal(travelWaypoint(url),ELENA_SANCTUARY_WAYPOINT);assert.equal(travelWaypoint(new URL('https://test/?character=warrior-v4&waypoint=elena-sanctuary')),null);assert.equal(travelWaypoint(new URL('https://test/?character=warrior-v5&waypoint=unknown')),null);
 for(const region of MINIMAP_REGIONS.filter(r=>!r.waypoint))assert.equal(new URL(minimapTravelUrl(url.href,region)).searchParams.has('waypoint'),false,'ordinary map choices must clear a stale sanctuary destination');
 complete();await tick();
});

test('sanctuary uses a real collision-free existing approach and remains outside the unengaged first-phase resident',()=>{
 const point=ELENA_SANCTUARY_WAYPOINT.position,nav=new CaveNavigation(caveObstacles());
 assert.ok(CAVE_ROUTES.some(route=>route.some(([x,z])=>x===point.x&&z===point.z)),'reuse an existing authored route centre');
 assert.ok(nav.free(point,WARRIOR_DIMENSIONS.moveRadius,74));assert.ok(nav.clearanceAt(point.x,point.z)>3);
 const distance=Math.hypot(point.x-ELENA_HOME.x,point.z-ELENA_HOME.z);
 assert.ok(distance>10&&distance<14,'keep the destination near the dwelling and outside its8m first-phase detection radius');
 assert.ok(nav.segmentClear(point,ELENA_HOME,WARRIOR_DIMENSIONS.moveRadius),'the sanctuary approach must connect to the current dwelling without a wall');
});

test('sanctuary rechecks combat, death and loading at click time just like every other destination',async t=>{
 const f=fixture({state:{character:'warrior-v5'}});t.after(()=>f.api.dispose());
 for(const change of [{dead:true},{enemies:1},{captured:true},{healing:true},{loading:true},{busy:true}]){
  f.click('.minimap-travel-launch');const original={...f.state};Object.assign(f.state,change);f.click('[data-region="elena-sanctuary"]');await tick();assert.equal(f.requests.length,0);assert.ok(minimapTravelBlocked(f.state));f.api.close();await tick();Object.assign(f.state,original);
 }
});

test('repeated setup replaces its own controls without touching minimap canvas or leaving an open modal',async()=>{
 const f=fixture(),canvas=f.element.querySelector('canvas');f.click('.minimap-travel-launch');
 const next=setupMinimapTravel({element:f.element,root:f.root,getState:()=>f.state,onTravel:async()=>{}});await tick();assert.equal(f.api.isOpen(),false);assert.equal(f.root.querySelectorAll('#minimap-travel-dialog').length,1);assert.equal(f.element.querySelectorAll('.minimap-travel-launch').length,1);assert.strictEqual(f.element.querySelector('canvas'),canvas);
 next.dispose();next.dispose();assert.equal(f.root.querySelectorAll('#minimap-travel-dialog').length,0);assert.equal(f.element.querySelectorAll('.minimap-travel-launch').length,0);assert.strictEqual(f.element.querySelector('canvas'),canvas);
});

test('the minimap control has a local tap target and chooser bounds/touch targets respect mobile safe areas',()=>{
 const css=readFileSync(new URL('../src/dot-minimap.css',import.meta.url),'utf8'),main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(css,/\.minimap-travel-launch\{[^}]*pointer-events:auto/);assert.match(css,/minimap-travel-dialog[^}]*safe-area-inset-left/);assert.match(css,/minimap-travel-dialog button\{[^}]*min-height:44px/);assert.match(css,/orientation:landscape/);
 assert.match(css,/minimap-region-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);assert.match(css,/button\[data-waypoint\]\{grid-column:1\/-1\}/);assert.match(css,/minimap-travel-dialog\{[^}]*overflow:auto/);assert.match(css,/landscape[\s\S]*minimap-region-grid button\{min-height:48px/);
 const otherSettings=main.match(/\botherSettings\s*=\s*([^;]+?),\s*settingsOpen\s*=/)?.[1];assert.ok(otherSettings,'read the actual playback pause expression');
 assert.match(otherSettings,/\bminimapTravel\?\.isOpen\(\)/);assert.match(otherSettings,/\bhudLayout\?\.isOpen\(\)/);assert.match(main,/minimapTravel\?\.close\(\);minimap\.hide\(\)/);
});
