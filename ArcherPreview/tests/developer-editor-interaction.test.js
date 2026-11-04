import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,MeshBuilder,Vector3,Matrix,Quaternion,Ray,Observable,PointerEventTypes,PointerInfoPre} from '@babylonjs/core';
import {setupDeveloperEditor} from '../src/developer-editor.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {createBasePlacementManifest,createEmptyPlacementDocument,validatePlacementDocument} from '../src/placement-document.js';
import {ArenaNavigation} from '../src/navigation.js';
import {authoredMapStorageKey} from '../src/authored-map-loader.js';

const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(t,{ready=true,autoEnter=true,deferLease=false,deferApply=false}={}){
 const {document,window}=parseHTML('<html><body><main id="app"><canvas></canvas><aside>게임 HUD</aside></main></body></html>'),root=document.querySelector('#app');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.getAttribute('value')===String(value));}});
 const engine=new NullEngine({renderWidth:800,renderHeight:600}),scene=new Scene(engine),camera=new ArcRotateCamera('editor-camera',-Math.PI/2,.5,25,new Vector3(4,0,3),scene),ground=MeshBuilder.CreateGround('terrain',{width:100,height:100},scene);scene.activeCamera=camera;scene.setTransformMatrix(camera.getViewMatrix(),camera.getProjectionMatrix());
 let detachCount=0,attachCount=0;camera.inputs.attachedToElement=true;camera.detachControl=()=>{detachCount++;camera.inputs.attachedToElement=false;};camera.attachControl=()=>{attachCount++;camera.inputs.attachedToElement=true;};
 const state={ready},store=new Map(),stats={runtimes:0,leases:0,releases:0,applies:0,previews:0,gizmos:0,gizmoDisposals:0},player={position:new Vector3(4,0,3)},world={scene,camera,ground,mapId:'village',terrain:{heightAt:()=>0},navigation:new ArenaNavigation([])},nativeGizmo={onDragStartObservable:new Observable(),onDragObservable:new Observable(),onDragEndObservable:new Observable()},gate={lease:null,apply:null},options=[];
 world.acquireToolLease=async value=>{options.push(value);stats.leases++;if(deferLease)await new Promise(resolve=>gate.lease=resolve);state.ready=false;return {active:true,isCurrent:()=>true,release(reason,{restore=true}={}){if(!this.active)return;this.active=false;stats.releases++;if(restore)state.ready=true;}};};
 class Runtime{
  constructor(){stats.runtimes++;this.mapId=world.mapId;this.baseManifest=createBasePlacementManifest(world.mapId,{catalog:ASSET_CATALOG});this.document=createEmptyPlacementDocument(this.baseManifest);this.records=new Map();this.disposed=false;}
  diagnostics(){return {instances:this.records.size};}
  clearPreview(){}
  clearExistingPreview(){if(!this.previous)return;const record=this.records.get(this.previous.instanceId);if(record)this.set(record,this.previous);this.previous=null;}
  set(record,instance){record.instance=structuredClone(instance);record.root.position.copyFromFloats(...instance.transform.position);record.root.position.y+=.5;record.root.scaling.setAll(instance.transform.scale);record.root.rotationQuaternion=Quaternion.FromArray(instance.transform.rotation);record.root.computeWorldMatrix(true);}
  async previewExisting(instance){stats.previews++;const record=this.records.get(instance.instanceId);this.previous??=structuredClone(record.instance);this.set(record,instance);return record;}
  async preview(){}
  async apply(value){if(deferApply)await new Promise(resolve=>gate.apply=resolve);this.clearExistingPreview();const valid=validatePlacementDocument(value,{catalog:ASSET_CATALOG,baseManifest:this.baseManifest});for(const record of this.records.values())record.root.dispose();this.records.clear();for(const instance of valid.instances){const root=MeshBuilder.CreateBox(instance.instanceId,{size:1},scene);root.metadata={placementInstanceId:instance.instanceId};const record={instance,root};this.records.set(instance.instanceId,record);this.set(record,instance);}this.document=valid;world.placementOverlay=structuredClone(valid);stats.applies++;return valid;}
 }
 const manager={gizmos:{positionGizmo:nativeGizmo},attachToNode(node){this.attached=node;},isHovered:false},api=setupDeveloperEditor({root,world,getPlayer:()=>player,getState:()=>state,storage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)},Runtime,autoEnter,createGizmos:()=>{stats.gizmos++;return {manager,dispose(){stats.gizmoDisposals++;}};}});
 t.after(()=>{api.dispose();scene.dispose();engine.dispose();});
 const button=name=>root.querySelector(`[data-cmd="${name}"]`),click=async name=>{button(name).dispatchEvent(new window.Event('click',{bubbles:true}));await settle();},project=point=>Vector3.Project(point,Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(800,600)),pointer=async(type,point,{pointerId=1,eventType='pointermove'}={})=>{const screen=project(point),info=new PointerInfoPre(type,{button:0,pointerId,type:eventType,preventDefault(){}},screen.x,screen.y);scene.pointerX=screen.x;scene.pointerY=screen.y;scene.onPrePointerObservable.notifyObservers(info,type);await settle();return info;};
 return {api,root,document,window,world,state,stats,store,gate,options,player,nativeGizmo,manager,button,click,pointer,get cameraCounts(){return {detach:detachCount,attach:attachCount};}};
}

