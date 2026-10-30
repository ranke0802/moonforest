import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,ArcRotateCamera,Vector3,Vector4,RawTexture,Constants,ShaderMaterial,PBRMaterial} from '@babylonjs/core';
import {buildCaveRockShell,bindCaveRock,caveRockTexture,CAVE_ROCK_GLSL} from '../src/cave-rock-shell.js';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {caveForegroundCutaway} from '../src/witch-cave-visibility.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {partitionCaveGround} from '../src/witch-cave-surfaces.js';
import {createTerrainGround} from '../src/terrain-mesh.js';
import {CameraPitch,WARRIOR_UPPER_BETA,UNRESTRICTED_UPPER_BETA} from '../src/camera-pitch.js';

test('rock shell keeps exact patch seams and every original terrain buffer unchanged',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),terrain=createWitchCaveTerrain(),ground=createTerrainGround(scene,terrain);partitionCaveGround(ground,terrain);
 try{
  const hash=()=>createHash('sha256').update(Buffer.from(Float32Array.from(ground.getVerticesData('position')).buffer)).update(Buffer.from(Uint32Array.from(ground.getIndices()).buffer)).digest('hex'),before=hash(),shell=buildCaveRockShell(ground,terrain);
  assert.equal(shell.triangles,10080);assert.equal(shell.originalTriangles,73728);assert.equal(hash(),before);assert.equal(shell.patches.length,36);
  const sourcePositions=Float32Array.from(ground.getVerticesData('position')),sourceNormals=Float32Array.from(ground.getVerticesData('normal')),normalByPosition=new Map();
  for(let i=0;i<sourcePositions.length;i+=3)normalByPosition.set(Array.from(sourcePositions.slice(i,i+3)).join(','),Array.from(sourceNormals.slice(i,i+3)));
  for(let i=0;i<shell.positions.length;i+=3)assert.deepEqual(Array.from(shell.normals.slice(i,i+3)),normalByPosition.get(Array.from(shell.positions.slice(i,i+3)).join(',')),'proxy uses exact source GPU normals, including every seam');
  for(const [i,sub]of ground.subMeshes.entries()){
   const b=sub.getBoundingInfo().boundingBox,p=Float32Array.from(ground.getVerticesData('position')),ids=ground.getIndices(),range=shell.patches[i],present=new Set();
   for(let j=range.indexStart;j<range.indexStart+range.indexCount;j++){const k=shell.indices[j]*3;present.add([shell.positions[k],shell.positions[k+1],shell.positions[k+2]].join(','));}
   for(let j=sub.indexStart;j<sub.indexStart+sub.indexCount;j++){const k=ids[j]*3;if(p[k]===Math.fround(b.minimum.x)||p[k]===Math.fround(b.maximum.x)||p[k+2]===Math.fround(b.minimum.z)||p[k+2]===Math.fround(b.maximum.z))assert.ok(present.has([p[k],p[k+1],p[k+2]].join(',')),'every detailed GPU boundary vertex remains');}
  }
 }finally{scene.dispose();engine.dispose();}
});

test('borrowed rock texture follows real Babylon sRGB getter and is never duplicated or disposed',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),texture=new RawTexture(new Uint8Array([120,100,90,255]),1,1,Constants.TEXTUREFORMAT_RGBA,scene),material=new PBRMaterial('existing-rock',scene),world={scene,villagePrepared:{assets:new Map()}};
 const cover=new ShaderMaterial('rock-proxy',scene,{vertexSource:'',fragmentSource:CAVE_ROCK_GLSL},{attributes:['position'],uniforms:['caveRockToGamma'],samplers:['caveRockMap']});material.albedoTexture=texture;
 world.villagePrepared.assets.set('cave-01-eroded-wall',{tiers:new Map([[2,{meshes:[{material}]}]])});
 try{
  const count=scene.textures.length,internal=texture.getInternalTexture();internal._gammaSpace=true;
  for(const hardware of [false,true]){internal._useSRGBBuffer=hardware;assert.equal(texture.gammaSpace,!hardware);bindCaveRock(cover,world);assert.equal(cover._floats.caveRockToGamma,hardware?1:0);assert.equal(cover._textures.caveRockMap,texture);assert.equal(caveRockTexture(world),texture);assert.equal(scene.textures.length,count);}
  cover.dispose();assert.equal(texture.getInternalTexture(),internal,'proxy does not own the borrowed image');
 }finally{scene.dispose();engine.dispose();}
});

test('player and visible giant boss view corridors survive 360-degree orbits, zoom and upward focus lift',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('orbit',0,1,20,new Vector3(0,7.05,0),scene),pitch=new CameraPitch(camera,{warrior:true});pitch.update({upwardLimited:false});
 const player=new Vector3(0,7.05,0),boss=new Vector4(4,9.5,0,6.3),points=[{name:'player torso',p:player,centre:player,radius:1},{name:'player head',p:new Vector3(0,7.7,0),centre:player,radius:1},{name:'boss chest',p:new Vector3(4,10.5,0),centre:boss,radius:5.9},{name:'boss head',p:new Vector3(4,11.7,0),centre:boss,radius:5.9},{name:'boss HP',p:new Vector3(4,12,0),centre:boss,radius:5.9}];let checked=0;
 try{
  for(const radius of [8,24,56,82])for(const beta of [.25,1.18,WARRIOR_UPPER_BETA,UNRESTRICTED_UPPER_BETA])for(let a=0;a<24;a++){
   camera.radius=radius;camera.beta=beta;camera.alpha=a*Math.PI/12;pitch.follow(player,0,{snap:true});camera.getViewMatrix(true);const eye=camera.globalPosition;
   for(const {name,p,centre,radius:bodyRadius}of points)for(const t of [.1,.25,.5,.7,.9]){const wall=Vector3.Lerp(eye,p,t);if(Vector3.Distance(wall,centre)<bodyRadius||wall.y<6.42)continue;assert.ok(caveForegroundCutaway(wall,eye,camera.target,{player,boss}),`${name}, radius${radius}, beta${beta}, yaw${a}, t${t}`);checked++;}
   const behind=player.add(player.subtract(eye).normalize().scale(15));assert.equal(caveForegroundCutaway(behind,eye,camera.target,{player}),false,'rear rock is retained');
  }
  assert.ok(checked>3000);
 }finally{scene.dispose();engine.dispose();}
});

test('a boss hidden by player sight never opens a remote wall; moved visible boss focus updates without fog uploads',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('view',0,1,20,Vector3.Zero(),scene),world={scene,camera,terrain:{heightAt:()=>0}},fog=new CaveFogRuntime(world,{isOpaque:x=>x>=0&&x<1});world.caveFog=fog;
 const actor={position:new Vector3(5,0,0)},enemy={actor,kind:'elena',phase:2,active:true};
 try{
  fog.update({x:-5,y:0,z:0},0,{encounters:[enemy],force:true});assert.equal(fog.bossView.w,0);
  actor.position.x=-4;fog.update({x:-5,y:0,z:0},.01,{encounters:[enemy]});assert.equal(fog.bossView.w,6.3);assert.equal(fog.bossView.x,-4);const uploads=fog.stats.uploads;
  actor.position.x=-3;fog.update({x:-5,y:0,z:0},.02,{encounters:[enemy]});assert.equal(fog.bossView.x,-3);assert.equal(fog.stats.uploads,uploads);assert.equal(fog.playerView.y,1.05);
 }finally{fog.dispose();scene.dispose();engine.dispose();}
});
