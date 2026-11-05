import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {Observable,Vector3} from '@babylonjs/core';
import {setupDeveloperEditor,terrainAttachment} from '../src/developer-editor.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {createBasePlacementManifest,createEmptyPlacementDocument,validatePlacementDocument} from '../src/placement-document.js';
import {authoredMapStorageKey,authoredMapDraftKey} from '../src/authored-map-loader.js';

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

test('hiding the real placement editor saves its draft, rolls back preview, and preserves applied placements when idle',async t=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),saved=new Map(),storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)},state={ready:true};
 let releases=0,gizmoDisposals=0,rollback=null;const applications=[];
 const world={mapId:'village',terrain:{heightAt:()=>0},scene:{onDisposeObservable:new Observable(),onBeforeRenderObservable:new Observable(),onPointerObservable:new Observable()},async acquireToolLease(){state.ready=false;return {active:true,release(reason,options){if(!this.active)return;this.active=false;if(options?.restore!==false)state.ready=true;releases++;}};}};
 class Runtime{
  constructor(){this.mapId=world.mapId;this.baseManifest=createBasePlacementManifest(world.mapId,{catalog:ASSET_CATALOG});this.document=createEmptyPlacementDocument(this.baseManifest);this.records=new Map();this.disposed=false;}
  clearPreview(){}clearExistingPreview(){}diagnostics(){return {instances:this.records.size};}
  async apply(value){applications.push(value.instances.length);if(rollback&&!value.instances.length)await rollback.promise;this.document=validatePlacementDocument(value,{catalog:ASSET_CATALOG,baseManifest:this.baseManifest});this.records=new Map(this.document.instances.map(instance=>[instance.instanceId,{instance,root:{}}]));world.placementOverlay=structuredClone(this.document);return this.document;}
 }
 const api=setupDeveloperEditor({root,world,storage,getPlayer:()=>({position:Vector3.Zero()}),getState:()=>state,Runtime,autoEnter:true,setupLayout:null,createGizmos:()=>({manager:{gizmos:{},attachToNode(){}},dispose(){gizmoDisposals++;}})});t.after(()=>{rollback?.resolve();api.dispose();});
 for(const [attribute,value]of Object.entries({'data-category':'','data-mode':'position','data-axis':'world','data-surface':'ground'}))Object.defineProperty(root.querySelector(`[${attribute}]`),'value',{value,writable:true});
 const click=async command=>{root.querySelector(`[data-cmd="${command}"]`).dispatchEvent(new window.Event('click',{bubbles:true}));await settle();};
 await settle();assert.equal(api.isEditing(),true);await click('place');const id=api.inspect().document.instances[0].instanceId,panel=root.querySelector('.placement-editor');assert.equal(world.placementOverlay.instances.length,1);
 let resolve;rollback={promise:new Promise(done=>resolve=done),resolve:()=>resolve()};const hiding=api.hide();assert.equal(panel.hidden,true);assert.equal(api.isEditing(),false);assert.equal(state.ready,false,'gameplay waits for normal lease restoration');assert.equal(JSON.parse(saved.get(authoredMapDraftKey('village'))).instances[0].instanceId,id);assert.equal(saved.has(authoredMapStorageKey('village')),false,'OFF does not silently apply the draft');
 rollback.resolve();await hiding;rollback=null;assert.equal(state.ready,true);assert.equal(world.placementOverlay.instances.length,0);assert.equal(releases,1);assert.equal(gizmoDisposals,1);
 api.leaveMap();await settle();for(let i=0;i<5;i++)api.notifyReady();await settle();assert.equal(panel.hidden,true);assert.equal(api.isEditing(),false,'readiness notifications cannot reopen a disabled panel');
 await api.enter({isCurrent:()=>true});assert.equal(panel.hidden,false);assert.equal(api.inspect().document.instances[0].instanceId,id);assert.equal(world.placementOverlay.instances.length,1);
 await click('apply');assert.equal(api.isEditing(),false);assert.equal(state.ready,true);assert.equal(JSON.parse(saved.get(authoredMapStorageKey('village'))).instances[0].instanceId,id);
 const appliedCalls=applications.length;await api.hide();assert.equal(panel.hidden,true);assert.equal(applications.length,appliedCalls,'hiding an idle editor must not roll back the applied map');assert.equal(world.placementOverlay.instances[0].instanceId,id);assert.equal(releases,2);assert.equal(gizmoDisposals,2);assert.equal(world.scene.onPointerObservable.observers.filter(observer=>!observer._willBeUnregistered).length,0,'no active pointer subscription remains during Babylon deferred removal');
});
