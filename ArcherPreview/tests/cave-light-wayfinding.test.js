import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,MeshBuilder,ShaderMaterial} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {cavePlayerFillFactor,CAVE_PLAYER_FILL} from '../src/cave-player-fill.js';
import {CAVE_FOG_GLSL} from '../src/cave-fog-cover.js';
import {bindCavePaintLight,CAVE_PAINT_LIGHT_GLSL,CAVE_PAINT_UNIFORMS,CAVE_PAINT_SAMPLERS} from '../src/cave-painted-light-runtime.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {CAVE_PLACEMENTS,CAVE_ROUTES,CAVE_WAYFINDING_LANTERNS,caveSurface,caveObstacles} from '../src/witch-cave-layout.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {setWorldCharacter} from '../src/world-limits.js';

test('forward cone extends gentle radial fill, rotates with actor and remains wall gated',()=>{
 const player={x:0,y:1,z:0,w:1};
 const f=(x,z,forward={x:0,z:1},visibility=1)=>cavePlayerFillFactor({x,y:1,z},player,visibility,forward)[0];
 assert.ok(f(0,8)>.15);assert.equal(f(8,0),0);assert.equal(f(0,-8),0);assert.ok(f(8,0,{x:1,z:0})>.15);
 assert.equal(f(0,CAVE_PLAYER_FILL.range),0);assert.equal(f(0,8,{x:0,z:1},.9),0);
 let prev=Infinity;for(let z=0;z<11;z+=.02){const v=f(0,z);assert.ok(v<=prev+1e-10);prev=v;}
 for(const d of [0,.5,2,4])assert.ok(f(0,-d)>0,'nearby rear floor remains readable');
 assert.match(CAVE_FOG_GLSL,/p-\(caveFogActive>.5\?caveFogOrigin.xyz:eye\)/);
});
test('retained painted ShaderMaterials are ready across map release without relying on a future onBind',async t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>engine.dispose());const scene=world.scene;
 const shader=new ShaderMaterial('retained-lantern',scene,{vertexSource:'precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;void main(){gl_Position=worldViewProjection*vec4(position,1.);}',fragmentSource:'precision highp float;void main(){gl_FragColor=vec4(1.);}'},{attributes:['position'],uniforms:['worldViewProjection',...CAVE_PAINT_UNIFORMS],samplers:CAVE_PAINT_SAMPLERS});
 const mesh=MeshBuilder.CreateBox('pooled-object',{},scene);mesh.material=shader;
 const ready=()=>{for(const t of scene.textures)if(t.getInternalTexture())t.getInternalTexture().isReady=true;};
 for(let i=0;i<6;i++){
  const runtime=scene.metadata.cavePaintLighting;ready();bindCavePaintLight(shader,world);assert.equal(shader.isReady(mesh),true);mesh.setEnabled(false);
  replaceWorldMap(world,'warrior-v4');ready();assert.equal(shader._textures.cavePaintLightMap,caveFogFallback(scene));assert.equal(shader._floats.cavePaintActive,0);assert.equal(runtime.shaderDisposals.size,0);assert.equal(shader.isReady(mesh),true);
  replaceWorldMap(world,'warrior-v5');ready();mesh.setEnabled(true);bindCavePaintLight(shader,world);assert.equal(shader.isReady(mesh),true);
 }
 shader.dispose();assert.equal(scene.metadata.cavePaintLighting.shaderDisposals.size,0);
});
test('zoom never changes player-centred haze or lantern direction and shader declarations are complete',t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>engine.dispose());
 const actor=MeshBuilder.CreateBox('anchor',{},world.scene);actor.position.set(-35,3,-18);actor.rotation.y=1.1;
 let initial;for(const radius of [1,13,21,48,80]){world.camera.radius=radius;world.caveFog.update(actor,radius,{force:true});const values=[...world.caveFog.playerView.asArray(),...world.caveFog.playerForward.asArray()];if(initial)assert.deepEqual(values,initial);initial=values;}
 assert.ok(CAVE_PAINT_UNIFORMS.includes('cavePaintForward'));assert.match(CAVE_PAINT_LIGHT_GLSL,/uniform vec4 cavePaintForward/);
});
test('ten reused wayfinding lanterns sit beside continuous routes, with no new realtime lights',t=>{
 setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
 const lamps=CAVE_PLACEMENTS.filter(p=>p.wayfinding),terrain=createWitchCaveTerrain(),nav=new CaveNavigation(caveObstacles());assert.equal(lamps.length,10);assert.equal(lamps.length,CAVE_WAYFINDING_LANTERNS.length);
 for(const p of lamps){assert.equal(p.asset,'cave-13-votive-lantern');assert.ok(caveSurface(p.x,p.z).distance<0,JSON.stringify(p));assert.ok(Math.abs(terrain.heightAt(p.x,p.z)-caveSurface(p.x,p.z).height)<.8,'lantern sits on route floor');}
 // Existing continuous centerline stays walkable except preexisting obstacles.
 const oldNav=new CaveNavigation(caveObstacles().filter(o=>!lamps.some(p=>o.id===p.id)));let tested=0;
 for(const route of CAVE_ROUTES)for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);for(let j=0;j<=n;j++){const p={x:a[0]+(b[0]-a[0])*j/n,z:a[1]+(b[1]-a[1])*j/n};if(oldNav.free(p,.289,74)){assert.ok(nav.free(p,.289,74),'new lantern must not block route center');tested++;}}}
 assert.ok(tested>500);
});
