import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createMapResourceInspector,mapResourceReportHtml,mapResourceReportMarkup} from '../src/map-resource-inspector.js';
import {captureMapPolygonInputs,estimateMapPolygonInputs} from '../src/map-polygon-estimate.js';

const catalog={entries:[{assetId:'grass',name:'풀 군락',category:'plant',geometry:{triangles:1455}},{assetId:'rock',name:'바위',geometry:{triangles:700}}]};
function fixture(options={}){
 const {document:doc,window}=parseHTML(readFileSync(new URL('../moonforest-0.2.html',import.meta.url),'utf8'));
 const opener=doc.createElement('button');opener.id='open-map-resources';doc.body.append(opener);
 let calls=0,marked=0,downloads=0,world={mapId:'great-plains',scene:{getActiveIndices:()=>600,getEngine:()=>({frameId:7})},environment:{geometryPending:0},placements:[{id:'a',asset:'grass'},{id:'b',asset:'grass'}],ground:{getTotalIndices:()=>300},resourceLoadLedger:{markReady(){marked++;},snapshot:()=>({files:[],bundles:[],dropped:{files:0,bundles:0},phases:{initial:{requestedFiles:0,responseBodyBytes:0}},trackedLogicalBytes:0})}};
 const revoked=[],blobs=new Map(),urlApi={createObjectURL(blob){const url='blob:fixture/'+blobs.size;blobs.set(url,blob);return url;},revokeObjectURL(url){revoked.push(url);}};
 const collect=()=>{calls++;return {cpuMs:1,totals:{uniqueGeometryTriangles:1455,uniqueGeometries:1,submittedTriangles:200,internalTextures:1,textureBytesEstimate:2048,textureBytesUnknown:0,geometryBufferBytesKnown:1000,geometryBuffersUnknown:1,surfaceMeshEntries:2,materials:1,outlineMeshEntries:0,placementBaseTriangles:2910},assets:[],textures:[],truncated:{assets:0,textures:0,geometries:0}};};
 const inspector=createMapResourceInspector({doc,getWorld:()=>world,getLoad:()=>({totalMs:2100}),collect,loadCatalog:async()=>catalog,urlApi,...options});
 for(const id of ['map-resource-json-link','map-resource-html-link'])doc.getElementById(id).click=()=>downloads++;
 const click=id=>doc.getElementById(id).dispatchEvent(new window.Event('click'));
 return {doc,inspector,click,blobs,revoked,world,setWorld:value=>world=value,counts:()=>({calls,marked,downloads})};
}

test('one load-ready snapshot is fixed while a manual refresh sees later streamed resources; no continuous scan',async()=>{
 const f=fixture();f.inspector.begin();assert.equal(f.counts().calls,0);f.inspector.captureReady();assert.deepEqual(f.counts(),{calls:1,marked:1,downloads:0});
 f.world.placements.push({id:'c',asset:'rock'});await f.inspector.show();assert.equal(f.counts().calls,1);assert.equal(f.inspector.snapshot().placementEstimate.placementTriangles,2910);assert.equal(f.inspector.snapshot().kind,'load-ready');
 await f.inspector.show('current');assert.equal(f.counts().calls,2);assert.equal(f.inspector.snapshot().placementEstimate.placementTriangles,3610);
 await f.inspector.show();assert.equal(f.inspector.snapshot().placementEstimate.placementTriangles,2910);assert.equal(f.counts().calls,2);
 f.inspector.dispose();
});

test('map replacement while lazy catalog resolves cannot replace the new map display or export an old snapshot',async()=>{
 let resolve;const f=fixture({loadCatalog:()=>new Promise(r=>resolve=r)});f.inspector.captureReady();const showing=f.inspector.show();
 f.inspector.begin();f.setWorld({...f.world,mapId:'village'});resolve(catalog);await showing;
 assert.equal(f.inspector.snapshot(),null);assert.equal(f.doc.getElementById('map-resource-json').disabled,true);assert.match(f.doc.getElementById('map-resource-report').textContent,/로딩이 완료/);
 f.inspector.captureReady();await f.inspector.show();assert.equal(f.inspector.snapshot().mapId,'village');f.inspector.dispose();
});

test('JSON and standalone HTML exports keep usable links and release old Blob URLs on replacement/disposal',async()=>{
 const f=fixture();f.inspector.captureReady();await f.inspector.show();f.click('map-resource-json');f.click('map-resource-html');assert.equal(f.counts().downloads,2);
 const json=f.doc.getElementById('map-resource-json-link'),html=f.doc.getElementById('map-resource-html-link');assert.equal(json.hidden,false);assert.match(json.download,/\.json$/);
 const payload=JSON.parse(await f.blobs.get(json.getAttribute('href')).text());assert.equal(payload.mapId,'great-plains');assert.equal(payload.frameCounter.frameId,7);
 const document=await f.blobs.get(html.getAttribute('href')).text();assert.match(document,/<html lang="ko">/);assert.doesNotMatch(document,/<script|<link |https?:\/\//);assert.match(document,/풀 군락/);
 await f.inspector.show('current');assert.equal(f.revoked.length,2);assert.equal(json.hidden,true);f.click('map-resource-json');f.inspector.dispose();assert.equal(f.revoked.length,3);
});

test('inventory failure remains visible without breaking map completion',async()=>{
 const f=fixture({collect:()=>{throw Error('inventory unavailable');}});assert.doesNotThrow(()=>f.inspector.captureReady());await f.inspector.show();assert.equal(f.counts().marked,1);assert.match(f.doc.getElementById('map-resource-report').textContent,/inventory unavailable/);f.inspector.dispose();
});

test('report escapes resource labels, explains near-tier and shared counts, and never calls unknown network bytes zero',async()=>{
 const f=fixture();f.inspector.captureReady();await f.inspector.show();const r=f.inspector.snapshot();r.inventory.assets.push({assetId:'<img src=x onerror=x>',basis:'metadata',meshEntries:1});r.inventory.textures.push({name:'<script>bad</script>',width:4096,height:4096,estimatedBytes:null});
 const markup=mapResourceReportMarkup(r);assert.doesNotMatch(markup,/<img|<script/);assert.match(markup,/모든 배치를 근거리 LOD/);assert.match(markup,/네트워크 전송량 미확정/);assert.match(markup,/엔진 캐시/);assert.match(mapResourceReportHtml(r),/&lt;script&gt;/);f.inspector.dispose();
});

test('polygon snapshots preserve all four maps and effective overlay assets without retaining world objects',()=>{
 for(const mapId of ['village','great-plains','monster-forest','witch-cave']){
  const world={mapId,placements:[{id:'a',asset:'grass'},{id:'b',asset:'rock'},{id:'c',asset:'rock'}],placementOverlay:{removedBaseIds:['b'],instances:[{sourceInstanceId:'a',assetId:'rock'},{assetId:'grass'}]},ground:{getTotalIndices:()=>300}};
  const inputs=captureMapPolygonInputs(world);world.placements.length=0;world.placementOverlay.instances.length=0;
  const result=estimateMapPolygonInputs(JSON.parse(JSON.stringify(inputs)),catalog);assert.equal(result.map,mapId);assert.equal(result.estimatedTotal,2955);assert.equal(result.placements,3);assert.deepEqual(result.assets.map(r=>r.assetId),['grass','rock']);
 }
});
