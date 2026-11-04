import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {Observable,Vector3} from '@babylonjs/core';
import {setupDeveloperEditor,terrainAttachment} from '../src/developer-editor.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {createBasePlacementManifest,createEmptyPlacementDocument,validatePlacementDocument} from '../src/placement-document.js';
import {authoredMapStorageKey} from '../src/authored-map-loader.js';

const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
test('catalog-only UI allocates no runtime; place/transform/undo/redo/apply/reopen retain the exported instance ID',async t=>{
 const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>'),root=document.getElementById('app'),store=new Map(),storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)},state={ready:true};
 let runtimes=0,disposedGizmos=0,releases=0;
 const world={mapId:'village',terrain:{heightAt:()=>0},scene:{onDisposeObservable:new Observable(),onPointerObservable:new Observable()},async acquireToolLease(){state.ready=false;return {active:true,release(){if(!this.active)return;this.active=false;state.ready=true;releases++;}};}};
 class Runtime{
  constructor(){runtimes++;this.mapId=world.mapId;this.baseManifest=createBasePlacementManifest(world.mapId,{catalog:ASSET_CATALOG});this.document=createEmptyPlacementDocument(this.baseManifest);this.records=new Map();this.disposed=false;}
  clearPreview(){}clearExistingPreview(){}diagnostics(){return {instances:this.records.size};}
  async apply(value){this.document=validatePlacementDocument(value,{catalog:ASSET_CATALOG,baseManifest:this.baseManifest});this.records=new Map(this.document.instances.map(instance=>[instance.instanceId,{instance,root:{}}]));world.placementOverlay=structuredClone(this.document);return this.document;}
 }
 const api=setupDeveloperEditor({root,world,storage,getPlayer:()=>({position:Vector3.Zero()}),getState:()=>state,Runtime,setupLayout:null,createGizmos:()=>({manager:{gizmos:{},attachToNode(){}},dispose(){disposedGizmos++;}})});t.after(()=>api.dispose());
 const selectDefaults={'data-category':'','data-mode':'position','data-axis':'world','data-surface':'ground'};for(const [attribute,value]of Object.entries(selectDefaults))Object.defineProperty(root.querySelector(`[${attribute}]`),'value',{value,writable:true});
 const click=async command=>{root.querySelector(`[data-cmd="${command}"]`).dispatchEvent(new window.Event('click',{bubbles:true}));await settle();};
 assert.equal(runtimes,0);root.querySelector('[data-query]').value='handcart';root.querySelector('[data-query]').dispatchEvent(new window.Event('input'));assert.equal(runtimes,0);
 await click('enter');assert.equal(runtimes,1);assert.equal(api.isEditing(),true);await click('place');assert.equal(api.inspect().document.instances.length,1);const id=api.inspect().document.instances[0].instanceId;
 root.querySelector('[data-field="scale"]').value='1.5';root.querySelector('[data-field="x"]').value='12';await click('numeric');assert.equal(api.inspect().document.instances[0].transform.scale,1.5);
 await click('undo');assert.equal(api.inspect().document.instances[0].transform.scale,1);await click('redo');assert.equal(api.inspect().document.instances[0].transform.scale,1.5);
 await click('apply');assert.equal(api.isEditing(),false);assert.equal(state.ready,true);assert.equal(releases,1);assert.equal(disposedGizmos,1);
 const applied=JSON.parse(store.get(authoredMapStorageKey('village')));assert.equal(applied.instances[0].instanceId,id);assert.equal(applied.instances[0].transform.position[0],12);
 await click('enter');assert.equal(api.inspect().document.instances[0].instanceId,id);await click('exit');assert.equal(state.ready,true);assert.equal(disposedGizmos,2);
});
test('terrain snap uses actual height and its normalized slope rather than a flat visual plane',()=>{
 const result=terrainAttachment({terrain:{heightAt:(x,z)=>x*.2+z*.1}},4,6,.03);assert.ok(Math.abs(result.position[1]-1.4)<1e-10);assert.equal(result.attachment.supportId,'terrain');assert.ok(Math.abs(Math.hypot(...result.attachment.normal)-1)<1e-10);assert.ok(result.attachment.normal[0]<0);assert.equal(result.attachment.offset,.03);
});
