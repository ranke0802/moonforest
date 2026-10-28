import test from 'node:test';
import assert from 'node:assert/strict';
import {CAVE_PLACEMENTS,CAVE_ASSET_IDS,CAVE_ENTRY,CAVE_BOSS,CAVE_ROUTES,caveObstacles,caveSurface} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain,caveClearance} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {worldSpawn,travelUrl,mapPortals,mapForCharacter,CAVE_RADIUS} from '../src/map-route.js';
import {playerTextureManifest} from '../src/player-texture-profile.js';
test('cave uses exactly twenty approved new types with existing village props',()=>{
  const used=new Set(CAVE_PLACEMENTS.map(p=>p.asset));
  assert.deepEqual([...used].filter(id=>id.startsWith('cave-')).sort(),[...CAVE_ASSET_IDS].sort());
  assert.ok(CAVE_PLACEMENTS.length<400);
  assert.equal(new Set(CAVE_PLACEMENTS.map(p=>p.id)).size,CAVE_PLACEMENTS.length);
  for(const p of CAVE_PLACEMENTS)for(const k of ['x','z','yaw','scale'])assert.ok(Number.isFinite(p[k]),p.id+' '+k);
});
test('v5 shares the exact existing 8K player profiles and has reversible travel',()=>{
  const caps={astc:true,maxTextureSize:8192};
  assert.equal(playerTextureManifest('warrior-v5',caps,{userAgent:'Android Chrome'}),'warrior-v3-ios');
  assert.equal(playerTextureManifest('warrior-v5',caps,{userAgent:'Windows Chrome'}),'warrior-v3');
  const out=travelUrl('https://example.test/?character=warrior-v5','warrior-v4');
  assert.deepEqual(worldSpawn('warrior-v4',new URL(out).search),{x:28,z:-38});
  assert.equal(mapForCharacter('warrior-v5'),'witch-cave');
  assert.equal(mapPortals('monster-forest').length,2);assert.equal(mapPortals('village').length,1);
  assert.deepEqual(worldSpawn('warrior-v5'),CAVE_ENTRY);
});
test('all broad cave route centres are walkable and terrain stays finite',()=>{
  const terrain=createWitchCaveTerrain();
  for(const points of CAVE_ROUTES)for(let i=1;i<points.length;i++)for(let n=0;n<=40;n++){
    const a=points[i-1],b=points[i],t=n/40,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
    assert.ok(caveClearance(x,z)>2.5);assert.ok(Number.isFinite(terrain.heightAt(x,z)));
  }
});
test('entry reaches boss chamber; movement and dodges cannot cross flooded voids',()=>{
  const nav=new CaveNavigation(caveObstacles());
  const goal={x:CAVE_BOSS.x,z:CAVE_BOSS.z+7};
  const path=nav.path(CAVE_ENTRY,goal,.34,CAVE_RADIUS-.5);
  assert.ok(path.length>5,'nontrivial route around cavern');
  for(let i=1;i<path.length;i++)assert.ok(nav.segmentClear(path[i-1],path[i],.34));
  const start={x:7,z:27},end=nav.move(start,{x:7,z:2},.34,CAVE_RADIUS);
  assert.ok(nav.free(end,.34,CAVE_RADIUS));assert.ok(Math.hypot(end.x-start.x,end.z-start.z)<15);
  assert.equal(nav.segmentClear(start,{x:0,z:0},.34),false);
  for(let i=0;i<180;i++){
    const a=i*Math.PI/90,delta={x:Math.cos(a)*25,z:Math.sin(a)*25};
    const landed=nav.move(start,{x:start.x+delta.x,z:start.z+delta.z},.34,CAVE_RADIUS);
    assert.ok(nav.free(landed,.34,CAVE_RADIUS));assert.ok(caveSurface(landed.x,landed.z).distance<0);
  }
});
