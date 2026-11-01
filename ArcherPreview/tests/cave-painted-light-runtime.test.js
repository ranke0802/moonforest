import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,MeshBuilder,PBRMaterial,Texture} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {applyVillageToon} from '../src/village-toon.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {inspectCavePaintLightCache} from '../src/cave-painted-light.js';
import {caveRockAlbedo,CAVE_ROCK_PALETTE_GLSL} from '../src/cave-rock-palette.js';

function readyRaw(world){
 for(const texture of [world.caveFog?.texture,world.scene.metadata?.cavePaintLighting?.texture,caveFogFallback(world.scene)])if(texture?.getInternalTexture())texture.getInternalTexture().isReady=true;
}
function fixture(t){const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});readyRaw(world);t.after(()=>engine.dispose());return world;}

test('static cave light owns one 64KiB map, no light/shadow/pass, and never uploads in normal frames',t=>{
 const world=fixture(t),runtime=world.scene.metadata.cavePaintLighting,lights=world.scene.lights.length,meshes=world.scene.meshes.length;
 assert.equal(lights,3);assert.equal(runtime.texture.getSize().width,128);assert.equal(runtime.texture.getSize().height,128);
 assert.equal(runtime.texture.gammaSpace,false);assert.equal(runtime.texture.noMipmap,true);assert.equal(runtime.texture.wrapU,Texture.CLAMP_ADDRESSMODE);
 assert.equal(runtime.inspect().bytes,65536);assert.equal(runtime.inspect().emitters,12);
 t.mock.method(runtime.texture,'update',()=>assert.fail('Static map must not upload per frame'));
 for(let i=0;i<600;i++)world.tick(i/30);
 assert.equal(world.scene.lights.length,lights);assert.equal(world.scene.meshes.length,meshes);assert.equal(runtime.inspect().frameUploads,0);
 assert.equal(world.scene.textures.filter(t=>t.name==='cave-static-painted-light').length,1);
});

test('only floor and painted environment get illumination; character materials keep their existing brightness path',async t=>{
 const world=fixture(t),scene=world.scene,rock=MeshBuilder.CreateBox('actual-env',{size:2},scene),actor=MeshBuilder.CreateBox('untouched-player',{},scene);
 rock.material=new PBRMaterial('rock',scene);rock.material.metadata={caveRockTone:true};applyVillageToon([rock],world.lighting);actor.material=new PBRMaterial('character',scene);
 scene.render();
 for(const mesh of [rock,world.ground]){
  const plugin=mesh.material.pluginManager.getPlugin('CavePaintLight');assert.ok(plugin);
  assert.equal(mesh.material.fogEnabled,false,'environment uses one final dark fog, not a bright engine fog followed by a second fade');
  const calls={},buffer={setTexture:(name,value)=>calls[name]=value,updateFloat:(name,value)=>calls[name]=value,updateFloat4:(name,...value)=>calls[name]=value};plugin.hardBindForSubMesh(buffer);
  assert.equal(calls.cavePaintActive,1);assert.strictEqual(calls.cavePaintLightMap,scene.metadata.cavePaintLighting.texture);
  await mesh.material.forceCompilationAsync(mesh);scene.render();
  const shader=mesh.subMeshes.find(s=>s.effect)?.effect.fragmentSourceCode;assert.ok(shader?.includes('cavePaintFactor(vPositionW)'));
 }
 assert.equal(actor.material.pluginManager?.getPlugin('CavePaintLight')??null,null);
 assert.equal(actor.material.fogEnabled,true);assert.deepEqual(scene.fogColor.asArray(),[.24,.23,.28],'character fog colour stays at the original cave value');
 assert.equal(rock.material.metallic,0);assert.equal(rock.material.roughness,1);assert.equal(rock.material.environmentIntensity,0);
});

