import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,PBRMaterial,RawTexture,Constants} from '@babylonjs/core';
import {applyVillageToon,villageDistanceFactor,villageDistanceCoverage,VILLAGE_DISTANCE_TONE} from '../src/village-toon.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {prepareMapMaterials} from '../src/map-shader-cache.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';

const results=[];
const updateWorld=world=>{for(const t of [world.caveFog?.texture,world.scene.metadata?.cavePaintLighting?.texture,caveFogFallback(world.scene)])if(t?.getInternalTexture())t.getInternalTexture().isReady=true;};
function captureBind(mesh){
 const scene=mesh.getScene(),m=mesh.material,u=m._uniformBuffer,original=u.updateFloat4,original2=u.updateFloat2,values={};u.updateFloat4=function(name,...v){values[name]=v;return original.call(this,name,...v);};u.updateFloat2=function(name,...v){values[name]=v;return original2.call(this,name,...v);};
 try{scene.updateTransformMatrix(true);assert.equal(m.isReadyForSubMesh(mesh,mesh.subMeshes[0],true),true);m.bindForSubMesh(mesh.computeWorldMatrix(true),mesh,mesh.subMeshes[0]);}finally{u.updateFloat4=original;u.updateFloat2=original2;}
 return values;
}

test('distance tone preserves near detail exactly, darkens monotonically and has no LOD branch or black silhouette',()=>{
 for(const [start,end]of [[65,80],[88,105]]){
  assert.equal(villageDistanceFactor(0,start,end),1);assert.equal(villageDistanceFactor(15,start,end),1);assert.equal(villageDistanceFactor(200,start,end),VILLAGE_DISTANCE_TONE.farFactor);
  let last=1;for(let d=0;d<=150;d+=.05){const factor=villageDistanceFactor(d,start,end);assert.ok(factor<=last+1e-12);assert.ok(factor>=.62&&factor<=1);last=factor;}
  for(let d=0;d<=150;d+=.25)assert.ok(Math.abs(villageDistanceFactor(d+.01,start,end)-villageDistanceFactor(d,start,end))<.001);
 }
 assert.equal(villageDistanceFactor(1000,65,80,false),1);results.push({case:'near-identity-continuous-bounded-distance',passed:true,farLinearFactor:.62});
});

test('old fog coverage fades before distance culling with the same fixed Bayer rule as ink and tree view',()=>{
 const bayer=p=>2*((p[0]+p[1])%2)+(p[1]%2),thresholds=[];
 for(let y=0;y<4;y++)for(let x=0;x<4;x++)thresholds.push((4*bayer([x%2,y%2])+bayer([Math.floor(x/2),Math.floor(y/2)])+.5)/16);
 assert.equal(new Set(thresholds).size,16);
 for(const [start,end,cull]of [[65,80,82],[88,105,110]]){
  assert.equal(villageDistanceCoverage(start,start,end),1);assert.equal(villageDistanceCoverage(end,start,end),0);assert.equal(villageDistanceCoverage(cull,start,end),0);assert.equal(villageDistanceCoverage(1000,start,end,false),1);
  let previous=16;
  for(let d=start;d<=cull;d+=.01){const coverage=villageDistanceCoverage(d,start,end),pixels=thresholds.filter(t=>coverage>=t).length;assert.ok(pixels<=previous);assert.ok(previous-pixels<=1,'no complete-object frame pop while crossing the fade');previous=pixels;}
  for(const treeCoverage of [.45,.6,1])for(let d=start;d<=end;d+=.25){const coverage=villageDistanceCoverage(d,start,end);assert.equal(thresholds.filter(t=>coverage>=t&&treeCoverage>=t).length,thresholds.filter(t=>Math.min(coverage,treeCoverage)>=t).length);}
 }
 for(const file of ['src/tree-occlusion.js','src/village-outlines.js']){const text=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.match(text,/4\.0\s*\*\s*\w+Bayer2\(mod\(p,\s*2\.0\)\)/);assert.match(text,/\+\s*0\.5\)\s*\/\s*16\.0/);}
 results.push({case:'old-fog-coverage-before-cell-cull-same-Bayer-no-double-fade',passed:true,minimumCoverage:0,nearCoverage:1,extraPasses:0});
});

