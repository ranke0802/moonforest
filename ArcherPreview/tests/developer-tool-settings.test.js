import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {Observable} from '@babylonjs/core/Misc/observable.js';
import {DEVELOPER_TOOLS_KEY,readDeveloperTools,setupDeveloperToolSettings} from '../src/tool-visibility-settings.js';
import {setupNearbyEditor} from '../src/nearby-editor.js';
import {setupAuthoringNavigation} from '../src/authoring-navigation.js';

const settle=async()=>{for(let i=0;i<4;i++)await Promise.resolve();};
function fixture(t,{storage,mounts={}}={}){
  const {document,window}=parseHTML('<main id="app"><nav class="top-actions"><button id="settings">설정</button></nav><div class="action-controls">공격</div><dialog><div class="settings-sections"></div></dialog></main>');
  const root=document.querySelector('main'),dialog=root.querySelector('dialog'),host=dialog.querySelector('div');
  const api=setupDeveloperToolSettings({host,dialog,storage,mounts});t.after(()=>api.dispose());
  return {root,dialog,api,document,window,host,change(id,on){const input=root.querySelector('#developer-'+id+'-enabled');input.checked=on;input.dispatchEvent(new window.Event('change'));}};
}

test('new, malformed and inaccessible preferences default both tools OFF without mounting anything',async t=>{
  for(const storage of [undefined,{getItem:()=>'{invalid'},{getItem:()=>'{"nearby":"true","authoring":1}'},{getItem(){throw Error('private');}}]){
    assert.deepEqual(readDeveloperTools(storage),{nearby:false,authoring:false});let mounts=0;
    const f=fixture(t,{storage,mounts:{nearby:()=>mounts++,authoring:()=>mounts++}});await settle();
    assert.equal(mounts,0);assert.equal(f.api.enabled('nearby'),false);assert.equal(f.api.enabled('authoring'),false);
    for(const node of f.host.querySelectorAll('[data-developer-tool-host]'))assert.equal(node.hidden,true);
    assert.equal(f.root.querySelectorAll('.top-actions button').length,1);assert.equal(f.root.querySelector('.action-controls').textContent,'공격');
  }
});

test('preferences persist independently and OFF disposes the mounted tool',async t=>{
  const saved=new Map(),storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};let active=0,updates=0;
  const mounts={nearby:()=>{active++;return {update(){updates++;},dispose(){active--;}};}};
  const f=fixture(t,{storage,mounts});f.change('nearby',true);await settle();assert.equal(active,1);assert.equal(f.api.enabled('authoring'),false);
  assert.deepEqual(JSON.parse(saved.get(DEVELOPER_TOOLS_KEY)),{nearby:true,authoring:false});assert.ok(updates>0);
  f.api.dispose();assert.equal(active,0);const restored=fixture(t,{storage,mounts});await settle();assert.equal(active,1);assert.equal(restored.api.enabled('nearby'),true);
  restored.change('nearby',false);assert.equal(active,0);assert.equal(restored.host.querySelector('[data-developer-tool-host="nearby"]').children.length,0);
});

test('late mount after OFF or disposal cannot retain UI, observers or a stale controller',async t=>{
  const pending=[];let active=0;
  const f=fixture(t,{mounts:{nearby:({host,isCurrent})=>new Promise(resolve=>pending.push(()=>{if(isCurrent()){const node=f.document.createElement('button');host.append(node);}active++;resolve({dispose(){active--;host.replaceChildren();}});} ))}});
  f.change('nearby',true);f.change('nearby',false);pending.shift()();await settle();assert.equal(active,0);assert.equal(f.host.querySelector('button'),null);
  f.change('nearby',true);f.api.dispose();pending.shift()();await settle();assert.equal(active,0);assert.equal(f.root.querySelector('#developer-tools-settings'),null);
});

test('enabled launchers stay inside settings in normal flow and paused settings refresh needs no scene observer',async t=>{
  let positionReads=0;const world={mapId:'village',placements:[],scene:{onAfterRenderObservable:new Observable()}};
  const f=fixture(t,{mounts:{
    nearby:({host})=>setupNearbyEditor({root:f.root,host,settingsDialog:f.dialog,world,getPlayer:()=>{positionReads++;return {position:{x:0,z:0}};},getState:()=>({ready:true}),onEdit:()=>{}}),
    authoring:({host})=>setupAuthoringNavigation({root:f.root,host,href:'https://game.test/?release=moonforest-0.1',mapId:'village',getState:()=>({ready:true,mapId:world.mapId})}),
  }});
  f.change('nearby',true);f.change('authoring',true);await settle();assert.equal(positionReads,0);assert.equal(world.scene.onAfterRenderObservable.observers.length,0);
  for(const selector of ['.nearby-editor','.moonforest-create-menu']){const node=f.root.querySelector(selector);assert.equal(node.closest('dialog'),f.dialog);assert.equal(node.style.position,'static');assert.equal(node.style.inset,'auto');}
  f.dialog.open=true;f.dialog.dispatchEvent(new f.window.Event('toggle'));assert.ok(positionReads>0);
  const reads=positionReads;f.dialog.open=false;f.api.refresh();assert.equal(positionReads,reads);assert.equal(f.root.querySelector('.nearby-editor').hidden,true);
  f.change('nearby',false);f.change('authoring',false);assert.equal(f.root.querySelector('.nearby-editor'),null);assert.equal(f.root.querySelector('.moonforest-create-menu'),null);
  assert.equal(f.root.querySelector('.top-actions').children.length,1);assert.equal(f.root.querySelector('.action-controls').textContent,'공격');
});

test('an older mount cleanup cannot remove the newer ON generation',async t=>{
  const pending=[];
  const f=fixture(t,{mounts:{authoring:({host})=>new Promise(resolve=>pending.push(text=>{
    const node=f.document.createElement('button');node.textContent=text;host.append(node);resolve({dispose(){host.replaceChildren();}});
  }))}});
  f.change('authoring',true);f.change('authoring',false);f.change('authoring',true);
  pending[1]('current');await settle();pending[0]('old');await settle();
  assert.equal(f.host.querySelector('button').textContent,'current');assert.equal(f.host.querySelectorAll('button').length,1);
});
