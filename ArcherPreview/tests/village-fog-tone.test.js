import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,MeshBuilder,PBRMaterial} from '@babylonjs/core';
import {BindFogParameters} from '@babylonjs/core/Materials/materialHelper.functions.js';
import {createWorld,replaceWorldMap,VILLAGE_FOG_COLOR} from '../src/world.js';
import {SKY_HORIZON} from '../src/sky.js';
import {applyVillageToon} from '../src/village-toon.js';
import {prepareMapMaterials} from '../src/map-shader-cache.js';
import {updatePlainsBoundaryAtmosphere} from '../src/plains-boundary-atmosphere.js';
import {FOREST_PLAINS_BOUNDARY} from '../src/plains-forest-boundary.js';

const facts=[],read=name=>JSON.parse(readFileSync(new URL('../public/assets/'+name,import.meta.url))),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const resources=scene=>[scene.meshes.length,scene.materials.length,scene.geometries.length,scene.textures.length,scene.lights.length];

test('initial village binds olive engine fog while retaining the actual sky, distances and exposure',t=>{
  const rows=[];
  for(const touchDevice of [false,true]){
    const engine=new NullEngine(),world=createWorld(engine,{village:true,touchDevice}),scene=world.scene;t.after(()=>engine.dispose());
    assert.deepEqual(scene.fogColor.asArray(),[.29,.32,.25]);assert.notEqual(scene.fogColor,VILLAGE_FOG_COLOR);
    assert.deepEqual([scene.fogStart,scene.fogEnd],touchDevice?[65,80]:[88,105]);assert.equal(scene.fogMode,3);
    assert.equal(scene.imageProcessingConfiguration.exposure,1.15);assert.equal(scene.imageProcessingConfiguration.contrast,1.08);
    assert.deepEqual(SKY_HORIZON.asArray(),[.61,.71,.77]);assert.deepEqual(scene.clearColor.asArray(),[.61,.71,.77,1]);assert.deepEqual(world.sky.material._colors3.horizon.asArray(),[.61,.71,.77]);
    assert.equal(world.floorMaterial.fogEnabled,true);
    const values={},effect={setFloat4(){},setColor3:(name,color)=>values[name]=[color.r,color.g,color.b]};BindFogParameters(scene,world.ground,effect,false);assert.deepEqual(values.vFogColor,[.29,.32,.25]);
    BindFogParameters(scene,world.ground,effect,true);assert.deepEqual(values.vFogColor,scene.fogColor.toLinearSpace(engine.useExactSrgbConversions).asArray());
    assert.ok(values.vFogColor[1]>values.vFogColor[0]&&values.vFogColor[0]>values.vFogColor[2],'the existing uniform is muted olive, without a blue channel cast');
    rows.push({touchDevice,fog:scene.fogColor.asArray(),fogDistances:[scene.fogStart,scene.fogEnd],pbrLinearFog:values.vFogColor,skyHorizon:world.sky.material._colors3.horizon.asArray()});
  }
  facts.push({case:'initial-village-existing-fog-uniform',rows,newTextures:0,newLights:0,newFrameObservers:0});
});