for(const ubo of [false,true])test(`actual PBR shader keeps near colour textures/geometry and removes later pale engine fog (UBO${ubo})`,async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.disableUniformBuffers=!ubo;engine.getCaps().instancedArrays=true;t.after(()=>engine.dispose());
 scene.useRightHandedSystem=true;scene.fogMode=Scene.FOGMODE_LINEAR;scene.fogStart=65;scene.fogEnd=80;new FreeCamera('camera',new Vector3(0,4,8),scene);
 const texture=RawTexture.CreateRGBATexture(new Uint8Array([80,103,53,255]),1,1,scene,false,false);texture.gammaSpace=true;texture.getInternalTexture().isReady=true;
 const materials=[],shaders=[];let textureBaseline;
 for(const level of [0,1,2]){
  const mesh=MeshBuilder.CreateBox('tree-lod'+level,{},scene),m=mesh.material=new PBRMaterial('painted-lod'+level,scene),geometry=mesh.geometry;m.albedoTexture=texture;m.albedoColor.set(.83,.91,.72);const colour=m.albedoColor.asArray();applyVillageToon([mesh],{direction:Vector3.Up(),shadowsActive:false});
  await prepareMapMaterials([mesh]);const values=captureBind(mesh),effect=mesh.subMeshes[0].effect;
  assert.equal(m.fogEnabled,false);assert.doesNotMatch(effect.defines,/^#define FOG\b/m);assert.match(effect.fragmentSourceCode,/finalDiffuse \*= mix\(1\.0, villageFarTone.z, villageFarBlend\)/);assert.match(effect.fragmentSourceCode,/length\(vPositionW-vEyePosition.xyz\)/);
  assert.match(effect.fragmentSourceCode,/villageFarCoverage<villageFarThreshold\)discard/);assert.deepEqual(values.villageFarClip,[65,80]);assert.deepEqual(values.villageFarTone,[29.25,64,.62,1]);assert.strictEqual(m.albedoTexture,texture);assert.deepEqual(m.albedoColor.asArray(),colour);assert.strictEqual(mesh.geometry,geometry);materials.push(m);shaders.push(effect.fragmentSourceCode);textureBaseline??=scene.textures.length;assert.equal(scene.textures.length,textureBaseline);
 }
 assert.equal(new Set(materials.map(m=>m.metadata.villageToon)).size,1);assert.ok(shaders.every(s=>s.includes('villageFarTone')));assert.equal(scene.textures.filter(t=>t===texture).length,1);
 const actor=MeshBuilder.CreateBox('player-unchanged',{},scene);actor.material=new PBRMaterial('actor',scene);assert.equal(actor.material.fogEnabled,true);assert.equal(actor.material.pluginManager?.getPlugin('MoonforestVillageToon')??null,null);
 results.push({case:'actual-PBR-fog-order-and-LOD-consistency',ubo,passed:true,newTextures:0,newGeometry:0});
});

test('retained frozen scenery binds each current region and cave exclusion over repeated village/forest/cave/plains travel',async t=>{
 const engine=new NullEngine();engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});const world=createWorld(engine,{village:true,touchDevice:true}),scene=world.scene;t.after(()=>engine.dispose());
 const mesh=MeshBuilder.CreateBox('retained-environment',{},scene),m=mesh.material=new PBRMaterial('retained-painted',scene);applyVillageToon([mesh],world.lighting);await prepareMapMaterials([mesh]);m.freeze();const geometry=mesh.geometry,rows=[];
 for(let cycle=0;cycle<5;cycle++)for(const map of ['warrior-v4','warrior-v5','warrior-plains','warrior-v3']){
  replaceWorldMap(world,map);updateWorld(world);world.caveAtmosphere?.attachMaterial(m);world.caveFog?.attach(m);await prepareMapMaterials([mesh]);m.freeze();const values=captureBind(mesh);
  assert.equal(values.villageFarTone[3],map==='warrior-v5'?0:1);assert.deepEqual(values.villageFarClip,[scene.fogStart,Math.max(scene.fogStart+1,scene.fogEnd)]);assert.equal(m.fogEnabled,false);assert.strictEqual(mesh.geometry,geometry);
  if(map==='warrior-v4')assert.deepEqual(scene.fogColor.asArray(),[.19,.23,.21]);
  if(map==='warrior-v5')assert.deepEqual(scene.fogColor.asArray(),[.024,.028,.038]);
  rows.push({cycle:cycle+1,map,villageFarTone:values.villageFarTone,cavePaintActive:values.cavePaintActive??null});
 }
 results.push({case:'20map-changes-current-hardbind-no-cave-tone-residue',passed:true,rows});
});

test('quality policies and resource references remain8Kplayer/max4Kbackground with existing geometricLOD',()=>{
 for(const file of ['warrior-v3.json','warrior-v3-ios.json'])assert.equal(JSON.parse(readFileSync(new URL('../public/assets/'+file,import.meta.url),'utf8')).textureProfile.maxSize,8192);
 for(const file of ['village.json','monster-forest.json','witch-cave.json']){
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/'+file,import.meta.url),'utf8'));for(const config of Object.values(manifest.assets)){assert.ok(!config.highTextures||config.highTextures.textures.albedo.width<=4096);if(config.geometryLod)assert.ok(config.lods.some(l=>l.level===0)&&config.lods.some(l=>l.level===1)&&config.lods.some(l=>l.level===2));}
 }
 results.push({case:'8K4KLOD-resource-policy-preserved',passed:true});
});

test.after(()=>{const out=new URL('../reports/environment-distance-tone-2026-11-03/',import.meta.url);mkdirSync(out,{recursive:true});writeFileSync(new URL('validation.json',out),JSON.stringify({cases:results,limitations:['CPU/NullEngine and actual expanded shader validation; no browser/GPU raster, physical phone FPS or heat measurements.','Near texture and geometry untouched; environmental distance modulation does not change geometricLOD selection.']},null,2));});
