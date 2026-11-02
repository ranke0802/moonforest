import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,MeshBuilder,PBRMaterial,ShaderMaterial,Vector3} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {CAVE_PLAYER_FILL,cavePlayerFillFactor} from '../src/cave-player-fill.js';
import {CaveFogOfWar,CAVE_FOG_VISIBLE} from '../src/cave-fog-of-war.js';
import {CAVE_FOG_GLSL} from '../src/cave-fog-cover.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {applyVillageToon} from '../src/village-toon.js';
import {prepareMapMaterials} from '../src/map-shader-cache.js';
import {BindFogParameters} from '@babylonjs/core/Materials/materialHelper.functions.js';
import {bindCavePaintLight,CAVE_PAINT_UNIFORMS,CAVE_PAINT_SAMPLERS} from '../src/cave-painted-light-runtime.js';

const luma=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
function ready(world){for(const t of [world.caveFog.texture,world.scene.metadata.cavePaintLighting.texture,caveFogFallback(world.scene)])if(t.getInternalTexture())t.getInternalTexture().isReady=true;}
function fixture(t){const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});ready(world);t.after(()=>engine.dispose());return world;}
function incoming(world,name,rock=false){const mesh=MeshBuilder.CreateBox(name,{size:2},world.scene),m=mesh.material=new PBRMaterial(name,world.scene);if(rock)m.metadata={caveRockTone:true};applyVillageToon([mesh],world.lighting);world.caveAtmosphere.attachMaterial(m);world.caveFog.attach(m);return mesh;}

test('warm fill has bounded3D falloff and raises nearby dark environment without brightening remote or high surfaces',()=>{
 const p={x:0,y:1.05,z:0,w:1},base=[.14,.16,.20];
 const floor=cavePlayerFillFactor({x:0,y:0,z:0},p,1),far=cavePlayerFillFactor({x:5.5,y:1.05,z:0},p,1),ceiling=cavePlayerFillFactor({x:0,y:7,z:0},p,1);
 assert.ok(floor[0]>floor[1]&&floor[1]>floor[2]);assert.ok(luma(floor)>luma(base)*3);assert.ok(floor.every((v,i)=>v<=CAVE_PLAYER_FILL.color[i]));
 assert.deepEqual(far,[0,0,0]);assert.deepEqual(ceiling,[0,0,0]);assert.deepEqual(cavePlayerFillFactor({x:0,y:0,z:0},{...p,w:0},1),[0,0,0]);
 let previous=Infinity;for(let x=0;x<=6;x+=.025){const value=luma(cavePlayerFillFactor({x,y:p.y,z:0},p,1));assert.ok(value<=previous+1e-12);previous=value;}
 // max(static,local), used in linear shader space, preserves bright firelight.
 const fire=[1,.76,.44];assert.deepEqual(fire.map((v,i)=>Math.max(v,floor[i])),fire);
});

test('the existing first-wall LOS and explored memory cannot receive local light through a wall',()=>{
 const fog=new CaveFogOfWar({minX:-10,minZ:-10,width:20,depth:20,cellSize:.5,isOpaque:x=>x>=0&&x<1});
 const player={x:-2,y:1.05,z:0,w:1};fog.update(player,0,{force:true});
 const front={x:-.75,y:1,z:0},behind={x:1.5,y:1,z:0};
 assert.equal(fog.stateAt(front.x,front.z),CAVE_FOG_VISIBLE);assert.notEqual(fog.stateAt(behind.x,behind.z),CAVE_FOG_VISIBLE);
 assert.ok(luma(cavePlayerFillFactor(front,player,1))>.1);assert.deepEqual(cavePlayerFillFactor(behind,player,0),[0,0,0]);
 // Even remembered points and bilinear boundary samples remain dark until
 // nearly fully CURRENT-visible, rather than treating explored G as light.
 for(const visibility of [0,.2,.5,.9,.92])assert.deepEqual(cavePlayerFillFactor(front,player,visibility),[0,0,0]);
 fog.update({x:3,y:0,z:0},1,{force:true});fog.update(player,2,{force:true});
 assert.equal(fog.explored[Math.floor((behind.z-fog.minZ)/fog.cellSize)*fog.cols+Math.floor((behind.x-fog.minX)/fog.cellSize)],1);
 assert.notEqual(fog.stateAt(behind.x,behind.z),CAVE_FOG_VISIBLE);assert.deepEqual(cavePlayerFillFactor(behind,player,0),[0,0,0]);
});