test('twenty map roundtrips release GPU maps, keep one detached CPU map, and rebind retained materials safely',async t=>{
 const world=fixture(t),scene=world.scene,mesh=MeshBuilder.CreateBox('retained-env',{},scene);mesh.material=new PBRMaterial('retained',scene);applyVillageToon([mesh],world.lighting);scene.render();
 const count=()=>[scene.textures.length,scene.meshes.length,scene.geometries.length,scene.lights.length],before=count(),oldMaps=[];
 for(let i=0;i<20;i++){
  const old=scene.metadata.cavePaintLighting;oldMaps.push(old);
  replaceWorldMap(world,'warrior-v4');assert.equal(old.disposed,true);assert.equal(scene.metadata.cavePaintLighting,null);
  assert.equal(mesh.material.fogEnabled,true,'outside-cave retained materials recover their engine fog policy');
  const p=mesh.material.pluginManager.getPlugin('CavePaintLight'),calls={},buffer={setTexture:(n,v)=>calls[n]=v,updateFloat:(n,v)=>calls[n]=v,updateFloat4(){}};
  p.hardBindForSubMesh(buffer);assert.equal(calls.cavePaintActive,0);assert.notStrictEqual(calls.cavePaintLightMap,old.texture);
  replaceWorldMap(world,'warrior-v5');readyRaw(world);scene.render();
  p.hardBindForSubMesh(buffer);assert.equal(calls.cavePaintActive,1);assert.strictEqual(calls.cavePaintLightMap,scene.metadata.cavePaintLighting.texture);
  assert.deepEqual(count(),before);
 }
 assert.equal(inspectCavePaintLightCache().maps,1);assert.equal(inspectCavePaintLightCache().bytes,65536);assert.equal(inspectCavePaintLightCache().sceneObjects,0);
 for(const runtime of oldMaps)assert.equal(runtime.texture.getInternalTexture(),null);
});

test('roof keeps the original 1600-triangle enclosure, uses real normals and does not repeat a UV atlas',t=>{
 const world=fixture(t),roof=world.scene.getMeshByName('cave-distant-ceiling'),source=roof.material.shaderPath.fragmentSource;
 assert.equal(roof.getTotalIndices()/3,1600);assert.equal(roof.getVerticesData('normal').length,roof.getVerticesData('position').length);
 assert.ok(roof.getVerticesData('normal').every(Number.isFinite));assert.match(source,/caveRockAlbedo\(p,caveRoofNormal\)/);assert.doesNotMatch(source,/caveRockShade\(p,vec3\(0\.,1\.,0\.\)/);
 assert.ok(roof.material.options.samplers.includes('cavePaintLightMap'));assert.ok(!roof.material.options.samplers.includes('caveRockMap'));
 assert.doesNotMatch(CAVE_ROCK_PALETTE_GLSL,/texture2D|fract\(/);
 for(let i=-80;i<=80;i+=.5){const a=caveRockAlbedo({x:i,y:5,z:-20}),b=caveRockAlbedo({x:i+.1,y:5,z:-20});assert.ok(a.every(v=>v>=.18&&v<=.31));assert.ok(a.every((v,k)=>Math.abs(v-b[k])<.002));}
});

test('custom water and roof apply the final 48m dark-air convergence after local light/fog colour',t=>{
 const world=fixture(t);
 for(const name of ['cave-painted-water','cave-flowing-water','cave-ceiling-paint']){
  const m=world.scene.materials.find(m=>m.name===name),s=m.shaderPath.fragmentSource;
  assert.match(s,/smoothstep\(22\.,48\.,length\(p-eye\)\)/);assert.match(s,/mix\(color,vec3\(\.024,\.028,\.038\),(haze|fog)\)/);
  assert.ok(s.includes('cavePaintFactor(p)')||s.includes('cavePaintFactorFromSample(p,painted)'));assert.ok(!s.includes('vec3(.24,.23,.28)'));
 }
 const profiles=['warrior-v3.json','warrior-v3-ios.json'];
 for(const file of profiles)assert.equal(JSON.parse(readFileSync(new URL('../public/assets/'+file,import.meta.url),'utf8')).textureProfile.maxSize,8192);
});

test('water reuses one packed light sample for true floor depth, with no new mesh, map or fast glitter',t=>{
 const world=fixture(t),water=world.scene.materials.find(m=>m.name==='cave-painted-water'),s=water.shaderPath.fragmentSource;
 assert.match(s,/vec4 painted=cavePaintSample\(p\)/);assert.match(s,/waterDepth=max\(0\.,p.y-cavePaintFloorHeight\(painted\)\)/);
 assert.match(s,/cavePaintFactorFromSample\(p,painted\)/);assert.equal((s.match(/texture2D\(cavePaintLightMap/g)||[]).length,1);
 assert.deepEqual(water.options.samplers,['caveFogMap','cavePaintLightMap']);assert.match(s,/time\*\.20/);assert.doesNotMatch(s,/reflect\(|refract\(|dFdx|dFdy/);
 assert.match(s,/color\+=vec3\(\.16,\.21,\.20\)\*\(1\.-smoothstep\(\.08,\.32,waterDepth\)\)/);
});
