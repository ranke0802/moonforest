import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,ArcRotateCamera,StandardMaterial,PBRMaterial,Vector3} from '@babylonjs/core';
import {CaveFogRuntime,distantCoverHidden,CAVE_COVER_HIDE_DISTANCE,CAVE_COVER_SHOW_DISTANCE} from '../src/cave-fog-runtime.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {createTerrainGround} from '../src/terrain-mesh.js';
import {partitionCaveGround} from '../src/witch-cave-surfaces.js';
import {CaveCameraGuard} from '../src/witch-cave-camera.js';
import {CAVE_FOG_GLSL,CAVE_FOG_COVER_FRAGMENT} from '../src/cave-fog-cover.js';

function fixture(t){
 const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('cover-distance-eye',new Vector3(0,20,0),scene),terrain=createWitchCaveTerrain(),ground=createTerrainGround(scene,terrain);ground.material=new StandardMaterial('ground',scene);ground.freezeWorldMatrix();partitionCaveGround(ground,terrain);
 const world={scene,camera,terrain,ground,floorMaterial:ground.material,cave:true},fog=new CaveFogRuntime(world,{isOpaque:()=>false});world.caveFog=fog;fog.update({x:0,y:terrain.heightAt(0,0),z:0},0,{force:true});
 t.after(()=>{fog.dispose();scene.dispose();engine.dispose();});return {engine,scene,camera,terrain,ground,world,fog};
}
const unitBox=distance=>({min:{x:distance,y:-1,z:-1},max:{x:distance+2,y:1,z:1}}),eye={x:0,y:0,z:0};

test('only fully fog-coloured cover can enter distance culling; all0~48m bounds are retained from either hysteresis state',()=>{
 assert.equal(CAVE_COVER_HIDE_DISTANCE,54);assert.equal(CAVE_COVER_SHOW_DISTANCE,50);
 for(let distance=0;distance<=48;distance+=.125){const b=unitBox(distance);assert.equal(distantCoverHidden(false,b.min,b.max,eye),false);assert.equal(distantCoverHidden(true,b.min,b.max,eye),false);}
 const b=unitBox(54);assert.equal(distantCoverHidden(false,b.min,b.max,eye),true);
 for(const distance of [50.001,51,52,53.999]){const box=unitBox(distance);assert.equal(distantCoverHidden(false,box.min,box.max,eye),false);assert.equal(distantCoverHidden(true,box.min,box.max,eye),true);}
 assert.equal(distantCoverHidden(true,unitBox(50).min,unitBox(50).max,eye),false);
 for(const bad of [{x:NaN,y:0,z:0},null])assert.equal(distantCoverHidden(true,b.min,b.max,bad),false);
 assert.equal(distantCoverHidden(true,b.max,b.min,eye),false);
});

test('nearest full AABB, never centre or flat distance, protects near corners and vertical changes',()=>{
 assert.equal(distantCoverHidden(false,{x:40,y:-1,z:-1},{x:90,y:1,z:1},eye),false,'centre65m does not hide a40m near edge');
 assert.equal(distantCoverHidden(true,{x:32,y:-1,z:32},{x:60,y:1,z:60},eye),false,'near diagonal corner is45.25m');
 assert.equal(distantCoverHidden(false,{x:0,y:55,z:0},{x:2,y:60,z:2},eye),true,'all axes are included');
 assert.equal(distantCoverHidden(true,{x:0,y:50,z:0},{x:2,y:60,z:2},eye),false);
});

test('render/frustum gates omit far cover only; original detail, FoW state and immutable buffers survive returning/disabled culling',t=>{
 const f=fixture(t),p=f.fog.patches[0],middle={x:(p.min.x+p.max.x)/2,y:(p.min.y+p.max.y)/2,z:(p.min.z+p.max.z)/2},geometry=f.fog.cover.geometry,index=f.fog.cover.geometry.getIndexBuffer(),vertices=f.fog.cover.getVerticesData('position'),initial={meshes:f.scene.meshes.length,geometries:f.scene.geometries.length,materials:f.scene.materials.length,textures:f.scene.textures.length};
 const saved={source:p.sourceRender,cover:p.coverRender,cull:p.coverCull};let coverCalls=0,detailCalls=0;
 p.sourceRender=()=>{detailCalls++;};p.coverRender=()=>{coverCalls++;};p.coverCull=()=>true;
 const move=distance=>{f.camera.position.set(p.max.x+distance,middle.y,middle.z);f.fog.playerView.set(f.camera.position.x,f.camera.position.y-1,f.camera.position.z-2,1);f.fog.updateCoverDistance();};
 p.detail=false;p.cover=true;move(54);assert.equal(p.farHidden,true);assert.equal(p.sub.isInFrustum([]),false);p.sub.render();assert.equal(coverCalls,0);
 p.detail=true;p.cover=false;p.source.render();assert.equal(detailCalls,1,'detail survives even when its cached farHidden is true');
 p.detail=false;p.cover=true;move(52);assert.equal(p.farHidden,true);move(49.99);assert.equal(p.farHidden,false);assert.equal(p.sub.isInFrustum([]),true);p.sub.render();assert.equal(coverCalls,1);
 move(52);assert.equal(p.farHidden,false);move(54);assert.equal(p.farHidden,true);
 f.fog.coverDistanceCulling=false;f.fog.updateCoverDistance();assert.equal(p.farHidden,false);p.sub.render();assert.equal(coverCalls,2);
 f.fog.coverDistanceCulling=true;f.fog.updateCoverDistance();assert.equal(p.farHidden,true);
 const revision=f.fog.fog.revision,visible=f.fog.fog.visible.slice();for(let i=0;i<400;i++)move(i%2?49:60);
 assert.equal(f.fog.fog.revision,revision);assert.deepEqual(f.fog.fog.visible,visible);assert.equal(f.fog.cover.geometry,geometry);assert.equal(f.fog.cover.geometry.getIndexBuffer(),index);assert.equal(f.fog.cover.getVerticesData('position'),vertices);
 assert.deepEqual({meshes:f.scene.meshes.length,geometries:f.scene.geometries.length,materials:f.scene.materials.length,textures:f.scene.textures.length},initial);
 p.sourceRender=saved.source;p.coverRender=saved.cover;p.coverCull=saved.cull;
});

