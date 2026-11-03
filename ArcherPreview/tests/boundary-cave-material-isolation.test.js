import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,RawTexture,Texture} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {prepareVillageStart,loadStreamedVillage} from '../src/village-streamed-environment.js';
import {hasVillageGeometry} from '../src/village-lod.js';
import {readMapContainer} from '../src/map-container.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

const base=new URL('../public/assets/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base)));
const readyRaw=scene=>{for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;};
const withoutImageReferences=value=>{
 if(!value||typeof value!=='object')return;
 for(const key of Object.keys(value)){if(/Texture$/.test(key))delete value[key];else withoutImageReferences(value[key]);}
};
const paintUniforms=material=>{
 const values={},buffer={setTexture:(key,value)=>values[key]=value,updateFloat:(key,value)=>values[key]=value,updateFloat4(){}};
 material.pluginManager.getPlugin('CavePaintLight').hardBindForSubMesh(buffer);return values;
};

test('every shipped cave asset and logical LOD receives cave grading before real SDK readiness and keeps texture ownership across map changes',async t=>{
 const previousLocation=globalThis.location,engine=new NullEngine({renderWidth:900,renderHeight:450});
 globalThis.location={href:'https://cave-material-isolation.test/game/'};
 engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
 const world=createWorld(engine,{cave:true,touchDevice:true}),scene=world.scene;
 engine.getCaps().instancedArrays=true;readyRaw(scene);
 const sourceTexture=RawTexture.CreateRGBATexture(new Uint8Array([144,132,120,255]),1,1,scene,false,false,Texture.NEAREST_SAMPLINGMODE);
 sourceTexture.getInternalTexture().isReady=true;
 const internalTexture=sourceTexture.getInternalTexture(),materials=new Map(),loads=[];let readyCalls=0;
 t.mock.method(globalThis,'fetch',async url=>new Response(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base))));
 t.after(async()=>{await world.releaseEnvironment?.();scene.dispose();engine.dispose();globalThis.location=previousLocation;});
 const prepared=await prepareVillageStart(world),byModel=new Map();
 for(const [id,asset]of prepared.assets)for(const profile of asset.levels){
  const key=new URL(profile.model,prepared.url).pathname.split('/').at(-1);
  if(!byModel.has(key))byModel.set(key,[]);byModel.get(key).push({id,level:profile.level,category:asset.config.category});
 }
 // Include every authored logical LOD, retaining production URL deduplication
 // where multiple profiles intentionally share the same geometry source.
 prepared.plan=[...prepared.assets].flatMap(([id,asset])=>[...asset.levels].sort((a,b)=>b.level-a.level).map(profile=>({id,level:profile.level,priority:1})));
 const expectedProfiles=prepared.plan.length;
 await loadStreamedVillage(world,{
  initialize:async()=>{},ground:async()=>{},
  loadContainer:async(model,target,options)=>{
   const key=model.pathname.split('/').at(-1),profiles=byModel.get(key);assert.ok(profiles?.length,key);
   assert.equal(new Set(profiles.map(p=>p.category)).size,1,'shared source must have an unambiguous surface category');
   const {gltf,files}=await readRuntimeGltf(new URL('content/'+key,base));
   for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(buffer.uri).data).toString('base64');
   // Keep shipped geometry, node transforms and actual glTF material scalar
   // properties. Omit image decoding/upload only, using one marked SDK texture
   // to prove that grading and map replacement never replace its ownership.
   withoutImageReferences(gltf.materials);delete gltf.images;delete gltf.textures;delete gltf.samplers;
   gltf.extensionsRequired=(gltf.extensionsRequired??[]).filter(v=>v!=='KHR_texture_basisu');
   gltf.extensionsUsed=(gltf.extensionsUsed??[]).filter(v=>v!=='KHR_texture_basisu');
   const container=await readMapContainer(target,gltf,'',{...options,fileName:key});
   const meshes=container.meshes.filter(mesh=>mesh.getTotalVertices()>0);assert.ok(meshes.length);
   const rock=profiles[0].category==='rock';
   for(const mesh of meshes){
    const material=mesh.material;assert.equal(material?.getClassName(),'PBRMaterial');
    if(materials.has(material))continue;
    material.albedoTexture=sourceTexture;
    const albedo=material.albedoColor.asArray();materials.set(material,{albedo,rock,profiles});
    const original=material.isReadyForSubMesh;
    material.isReadyForSubMesh=function(mesh,sub,...rest){
     assert.ok(this.pluginManager?.getPlugin('MoonforestVillageToon'),'toon must precede shader readiness');
     assert.ok(this.pluginManager.getPlugin('CaveRockMood'),'surface grading must precede shader readiness');
     assert.ok(this.pluginManager.getPlugin('CavePaintLight'),'painted light must precede shader readiness');
     assert.equal(Boolean(this.metadata.caveRockTone),rock,'only rock assets receive the rock palette');
     const ready=original.call(this,mesh,sub,...rest);
     if(ready){assert.match(sub.effect.fragmentSourceCode,/cavePaintFactor\(/);assert.match(sub.effect.fragmentSourceCode,/caveMoodActive/);readyCalls++;}
     return ready;
    };
   }
   loads.push({model:key,profiles,geometryMeshes:meshes.length});return container;
  },
 });
 assert.equal(world.environment.ready,true);assert.ok(readyCalls>=loads.length);
 for(const [id,asset]of prepared.assets)for(const profile of asset.levels)assert.ok(hasVillageGeometry(asset,profile.level),id+' missing logical LOD '+profile.level);
 assert.equal(prepared.assets.size,Object.keys(manifest.assets).length);
 assert.ok(materials.size>prepared.assets.size);
 const firstLight=scene.metadata.cavePaintLighting;
 for(const [material,snapshot]of materials){
  assert.equal(material.albedoTexture,sourceTexture);assert.equal(material.albedoTexture.getInternalTexture(),internalTexture);
  assert.deepEqual(material.albedoColor.asArray(),snapshot.albedo,'grading must preserve authored scalar colour');
  const uniforms=paintUniforms(material);assert.equal(uniforms.cavePaintActive,1);assert.equal(uniforms.cavePaintLightMap,firstLight.texture);
 }
 const visits=[];
 for(const character of ['warrior-v4','warrior-plains','warrior-v3']){
  replaceWorldMap(world,character);readyRaw(scene);
  for(const [material,snapshot]of materials){
   assert.equal(material.pluginManager.getPlugin('CaveRockMood').active,false);
   const uniforms=paintUniforms(material);assert.equal(uniforms.cavePaintActive,0);assert.notEqual(uniforms.cavePaintLightMap,firstLight.texture);
   assert.equal(material.albedoTexture,sourceTexture);assert.deepEqual(material.albedoColor.asArray(),snapshot.albedo);
  }
  visits.push(world.mapId);
 }
 assert.equal(firstLight.disposed,true);assert.equal(firstLight.texture.getInternalTexture(),null);
 replaceWorldMap(world,'warrior-v5');readyRaw(scene);
 const nextLight=scene.metadata.cavePaintLighting;assert.notEqual(nextLight,firstLight);
 for(const material of materials.keys()){
  world.caveAtmosphere.attachMaterial(material);world.caveFog.attach(material);
  assert.equal(material.pluginManager.getPlugin('CaveRockMood').active,true);
  const uniforms=paintUniforms(material);assert.equal(uniforms.cavePaintActive,1);assert.equal(uniforms.cavePaintLightMap,nextLight.texture);
  assert.equal(material.albedoTexture,sourceTexture);assert.equal(sourceTexture.getInternalTexture(),internalTexture);
 }
 assert.notEqual(caveFogFallback(scene),nextLight.texture);
 const folder=new URL('../reports/boundary-cave-polish-2026-11-03/',import.meta.url);mkdirSync(folder,{recursive:true});
 writeFileSync(new URL('cave-material-isolation.json',folder),JSON.stringify({passed:true,assets:prepared.assets.size,logicalLodProfiles:expectedProfiles,actualDistinctModelLoads:loads.length,actualPbrMaterials:materials.size,successfulSdkReadinessCalls:readyCalls,rockMaterials:[...materials.values()].filter(v=>v.rock).length,nonRockMaterials:[...materials.values()].filter(v=>!v.rock).length,outdoorMapVisits:visits,caveReentryBindsNewLightMap:true,sharedTextureAndScalarColourPreserved:true,loads,limitations:['Actual shipped glTF geometry, transforms and PBR scalar properties traverse the production streamed installation and shader-readiness path. Image decoding is omitted and one controlled 1x1 SDK texture verifies reference ownership.','NullEngine does not rasterize or measure GPU uploads, visual brightness, mobile FPS, thermals or final commercial art quality.','Retained materials deliberately survive map replacements in this test to exercise deactivation/rebinding; normal map release disposes map-owned material containers.']},null,2)+'\n');
});
