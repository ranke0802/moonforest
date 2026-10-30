import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {R9_CLIPS,R9_MORPHS,accessorBytes,compareBodyCorners,morphTextureEstimate} from '../scripts/pack-mourning-elena-v2-1.mjs';
const assets=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',assets)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let loaded;const packed=()=>loaded??=readRuntimeGltf(new URL(config.model,assets));

test('r9 package preserves all eight clips and finite zero-root state catalog including full 5.2 second death',async()=>{
 const {gltf:g}=await packed();assert.equal(config.sourceSha256,'9673c3aa680f521c8d861001458e41e98dabc6edb046cf726c13540acc31f061');
 assert.equal(config.rigRevision,'r9-attack-shape-repair');assert.deepEqual(g.animations.map(a=>a.name).sort(),[...R9_CLIPS].sort());
 const death=config.catalog.find(c=>c.name==='dead');assert.equal(death.clip,'Chimera_Death_Lament_5p2s');assert.equal(death.duration,5.2);assert.equal(death.frames,157);
 for(const state of config.catalog){assert.equal(state.rootTrack.length,state.frames);assert.equal(state.groundTrack.length,state.frames);assert.ok(state.rootTrack.every(v=>v.length===3&&v.every(x=>x===0)));assert.ok(state.groundTrack.every(x=>x===0));}
 assert.equal(config.height,3.2);assert.equal(config.scale,3.5363933762773603);assert.equal(g.skins.reduce((n,s)=>n+s.joints.length,0),255);
});

test('r8 body triangle-corner coordinates, normals, UVs and weights survive corrective export vertex splits',async()=>{
 const before=await readRuntimeGltf(new URL('content/e1c21f783d411793239f361df18a72d9f79e7723f66c293720fa87e6795089d4.gltf',assets)),after=await packed(),comparison=compareBodyCorners(before,after);
 assert.equal(comparison.oldVertices,89909);assert.equal(comparison.newVertices,89940);assert.equal(comparison.triangles,137412);
 for(const [name,value]of Object.entries(comparison.attributes))assert.equal(value.byteExact,true,name+' changed');
});

test('eleven independent body targets and the neutral-degenerate mouth remain finite and losslessly accessible',async()=>{
 const source=await packed(),g=source.gltf,body=g.meshes.find(m=>m.name==='tripo_mesh_b9a89d0a'),mouth=g.meshes.find(m=>m.name==='Lament_Mouth_Interior');
 assert.deepEqual(body.extras.targetNames,R9_MORPHS);assert.equal(body.primitives[0].targets.length,11);assert.deepEqual(mouth.extras.targetNames,['Death_Scream']);
 assert.equal(g.accessors[mouth.primitives[0].indices].count/3,96);
 const base=accessorBytes(source,mouth.primitives[0].attributes.POSITION);for(let i=0;i<base.length;i+=4)assert.equal(base.readFloatLE(i),base.readFloatLE(i%12));
 const opened=accessorBytes(source,mouth.primitives[0].targets[0].POSITION);assert.ok([...new Float32Array(opened.buffer,opened.byteOffset,opened.length/4)].some(v=>Math.abs(v)>.001));
 for(let i=0;i<g.accessors.length;i++)if(g.accessors[i].componentType===5126){const b=accessorBytes(source,i);for(let k=0;k<b.length;k+=4)assert.ok(Number.isFinite(b.readFloatLE(k)),'nonfinite accessor '+i);}
 assert.equal(g.meshes.reduce((n,m)=>n+m.primitives.reduce((n,p)=>n+g.accessors[p.indices].count/3,0),0),143228);
 const memory=morphTextureEstimate(g);assert.equal(memory.bytes,31728384);assert.equal(memory.meshes.length,2);
});

test('r9 reuses the exact existing 4K texture and every content-addressed resource verifies',async()=>{
 const {gltf:g}=await packed(),texture='b943792deead273c3d9793295a2660c005e750f23e1c4074de95f5e6487c4eb9.ktx2';
 assert.equal(g.images.length,1);assert.equal(g.images[0].uri,texture);assert.equal(config.resources.filter(p=>p.endsWith('.ktx2')).length,1);
 for(const resource of config.resources){const file=readFileSync(new URL(resource,assets));assert.equal(sha(file),resource.split('/').at(-1).split('.')[0],resource);}
 const bytes=readFileSync(new URL('content/'+texture,assets));assert.equal(bytes.readUInt32LE(20),4096);assert.equal(bytes.readUInt32LE(24),4096);assert.equal(bytes.readUInt32LE(40),13);
});
