import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readAccessor} from '../scripts/web-geometry.js';

test('reduced trees preserve painted colors without sampling across disconnected atlas islands',async()=>{
 const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(await readFile(new URL('environment.json',base),'utf8'));
 for(const key of ['verdant-tree','oak-tree']){
  const config=manifest.assets[key],original=JSON.parse(await readFile(new URL(config.model,base),'utf8'));
  assert.ok(original.materials.every(m=>m.pbrMetallicRoughness.baseColorTexture),'full-detail source texture stays intact');
  const budgets=key==='oak-tree'?[75000,22500,4000,1500]:[74000,33000,6400,2600];
  for(const [level,lod] of config.lods.entries()){
   const g=JSON.parse(await readFile(new URL(lod.model,base),'utf8')),files=new Map();
   for(const b of g.buffers)files.set(b.uri,{data:await readFile(new URL('content/'+b.uri,base))});
   let triangles=0;
   for(const mesh of g.meshes)for(const p of mesh.primitives){
    assert.equal(g.materials[p.material].pbrMetallicRoughness.baseColorTexture,undefined,'new triangles cannot bridge UV islands');
    assert.equal(p.attributes.TEXCOORD_0,undefined);
    const colors=readAccessor(g,files,p.attributes.COLOR_0),positions=readAccessor(g,files,p.attributes.POSITION),indices=readAccessor(g,files,p.indices);
    assert.equal(colors.length,positions.length);
    for(const c of colors)assert.ok(Number.isFinite(c)&&c>=0&&c<=1,'valid linear RGB');
    for(const i of indices)assert.ok(i<colors.length/3);
    triangles+=indices.length/3;
   }
   assert.ok(triangles<=budgets[level],`${key} LOD ${level}: ${triangles}`);
  }
 }
});
