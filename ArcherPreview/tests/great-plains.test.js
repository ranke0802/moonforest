import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAINS_PLACEMENTS,PLAINS_ROUTES,PLAINS_RADIUS,plainsObstacles} from '../src/great-plains-layout.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {mapPortals,mapForCharacter,worldSpawn,portalHeadingTurn,portalAvailable,travelUrl} from '../src/map-route.js';
import {greatPlainsHeight} from '../src/great-plains-terrain.js';
import {NullEngine} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';

test('approved 301 placements, reused types and all roads remain walkable',()=>{
 assert.equal(PLAINS_PLACEMENTS.length,301);
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

test('plains signs and river release across repeated four-map replacement without scene ownership growth',async t=>{
 const engine=new NullEngine();engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
 const world=createWorld(engine,{village:true,touchDevice:true});t.after(()=>{world.scene.dispose();engine.dispose();});
 const baseline=new Map(),sequence=['warrior-plains','warrior-v4','warrior-v5','warrior-v4','warrior-plains','warrior-v3'];
 for(let cycle=0;cycle<4;cycle++)for(const character of sequence){
  replaceWorldMap(world,character);await new Promise(resolve=>setTimeout(resolve,5));
  const scene=world.scene,counts={meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,before:scene.onBeforeRenderObservable.observers.length,dispose:scene.onDisposeObservable.observers.length};
  assert.equal(!!world.plainsDecor,character==='warrior-plains');
  if(character!=='warrior-plains')assert.equal(scene.meshes.some(m=>m.name==='plains-stream'),false);
  if(cycle===1)baseline.set(character,counts);if(cycle>1)assert.deepEqual(counts,baseline.get(character),character+' resources grew');
 }
});
