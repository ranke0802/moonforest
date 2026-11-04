import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {Observable} from '@babylonjs/core/Misc/observable.js';
import {nearbyEditableObjects,setupNearbyEditor} from '../src/nearby-editor.js';
import {EDITABLE_ASSET_INDEX} from '../src/editable-asset-index.js';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';

const cases=[],files=['src/nearby-editor.js','src/main.js','src/editable-asset-index.js'],hash=path=>createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex'),sourceHashes=Object.fromEntries(files.map(path=>[path,hash(path)])),settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
function check(name,run){test(name,async t=>{try{const evidence=await run(t);cases.push({name,passed:true,...evidence});}catch(error){cases.push({name,passed:false,error:error.message});throw error;}});}
after(()=>{const unchanged=files.every(path=>sourceHashes[path]===hash(path));writeFileSync(new URL('../reports/moonforest-0.1-usability-2026-11-04/nearby-editor-verification.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),passed:unchanged&&cases.every(row=>row.passed),sourceHashes,sourceUnchanged:unchanged,cases,scope:'Pure proximity/index cases and connected LinkeDOM click events; real production main onEdit callback body executed with deferred loader and live state mocks. No browser automation, pixel, OS input or device-performance claim.'},null,2)+'\n');});
const source=(id,asset,x=0,z=0,extra={})=>({id,asset,kind:EDITABLE_ASSET_INDEX.assets.find(row=>row.assetId===asset)?.sourceKind??'prop',x,z,...extra});
const overlay=(instanceId,assetId,x=0,z=0,extra={})=>({instanceId,assetId,assetVersion:EDITABLE_ASSET_INDEX.assets.find(row=>row.assetId===assetId)?.version,transform:{position:[x,0,z],rotation:[0,0,0,1],scale:1},attachment:{surface:'ground',normal:[0,1,0],offset:0,supportId:'terrain'},collision:'none',...extra});
function fixture(t,{mapId='village',placements=[source('base-cart','handcart',1)],instances=[],onEdit=()=>{}}={}){
 const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>'),root=document.querySelector('main'),world={mapId,toolGeneration:1,placements,placementOverlay:{instances},scene:{onAfterRenderObservable:new Observable()}},state={ready:true,dead:false,hidden:false,loading:false,settings:false},player={position:{x:0,y:0,z:0}};let time=0;
 const api=setupNearbyEditor({root,world,getPlayer:()=>player,getState:()=>state,onEdit,now:()=>time});t.after(()=>api.dispose());const click=target=>target.dispatchEvent(new window.Event('click',{bubbles:true})),render=()=>{time+=251;world.scene.onAfterRenderObservable.notifyObservers();},row=id=>root.querySelector(`[data-nearby-id="${id}"]`);
 return {api,root,world,state,player,window,document,click,render,row};
}

check('all thirteen approved base definitions are discoverable, named and editable without loading model resources',()=>{
 assert.equal(EDITABLE_ASSET_INDEX.assets.length,13);const world={mapId:'village',placements:EDITABLE_ASSET_INDEX.assets.map((asset,index)=>source('type-'+index,asset.assetId,(index-6)*.5,1))},rows=nearbyEditableObjects(world,{x:0,z:0},{radius:12,limit:20});assert.equal(rows.length,13);assert.equal(new Set(rows.map(row=>row.instanceId)).size,13);assert.ok(rows.every(row=>row.editable&&row.source==='base'&&!row.reason));assert.deepEqual(new Set(rows.map(row=>row.name)),new Set(EDITABLE_ASSET_INDEX.assets.map(row=>row.name)));return {definitions:13,categories:[...new Set(EDITABLE_ASSET_INDEX.assets.map(row=>row.category))]};
});
check('actual shipped village objects use original stable IDs in the proximity list',()=>{
 const original=VILLAGE_PLACEMENTS.find(row=>row.asset==='handcart'&&!row.background&&!row.villagePlainsOutskirts),rows=nearbyEditableObjects({mapId:'village',placements:VILLAGE_PLACEMENTS},{x:original.x,z:original.z},{limit:50}),found=rows.find(row=>row.instanceId===original.id);assert.ok(found);assert.equal(found.editable,true);assert.equal(found.distance,0);return {actualBaseId:original.id};
});
check('distance sorting, tie-breaking, radius boundary and limit are deterministic',()=>{
 const world={mapId:'village',placements:[source('z','handcart',3,4),source('a','firewood',-3,-4),source('near','bush',.2),source('edge','handcart',12),source('far','handcart',12.01)]};assert.deepEqual(nearbyEditableObjects(world,{x:0,z:0}).map(row=>row.instanceId),['near','a','z','edge']);assert.deepEqual(nearbyEditableObjects(world,{x:0,z:0},{limit:2}).map(row=>row.instanceId),['near','a']);assert.deepEqual(nearbyEditableObjects(world,null),[]);return {inclusiveRadius:12,tieOrder:'instanceId'};
});
check('same-ID moved base overlays replace the old position and deduplicate against original placements',()=>{
 const instance=overlay('base-cart','handcart',25,0,{sourceInstanceId:'base-cart'}),world={mapId:'village',placements:[source('base-cart','handcart',1)],placementOverlay:{instances:[instance,overlay('my-crate','crate-barrel-cluster',2)]}};const origin=nearbyEditableObjects(world,{x:0,z:0});assert.deepEqual(origin.map(row=>row.instanceId),['my-crate']);const moved=nearbyEditableObjects(world,{x:25,z:0});assert.equal(moved.length,1);assert.equal(moved[0].instanceId,'base-cart');assert.equal(moved[0].distance,0);assert.equal(moved[0].source,'base');assert.equal(moved[0].editable,true);return {sameId:'base-cart',oldPositionRemoved:true,newPositionListedOnce:true};
});
check('protected cave/base reasons stay visible while independently authored props remain editable',async t=>{
 const calls=[],f=fixture(t,{mapId:'witch-cave',placements:[source('cave-original','handcart',1)],instances:[overlay('my-crate','crate-barrel-cluster',2)],onEdit:id=>calls.push(id)});assert.equal(f.row('cave-original').disabled,true);assert.match(f.row('cave-original').querySelector('small').textContent,/동굴.*고정 충돌/);assert.equal(f.row('my-crate').disabled,false);f.click(f.row('cave-original'));await settle();assert.deepEqual(calls,[]);return {protectedReason:'동굴의 기존 고정 충돌',independentOverlayEditable:true};
});
check('native DOM clicks dispatch the exact selected ID once while work is pending',async t=>{
 let finish,calls=[];const f=fixture(t,{onEdit:id=>{calls.push(id);return new Promise(resolve=>finish=resolve);}});f.click(f.root.querySelector('[data-nearby-toggle]'));assert.equal(f.root.querySelector('section').hidden,false);f.click(f.row('base-cart').querySelector('small'));f.click(f.row('base-cart'));await settle();assert.deepEqual(calls,['base-cart']);assert.match(f.root.querySelector('output').textContent,/여는 중/);finish();await settle();assert.equal(f.root.querySelector('section').hidden,true);assert.equal(f.root.querySelector('output').textContent,'');return {exactId:'base-cart',pendingDispatches:1};
});
check('a rejected edit remains readable and allows retry without retaining busy state',async t=>{
 const calls=[],f=fixture(t,{onEdit:async id=>{calls.push(id);if(calls.length===1)throw new Error('대상을 준비하지 못했어요. 다시 골라 주세요.');}});f.click(f.root.querySelector('[data-nearby-toggle]'));f.click(f.row('base-cart'));await settle();assert.equal(f.root.querySelector('section').hidden,false);assert.match(f.root.querySelector('output').textContent,/다시 골라/);assert.equal(f.row('base-cart').disabled,false);f.click(f.row('base-cart'));await settle();assert.deepEqual(calls,['base-cart','base-cart']);assert.equal(f.root.querySelector('section').hidden,true);assert.equal(f.root.querySelector('output').textContent,'');return {failedAttempt:1,successfulRetry:1};
});
check('tool ownership and nonplayable states hide the nearby menu without stale dispatch',async t=>{
 const calls=[],f=fixture(t,{onEdit:id=>calls.push(id)});for(const key of ['dead','hidden','loading','settings']){f.state[key]=true;f.render();assert.equal(f.root.querySelector('.nearby-editor').hidden,true,key);f.state[key]=false;}f.state.ready=false;f.render();assert.equal(f.root.querySelector('.nearby-editor').hidden,true);f.state.ready=true;f.world.toolLease={active:true};f.render();assert.equal(f.root.querySelector('.nearby-editor').hidden,true);f.click(f.row('base-cart'));await settle();assert.deepEqual(calls,[]);f.world.toolLease=null;f.render();assert.equal(f.root.querySelector('.nearby-editor').hidden,false);return {states:['toolLease','ready=false','dead','hidden','loading','settings']};
});
check('click then disposal/map-generation change cannot dispatch queued stale selection',async t=>{
 const calls=[],f=fixture(t,{onEdit:id=>calls.push(id)});f.click(f.row('base-cart'));f.api.dispose();await settle();assert.deepEqual(calls,[]);assert.equal(f.root.children.length,0);assert.equal(f.world.scene.onAfterRenderObservable.observers.filter(row=>!row._willBeUnregistered).length,0);
 const g=fixture(t,{onEdit:id=>calls.push(id)});g.click(g.row('base-cart'));g.world.mapId='monster-forest';g.world.toolGeneration++;await settle();assert.deepEqual(calls,[]);return {postDisposeDispatches:0,postTravelDispatches:0,liveObserversAfterDispose:0};
});

function gameDocument(){const dialog={open:true,close(){this.open=false;}};return {hidden:false,dialog,querySelector:selector=>selector==='#motion-speed-dialog'?dialog:null};}

function mainNearbyCallback(){
 const text=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),marker='onEdit:async id=>',start=text.indexOf('{',text.indexOf(marker));assert.ok(start>0);let depth=0,quote=null,escape=false,end=start;
 for(;end<text.length;end++){const char=text[end];if(quote){if(escape)escape=false;else if(char==='\\')escape=true;else if(char===quote)quote=null;continue;}if(char==='\''||char==='"'||char==='`'){quote=char;continue;}if(char==='{')depth++;else if(char==='}'&&--depth===0){end++;break;}}
 const body=text.slice(start,end);assert.match(body,/getPlacementEditor/);return new Function('world','getPlacementEditor','document','controller','boss','mapTransition',`let ready=true,loadingAsset=false,enabled=true;const developerTools={enabled:()=>enabled},isCurrent=()=>enabled,toast=()=>{};return {setEnabled(value){enabled=value;},run:async id=>${body},setReady(value){ready=value;},setLoading(value){loadingAsset=value;}};`);
}
check('actual main lazy-loader callback forwards selection and rejects old-map results before acquiring editor',async()=>{
 const make=mainNearbyCallback(),world={mapId:'village',toolGeneration:3,scene:{isDisposed:false}},entered=[],doc=gameDocument(),controller={dead:false},boss={playerHp:100},transition={busy:false};let resolve;const control=make(world,()=>new Promise(done=>resolve=done),doc,controller,boss,transition),pending=control.run('base-cart');world.mapId='monster-forest';world.toolGeneration++;resolve({enter:value=>entered.push(value)});await assert.rejects(pending);assert.deepEqual(entered,[]);
 const current=make(world,async()=>({enter:value=>entered.push(value)}),doc,controller,boss,transition);await current.run('my-crate');assert.deepEqual(entered,[{selection:'my-crate'}]);return {realMainBodyExecuted:true,oldMapEditorEntries:0,currentSelection:'my-crate'};
});
check('actual main deferred callback rechecks readiness, modal, death and scene disposal',async()=>{
 const make=mainNearbyCallback();for(const state of ['not-ready','loading','modal','dead','scene-disposed','tool-disabled','settings-closed']){const world={mapId:'village',toolGeneration:1,scene:{isDisposed:false}},doc=gameDocument(),controller={dead:false},boss={playerHp:100},transition={busy:false},entered=[];let resolve;const callback=make(world,()=>new Promise(done=>resolve=done),doc,controller,boss,transition),pending=callback.run('base-cart');if(state==='settings-closed')doc.dialog.open=false;else if(state==='tool-disabled')callback.setEnabled(false);else if(state==='not-ready')callback.setReady(false);else if(state==='loading')callback.setLoading(true);else if(state==='modal')doc.querySelector=()=>({});else if(state==='dead')controller.dead=true;else world.scene.isDisposed=true;resolve({enter:value=>entered.push(value)});await assert.rejects(pending,undefined,state);assert.deepEqual(entered,[],state);}return {deferredGuards:['ready','loading','modal','dead','scene-disposed']};
});
