import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {splitGlb,hash} from './resource-pack.js';
import {compressMeshopt} from './meshopt-lossless.js';
import {basisModel} from './pack-village-ktx2.mjs';
import {ELENA_ACTIVE_CLIPS} from '../src/elena-spec.js';
const root=resolve(import.meta.dirname,'..'),review=resolve(root,'reports/elena-boss');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const config=await read(resolve(review,'config.json')),input=splitGlb(await readFile(resolve(review,'elena.glb')),{baseColorOnly:true});
assert.equal(input.gltf.animations.length,19);
const g=structuredClone(input.gltf);
g.animations=g.animations.filter(a=>ELENA_ACTIVE_CLIPS.includes(a.name));assert.equal(g.animations.length,ELENA_ACTIVE_CLIPS.length);
// FBX starts at frame 1. Normalize time to zero before Babylon normalize(0)
// extends it, retaining the exact source duration instead of an extra 1/60 s.
const normalized=new Set(),copied=new Set();
for(const clip of g.animations){
  const start=Math.min(...clip.samplers.map(s=>g.accessors[s.input].min[0]));
  for(const sampler of clip.samplers){
    if(normalized.has(sampler.input)||start===0)continue;normalized.add(sampler.input);
    const a=g.accessors[sampler.input],v=g.bufferViews[a.bufferView],uri=g.buffers[v.buffer].uri;
    assert.equal(a.componentType,5126);assert.equal(a.type,'SCALAR');
    if(!copied.has(uri)){input.files.set(uri,{data:Buffer.from(input.files.get(uri).data)});copied.add(uri);}
    const bytes=input.files.get(uri).data;
    for(let i=0;i<a.count;i++){const at=(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??4);bytes.writeFloatLE(Math.max(0,bytes.readFloatLE(at)-start),at);}
    a.min=[0];a.max=[a.max[0]-start];
  }
}
// Keep the source's other motions in the offline review/export, but do not make
// a phone download/parse spell and showcase tracks which cannot run yet.
const accessors=new Set();
for(const m of g.meshes)for(const p of m.primitives){Object.values(p.attributes).forEach(a=>accessors.add(a));if(p.indices!==undefined)accessors.add(p.indices);for(const t of p.targets??[])Object.values(t).forEach(a=>accessors.add(a));}
for(const s of g.skins??[])if(s.inverseBindMatrices!==undefined)accessors.add(s.inverseBindMatrices);
for(const a of g.animations)for(const s of a.samplers){accessors.add(s.input);accessors.add(s.output);}
const remap=list=>new Map(list.map((v,i)=>[v,i])),aList=[...accessors].sort((a,b)=>a-b),aMap=remap(aList);
for(const m of g.meshes)for(const p of m.primitives){for(const k in p.attributes)p.attributes[k]=aMap.get(p.attributes[k]);if(p.indices!==undefined)p.indices=aMap.get(p.indices);for(const t of p.targets??[])for(const k in t)t[k]=aMap.get(t[k]);}
for(const s of g.skins??[])if(s.inverseBindMatrices!==undefined)s.inverseBindMatrices=aMap.get(s.inverseBindMatrices);
for(const a of g.animations)for(const s of a.samplers){s.input=aMap.get(s.input);s.output=aMap.get(s.output);}
g.accessors=aList.map(i=>g.accessors[i]);
const views=new Set();for(const a of g.accessors){if(a.bufferView!==undefined)views.add(a.bufferView);if(a.sparse){views.add(a.sparse.indices.bufferView);views.add(a.sparse.values.bufferView);}}
const vList=[...views].sort((a,b)=>a-b),vMap=remap(vList);
for(const a of g.accessors){if(a.bufferView!==undefined)a.bufferView=vMap.get(a.bufferView);if(a.sparse){a.sparse.indices.bufferView=vMap.get(a.sparse.indices.bufferView);a.sparse.values.bufferView=vMap.get(a.sparse.values.bufferView);}}
g.bufferViews=vList.map(i=>g.bufferViews[i]);
const bList=[...new Set(g.bufferViews.map(v=>v.buffer))].sort((a,b)=>a-b),bMap=remap(bList);
g.buffers=bList.map(i=>g.buffers[i]);for(const v of g.bufferViews)v.buffer=bMap.get(v.buffer);
assert.equal(g.images.length,1);
const texture=await readFile(resolve(review,'elena-color.ktx2')),textureName=hash(texture)+'.ktx2';
assert.equal(texture.readUInt32LE(20),4096);assert.equal(texture.readUInt32LE(24),4096);
input.files.set(textureName,{data:texture});
const packed=await compressMeshopt(basisModel(g,[{name:'Elena painted color',uri:textureName,mimeType:'image/ktx2'}]),input.files);
const content=resolve(root,'public/assets/content');await mkdir(content,{recursive:true});
for(const [name,file]of packed.files)await writeFile(resolve(content,name),file.data);
const sourceClips=config.catalog.filter(c=>!c.derived).map(({name,duration,frames,fps})=>({name,duration,frames,fps}));
config.catalog=config.catalog.filter(c=>ELENA_ACTIVE_CLIPS.includes(c.name));
config.animations=Object.fromEntries(ELENA_ACTIVE_CLIPS.map(n=>[n,n]));
Object.assign(config,{model:'./content/'+packed.model,resources:[...packed.files.keys()].map(n=>'./content/'+n),sourceClips,sourceSha256:'3896b89995c7b424aa3f6a35139127609c263e4063c48d5e9165a679baece4ac',texture:{width:4096,height:4096,codec:'ETC1S',mipmaps:true},geometry:{triangles:103930,originalTopology:true},magicEffectsEnabled:true,magicEffect:'replaceable-red-line-prototype',style:{pbr:false,outlinePixels:.5,internalLineStrength:.2,brightness:1.35,contactGround:true}});
await writeFile(resolve(root,'public/assets/elena.json'),JSON.stringify(config,null,2)+'\n');
const report={sourceClips:sourceClips.length,runtimeClips:config.catalog.length,files:packed.files.size,bytes:[...packed.files.values()].reduce((n,f)=>n+f.data.length,0),meshopt:packed.stats,paths:[...packed.files.keys()].map(n=>'ArcherPreview/public/assets/content/'+n)};
await writeFile(resolve(review,'pack-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,paths:undefined}));
