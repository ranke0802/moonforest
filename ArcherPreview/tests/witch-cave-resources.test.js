import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {CAVE_PLACEMENTS,CAVE_ASSET_IDS,CAVE_ENTRY} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {prepareVillageStart} from '../src/village-streamed-environment.js';
import {validVillageTextureProfile} from '../src/village-texture-budget.js';
const base=new URL('../public/assets/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,base)));

test('cave publishes twenty new models, six exact reuses, capped textures and three lossless-compressed LODs',()=>{
  const m=read('witch-cave.json'),village=read('village.json'),forest=read('monster-forest.json');
  assert.equal(m.newSourceModels,20);assert.equal(m.reusedSourceModels,6);assert.equal(m.spentCredits,400);
  assert.equal(m.placementCount,CAVE_PLACEMENTS.length);assert.equal(m.availableAssetCount,26);
  assert.equal(m.sourceSettings.enablePbr,false);assert.equal(m.sourceSettings.autoSize,true);assert.equal(m.sourceSettings.textureResolution,8192);
  for(const p of CAVE_PLACEMENTS)assert.ok(m.assets[p.asset]);
  const checked=new Set();
  for(const [id,a]of Object.entries(m.assets)){
    if(!CAVE_ASSET_IDS.includes(id))assert.deepEqual(a,village.assets[id]??forest.assets[id]);
    assert.equal(a.lods.length,3);assert.ok(validVillageTextureProfile(a.highTextures));
    assert.ok(a.highTextures.textures.albedo.width<=4096);assert.equal(a.mobileNear.triangles,a.lods[0].triangles);
    assert.ok(a.lods[2].triangles<a.lods[1].triangles&&a.lods[1].triangles<a.lods[0].triangles);
    if(id.startsWith('cave-'))assert.ok(a.lods[0].triangles<=5000);
    for(const tier of a.lods){
      const g=read(tier.model);assert.ok(g.extensionsRequired.includes('EXT_meshopt_compression'));assert.ok(g.extensionsRequired.includes('KHR_texture_basisu'));
      if(id.startsWith('cave-'))for(const material of g.materials){assert.equal(material.pbrMetallicRoughness.metallicFactor,0);assert.equal(material.pbrMetallicRoughness.roughnessFactor,1);assert.equal(material.normalTexture,undefined);}
      for(const url of tier.resources){if(checked.has(url))continue;checked.add(url);const bytes=readFileSync(new URL(url,base));assert.equal(createHash('sha256').update(bytes).digest('hex'),url.split('/').at(-1).split('.')[0]);}
    }
    const high=a.highTextures.textures.albedo,bytes=readFileSync(new URL(high.url,base));assert.equal(bytes.readUInt32LE(20),high.width);assert.equal(bytes.readUInt32LE(24),high.height);
  }
});

test('cave entrance defers distant boss-room detail and shares one demand plan',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());scene.useRightHandedSystem=true;
  const terrain=createWitchCaveTerrain(),camera=new ArcRotateCamera('startup',Math.PI*.38,1.18,4.8,new Vector3(CAVE_ENTRY.x,terrain.heightAt(CAVE_ENTRY.x,CAVE_ENTRY.z)+1.46,CAVE_ENTRY.z),scene);camera.maxZ=350;
  const world={scene,camera,terrain,cave:true,placements:CAVE_PLACEMENTS,environmentManifest:'witch-cave',touchDevice:true};
  const previous=globalThis.location;globalThis.location={href:'https://example.test/game/?character=warrior-v5'};t.after(()=>{globalThis.location=previous;});
  const requests=[];t.mock.method(globalThis,'fetch',async url=>{requests.push(String(url));return {ok:true,json:async()=>read('witch-cave.json')};});
  const start=await prepareVillageStart(world);assert.equal(start.assets.size,26);assert.equal(start.records.length,CAVE_PLACEMENTS.length);
  assert.ok(start.plan.length>0&&start.plan.length<78);assert.ok(!start.plan.some(p=>p.id==='cave-15-resurrection-altar'&&p.level<2));
  assert.equal(await prepareVillageStart(world),start);assert.equal(requests.length,1);
  t.diagnostic(JSON.stringify({initialLodModels:start.plan.length,possibleLodModels:78,files:start.resources.length}));
});
