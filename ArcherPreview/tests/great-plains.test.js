import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PLAINS_PLACEMENTS,PLAINS_ROUTES,PLAINS_CLEARINGS,PLAINS_TREASURE_ANCHORS,PLAINS_RADIUS,plainsObstacles,plainsRoadDistance,plainsStreamDistance} from '../src/great-plains-layout.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {mapPortals,mapForCharacter,worldSpawn,portalHeadingTurn,portalAvailable,travelUrl} from '../src/map-route.js';
import {greatPlainsHeight} from '../src/great-plains-terrain.js';
import {NullEngine,VertexBuffer} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {createTerrainGround} from '../src/terrain-mesh.js';
import {applyPlainsViewDistance,plainsRenderRange} from '../src/plains-view-distance.js';

test('treasure anchors preserve quest identities without duplicate static chests',()=>{
 assert.deepEqual(PLAINS_TREASURE_ANCHORS.map(({id,x,z,lootTier})=>({id,x,z,lootTier})),[
  {id:'supply-chest',x:18,z:81,lootTier:1},
  {id:'meadow-chest',x:-55,z:45,lootTier:1},
  {id:'lookout-chest',x:-27,z:-22,lootTier:2},
 ]);
 const ids=new Set(PLAINS_TREASURE_ANCHORS.map(p=>p.id));
 assert.equal(PLAINS_PLACEMENTS.some(p=>ids.has(p.id)||p.asset==='chest-common'),false);
 for(const anchor of PLAINS_TREASURE_ANCHORS)for(const p of PLAINS_PLACEMENTS.filter(p=>p.grove))assert.ok(Math.hypot(p.x-anchor.x,p.z-anchor.z)>p.colliderRadius+anchor.colliderRadius+.6,p.id+' covers a treasure anchor');
});

test('groves add bounded scenery outside full road widths, clearings and the lookout ramp',()=>{
 const added=PLAINS_PLACEMENTS.filter(p=>p.grove);
 assert.ok(added.length>70&&added.length<=150,'keep the added instance budget bounded');
 assert.ok(PLAINS_PLACEMENTS.length<=1250,'density must not grow without a new performance review');
 assert.equal(PLAINS_PLACEMENTS.filter(p=>p.kind==='ground-detail').length,580,'do not spend more instances on uniform grass');
 for(const p of added){
  assert.ok(plainsRoadDistance(p.x,p.z)>p.colliderRadius+.65,p.id+' narrows a road or clearing');
  assert.ok(plainsStreamDistance(p.x,p.z)>p.colliderRadius+3.6,p.id+' is inside the river bank');
  assert.ok(Math.hypot((p.x+28)/1.1,p.z+20)>=15,p.id+' obscures the summit');
  for(const c of PLAINS_CLEARINGS)assert.ok(Math.hypot(p.x-c.x,p.z-c.z)>c.r+p.colliderRadius+.6,p.id+' blocks an exploration clearing');
 }
 // Test the road shoulders as well as its center with only the new obstacles.
 const nav=new VillageNavigation(plainsObstacles().filter(o=>added.some(p=>p.id===o.id)));
 for(const road of PLAINS_ROUTES)for(let i=1;i<road.samples.length;i++){
  const [x,z]=road.samples[i],[px,pz]=road.samples[i-1],length=Math.hypot(x-px,z-pz);
  if(length<1e-8)continue;
  for(const side of [-1,0,1]){
   const point={x:x-(z-pz)/length*road.width*.5*side,z:z+(x-px)/length*road.width*.5*side};
   if(Math.hypot(point.x,point.z)<PLAINS_RADIUS-.5)assert.ok(nav.free(point,.35,PLAINS_RADIUS),road.id+' shoulder obstructed');
  }
 }
});

test('forest species increase towards the entrance while village groves stay healthy',()=>{
 const addedTrees=PLAINS_PLACEMENTS.filter(p=>p.grove&&p.kind==='tree');
 const ratio=zone=>{const trees=addedTrees.filter(p=>p.zone===zone);assert.ok(trees.length>=8);return trees.filter(p=>p.asset.startsWith('forest-')).length/trees.length;};
 assert.equal(ratio('village'),0);
 assert.ok(ratio('forest')>ratio('fringe')&&ratio('fringe')>0);
 assert.ok(new Set(addedTrees.map(p=>p.grove)).size>=12,'trees should form separate islands around traversable spaces');
 const boundary=PLAINS_PLACEMENTS.filter(p=>p.id.startsWith('forest-north-'));
 assert.ok(boundary.some(p=>p.asset==='tree-01-round-oak'));
 for(const asset of ['tree-02-slender-pine','forest-01-sickly-oak','forest-02-dead-tree'])assert.ok(boundary.some(p=>p.asset===asset));
});

test('plains reuses complete existing forest and village LOD graphs',()=>{
 const read=name=>JSON.parse(readFileSync(new URL('../public/assets/'+name+'.json',import.meta.url),'utf8'));
 const plains=read('great-plains'),village=read('village'),forest=read('monster-forest');
 for(const [source,ids]of [[village,['tree-02-slender-pine','bush','handcart','firewood']],[forest,['forest-01-sickly-oak','forest-02-dead-tree','forest-03-fallen-log']]])for(const id of ids){
  assert.deepEqual(plains.assets[id],source.assets[id],id+' must preserve the source LOD and texture metadata');
  for(const lod of plains.assets[id].lods)for(const ref of lod.resources)assert.ok(existsSync(new URL('../public/assets/'+ref,import.meta.url)),id+' missing '+ref);
 }
 assert.equal(plains.availableAssetCount,Object.keys(plains.assets).length);
 for(const p of PLAINS_PLACEMENTS)assert.ok(plains.assets[p.asset],p.id+' has no asset config');
 const exterior=plains.assets['village-approach'];
 assert.equal(new Set(exterior.lods.map(l=>l.model)).size,1,'preserve integrated shared exterior geometry');
 assert.ok(exterior.lods.every(l=>l.textureSize===2048),'retain actual exterior 2K metadata');
});

