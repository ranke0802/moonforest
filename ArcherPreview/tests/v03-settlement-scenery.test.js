import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mapNavigation} from '../src/world.js';
import {plainsPlacements,villagePlacements} from '../src/fixed-layouts.js';
import {VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS} from '../src/village-plains-outskirts.js';
import {villageToPlains,VILLAGE_PLAINS_BOUNDARY} from '../src/village-plains-boundary.js';
import {NPCS} from '../src/v03/data/chapter1.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {createBasePlacementManifest,validatePlacementDocument} from '../src/placement-document.js';
import {settlementPlacements,villageGate,plainsGateAssets} from '../src/v03/settlement-scenery.js';

const town=Object.freeze([...villagePlacements(),...VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS]);
const plains=plainsPlacements(), town03=settlementPlacements('village',town);
const plains03=settlementPlacements('great-plains',plains);
const navigation=(placements,plains)=>mapNavigation({village:true,plains,gameplayV03:true,placements});

test('the published plains document applies without invalidating any of its saved authoring coordinates',()=>{
  const doc=JSON.parse(readFileSync(new URL('../public/authored/maps/great-plains.json',import.meta.url),'utf8'));
  const base=createBasePlacementManifest('great-plains',{catalog:ASSET_CATALOG,placements:plains03});
  assert.equal(base.baseRevision,doc.baseRevision);
  const checked=validatePlacementDocument(doc,{catalog:ASSET_CATALOG,baseManifest:base});
  assert.equal(checked.instances.length,doc.instances.length);
});

test('bear respawn, fighting shelf and chest do not have a buried rock collider; the cliff barrier remains',()=>{
  const original=navigation(plains,true), current=navigation(plains03,true);
  const spawn={x:-25,z:-16}, clearing={x:-26,z:-19};
  assert.equal(original.free(spawn,.7,106),false);
  assert.ok(current.free(spawn,1.7,106));
  assert.ok(current.segmentClear(spawn,clearing,1.7));
  assert.ok(current.free({x:-30.2,z:-23.7},.34,106));
  for(const suffix of [0,1,2,5]){
    const id='lookout-rock-'+suffix;
    assert.ok(plains.some(p=>p.id===id));
    assert.ok(!plains03.some(p=>p.id===id));
    assert.ok(!current.obstacles.some(o=>o.id===id));
  }
  assert.deepEqual(current.obstacles.filter(o=>o.id.startsWith('plains-cliff-')),original.obstacles.filter(o=>o.id.startsWith('plains-cliff-')));
  assert.ok(plains03.some(p=>p.id==='lookout-rock-4'));
  assert.equal(settlementPlacements('great-plains',plains),plains03);
});

test('both gate towers, stockades and the connected inn wing are solid while the entrance road and innkeeper remain accessible',()=>{
  const nav=navigation(town03,false);
  const approach=VILLAGE_PLAINS_BOUNDARY.villageSamples.filter(([,z])=>z>=44&&z<=76);
  for(const [x,z] of approach)assert.ok(nav.free({x,z},.7,90),'gate road '+x+','+z);
  for(const p of villageGate)assert.equal(nav.free(p,.34,90),false,p.id);
  const inn=town03.find(p=>p.id==='v03-moonlight-inn-guest-wing'), host=NPCS.find(p=>p.id==='innkeeper');
  assert.ok(town03.some(p=>p.id==='home-18'&&p.asset==='house-03-workshop'));
  assert.equal(inn.asset,'house-02-tall-home');
  assert.equal(nav.free(inn,.34,80),false);
  assert.ok(Math.hypot(inn.x-host.x,inn.z-host.z)<6);
  assert.ok(nav.segmentClear({x:0,z:10.6},host,.45));
  assert.ok(nav.segmentClear(host,{x:-6,z:11.45},.45));
  assert.equal(settlementPlacements('village',town),town03);
});

test('plains versions of the entrance use the corresponding village poses and reuse only the existing far mesh and texture',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/village.json',import.meta.url),'utf8'));
  for(const source of villageGate){
    const vista=plains03.find(p=>p.id==='vista-'+source.id);
    const {x,z}=villageToPlains(source);
    assert.equal(vista.x,x);assert.equal(vista.z,z);
    assert.equal(vista.yaw,source.yaw+VILLAGE_PLAINS_BOUNDARY.yaw);
    assert.equal(vista.scale,source.scale);assert.ok(vista.background);
    const original=manifest.assets[source.asset].lods.find(level=>level.level===2);
    const config=plainsGateAssets[source.asset];
    for(const level of [config.mobileNear,...config.lods]){
      assert.equal(level.model,original.model);assert.deepEqual(level.resources,original.resources);
      assert.equal(level.textureSize,256);
    }
  }
  assert.equal(new Set(villageGate.map(p=>p.asset)).size,2);
  assert.equal(settlementPlacements('witch-cave',plains),plains);
});
