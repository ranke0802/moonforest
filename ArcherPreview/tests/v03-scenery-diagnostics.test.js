import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ArcRotateCamera, FreeCamera, NullEngine, Scene, Vector3, VertexBuffer} from '@babylonjs/core';
import {configurePlainsDecor} from '../src/great-plains-decor.js';
import {createPlainsLeafDrift} from '../src/plains-leaf-drift.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS} from '../src/village-plains-outskirts.js';
import {sceneryFeatureEnabled, vistaRenderPlacements} from '../src/v03/scenery-diagnostics.js';
import {settlementPlacements} from '../src/v03/settlement-scenery.js';
import {prepareVillageStart} from '../src/village-streamed-environment.js';

function fixture(t) {
  const engine = new NullEngine(), scene = new Scene(engine);
  const pos = new Vector3(0, 0, 0);
  const tree = {root:{position:pos, isEnabled:()=>true}, placement:{asset:'tree-01-round-oak', scale:1}, meshes:[{}], entry:{config:{height:9}}};
  const world = {scene, terrain:createGreatPlainsTerrain(), lighting:{direction:new Vector3(.3,.9,.25)}, mapId:'great-plains', plains:true, gameplayV03:true, touchDevice:true,
    villagePrepared:{recordsByAsset:new Map([[tree.placement.asset,[tree]]])}};
  t.after(()=>{scene.dispose(); engine.dispose();});
  return {world, tree, pos, engine, scene};
}
function locationFor(t, search) {
  const before=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{configurable:true,writable:true,value:new URL('https://scenery.test/moonforest-0.3.html'+search)});
  t.after(()=>{if(before)Object.defineProperty(globalThis,'location',before);else delete globalThis.location;});
}

test('leaf updates skip all off-camera uploads, wake on the same frame, and preserve every reference vertex', t=>{
  const tracked=fixture(t), reference=fixture(t);
  const input={random:()=>.4};
  const a=createPlainsLeafDrift(tracked.world,input), b=createPlainsLeafDrift(reference.world,input);
  t.after(()=>{a.dispose();b.dispose();});
  const camera=new FreeCamera('turn',new Vector3(0,5,-25),tracked.scene);
  const face=z=>{camera.setTarget(new Vector3(0,5,z));camera.getViewMatrix(true);};
  face(0);
  const tick=()=>{a.update(1/60,tracked.pos,true); b.update(1/60,reference.pos,true);};
  for(let i=0;i<50;i++)tick();
  const mesh=tracked.scene.getMeshByName('plains-drifting-leaves');
  const other=reference.scene.getMeshByName(mesh.name);
  const installCounter=mesh=>{
    const update=mesh.updateVerticesData.bind(mesh);
    let count=0;
    mesh.updateVerticesData=(...args)=>{count++;return update(...args);};
    return ()=>count;
  };
  const count=installCounter(mesh), referenceCount=installCounter(other);
  face(-55);
  for(let i=0;i<120;i++)tick();
  assert.equal(count(),0);assert.equal(referenceCount(),120);
  face(0);tick();
  assert.equal(count(),1);
  assert.deepEqual(mesh.getVerticesData(VertexBuffer.PositionKind),other.getVerticesData(VertexBuffer.PositionKind));
});

test('distant plains oaks never need a scene-node check during the canopy search', t=>{
  const {world, pos, tree}=fixture(t);
  const oaks=PLAINS_PLACEMENTS.filter(p=>p.asset===tree.placement.asset&&!p.background);
  let checked=0;
  world.villagePrepared.recordsByAsset.set(tree.placement.asset,oaks.map(p=>({
    placement:p, meshes:[{}], root:{position:p, isEnabled(){checked++;return false;}}
  })));
  const drift=createPlainsLeafDrift(world);
  t.after(()=>drift.dispose());
  drift.update(1/60,pos,true);
  assert.equal(checked,oaks.filter(p=>p.x*p.x+p.z*p.z<14**2).length);
  assert.ok(oaks.some(p=>p.x*p.x+p.z*p.z>=14**2));
});

