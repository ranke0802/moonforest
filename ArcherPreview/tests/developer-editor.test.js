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


test('real editor adds structural categories, edits and deletes originals, and saves an applied moonmap with every change',async t=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),store=new Map(),state={ready:true},storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};let allocations=0,exported,filename;
 const world={mapId:'village',terrain:{heightAt:()=>0},scene:{onDisposeObservable:new Observable(),onPointerObservable:new Observable()},async acquireToolLease(){state.ready=false;return {active:true,release(){this.active=false;state.ready=true;}};}};
 class Runtime{
  constructor(){allocations++;this.mapId=world.mapId;this.baseManifest=createBasePlacementManifest(world.mapId,{catalog:ASSET_CATALOG});this.document=createEmptyPlacementDocument(this.baseManifest);this.records=new Map();}
  clearPreview(){}clearExistingPreview(){}diagnostics(){return {instances:this.records.size};}
  createBaseOverride(id){const row=this.baseManifest.instances.find(row=>row.instanceId===id);return {instanceId:id,sourceInstanceId:id,assetId:row.assetId,assetVersion:row.assetVersion,transform:{position:[0,0,0],rotation:[0,0,0,1],scale:1,aspect:[1.7,1,.6]},attachment:{surface:'ground',normal:[0,1,0],offset:0,supportId:'terrain'},collision:'solid'};}
  async apply(value){this.document=validatePlacementDocument(value,{catalog:ASSET_CATALOG,baseManifest:this.baseManifest});this.records=new Map(this.document.instances.map(instance=>[instance.instanceId,{instance,root:{}}]));world.placementOverlay=structuredClone(this.document);}
 }
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;URL.createObjectURL=blob=>{exported=blob;return 'blob:test-export';};URL.revokeObjectURL=()=>{};
 const api=setupDeveloperEditor({root,world,storage,getPlayer:()=>({position:Vector3.Zero()}),getState:()=>state,Runtime,setupLayout:null,createGizmos:()=>({manager:{gizmos:{},attachToNode(){}},dispose(){}})});t.after(()=>{api.dispose();URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;});
 const select=root.querySelector('[data-category]');for(const [attribute,value]of Object.entries({'data-category':'prop','data-mode':'position','data-axis':'world','data-surface':'ground'}))Object.defineProperty(root.querySelector(`[${attribute}]`),'value',{value,writable:true});
 const click=async command=>{root.querySelector(`[data-cmd="${command}"]`).dispatchEvent(new window.Event('click',{bubbles:true}));await settle();};
 for(const category of ['building','wall','fence','defense']){select.value=category;select.dispatchEvent(new window.Event('change'));assert.ok(root.querySelector('[data-variants]').children.length>0);assert.equal(allocations,0,'catalog browsing is metadata only');}
 await click('enter');for(const category of ['building','wall','fence','defense']){select.value=category;select.dispatchEvent(new window.Event('change'));await click('place');assert.equal(ASSET_CATALOG.entries.find(row=>row.assetId===api.inspect().document.instances.at(-1).assetId).category,category);}
 const base=world.authoredPlacements.baseManifest,house=base.instances.find(row=>row.editable&&row.source.kind==='building'),wall=base.instances.find(row=>row.editable&&row.source.kind==='wall');await api.selectInstance(house.instanceId,{focus:false});root.querySelector('[data-field="x"]').value='11';await click('numeric');assert.deepEqual(api.inspect().document.instances.find(row=>row.instanceId===house.instanceId).transform.aspect,[1.7,1,.6]);await click('duplicate');const houseCopy=api.inspect().document.instances.at(-1);assert.equal(houseCopy.sourceInstanceId,undefined);assert.deepEqual(houseCopy.transform.aspect,[1.7,1,.6]);
 await api.selectInstance(wall.instanceId,{focus:false});await click('delete');assert.ok(api.inspect().document.removedBaseIds.includes(wall.instanceId));await click('undo');assert.ok(api.inspect().document.instances.some(row=>row.instanceId===wall.instanceId));await click('redo');assert.ok(api.inspect().document.removedBaseIds.includes(wall.instanceId));
 await click('apply');assert.equal(api.isEditing(),false);assert.equal(root.querySelector('[data-cmd="export"]').disabled,false,'the existing save workflow remains available after applying');
 root.addEventListener('click',event=>{if(event.target.tagName==='A')filename=event.target.download;});const append=document.body.append.bind(document.body);document.body.append=(...nodes)=>{for(const node of nodes)if(node.tagName==='A')filename=node.download;return append(...nodes);};await click('export');assert.match(filename,/\.moonmap$/);assert.equal(exported.type,'application/json');const saved=JSON.parse(await exported.text());assert.ok(saved.removedBaseIds.includes(wall.instanceId));assert.equal(saved.instances.find(row=>row.instanceId===house.instanceId).transform.position[0],11);assert.deepEqual(saved,api.inspect().document);assert.match(root.querySelector('[data-status]').textContent,/개발 담당자/);
});

test('a deletion-only draft reapplies after OFF rollback and reopen',async t=>{
 const {document}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),state={ready:true},store=new Map(),storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
 const base=createBasePlacementManifest('village',{catalog:ASSET_CATALOG}),wall=base.instances.find(row=>row.editable&&row.source.kind==='wall'),draft={...createEmptyPlacementDocument(base),revision:4,removedBaseIds:[wall.instanceId]};store.set(authoredMapDraftKey('village'),JSON.stringify(draft));
 const world={mapId:'village',terrain:{heightAt:()=>0},scene:{onDisposeObservable:new Observable(),onPointerObservable:new Observable()},async acquireToolLease(){state.ready=false;return {active:true,release(){this.active=false;state.ready=true;}};}};
 class Runtime{constructor(){this.mapId='village';this.document=createEmptyPlacementDocument(base);this.records=new Map();}clearPreview(){}clearExistingPreview(){}diagnostics(){return {};}async apply(doc){this.document=structuredClone(doc);world.placementOverlay=structuredClone(doc);}}
 const api=setupDeveloperEditor({root,world,storage,getState:()=>state,Runtime,setupLayout:null,createGizmos:()=>({manager:{gizmos:{},attachToNode(){}},dispose(){}})});t.after(()=>api.dispose());await api.enter();assert.deepEqual(world.placementOverlay.removedBaseIds,[wall.instanceId]);await api.hide();assert.equal(world.placementOverlay.removedBaseIds,undefined);await api.enter();assert.deepEqual(world.placementOverlay.removedBaseIds,[wall.instanceId]);
});
