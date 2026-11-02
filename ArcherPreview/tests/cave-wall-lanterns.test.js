import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Vector3} from '@babylonjs/core';
import {CAVE_PLACEMENTS,caveObstacles} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {caveLanternSupportGeometry} from '../src/cave-lantern-supports.js';
import {buildCavePaintLight,sampleCavePaintLight} from '../src/cave-painted-light.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

test('all twenty existing lamps sit above the walking lane with wall contact and no ground blockers',()=>{
 const terrain=createWitchCaveTerrain(),lamps=CAVE_PLACEMENTS.filter(p=>p.asset==='cave-13-votive-lantern'),obstacles=caveObstacles();assert.equal(lamps.length,20);
 for(const p of lamps){const m=p.wallMount;assert.ok(m);assert.equal(p.scale,.9);assert.ok(Math.abs(p.elevation-.025-m.floor-1.8)<1e-8);assert.ok(p.elevation-.025>terrain.heightAt(p.x,p.z)+.5);assert.ok(m.supportDepth>=.2&&m.supportDepth<=1.1);assert.ok(!obstacles.some(o=>o.id===p.id));assert.ok(Math.hypot(p.x-m.from.x,p.z-m.from.z)<13);assert.ok(Math.abs(Math.hypot(...m.normal)-1)<1e-8);}
 const geometry=caveLanternSupportGeometry();assert.equal(geometry.indices.length/3,480);assert.ok(geometry.positions.every(Number.isFinite));
});

test('wall-mounted light escapes its conservative wall cell but cannot shine behind its mount',()=>{
 const floor={heightAt:()=>0},placements=[{id:'wall-lamp',asset:'votive-lantern',x:0,z:0,elevation:1.8,scale:.9,wallMount:{normal:[1,0]}}];
 const map=buildCavePaintLight(floor,{placements,occludes:(x,z,r)=>x<=.2+r});
 const front=sampleCavePaintLight(map,2,.1,0),behind=sampleCavePaintLight(map,-2,.1,0);
 assert.ok(front.rgb[0]>.5);assert.ok(behind.rgb[0]<.2);assert.equal(map.stats.additionalLights,0);assert.equal(map.stats.additionalShadowPasses,0);assert.equal(map.data.byteLength,65536);
});

test('wall fittings and raised glows stay aligned across six cave/forest returns and dispose with the map',t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>engine.dispose());const scene=world.scene,counts=()=>[scene.meshes.length,scene.materials.length,scene.geometries.length,scene.textures.length,scene.lights.length];let baseline;
 for(let i=0;i<6;i++){
  const support=scene.getMeshByName('cave-lantern-wall-fittings');assert.ok(support);assert.equal(support.getTotalIndices()/3,480);assert.equal(support.isPickable,false);assert.equal(support.material.metadata.villageToon,true);
  const glows=scene.getMeshByName('cave-glow-source-votive-lantern').instances,lamps=CAVE_PLACEMENTS.filter(p=>p.wallMount);assert.equal(glows.length,20);
  for(let j=0;j<lamps.length;j++){const p=lamps[j];assert.ok(glows[j].position.equalsWithEpsilon(new Vector3(p.x,p.elevation+.8*p.scale,p.z),1e-6));}
  caveFogFallback(scene);for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
  world.scene.render();if(baseline)assert.deepEqual(counts(),baseline);else baseline=counts();
  replaceWorldMap(world,'warrior-v4');assert.ok(support.isDisposed());assert.equal(scene.getMeshByName('cave-lantern-wall-fittings'),null);
  replaceWorldMap(world,'warrior-v5');
 }
});