test('unready/invalid eye fails open and wide requested zoom uses the guarded render eye without rewriting user controls',t=>{
 const f=fixture(t),p=f.fog.patches[0];f.world.camera={globalPosition:{x:500,y:50,z:500},getViewMatrix(){}};f.fog.playerView.set(500,49,498,1);f.fog.updateCoverDistance();assert.equal(p.farHidden,true);
 f.world.camera.globalPosition.x=NaN;f.fog.updateCoverDistance();assert.equal(p.farHidden,false);
 f.fog.fog.ready=false;f.world.camera.globalPosition.x=500;f.fog.updateCoverDistance();assert.equal(p.farHidden,false);f.fog.fog.ready=true;
 // A real eye more than24m from the player never drops any depth surface.
 f.fog.playerView.set(0,0,0,1);f.world.camera.globalPosition={x:82,y:0,z:0};f.fog.updateCoverDistance();assert.ok(f.fog.patches.every(p=>!p.farHidden));assert.equal(f.fog.coverDistanceEligible,false);
 const base=new Vector3(29,f.terrain.heightAt(29,-30)+1.05,-30),camera=new ArcRotateCamera('wide-cave',0,1.18,82,base.clone(),f.scene);f.world.camera=camera;const guard=new CaveCameraGuard(f.world);f.world.caveCamera=guard;f.fog.playerView.set(base.x,base.y,base.z,1);
 guard.follow(base,1/30,{stable:true});guard.beginFrame();f.fog.updateCoverDistance();assert.ok(f.fog.patches.every(p=>!p.farHidden));assert.equal(f.fog.coverDistanceEligible,false);guard.endFrame();assert.equal(camera.radius,82);assert.equal(camera.beta,1.18);
 camera.radius=13;guard.follow(base,1/30,{stable:true});guard.beginFrame();const renderEye=camera.globalPosition.clone();f.fog.updateCoverDistance();assert.equal(f.fog.coverDistanceEye[0],renderEye.x);assert.equal(f.fog.coverDistanceEye[1],renderEye.y);assert.equal(f.fog.coverDistanceEye[2],renderEye.z);assert.equal(f.fog.coverDistanceEligible,true);guard.endFrame();guard.dispose();
 assert.deepEqual(f.scene.clearColor.asArray(),[.024,.028,.038,1]);
});

test('final distance blend is environment-only; player and boss paint receive a zero environment flag',t=>{
 const f=fixture(t),environment=new PBRMaterial('static-wall',f.scene),player=new PBRMaterial('player8k',f.scene),boss=new PBRMaterial('elena-paint',f.scene);environment.metadata={villageToon:true};player.metadata={characterStyle:true};boss.metadata={elenaPaint:true};
 for(const [material,expected]of [[f.ground.material,1],[environment,1],[player,0],[boss,0]]){
  f.fog.attach(material);const plugin=material.pluginManager.getPlugin('CaveFogOfWar'),values={},buffer={updateFloat:(name,value)=>{values[name]=value;},updateFloat4(){},setTexture(){}};
  plugin.hardBindForSubMesh(buffer);assert.equal(values.caveFogEnvironment,expected,material.name);
  const fragment=plugin.getCustomCode('fragment').CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR;
  assert.match(fragment,/caveFogActive>\.5&&caveFogEnvironment>\.5/);assert.match(fragment,/smoothstep\(22\.,48\.,length\(vPositionW-vEyePosition.xyz\)\)/);assert.match(fragment,/vec3\(\.024,\.028,\.038\)/);
 }
});

test('far omission contract has exact same final clear output for cover, memory, roof, water and falls',()=>{
 assert.match(CAVE_FOG_GLSL,/vec3 caveFogMemoryColor[^}]*return vec3\(\.024,\.028,\.038\);/s);
 assert.match(CAVE_FOG_COVER_FRAGMENT,/smoothstep\(22\.,48\.,length\(fogWorldPosition-caveEye\)\)/);
 assert.match(CAVE_FOG_COVER_FRAGMENT,/gl_FragColor=vec4\(mix\(rock,vec3\(\.024,\.028,\.038\),haze\),1\.\)/);
 const atmosphere=readFileSync(new URL('../src/witch-cave-atmosphere.js',import.meta.url),'utf8');
 assert.equal((atmosphere.match(/gl_FragColor=vec4\(mix\(color,vec3\(\.024,\.028,\.038\),(?:haze|fog)\),1\.\)/g)??[]).length,3,'each global opaque atmosphere shader converges after its other colour/shading');
 // smoothstep has reached1 before either hide threshold. No nearby fragment
 // or derivative of the retained source terrain is removed by this gate.
 const blend=d=>{const t=Math.max(0,Math.min(1,(d-22)/26));return t*t*(3-2*t);};
 for(const d of [48,50,54,80,160])assert.equal(blend(d),1);assert.ok(blend(47.99)<1);
});
