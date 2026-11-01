import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {CAVE_PLACEMENTS,CAVE_ASSET_IDS,CAVE_ENTRY} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {prepareVillageStart} from '../src/village-streamed-environment.js';
import {validVillageTextureProfile} from '../src/village-texture-budget.js';
import {CAVE_LABORATORY_GEOMETRY} from '../src/cave-laboratory-geometry.js';
const base=new URL('../public/assets/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,base)));

test('cave publishes 22 approved Meshy types, six unchanged reuses and one image-free derived enclosure without the removed Joachim body',()=>{
  const m=read('witch-cave.json'),village=read('village.json'),forest=read('monster-forest.json');
  assert.equal(m.newSourceModels,22);assert.equal(m.reusedSourceModels,6);assert.equal(m.spentCredits,440);
  assert.equal(m.staticCharacterReuses,0);assert.equal(m.assets['joachim-resting'],undefined);assert.equal(m.placementCount,CAVE_PLACEMENTS.length);assert.equal(m.availableAssetCount,Object.keys(m.assets).length);assert.equal(Object.keys(m.assets).length,22+6+1);assert.equal(m.derivedEnvironmentAssets,1);
  assert.equal(m.sourceSettings.enablePbr,false);assert.equal(m.sourceSettings.autoSize,true);assert.equal(m.sourceSettings.textureResolution,8192);
  for(const p of CAVE_PLACEMENTS)assert.ok(m.assets[p.asset]);
  const checked=new Set();
  for(const [id,a]of Object.entries(m.assets)){
    const derived=id===CAVE_LABORATORY_GEOMETRY.assetId;
    if(!CAVE_ASSET_IDS.includes(id)&&!derived)assert.deepEqual(a,village.assets[id]??forest.assets[id]);
    assert.equal(a.lods.length,3);if(!derived){assert.ok(validVillageTextureProfile(a.highTextures));assert.ok(a.highTextures.textures.albedo.width<=4096);}else{
      assert.equal(a.surfaceStyle,'cave-palette');assert.equal(a.essentialStructural,true);assert.equal(a.highTextures,undefined);assert.equal(a.sourceSha256,CAVE_LABORATORY_GEOMETRY.sourceSha256);assert.equal(a.terrainSha256,CAVE_LABORATORY_GEOMETRY.terrainSha256);assert.equal(a.approvedRevision,CAVE_LABORATORY_GEOMETRY.revision);assert.equal(a.newGenerationCalls,0);assert.deepEqual(a.lods.map(l=>l.triangles),[4512,3158,2374]);
    }
    assert.equal(a.mobileNear.triangles,a.lods[0].triangles);
    assert.ok(a.lods[2].triangles<a.lods[1].triangles&&a.lods[1].triangles<a.lods[0].triangles);
    if(id.startsWith('cave-'))assert.ok(a.lods[0].triangles<=5000);
    for(const tier of a.lods){
      const g=read(tier.model);assert.ok(g.extensionsRequired.includes('EXT_meshopt_compression'));
      if(derived){
        assert.equal(tier.textureSize,0);assert.equal(g.images?.length??0,0);assert.equal(g.skins?.length??0,0);assert.equal(g.animations?.length??0,0);assert.ok(!g.extensionsRequired.includes('KHR_texture_basisu'));
        let triangles=0;for(const mesh of g.meshes)for(const primitive of mesh.primitives){assert.equal(primitive.targets?.length??0,0);assert.deepEqual(Object.keys(primitive.attributes).sort(),['NORMAL','POSITION']);triangles+=g.accessors[primitive.indices].count/3;}
        assert.equal(triangles,tier.triangles);
      }else{
        assert.ok(g.extensionsRequired.includes('KHR_texture_basisu'));
      }
      if(id.startsWith('cave-'))for(const material of g.materials){assert.equal(material.pbrMetallicRoughness.metallicFactor,0);assert.equal(material.pbrMetallicRoughness.roughnessFactor,1);assert.equal(material.normalTexture,undefined);}
      for(const url of tier.resources){if(checked.has(url))continue;checked.add(url);const bytes=readFileSync(new URL(url,base));assert.equal(createHash('sha256').update(bytes).digest('hex'),url.split('/').at(-1).split('.')[0]);}
    }
    if(!derived){const high=a.highTextures.textures.albedo,bytes=readFileSync(new URL(high.url,base));assert.equal(bytes.readUInt32LE(20),high.width);assert.equal(bytes.readUInt32LE(24),high.height);}
  }
});

test('cave entrance defers distant boss-room detail and shares one demand plan',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());scene.useRightHandedSystem=true;
  const terrain=createWitchCaveTerrain(),camera=new ArcRotateCamera('startup',Math.PI*.38,1.18,4.8,new Vector3(CAVE_ENTRY.x,terrain.heightAt(CAVE_ENTRY.x,CAVE_ENTRY.z)+1.46,CAVE_ENTRY.z),scene);camera.maxZ=350;
  const world={scene,camera,terrain,cave:true,placements:CAVE_PLACEMENTS,environmentManifest:'witch-cave',touchDevice:true};
  const previous=globalThis.location;globalThis.location={href:'https://example.test/game/?character=warrior-v5'};t.after(()=>{globalThis.location=previous;});
  const requests=[];t.mock.method(globalThis,'fetch',async url=>{requests.push(String(url));return {ok:true,json:async()=>read('witch-cave.json')};});
  const start=await prepareVillageStart(world),possible=Object.values(read('witch-cave.json').assets).reduce((n,a)=>n+a.lods.length,0);assert.equal(start.assets.size,29);assert.equal(start.records.length,CAVE_PLACEMENTS.length);assert.equal(start.plan[0].id,CAVE_LABORATORY_GEOMETRY.assetId);assert.equal(start.plan[0].level,2);
  assert.ok(start.plan.length>0&&start.plan.length<possible);assert.ok(!start.plan.some(p=>['cave-15-resurrection-altar','joachim-resting'].includes(p.id)&&p.level<2));
  assert.equal(await prepareVillageStart(world),start);assert.equal(requests.length,1);
  t.diagnostic(JSON.stringify({initialLodModels:start.plan.length,possibleLodModels:possible,files:start.resources.length}));
});