test('leaves=0 isolates atmospheric drift: a real tree strike still sheds leaves and the river remains enabled', t=>{
  locationFor(t,'?leaves=0');
  const {world,tree,pos,scene,engine}=fixture(t);
  world.camera=new FreeCamera('gate',new Vector3(0,5,-25),scene);
  world.camera.setTarget(new Vector3(0,5,0));
  engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
  configurePlainsDecor(world);
  const step=n=>{for(let i=0;i<n;i++)world.plainsDecor.updateLeaves(1/60,pos,true);};
  step(180);
  const name='plains-drifting-leaves';
  assert.equal(scene.getMeshByName(name),null);
  assert.equal(world.plainsDecor.river.mesh.isEnabled(),true);
  world.plainsDecor.strikeLeaves(tree,pos);step(20);
  const batch=scene.getMeshByName(name);
  assert.ok(batch.isEnabled());
  assert.ok(batch.getVerticesData(VertexBuffer.PositionKind).some(value=>value!==0));
  step(420);
  assert.equal(batch.isEnabled(),false);
  world.plains=false;configurePlainsDecor(world);
  assert.equal(world.plainsDecor,null);
  assert.equal(scene.getMeshByName(name),null);
});

test('vista=0 omits only non-playable reciprocal scenery before prefetch and keeps the physical layout',async t=>{
  locationFor(t,'?vista=0');
  const {world,scene}=fixture(t);
  const physical=settlementPlacements('great-plains',PLAINS_PLACEMENTS);
  const vista=physical.find(p=>p.id==='village-exterior');
  const farGate=physical.filter(p=>p.id.startsWith('vista-v03-gate-'));
  assert.equal(farGate.length,6);
  const renderSet=new Set(vistaRenderPlacements(world,physical));
  const removed=physical.filter(p=>!renderSet.has(p));
  assert.deepEqual(removed,[vista,...farGate]);
  assert.ok(removed.every(p=>p.background&&!p.colliderRadius));
  const outskirts=settlementPlacements('village',VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS);
  const townView=vistaRenderPlacements({...world,mapId:'village'},outskirts);
  assert.ok(townView.some(p=>p.id==='v03-gate-west-tower'));
  assert.ok(outskirts.filter(p=>p.villagePlainsOutskirts).length>1);
  assert.deepEqual(townView,outskirts.filter(p=>!p.villagePlainsOutskirts));
  assert.equal(vistaRenderPlacements({...world,gameplayV03:false},physical),physical);
  assert.equal(vistaRenderPlacements({...world,mapId:'witch-cave'},physical),physical);
  assert.equal(sceneryFeatureEnabled(world,'leaves'),true);
  assert.equal(sceneryFeatureEnabled(world,'leaves','?leaves=1'),true);
  assert.equal(sceneryFeatureEnabled({...world,gameplayV03:false},'leaves','?leaves=0'),true);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>new Response(readFileSync(new URL('../public'+new URL(url).pathname,import.meta.url)));
  t.after(()=>{globalThis.fetch=originalFetch;});
  Object.assign(world,{camera:new ArcRotateCamera('gate',1,1.1,20,new Vector3(vista.x,4,vista.z),scene),placements:physical,environmentManifest:'great-plains',villagePrepared:null});
  const prepared=await prepareVillageStart(world);
  assert.equal(world.placements,physical);
  assert.equal(prepared.recordsByAsset.has('village-approach'),false);
  assert.ok(prepared.records.length>100);
  assert.ok(!prepared.plan.some(item=>item.id==='village-approach'));
  const excluded=prepared.assets.get('village-approach').levels[0];
  assert.ok(!prepared.resources.includes(excluded.model));
  const source=JSON.parse(readFileSync(new URL('../public/assets/'+excluded.model,import.meta.url))).images[0].uri;
  assert.ok(!prepared.resources.some(path=>path.endsWith('/'+source)));
  globalThis.location.search='?leaves=0';
  assert.equal(vistaRenderPlacements(world,physical),physical);
});
