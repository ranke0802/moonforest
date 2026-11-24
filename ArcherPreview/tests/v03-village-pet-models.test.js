import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {NullEngine,Scene} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {PET_MODELS} from '../src/v03/village-pet-assets.js';
import {VILLAGE_PETS,createVillagePets} from '../src/v03/village-pets.js';

function nodeFixture(url){
  const bytes=readFileSync(url);
  const jsonLength=bytes.readUInt32LE(12);
  const doc=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
  const payload=bytes.subarray(28+jsonLength);
  // The original KTX2 is decoded offline in the visual check. NullEngine gets
  // the identical geometry, skin, animated transforms and PBR material.
  const p=doc.meshes[0].primitives[0],j=doc.skins[0].joints;
  assert.equal(doc.materials.length,1);assert.equal(doc.meshes.length,1);assert.ok(doc.accessors[p.indices].count/3<=6500);
  assert.deepEqual(doc.animations.map(a=>a.name),['Idle','Walk']);
  assert.ok(j.length===12||j.length===24);assert.ok(doc.extensionsRequired.includes('KHR_texture_basisu'));
  const image=doc.bufferViews[doc.images[0].bufferView],base=image.byteOffset;
  assert.equal(payload.readUint32LE(base+20),2048);assert.equal(payload.readUint32LE(base+40),12);
  const a=doc.accessors[p.attributes.WEIGHTS_0],i=doc.accessors[p.attributes.JOINTS_0];
  const weights=doc.bufferViews[a.bufferView].byteOffset,ids=doc.bufferViews[i.bufferView].byteOffset;
  for(let vertex=0;vertex<a.count;vertex++){
    let total=0;
    for(let ch=0;ch<4;ch++){
      total+=payload.readFloatLE(weights+16*vertex+4*ch);
      assert.ok(payload[ids+4*vertex+ch]<j.length);
    }
    assert.ok(Math.abs(total-1)<.00001);
  }
  delete doc.materials[0].pbrMetallicRoughness.baseColorTexture;delete doc.textures;delete doc.images;
  delete doc.extensionsRequired;delete doc.extensionsUsed;
  const json=Buffer.from(JSON.stringify(doc));const padded=Math.ceil(json.length/4)*4;
  const out=Buffer.alloc(28+padded+payload.length,32);bytes.copy(out,0,0,20);
  out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded,12);json.copy(out,20);
  out.writeUInt32LE(payload.length,20+padded);out.write('BIN\0',24+padded);payload.copy(out,28+padded);
  return out;
}

for(const config of VILLAGE_PETS)test(config.id+' uses its toy-sized rig, shared outline, measured gait and one map lifetime',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const url=PET_MODELS[config.id],bytes=nodeFixture(url);
  let reads=0;
  t.mock.method(globalThis,'fetch',async (u,options)=>{
    assert.equal(u.href,url.href);assert.equal(options.signal.aborted,false);reads++;return new Response(bytes);
  });
  const pets=createVillagePets({scene,navigation:{free:()=>true,segmentClear:()=>true},terrain:{heightAt:()=>0}},
    {models:{[config.id]:url},view:{prepare(){},hidden:()=>false}});
  try{
    const player={x:config.origin[0],z:config.origin[1]};pets.update(.016,player);
    for(let i=0;i<200&&!scene.getMeshByName(config.id+'-painted / silhouette');i++)await delay(5);
    assert.equal(reads,1);
    const body=scene.getMeshByName(config.id+'-painted'),shell=scene.getMeshByName(config.id+'-painted / silhouette');
    assert.ok(body&&shell);assert.ok(body.material.unlit&&body.material.metadata.moonforestMonsterToon);
    assert.equal(shell.skeleton,body.skeleton);assert.equal(shell.metadata.outlinePixels,.5);
    for(let i=0;i<170;i++)pets.update(1/60,player);
    assert.equal(scene.animationGroups.find(a=>a.name==='Walk').isPlaying,true);
    assert.equal(scene.skeletons.length,1);
    pets.dispose();assert.equal(scene.skeletons.length,0);assert.equal(scene.animationGroups.length,0);
    assert.ok(body.isDisposed()&&shell.isDisposed());
  }finally{pets.dispose();scene.dispose();engine.dispose();}
});
