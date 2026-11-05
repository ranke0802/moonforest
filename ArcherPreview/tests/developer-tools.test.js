import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {setupDeveloperTools,DEVELOPER_TOOLS_KEY} from '../src/developer-tools.js';
import {nearbyEditableObjects} from '../src/nearby-editor.js';
import {setupDeveloperToolSettings} from '../src/tool-visibility-settings.js';

function fixture(options={}){
 const {document,window}=parseHTML('<html><body><main id="app"></main><dialog open><div id="settings"></div></dialog></body></html>'),root=document.querySelector('main'),settingsDialog=document.querySelector('dialog'),values=new Map();let closed=0;
 settingsDialog.open=true;settingsDialog.close=()=>{closed++;settingsDialog.open=false;settingsDialog.removeAttribute('open');settingsDialog.dispatchEvent(new window.Event('close'));};
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const api=setupDeveloperTools({root,settingsHost:document.querySelector('#settings'),settingsDialog,storage,studioUrl:'https://game.test/cinematic-studio.html',...options});
 const toggle=document.querySelector('[data-developer-tools-enabled]'),change=value=>{toggle.checked=value;toggle.dispatchEvent(new window.Event('change',{bubbles:true}));},click=selector=>root.querySelector(selector).dispatchEvent(new window.Event('click',{bubbles:true}));
 return {document,window,root,values,storage,api,change,click,closed:()=>closed};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('turning developer tools on in settings closes settings and opens the in-game dialog without loading an editor',()=>{
 let calls=0;const f=fixture({onActors:()=>calls++,onProps:()=>calls++});assert.equal(f.api.inspect().visible,false);f.change(true);assert.equal(f.closed(),1);assert.equal(f.api.inspect().visible,true);assert.equal(f.document.querySelector('[role=dialog]').hidden,false);assert.equal(f.values.get(DEVELOPER_TOOLS_KEY),'1');assert.equal(calls,0);assert.equal(f.root.querySelector('[data-dev-studio]').href,'https://game.test/cinematic-studio.html');f.api.dispose();
});
test('developer actor import action opens the actor tool once and preserves its import intent',async()=>{
 let release,seen=[];const held=new Promise(resolve=>release=resolve),f=fixture({onActors:async options=>{seen.push(options);await held;}});f.change(true);f.click('[data-dev-action=npc-import]');f.click('[data-dev-action=actors]');assert.deepEqual(seen,[{importPackage:true}]);assert.equal(f.api.inspect().busy,true);release();await flush();assert.equal(f.api.inspect().visible,false);f.click('.developer-tools-dock');assert.equal(f.api.inspect().visible,true);f.api.dispose();
});
test('not-ready game and failed editor load remain reviewable without losing the enabled setting',async()=>{
 let ready=false,calls=0;const f=fixture({getState:()=>({ready}),onProps:()=>{calls++;throw new Error('model unavailable');}});f.change(true);f.click('[data-dev-action=props]');assert.equal(calls,0);assert.match(f.root.querySelector('output').textContent,/준비/);ready=true;f.click('[data-dev-action=props]');await flush();assert.equal(calls,1);assert.match(f.root.querySelector('output').textContent,/model unavailable/);assert.equal(f.api.inspect().visible,true);assert.equal(f.api.inspect().busy,false);f.change(false);assert.equal(f.api.inspect().visible,false);assert.equal(f.values.get(DEVELOPER_TOOLS_KEY),'0');f.api.dispose();assert.equal(f.root.children.length,0);
});
test('nearby object inventory includes NPCs and monsters at their live positions, with stable actor dispatch metadata',()=>{
 const root={isEnabled:()=>true,isDisposed:()=>false},world={mapId:'village',placements:[],placementOverlay:{instances:[]}},position={x:0,z:0};const actors=[{id:'live-actor:1',name:'고블린',position:[3,0,4],root,source:'monster'},{id:'npc-instance-a',label:'대장장이',position:[1,2,0],root,source:'npc-authored'},{id:'too-far',position:[100,0,0],root},{id:'hidden',position:[0,0,0],root:{isEnabled:()=>false}}];const rows=nearbyEditableObjects(world,position,{actors});assert.deepEqual(rows.map(row=>row.instanceId),['npc-instance-a','live-actor:1']);assert.deepEqual(rows.map(row=>row.kind),['actor','actor']);assert.equal(rows[0].name,'대장장이');assert.equal(rows[1].distance,5);assert.equal(rows[1].editable,true);assert.deepEqual(nearbyEditableObjects(world,position),[]);
});
test('the existing Game/Create setting opens a managed in-game window and OFF removes it without an extra checkbox',async()=>{
 const {document,window}=parseHTML('<html><body><main id="app"></main><dialog open><div id="settings"></div></dialog></body></html>'),root=document.querySelector('main'),host=document.querySelector('#settings'),dialog=document.querySelector('dialog');dialog.open=true;let closed=0,mounted=0;dialog.close=()=>{closed++;dialog.open=false;dialog.removeAttribute('open');};
 const api=setupDeveloperToolSettings({host,dialog,inGame:true,mounts:{authoring:async()=>{mounted++;return setupDeveloperTools({root,managed:true});}}});
 assert.equal(root.children.length,0);const checkbox=host.querySelector('#developer-authoring-enabled');checkbox.checked=true;checkbox.dispatchEvent(new window.Event('change',{bubbles:true}));await flush();assert.equal(closed,1);assert.equal(mounted,1);assert.equal(root.querySelector('[role=dialog]').hidden,false);assert.equal(document.querySelectorAll('[data-developer-tools-enabled]').length,0,'no duplicate preference control is mounted');root.querySelector('[data-dev-close]').dispatchEvent(new window.Event('click',{bubbles:true}));assert.equal(root.querySelector('[role=dialog]').hidden,true);host.querySelector('[data-developer-open=authoring]').dispatchEvent(new window.Event('click',{bubbles:true}));assert.equal(root.querySelector('[role=dialog]').hidden,false);checkbox.checked=false;checkbox.dispatchEvent(new window.Event('change',{bubbles:true}));assert.equal(root.children.length,0);assert.equal(host.querySelector('[data-developer-open=authoring]').disabled,true);api.dispose();
});