test('shipped LOD source materials have no cyan factor and actual toon shaders remain outside engine fog',async t=>{
  const manifest=read('village.json'),sourceRows=[];
  for(const id of ['tree-01-round-oak','tree-02-slender-pine','house-03-workshop','rock-02-jagged-outcrop'])for(const lod of manifest.assets[id].lods){
    const source=JSON.parse(readFileSync(new URL('../public/assets/'+lod.model,import.meta.url)));
    for(const material of source.materials){assert.deepEqual(material.pbrMetallicRoughness?.baseColorFactor??[1,1,1,1],[1,1,1,1]);assert.deepEqual(material.emissiveFactor??[0,0,0],[0,0,0]);}
    sourceRows.push({asset:id,level:lod.level,materialFactors:'white base, black emission',textureSize:lod.textureSize});
  }
  const engine=new NullEngine();engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
  const world=createWorld(engine,{village:true,touchDevice:true}),scene=world.scene;t.after(()=>engine.dispose());
  const shaderRows=[];
  for(const level of [0,1,2]){
    const mesh=MeshBuilder.CreateBox('retained-lod-'+level,{},scene),material=mesh.material=new PBRMaterial('retained-lod-'+level,scene);material.albedoColor.set(.32,.4,.29);const before=material.albedoColor.asArray(),geometry=mesh.geometry;
    applyVillageToon([mesh],world.lighting);await prepareMapMaterials([mesh]);const effect=mesh.subMeshes[0].effect;
    assert.equal(material.fogEnabled,false);assert.doesNotMatch(effect.defines,/^#define FOG\b/m);assert.match(effect.fragmentSourceCode,/finalDiffuse \*= mix\(1\.0, villageFarTone.z, villageFarBlend\)/);
    assert.deepEqual(material.albedoColor.asArray(),before);assert.equal(mesh.geometry,geometry);shaderRows.push({level,engineFog:false,distanceTone:'existing scalar, no RGB hue replacement'});
  }
  facts.push({case:'actual-tint-path-trace',sourceRows,shaderRows,fogReceivers:'outdoor floor and characters; toon scenery remains hue-preserving',newSourceMaterialsOrTextures:false});
});

test('village fog restores over forest, cave and plains roundtrips while their existing palettes and boundary interpolation stay intact',t=>{
  const engine=new NullEngine();engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
  const world=createWorld(engine,{village:true,touchDevice:true}),scene=world.scene;t.after(()=>engine.dispose());
  const expected={
    'warrior-v4':[.19,.23,.21],
    'warrior-v5':[.024,.028,.038],
    'warrior-plains':[.61,.71,.77],
  },rows=[];let warmCounts;
  for(let cycle=0;cycle<2;cycle++)for(const destination of ['warrior-v4','warrior-v5','warrior-plains']){
    replaceWorldMap(world,destination);assert.deepEqual(scene.fogColor.asArray(),expected[destination]);
    if(destination==='warrior-plains'){
      const portal=FOREST_PLAINS_BOUNDARY.plainsPortal;
      updatePlainsBoundaryAtmosphere(world,portal,true);scene.fogColor.asArray().forEach((value,index)=>near(value,[.19,.23,.21][index]));
      updatePlainsBoundaryAtmosphere(world,{x:portal.x+70,z:portal.z},true);scene.fogColor.asArray().forEach((value,index)=>near(value,[.61,.71,.77][index]));
    }
    replaceWorldMap(world,'warrior-v3');assert.deepEqual(scene.fogColor.asArray(),[.29,.32,.25]);assert.deepEqual([scene.fogStart,scene.fogEnd],[65,80]);
    near(scene.imageProcessingConfiguration.exposure,1.15);assert.deepEqual(scene.clearColor.asArray(),[.61,.71,.77,1]);assert.deepEqual(world.sky.material._colors3.horizon.asArray(),[.61,.71,.77]);
    if(cycle===0&&destination==='warrior-plains')warmCounts=resources(scene);
    if(cycle===1)assert.deepEqual(resources(scene),warmCounts,'fog palette choice cannot accumulate scene resources');
    rows.push({cycle:cycle+1,destination,destinationFog:expected[destination],restoredVillageFog:scene.fogColor.asArray()});
  }
  assert.deepEqual(VILLAGE_FOG_COLOR.asArray(),[.29,.32,.25]);facts.push({case:'outdoor-cave-roundtrip-lifecycle',mapChanges:12,rows,warmVillageResources:warmCounts,plainsForestEndpointsUnchanged:true});
});

test.after(()=>{
  const out=new URL('../reports/borderless-hud-2026-11-05/',import.meta.url);mkdirSync(out,{recursive:true});
  writeFileSync(new URL('village-tone-validation.json',out),JSON.stringify({baseline:'5d1ee03',passed:facts.length===3,sourceSha256:createHash('sha256').update(readFileSync(new URL('../src/world.js',import.meta.url))).digest('hex'),facts,limitations:['CPU/NullEngine source-material and expanded-shader/fog-uniform inspection; no browser rasterization, screenshot or device timing.','The village change affects existing engine-fog receivers. Toon scenery already disables engine fog and preserves texture hue; its distance tone, dithering, geometry, LOD and textures remain unchanged.','The actual sky horizon and plains-to-forest interpolation retain their prior palettes.']},null,2)+'\n');
});
