import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { hash } from '../scripts/resource-pack.js';
import { collectVillageSiteFiles } from '../scripts/build-village-site.mjs';

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