test('first-use UI waits for ready, auto-enters once and shows only the three usable props',async t=>{
 const f=fixture(t,{ready:false});assert.equal(f.root.querySelectorAll('[data-assets] button').length,3);assert.equal(f.root.querySelector('[data-advanced]').hasAttribute('open'),false);assert.equal(f.button('place').disabled,true);assert.equal(f.button('enter').disabled,true);await settle();assert.equal(f.stats.runtimes,0);f.api.notifyReady();assert.equal(f.stats.leases,0);
 f.state.ready=true;f.api.notifyReady();await settle();assert.equal(f.api.isEditing(),true);assert.equal(f.stats.leases,1);assert.equal(f.options[0].hideHud,true);assert.equal(f.button('place').disabled,false);assert.equal(f.world.scene.onBeforeRenderObservable.observers.filter(observer=>!observer._willBeUnregistered).length,0);
 f.api.notifyReady();await f.click('enter');assert.equal(f.stats.leases,1);await f.click('place');const instance=f.api.inspect().document.instances[0];assert.ok(Math.hypot(instance.transform.position[0]-f.player.position.x,instance.transform.position[2]-f.player.position.z)>1.3,'camera focus spawn moves clear of the player');assert.equal(f.root.querySelector('[data-instances] option[selected]').textContent.includes(instance.instanceId),false);
 await f.click('apply');assert.equal(f.api.isEditing(),false);f.api.notifyReady();await settle();assert.equal(f.stats.leases,1,'applying does not immediately reopen the editor');assert.ok(f.store.get(authoredMapStorageKey('village')));assert.equal(f.button('export').disabled,false,'the applied work remains saveable');
});

test('actual scene picks drag an owned prop without moving camera or publishing until pointer-up',async t=>{
 const f=fixture(t);await settle();await f.click('place');const item=f.api.inspect().document.instances[0],record=f.world.authoredPlacements.records.get(item.instanceId),start=record.root.position.clone(),target=start.add(new Vector3(9,0,7)),before=f.stats.applies,camera=f.world.camera.position.clone();
 const sky=MeshBuilder.CreateSphere('painted-sky',{diameter:2,sideOrientation:2},f.world.scene);sky.position.copyFrom(camera);sky.isPickable=false;sky.computeWorldMatrix(true);const ray=new Ray(camera,start.subtract(camera).normalize(),100);assert.equal(f.world.scene.pickWithRay(ray,()=>true).pickedMesh,sky,'a custom predicate without pickability is intercepted by foreground sky geometry');
 const down=await f.pointer(PointerEventTypes.POINTERDOWN,start,{eventType:'pointerdown'});assert.equal(down.skipOnPointerObservable,true);assert.equal(f.world.camera.inputs.attachedToElement,false);assert.equal(f.button('apply').disabled,true);
 await f.pointer(PointerEventTypes.POINTERMOVE,target);assert.ok(f.stats.previews>0);assert.equal(f.stats.applies,before);assert.deepEqual(f.api.inspect().document.instances[0],item);assert.ok(f.world.camera.position.equals(camera));
 await f.pointer(PointerEventTypes.POINTERUP,target,{eventType:'pointerup'});assert.equal(f.stats.applies,before+1);assert.equal(f.world.camera.inputs.attachedToElement,true);assert.deepEqual(f.cameraCounts,{detach:1,attach:1});const moved=f.api.inspect().document.instances[0];assert.equal(moved.instanceId,item.instanceId);assert.ok(moved.transform.position[0]>item.transform.position[0]+5);
 await f.click('undo');assert.deepEqual(f.api.inspect().document.instances[0],item);await f.click('redo');assert.deepEqual(f.api.inspect().document.instances[0],moved);
});