test('all incoming near/mid/far environment shaders have cave illumination before their first actual prewarm',async t=>{
 const world=fixture(t),actorsBefore=world.scene.materials.length;
 for(const [index,rock]of [true,false,true].entries()){
  const mesh=incoming(world,'incoming-lod-'+index,rock),m=mesh.material;
  assert.equal(m.fogEnabled,false);assert.ok(m.pluginManager.getPlugin('CavePaintLight'));assert.ok(m.pluginManager.getPlugin('CaveRockMood'));
  await prepareMapMaterials([mesh]);const s=mesh.subMeshes[0].effect.fragmentSourceCode;
  assert.match(s,/finalDiffuse\*=cavePaintFactor\(vPositionW\)/);assert.match(s,/cavePlayerFillFactor\(p,caveFogState\(p\)\.x\)/);
  assert.match(s,/float caveDistanceFog=smoothstep\(22\.,48\./);
 }
 assert.equal(world.scene.materials.length,actorsBefore+3,'one existing material per source; no additional glow/light material');
 const source=readFileSync(new URL('../src/village-streamed-environment.js',import.meta.url),'utf8');
 assert.ok(source.indexOf('applyVillageToon(meshes')<source.indexOf('attachMaterial(mesh.material)'));
 assert.ok(source.indexOf('attachMaterial(mesh.material)')<source.indexOf('await prepareMapMaterials(meshes'));
});

test('player uniform follows existing fog focus at bind time while character options stay unchanged',t=>{
 const world=fixture(t),mesh=incoming(world,'lantern-env'),actor=MeshBuilder.CreateBox('player',{},world.scene);actor.material=new PBRMaterial('player-options',world.scene);actor.material.metadata={styleBrightness:1.35};actor.material.albedoColor.set(.8,.6,.4);
 const initial=[actor.material.albedoColor.asArray(),actor.material.directIntensity,actor.material.environmentIntensity,actor.material.metadata.styleBrightness];
 const values={},buffer={setTexture(){},updateFloat(){},updateFloat4:(k,...v)=>values[k]=v};
 world.caveFog.update(new Vector3(-35,3,-18),0,{force:true});mesh.material.pluginManager.getPlugin('CavePaintLight').hardBindForSubMesh(buffer);
 assert.deepEqual(values.cavePaintPlayer,world.caveFog.playerView.asArray());
 world.caveFog.update(new Vector3(-34,3,-18),1);mesh.material.pluginManager.getPlugin('CavePaintLight').hardBindForSubMesh(buffer);assert.equal(values.cavePaintPlayer[0],-34);
 assert.equal(actor.material.pluginManager?.getPlugin('CavePaintLight')??null,null);assert.deepEqual([actor.material.albedoColor.asArray(),actor.material.directIntensity,actor.material.environmentIntensity,actor.material.metadata.styleBrightness],initial);
 assert.equal((CAVE_FOG_GLSL.match(/texture2D\(caveFogMap/g)||[]).length,1);assert.match(CAVE_FOG_GLSL,/caveFogSampleReady&&all\(equal\(p,caveFogSamplePosition\)\)/);
});

test('engine fog uses corresponding linear dark-air colour for PBR while preserving scene gamma colour',t=>{
 const world=fixture(t),values={},effect={setFloat4(){},setColor3:(name,color)=>values[name]=[color.r,color.g,color.b]};
 BindFogParameters(world.scene,world.ground,effect,true);assert.deepEqual(world.scene.fogColor.asArray(),[.024,.028,.038]);
 const expected=world.scene.fogColor.toLinearSpace(world.scene.getEngine().useExactSrgbConversions).asArray();
 assert.deepEqual(values.vFogColor,expected);assert.ok(expected.every(v=>v<.001));
});

test('real ShaderMaterial binds an inactive player vector after paint disposal and outside-cave map replacement',t=>{
 const world=fixture(t),scene=world.scene;
 const material=new ShaderMaterial('retained-paint-fallback',scene,{vertexSource:'precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;void main(){gl_Position=worldViewProjection*vec4(position,1.);}',fragmentSource:'precision highp float;void main(){gl_FragColor=vec4(1.);}'},{attributes:['position'],uniforms:['worldViewProjection',...CAVE_PAINT_UNIFORMS],samplers:CAVE_PAINT_SAMPLERS});
 world.scene.metadata.cavePaintLighting.dispose();
 assert.equal(scene.metadata.cavePaintLighting,null);assert.doesNotThrow(()=>bindCavePaintLight(material,world));
 assert.equal(material._floats.cavePaintActive,0);assert.deepEqual(material._vectors4.cavePaintPlayer.asArray(),[0,0,0,0]);
 assert.strictEqual(material._textures.cavePaintLightMap,caveFogFallback(scene));
 replaceWorldMap(world,'warrior-v4');assert.doesNotThrow(()=>bindCavePaintLight(material,world));
 assert.equal(material._floats.cavePaintActive,0);assert.deepEqual(material._vectors4.cavePaintPlayer.asArray(),[0,0,0,0]);
});

test('moving lantern adds no lights, meshes, textures, observers or uploads across movement and20roundtrips',t=>{
 const world=fixture(t),mesh=incoming(world,'retained-fill'),scene=world.scene;scene.render();
 const count=()=>({lights:scene.lights.length,meshes:scene.meshes.length,textures:scene.textures.length,geometries:scene.geometries.length,before:scene.onBeforeRenderObservable.observers.filter(o=>!o._willBeUnregistered).length,after:scene.onAfterRenderObservable.observers.filter(o=>!o._willBeUnregistered).length});
 const baseline=count(),uniform={setTexture(){},updateFloat(){},updateFloat4(){}},paint=mesh.material.pluginManager.getPlugin('CavePaintLight');
 const map=scene.metadata.cavePaintLighting.texture;t.mock.method(map,'update',()=>assert.fail('Static lightmap must not upload for moving lantern'));
 for(let i=0;i<1200;i++){world.caveFog.update(new Vector3(-35+Math.sin(i*.01),3,-18),i/30);paint.hardBindForSubMesh(uniform);}
 assert.deepEqual(count(),baseline);
 for(let i=0;i<20;i++){
  replaceWorldMap(world,'warrior-v4');assert.equal(scene.metadata.cavePaintLighting,null);
  const values={};paint.hardBindForSubMesh({setTexture(){},updateFloat(){},updateFloat4:(k,...v)=>values[k]=v});assert.deepEqual(values.cavePaintPlayer,[0,0,0,0]);
  replaceWorldMap(world,'warrior-v5');ready(world);scene.render();assert.deepEqual(count(),baseline);
 }
});
