import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FOREST_PLACEMENTS,FOREST_ROUTES,FOREST_CLEARINGS,forestObstacles} from '../src/monster-forest-layout.js';
import {monsterForestHeight} from '../src/monster-forest-terrain.js';
import {mapForCharacter,FOREST_RADIUS,FOREST_SPAWN,MAP_PORTALS,portalAvailable,travelUrl} from '../src/map-route.js';
import {clampVillageExit,villageTravelLimit,exitRoadX,consumeTravel} from '../src/map-travel.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {villageObstacles} from '../src/village-layout.js';
import {playerTextureManifest} from '../src/player-texture-profile.js';
import {validVillageTextureProfile} from '../src/village-texture-budget.js';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {prepareVillageStart} from '../src/village-streamed-environment.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {execFileSync} from 'node:child_process';
const base=new URL('../public/assets/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,base)));

test('v4 shares the exact v3 8K player profiles and selects a separate world',()=>{
  for(const agent of [{userAgent:'Android Chrome'},{userAgent:'iPhone'}])assert.equal(playerTextureManifest('warrior-v4',{astc:true,maxTextureSize:8192},agent),playerTextureManifest('warrior-v3',{astc:true,maxTextureSize:8192},agent));
  assert.equal(mapForCharacter('warrior-v3'),'village');assert.equal(mapForCharacter('warrior-v4'),'monster-forest');
});

test('world bounds follow the selected route without changing the village arena',()=>{
  for(const [character,radius]of [['warrior-v4',62],['warrior-v3',48],['warrior-v2',22]]){
    const module=new URL('../src/world-limits.js',import.meta.url).href;
    const script=`globalThis.location={search:'?character=${character}'};const m=await import(${JSON.stringify(module)});process.stdout.write(JSON.stringify([m.ARENA_RADIUS,m.ENEMY_ARENA_RADIUS]));`;
    assert.deepEqual(JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'})),[radius,radius-.5]);
  }
});

test('forest startup requests its own visible LODs and defers high-detail distant geometry',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());scene.useRightHandedSystem=true;
  const camera=new ArcRotateCamera('startup',Math.PI*.38,1.18,4.8,new Vector3(0,1.28,46),scene);camera.maxZ=350;
  const world={scene,camera,terrain:createMonsterForestTerrain(),placements:FOREST_PLACEMENTS,environmentManifest:'monster-forest',touchDevice:true};
  const requests=[],oldLocation=globalThis.location;globalThis.location={href:'https://example.test/game/?character=warrior-v4'};
  t.after(()=>{if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;});
  t.mock.method(globalThis,'fetch',async url=>{requests.push(String(url));return {ok:true,json:async()=>read('monster-forest.json')};});
  const prepared=await prepareVillageStart(world);
  assert.equal(requests.length,1);assert.ok(requests[0].endsWith('/assets/monster-forest.json'));
  assert.equal(prepared.records.length,FOREST_PLACEMENTS.length);assert.equal(prepared.assets.size,10);
  assert.ok(prepared.plan.length>0&&prepared.plan.length<30);
  // The far cave may be prefetched inside the existing visibility margin;
  // its expensive near/mid geometry must wait until the player approaches.
  assert.ok(!prepared.plan.some(p=>p.id==='forest-06-witch-cave-mouth'&&p.level<2));
  const needed=new Set(prepared.plan.flatMap(p=>prepared.assets.get(p.id).levels.find(l=>l.level===p.level).resources));
  assert.deepEqual(new Set(prepared.resources),needed);
  assert.equal(await prepareVillageStart(world),prepared);assert.equal(requests.length,1);
  t.diagnostic(JSON.stringify({initialLods:prepared.plan.length,initialFiles:prepared.resources.length,placements:prepared.records.length}));
});
test('forest has 891 deterministic placements from six prepared and four reused types',()=>{
  const m=read('monster-forest.json'),v=read('village.json');assert.equal(FOREST_PLACEMENTS.length,891);assert.equal(Object.keys(m.assets).length,10);
  assert.equal(new Set(FOREST_PLACEMENTS.map(p=>p.id)).size,891);
  for(const id of ['tree-02-slender-pine','rock-01-mossy-boulder','rock-02-jagged-outcrop','bush'])assert.deepEqual(m.assets[id],v.assets[id]);
  for(const p of FOREST_PLACEMENTS)assert.ok(m.assets[p.asset]);
  for(const [id,a]of Object.entries(m.assets)){
    assert.equal(a.lods.length,3);assert.ok(validVillageTextureProfile(a.highTextures));assert.ok(a.highTextures.textures.albedo.width<=4096);
    assert.equal(a.mobileNear.triangles,a.lods[0].triangles);
    if(id.startsWith('forest-'))assert.ok(a.lods[0].triangles<=5000);
    for(const tier of a.lods){
      for(const url of tier.resources){const bytes=readFileSync(new URL(url,base));assert.equal(createHash('sha256').update(bytes).digest('hex'),url.split('/').at(-1).split('.')[0]);}
      const g=read(tier.model);assert.ok(g.extensionsRequired.includes('EXT_meshopt_compression'));assert.ok(g.extensionsRequired.includes('KHR_texture_basisu'));
    }
  }
});
test('all curved forest routes, spawn and clearings are traversable',()=>{
  const nav=new VillageNavigation(forestObstacles());
  assert.ok(nav.free(FOREST_SPAWN,.32,FOREST_RADIUS));
  for(const route of FOREST_ROUTES)for(let i=0;i<route.samples.length;i++){
    const [x,z]=route.samples[i],p={x,z};assert.ok(nav.free(p,.7,FOREST_RADIUS),'blocked forest road '+JSON.stringify(p));
    if(i){const [px,pz]=route.samples[i-1];assert.ok(nav.segmentClear({x:px,z:pz},p,.7));}
    assert.ok(Number.isFinite(monsterForestHeight(x,z)));
  }
  for(const c of FOREST_CLEARINGS)assert.ok(nav.free(c,.7,FOREST_RADIUS));
});
test('village open entrance reaches the portal at the end of the existing painted road',()=>{
  const nav=new VillageNavigation(villageObstacles());let p={x:0,z:38};
  for(let z=38.1;z<=76;z+=.1){
    const target={x:exitRoadX(z),z},from={...p};p=nav.move(from,target,.32,villageTravelLimit(from,48));clampVillageExit(p);
    assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<.02,'road blocked at '+z);
  }
  assert.ok(portalAvailable(p,MAP_PORTALS.village));
  for(const q of [{x:65,z:0},{x:30,z:65},{x:0,z:-60}])assert.ok(Math.hypot(...Object.values(clampVillageExit(q)))<=48.001);
  assert.ok(clampVillageExit({x:0,z:90}).z<=78);
  const dodge=clampVillageExit({x:8,z:65},{x:exitRoadX(65),z:65});assert.equal(dodge.z,65);assert.ok(Math.abs(dodge.x-exitRoadX(65))<=1.61);
});
test('teleport is deliberate, bidirectional, range checked and blocked during combat',()=>{
  for(const p of Object.values(MAP_PORTALS)){
    assert.ok(portalAvailable(p,p));assert.ok(!portalAvailable({x:p.x+7,z:p.z},p));
    for(const state of [{loading:true},{dead:true},{captured:true},{healing:true},{enemies:1}])assert.ok(!portalAvailable(p,p,state));
    const url=new URL(travelUrl('https://example.test/game/?character=warrior-v3&rev=abc&villageFixture=1',p.destination));
    assert.equal(url.searchParams.get('character'),p.destination);assert.equal(url.searchParams.get('rev'),'abc');assert.equal(url.searchParams.get('arrival'),'portal');assert.equal(url.searchParams.has('villageFixture'),false);
  }
  let value=JSON.stringify({destination:'warrior-v4',time:100,hp:310,potions:1});const storage={getItem:()=>value,removeItem:()=>{value=null;}};
  assert.deepEqual(consumeTravel(storage,'warrior-v4',150),{hp:310,potions:1});assert.equal(consumeTravel(storage,'warrior-v4',150),null);
});
