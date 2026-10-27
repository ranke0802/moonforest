import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { hash } from '../scripts/resource-pack.js';
import { collectVillageSiteFiles } from '../scripts/build-village-site.mjs';
import { VILLAGE_ASSET_IDS } from '../src/village-layout.js';

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'moonforest-village-site-'));
  t.after(async()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});});
  await mkdir(join(root,'assets/content'),{recursive:true});
  const content=async(data,extension)=>{const bytes=Buffer.from(data),name=`${hash(bytes)}.${extension}`;await writeFile(join(root,'assets/content',name),bytes);return name;};
  const image=await content('painted image','webp'),buffer=await content('shared geometry','bin');
  const model=await content(JSON.stringify({buffers:[{uri:buffer,byteLength:15}],images:[{uri:image}]}),'gltf');
  await writeFile(join(root,'assets/character.json'),JSON.stringify({model:`./content/${model}`}));
  await writeFile(join(root,'assets/sky.json'),JSON.stringify({texture:`content/${image}`}));
  await writeFile(join(root,'assets/village-fixture.json'),JSON.stringify({developmentFixture:true}));
  await writeFile(join(root,'assets/source.glb'),'unused original');
  await writeFile(join(root,'resource-cache.js'),'persistent cache worker');
  await writeFile(join(root,'NOTICE.txt'),'asset notice');
  return {root,image,buffer,model};
}

test('publication graph includes sky and glTF dependencies but excludes fixture and raw originals',async t=>{
  const f=await fixture(t),{files}=await collectVillageSiteFiles(f.root,{requireCompleteVillage:false});
  assert.deepEqual([...files.keys()].sort(),['NOTICE.txt','resource-cache.js','assets/character.json','assets/sky.json',...['image','buffer','model'].map(k=>`assets/content/${f[k]}`)].sort());
});

test('publication fails before copying if content bytes no longer match their immutable name',async t=>{
  const f=await fixture(t);await writeFile(join(f.root,'assets/content',f.buffer),'changed geometry');
  await assert.rejects(collectVillageSiteFiles(f.root,{requireCompleteVillage:false}),/Content hash mismatch/);
});

test('production publication requires a complete, approved village and rejects traversal',async t=>{
  const f=await fixture(t);await writeFile(join(f.root,'assets/village.json'),JSON.stringify({complete:false,assets:{}}));
  await assert.rejects(collectVillageSiteFiles(f.root),/25 approved assets/);
  await writeFile(join(f.root,'assets/sky.json'),JSON.stringify({texture:'content/../../outside.bin'}));
  await assert.rejects(collectVillageSiteFiles(f.root,{requireCompleteVillage:false}),/Unsupported publish dependency/);
});

test('production cannot regress to the old 1K mobile near tier without geometry LOD',async t=>{
 const f=await fixture(t);
 await writeFile(join(f.root,'assets/village.json'),JSON.stringify({complete:true,availableAssetCount:25,assets:Object.fromEntries(VILLAGE_ASSET_IDS.map(id=>[id,{visualReview:'APPROVED'}]))}));
 await assert.rejects(collectVillageSiteFiles(f.root),/original mobile near geometry, at most 4K/);
});

test('publication accepts the 4K/2K profile and rejects accidental 8K or oversized auxiliary maps',async t=>{
 const f=await fixture(t);
 const asset=size=>({visualReview:'APPROVED',geometryLod:true,lods:[{triangles:5000},{triangles:2500},{triangles:1000}],mobileNear:{triangles:5000},highTextures:{textures:Object.fromEntries(['albedo','normal','orm'].map(role=>[role,{width:role==='albedo'?size:size/4,height:role==='albedo'?size:size/4}]))}});
 const village={complete:true,availableAssetCount:25,geometryLod:{nearColorResolution:4096},assets:Object.fromEntries(VILLAGE_ASSET_IDS.map((id,i)=>[id,asset(i%2?2048:4096)]))};
 const save=()=>writeFile(join(f.root,'assets/village.json'),JSON.stringify(village));
 await save();await collectVillageSiteFiles(f.root);
 village.assets[VILLAGE_ASSET_IDS[0]]=asset(8192);await save();await assert.rejects(collectVillageSiteFiles(f.root),/at most 4K/);
 village.assets[VILLAGE_ASSET_IDS[0]]=asset(4096);village.assets[VILLAGE_ASSET_IDS[0]].highTextures.textures.normal.width=4096;
 await save();await assert.rejects(collectVillageSiteFiles(f.root),/at most 4K/);
});
