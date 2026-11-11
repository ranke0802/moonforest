import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {setupChapterQuests} from '../src/chapter-quest.js';

test('deleted story residents disappear from dialogue and cannot generate facts; restoring keeps prior progress',t=>{
 const {document}=parseHTML('<html><body><main id="app"><div class="top-actions"></div><canvas id="viewport"></canvas></main></body></html>'),root=document.querySelector('main'),create=document.createElement.bind(document);
 document.createElement=name=>{const node=create(name);if(name==='dialog'){Object.defineProperty(node,'open',{get:()=>node.hasAttribute('open')});node.showModal=()=>node.setAttribute('open','');node.close=()=>node.removeAttribute('open');}return node;};
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},world={mapId:'village',scene:{onDisposeObservable:{addOnce(){}}}},state={ready:true,map:'village',position:{x:0,z:0}};
 const api=setupChapterQuests({root,world,storage,getState:()=>state,createProps:()=>({dispose(){},release(){}})});t.after(()=>api.dispose());
 assert.equal(api.talk('elder'),true);const prior=api.journey.value.facts['talk:elder'];
 world.storyNpcs.setRemoved(['elder','guard']);assert.equal(api.talk('guard'),false);assert.equal(api.journey.value.facts['talk:guard'],undefined);
 root.querySelector('[data-chapter=story]').click();const dialog=root.querySelector('#chapter-dialog');assert.equal(dialog.querySelector('[data-chapter=talk][data-id=elder]'),null);assert.equal(dialog.querySelector('[data-chapter=talk][data-id=guard]'),null);
 world.storyNpcs.setRemoved([]);root.querySelector('[data-chapter=story]').click();assert.ok(dialog.querySelector('[data-chapter=talk][data-id=guard]'));assert.equal(api.journey.value.facts['talk:elder'],prior);
});
