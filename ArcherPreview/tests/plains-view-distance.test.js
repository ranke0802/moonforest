import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {FreeCamera,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {setupSettingsPanel} from '../src/settings-panel.js';
import {PLAINS_VIEW_DISTANCE_KEY,applyPlainsViewDistance,plainsRenderRange,readPlainsViewDistance,setupPlainsViewDistanceControl} from '../src/plains-view-distance.js';
import {villageRenderRange} from '../src/village-policy.js';
import {VillageDemandCache,VillageGeometryStreaming} from '../src/village-demand.js';
import {VillageVisibility} from '../src/village-visibility.js';

test('settings default to existing range, persist only valid steps, and tolerate unavailable storage',t=>{
 const {document}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
 const previous=globalThis.document;globalThis.document=document;t.after(()=>globalThis.document=previous);setupSettingsPanel();
 const select=document.getElementById('plains-view-distance-select');
 assert.deepEqual([...select.options].map(o=>o.value),['1','1.1','1.2','1.3']);
 Object.defineProperty(select,'value',{configurable:true,writable:true,value:''});
 const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},seen=[];
 const control=setupPlainsViewDistanceControl({select,storage,onChange:v=>seen.push(v)});
 assert.equal(control.value,1);select.value='1.3';select.dispatchEvent(new document.defaultView.Event('change'));
 assert.equal(saved.get(PLAINS_VIEW_DISTANCE_KEY),'1.3');control.dispose();
 const restored=setupPlainsViewDistanceControl({select,storage});assert.equal(restored.value,1.3);restored.dispose();
 for(const invalid of ['1.4','999','NaN','',null])assert.equal(readPlainsViewDistance({getItem:()=>invalid}),1);
 assert.equal(readPlainsViewDistance({getItem(){throw Error('denied');}}),1);
});

test('scenery demand and visibility extend together only on plains and return on map switch',async t=>{
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);
 t.after(()=>{scene.dispose();engine.dispose();});
 const camera=new FreeCamera('camera',new Vector3(0,0,0),scene);camera.setTarget(new Vector3(0,0,1));camera.minZ=.1;camera.maxZ=350;
 const world={scene,camera,mapId:'great-plains',plains:true,touchDevice:false,lighting:{shadowsActive:false},shadows:{removeShadowCaster(){},addShadowCaster(){}}};
 const makeRecord=(z,id)=>{const center=new Vector3(0,0,z),min=center.subtract(new Vector3(1,1,1)),max=center.add(new Vector3(1,1,1));return {root:new TransformNode(id,scene),placement:{x:0,z,asset:id,kind:'tree'},bounds:{center,radius:1,min,max},min,max,meshes:[]};};
 const records=[makeRecord(100,'near'),makeRecord(130,'far'),makeRecord(131,'far')];
 const stats={},cache=new VillageDemandCache(world,records,stats);world.villageStreaming={demand:cache};
 const visibility=new VillageVisibility(world,records);world.villageVisibility=visibility;t.after(()=>visibility.dispose());
 applyPlainsViewDistance(world,1);assert.equal(plainsRenderRange(world),villageRenderRange(false));
 assert.deepEqual([scene.fogStart,scene.fogEnd],[88,105]);assert.deepEqual(cache.get().map(x=>x.id),['near']);
 visibility.update(camera.globalPosition,camera.target,.2);assert.equal(records[1].cellActive,false);
 applyPlainsViewDistance(world,1.3);assert.deepEqual([scene.fogStart,scene.fogEnd],[88*1.3,105*1.3]);
 assert.equal(plainsRenderRange(world).cellCull,110*1.3);
 const plan=cache.get();assert.deepEqual(plan.map(x=>x.id),['near','far']);assert.equal(plan.filter(x=>x.id==='far').length,1);assert.equal(plan.find(x=>x.id==='far').level,2);
 visibility.update(camera.globalPosition,camera.target,.2);assert.equal(records[1].cellActive,true);
 let loads=0;const loaded=new Set(),stream=new VillageGeometryStreaming(world,records,async r=>{loads++;loaded.add(r.id+':'+r.level);},r=>loaded.has(r.id+':'+r.level),{});
 stream.active=true;stream.update(1000);await stream.pending;stream.update(1300);await stream.pending;stream.update(1600);assert.equal(loads,2);
 world.mapId='village';world.plains=false;scene.fogStart=88;scene.fogEnd=105;applyPlainsViewDistance(world,1.3);
 assert.deepEqual([scene.fogStart,scene.fogEnd],[88,105]);assert.deepEqual(stream.demand.get().map(x=>x.id),['near']);
 visibility.timer=0;visibility.update(camera.globalPosition,camera.target,.2);assert.equal(records[1].cellActive,false);
 world.mapId='monster-forest';world.forest=true;scene.fogStart=65;scene.fogEnd=80;applyPlainsViewDistance(world,1.3);
 assert.deepEqual([scene.fogStart,scene.fogEnd],[65,80]);assert.equal(plainsRenderRange(world),villageRenderRange(false));
 stream.dispose();stream.update(2000);assert.equal(loads,2);
 world.mapId='great-plains';world.plains=true;applyPlainsViewDistance(world,1.3);assert.equal(scene.fogEnd,105*1.3);
 applyPlainsViewDistance(world,1);assert.deepEqual([scene.fogStart,scene.fogEnd],[88,105]);
});

test('touch cap keeps the same fog-to-cull margin and overview is unaffected',()=>{
 const world={mapId:'great-plains',touchDevice:true,scene:{fogStart:400,fogEnd:500},villageOverview:true};
 applyPlainsViewDistance(world,1.3);assert.deepEqual([world.scene.fogStart,world.scene.fogEnd],[400,500]);
 world.villageOverview=false;applyPlainsViewDistance(world,1.3);
 const range=plainsRenderRange(world);assert.deepEqual([range.fogStart,range.fogEnd,range.cellCull],[65*1.3,80*1.3,82*1.3]);
 assert.ok(range.cellCull>range.fogEnd);
});
