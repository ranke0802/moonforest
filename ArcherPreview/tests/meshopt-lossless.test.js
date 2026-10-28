import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readAccessor} from '../scripts/web-geometry.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

const base=new URL('../public/assets/content/',import.meta.url);
const report=JSON.parse(readFileSync(new URL('../reports/village-meshopt.json',import.meta.url)));

test('all shipped Meshopt assets preserve every accessor and all scene/LOD/material metadata',async()=>{
  assert.equal(report.models.length,101);
  for(const row of report.models){
    const old=JSON.parse(readFileSync(new URL(row.inputModel,base)));
    const files=new Map(old.buffers.map(b=>[b.uri,{data:readFileSync(new URL(b.uri,base))}]));
    const {gltf,files:decoded}=await readRuntimeGltf(new URL(row.model,base));
    for(const key of ['meshes','nodes','skins','materials','textures','images','samplers','scenes','scene','animations','accessors'])assert.deepEqual(gltf[key],old[key],row.model+' '+key);
    for(let i=0;i<old.accessors.length;i++)assert.deepEqual(readAccessor(gltf,decoded,i),readAccessor(old,files,i),row.model+' accessor '+i);
  }
  assert.ok(report.afterUniqueBytes+report.decoderBytes<report.beforeUniqueBytes);
});
