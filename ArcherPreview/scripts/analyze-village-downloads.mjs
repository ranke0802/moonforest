// Read-only size experiment. No published model, texture, LOD or manifest changes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {hash} from './resource-pack.js';
const root=resolve(import.meta.dirname,'../public/assets');
const out=resolve(process.argv[2]??'reports/download-analysis');await mkdir(out,{recursive:true});
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const village=await read(resolve(root,'village.json')),warrior=await read(resolve(root,'warrior-v3.json'));
const models=new Map(),files=new Map();
async function model(path){
  const absolute=resolve(root,path);if(models.has(absolute))return models.get(absolute);
  const g=await read(absolute);models.set(absolute,g);return g;
}
async function bytes(path){const absolute=resolve(root,path);if(!files.has(absolute))files.set(absolute,await readFile(absolute));return files.get(absolute);}
async function graph(config){
  const refs=new Set(config.resources??[]);
  if(config.model){refs.add(config.model);const g=await model(config.model);for(const item of [...g.buffers,...g.images])refs.add('./content/'+item.uri);}
  const totals={};let total=0;
  for(const path of refs){const length=(await bytes(path)).length;total+=length;const key=extname(path);totals[key]=(totals[key]??0)+length;}
  return {bytes:total,byType:totals,files:refs.size};
}
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
async function losslessMeshopt(paths){
  const buffers=new Map(),views=new Map();let verified=0;
  for(const path of paths){
    const g=await model(path);
    for(const b of g.buffers)buffers.set(b.uri,await bytes('./content/'+b.uri));
    for(let i=0;i<g.bufferViews.length;i++){
      const v=g.bufferViews[i],a=g.accessors.find(a=>a.bufferView===i);assert.ok(a&&!a.sparse);
      const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],size={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a.componentType];
      const stride=v.byteStride??components*size,mode=v.target===34963?'INDICES':'ATTRIBUTES';
      const data=buffers.get(g.buffers[v.buffer].uri).subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
      const key=hash(data)+':'+stride+':'+mode;if(views.has(key))continue;
      if(v.byteLength%stride||mode==='ATTRIBUTES'&&(stride%4||stride>256)){views.set(key,{raw:data.length,encoded:data.length,skipped:true});continue;}
      const count=v.byteLength/stride,encoded=MeshoptEncoder.encodeGltfBuffer(data,count,stride,mode,0),decoded=new Uint8Array(data.length);
      MeshoptDecoder.decodeGltfBuffer(decoded,count,stride,encoded,mode);assert.ok(Buffer.from(decoded).equals(data),'lossless round trip');verified++;
      views.set(key,{raw:data.length,encoded:Math.min(data.length,encoded.length)});
    }
  }
  return {originalUniqueBufferBytes:[...buffers.values()].reduce((n,b)=>n+b.length,0),deduplicatedViewBytes:[...views.values()].reduce((n,v)=>n+v.raw,0),encodedPayloadBytes:[...views.values()].reduce((n,v)=>n+v.encoded,0),verifiedViews:verified,skippedViews:[...views.values()].filter(v=>v.skipped).length,note:'Lossless sample payload only; runtime integration needs extension metadata and decoder. No quantization, reordering or LOD change.'};
}
const villagePaths=[...new Set(Object.values(village.assets).flatMap(a=>[...a.lods,a.mobileNear].map(t=>t.model)))];
const villageMesh=await losslessMeshopt(villagePaths),warriorMesh=await losslessMeshopt([warrior.model]);
const character=await graph(warrior),imageList=[];
for(const im of (await model(warrior.model)).images){const p=resolve(root,'content',im.uri);imageList.push({path:p,bytes:(await readFile(p)).length});}
const near=Object.fromEntries(Object.entries(village.assets).map(([id,a])=>[id,a.highTextures.textures.albedo.bytes]));
const report={villageMeshopt:villageMesh,warriorMeshopt:warriorMesh,warrior:character,warriorImages:imageList,nearTextureBytes:near,notes:['Existing village KTX2 codec and 4K cap remain unchanged.','Character and village geometry stay at the current LOD and full float precision.','This is an offline analysis, not a shipped compression change.']};
await writeFile(resolve(out,'download-analysis.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({villageMesh,warriorMesh,character,images:imageList}));