test('authored route network stays walkable through clustered scenery',()=>{
 assert.equal(new Set(PLAINS_PLACEMENTS.map(p=>p.id)).size,PLAINS_PLACEMENTS.length);
 assert.ok(PLAINS_PLACEMENTS.some(p=>p.id==='village-exterior'&&p.background));
 const nav=new VillageNavigation(plainsObstacles());
 for(const road of PLAINS_ROUTES)for(const [x,z]of road.samples){
  if(Math.hypot(x,z)>PLAINS_RADIUS-.5)continue;
  assert.ok(nav.free({x,z},.35,PLAINS_RADIUS),road.id+' blocked at '+x+','+z);
 }
});
test('village to plains to forest and reciprocal arrivals are outside triggers',()=>{
 assert.equal(mapPortals('village')[0].destination,'warrior-plains');
 assert.deepEqual(mapPortals('great-plains').map(p=>p.destination),['warrior-v3','warrior-v4']);
 assert.equal(mapPortals('monster-forest')[0].destination,'warrior-plains');
 for(const from of ['warrior-v3','warrior-plains','warrior-v4','warrior-v5'])for(const p of mapPortals(mapForCharacter(from))){
  const spawn=worldSpawn(p.destination,'?arrival=portal&from='+from);
  assert.deepEqual(spawn,p.arrival);
  for(const reverse of mapPortals(mapForCharacter(p.destination)))assert.equal(portalAvailable(spawn,reverse),false,'arrival retriggers portal');
  assert.ok(Number.isFinite(portalHeadingTurn(from,p.destination)));
  assert.ok(Math.abs(portalHeadingTurn(from,p.destination)+portalHeadingTurn(p.destination,from))<1e-8);
 }
});
test('plains entry, exit and terrain stay finite with gentle road gradients',()=>{
 const nav=new VillageNavigation(plainsObstacles());
 for(const p of mapPortals('great-plains'))assert.ok(nav.free(p,.35,PLAINS_RADIUS));
 for(const road of PLAINS_ROUTES){let prev;for(const [x,z]of road.samples){
  const h=greatPlainsHeight(x,z);assert.ok(Number.isFinite(h));
  if(prev)assert.ok(Math.abs(h-prev.h)/Math.hypot(x-prev.x,z-prev.z)<.7,'steep path '+road.id);
  prev={x,z,h};
 }}
 assert.match(travelUrl('http://localhost/?character=warrior-v3','warrior-plains'),/character=warrior-plains/);
});

test('plains 200% floor border covers the normal camera range without adding playable geometry',t=>{
 const engine=new NullEngine();engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
 const world=createWorld(engine,{plains:true,touchDevice:false});t.after(()=>{world.scene.dispose();engine.dispose();});
 const original=createTerrainGround(world.scene,world.terrain,{borderExtension:105}),actual=world.ground;
 assert.equal(actual.getTotalVertices(),original.getTotalVertices());assert.deepEqual(actual.getIndices(),original.getIndices());
 const before=original.getVerticesData(VertexBuffer.PositionKind),after=actual.getVerticesData(VertexBuffer.PositionKind);
 for(let i=0;i<before.length;i+=3)if(Math.abs(before[i])<world.terrain.half&&Math.abs(before[i+2])<world.terrain.half)assert.deepEqual(after.slice(i,i+3),before.slice(i,i+3));
 applyPlainsViewDistance(world,2);const bounds=actual.getBoundingInfo().boundingBox;
 assert.ok(bounds.maximum.x-PLAINS_RADIUS-world.camera.upperRadiusLimit>plainsRenderRange(world).fogEnd);
 assert.ok(-bounds.minimum.z-PLAINS_RADIUS-world.camera.upperRadiusLimit>plainsRenderRange(world).fogEnd);
 assert.ok(world.camera.maxZ>plainsRenderRange(world).fogEnd);original.dispose();
});

test('plains signs and river release across repeated four-map replacement without scene ownership growth',async t=>{
 const engine=new NullEngine();engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
 const world=createWorld(engine,{village:true,touchDevice:true});t.after(()=>{world.scene.dispose();engine.dispose();});
 const baseline=new Map(),sequence=['warrior-plains','warrior-v4','warrior-v5','warrior-v4','warrior-plains','warrior-v3'];
 for(let cycle=0;cycle<4;cycle++)for(const character of sequence){
  replaceWorldMap(world,character);await new Promise(resolve=>setTimeout(resolve,5));
  const scene=world.scene,counts={meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,before:scene.onBeforeRenderObservable.observers.length,dispose:scene.onDisposeObservable.observers.length};
  assert.equal(!!world.plainsDecor,character==='warrior-plains');
  if(character!=='warrior-v5')assert.equal(world.ground.getBoundingInfo().boundingBox.maximum.x,world.terrain.half+(character==='warrior-plains'?260:105));
  if(character!=='warrior-plains')assert.equal(scene.meshes.some(m=>m.name==='plains-stream'),false);
  if(cycle===1)baseline.set(character,counts);if(cycle>1)assert.deepEqual(counts,baseline.get(character),character+' resources grew');
 }
});