test('touch cancel restores the committed prop; ground-click move commits once without numeric input',async t=>{
 const f=fixture(t);await settle();await f.click('place');const item=f.api.inspect().document.instances[0],record=f.world.authoredPlacements.records.get(item.instanceId),before=f.stats.applies,start=record.root.position.clone();await f.pointer(PointerEventTypes.POINTERDOWN,start,{pointerId:7,eventType:'pointerdown'});await f.pointer(PointerEventTypes.POINTERMOVE,start.add(new Vector3(6,0,-4)),{pointerId:7});f.root.querySelector('canvas').dispatchEvent(new f.window.Event('pointercancel'));await settle();assert.equal(f.stats.applies,before);assert.deepEqual(f.api.inspect().document.instances[0],item);assert.equal(f.world.camera.inputs.attachedToElement,true);
 await f.click('move');const target=new Vector3(-2,0,-3);await f.pointer(PointerEventTypes.POINTERDOWN,target,{eventType:'pointerdown'});assert.equal(f.stats.applies,before+1);const position=f.api.inspect().document.instances[0].transform.position;assert.ok(Math.abs(position[0]-target.x)<1e-4);assert.ok(Math.abs(position[2]-target.z)<1e-4);assert.equal(f.world.camera.inputs.attachedToElement,true);
});

test('native gizmo drag detaches camera before the Babylon behavior and restores it after commit',async t=>{
 const f=fixture(t);await settle();await f.click('place');assert.equal(f.manager.positionGizmoEnabled,false,'collapsed advanced tools cannot intercept primary prop dragging');assert.equal(f.manager.attached,null);const advanced=f.root.querySelector('[data-advanced]');advanced.open=true;advanced.dispatchEvent(new f.window.Event('toggle'));assert.equal(f.manager.positionGizmoEnabled,true);const record=[...f.world.authoredPlacements.records.values()][0],before=f.stats.applies;f.nativeGizmo.onDragStartObservable.notifyObservers({});assert.equal(f.world.camera.inputs.attachedToElement,false);record.root.position.x+=3;f.nativeGizmo.onDragObservable.notifyObservers({});await settle();assert.equal(f.stats.applies,before);f.nativeGizmo.onDragEndObservable.notifyObservers({});await settle();assert.equal(f.stats.applies,before+1);assert.deepEqual(f.cameraCounts,{detach:1,attach:1});
});

test('save and open work files keep IDs and transforms without exposing serialization controls',async t=>{
 const f=fixture(t);await settle();await f.click('place');await f.click('rotate-right');await f.click('larger');const expected=f.api.inspect().document;const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL,originalAnchorClick=f.window.HTMLAnchorElement.prototype.click;let blob,download;URL.createObjectURL=value=>{blob=value;return 'blob:test-editor';};URL.revokeObjectURL=()=>{};f.window.HTMLAnchorElement.prototype.click=function(){assert.equal(this.isConnected,true,'download request starts from a connected anchor');download=this.download;};t.after(()=>{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;f.window.HTMLAnchorElement.prototype.click=originalAnchorClick;});
 await f.click('export');assert.match(download,/\.moonmap$/);assert.equal(download.includes('.json'),false);const text=await blob.text();assert.deepEqual(JSON.parse(text).instances,expected.instances);await f.click('delete');const input=f.root.querySelector('[data-import]');let opened=0;input.click=()=>opened++;await f.click('open');assert.equal(opened,1);Object.defineProperty(input,'files',{configurable:true,value:[{size:blob.size,text:async()=>text}]});input.dispatchEvent(new f.window.Event('change'));await settle();assert.deepEqual(f.api.inspect().document.instances,expected.instances);await f.click('apply');assert.deepEqual(JSON.parse(f.store.get(authoredMapStorageKey('village'))).instances,expected.instances);
});

test('a coalesced touch release uses its final ground point even without a final move event',async t=>{
 const f=fixture(t);await settle();await f.click('place');const record=[...f.world.authoredPlacements.records.values()][0],start=record.root.position.clone(),before=f.stats.applies,target=start.add(new Vector3(7,0,-5));await f.pointer(PointerEventTypes.POINTERDOWN,start,{pointerId:12,eventType:'pointerdown'});await f.pointer(PointerEventTypes.POINTERUP,target,{pointerId:12,eventType:'pointerup'});assert.equal(f.stats.applies,before+1);const point=f.api.inspect().document.instances[0].transform.position;assert.ok(point[0]>start.x+5);assert.ok(point[2]<start.z-3);assert.equal(f.world.camera.inputs.attachedToElement,true);
});

test('concurrent ready/manual entry shares one lease and a late cancelled lease restores readiness',async t=>{
 const f=fixture(t,{autoEnter:false,deferLease:true});const first=f.api.enter(),second=f.api.enter();assert.equal(first,second);await settle();assert.equal(f.stats.leases,1);f.api.leaveMap();f.gate.lease();await first;await settle();assert.equal(f.api.isEditing(),false);assert.equal(f.stats.releases,1);assert.equal(f.state.ready,true);assert.equal(f.stats.gizmos,0);
});
