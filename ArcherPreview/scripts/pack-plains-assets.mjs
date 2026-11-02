import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {splitGlb,hash} from './resource-pack.js';
import {compressMeshopt} from './meshopt-lossless.js';
import {PLAINS_PLACEMENTS,PLAINS_ROUTES,PLAINS_CLEARINGS,PLAINS_STREAM,PLAINS_SPAN} from '../src/great-plains-layout.js';

const root=resolve(import.meta.dirname,'..'),base=resolve(root,'public/assets'),content=resolve(base,'content');
const source=resolve(process.env.PLAINS_SOURCE??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/plains-implementation/2026-11-02-v1');
const python='C:/Users/ryank/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const work=resolve(root,'reports/great-plains-2026-11-02');await mkdir(work,{recursive:true});
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const generation=await read(resolve(source,'generation-results.json'));
const specs=[['apple',.10],['apple-pie',.25],['pet-food',.22],['contaminated-vial',.18],['clue-bandage',.4],['moon-dew-herb',.32],['memory-locket',.08],['goblin-club',.65],['clue-journal',.25],['clue-satchel',.36],['chest-common',.9],['waypost',2.2]];
const assets={},report=[];
const put=async (data,ext)=>{const name=hash(data)+'.'+ext;await writeFile(resolve(content,name),data);return name;};
for(const [id,longest]of specs){
 const folder=resolve(work,id);await mkdir(folder,{recursive:true});
 const bytes=await readFile(resolve(source,'models',id+'.glb')),input=splitGlb(bytes,{baseColorOnly:true});
 const g=input.gltf,files=input.files;
 if(g.nodes.length!==1||g.nodes[0].mesh===undefined)throw Error('Inspect model transform before packaging '+id);
 const positions=g.meshes.flatMap(m=>m.primitives.map(p=>g.accessors[p.attributes.POSITION]));
 const min=[0,1,2].map(i=>Math.min(...positions.map(a=>a.min[i]))),max=[0,1,2].map(i=>Math.max(...positions.map(a=>a.max[i]))),bounds=max.map((v,i)=>v-min[i]);
 delete g.nodes[0].matrix;g.nodes[0].translation=[-(min[0]+max[0])/2,-min[1],-(min[2]+max[2])/2];
 const albedo=g.materials[0].pbrMetallicRoughness.baseColorTexture.index,imageIndex=g.textures[albedo].source;
 const original=g.images[imageIndex];await writeFile(resolve(folder,'source.png'),files.get(original.uri).data);
 execFileSync(python,[resolve(import.meta.dirname,'plains-texture-tiers.py'),folder,resolve(folder,'source.png')],{stdio:'pipe',windowsHide:true});
 const lods=[],colorUrls={};
 for(const size of [2048,1024,512,256])colorUrls[size]=await put(await readFile(resolve(folder,`color-${size}.ktx2`)),'ktx2');
 for(const [level,size]of [[0,1024],[1,512],[2,256]]){
  const model=structuredClone(g),images=new Map(files),texture=model.textures[albedo];
  model.images[imageIndex]={uri:colorUrls[size],mimeType:'image/ktx2'};delete texture.source;
  texture.extensions={KHR_texture_basisu:{source:imageIndex}};
  model.extensionsUsed=[...new Set([...(model.extensionsUsed??[]),'KHR_texture_basisu'])];model.extensionsRequired=[...new Set([...(model.extensionsRequired??[]),'KHR_texture_basisu'])];
  images.set(colorUrls[size],{data:await readFile(resolve(content,colorUrls[size]))});
  const packed=await compressMeshopt(model,images);
  for(const [name,{data}]of packed.files)await writeFile(resolve(content,name),data);
  lods.push({level,model:'./content/'+packed.model,resources:[...packed.files.keys()].map(n=>'./content/'+n),bytes:[...packed.files.values()].reduce((n,f)=>n+f.data.length,0),textureSize:size});
 }
 const triangles=g.meshes.reduce((sum,m)=>sum+m.primitives.reduce((s,p)=>s+g.accessors[p.indices].count/3,0),0),job=generation.jobs.find(j=>j.slug===id);
 assets[id]={name:id,category:id==='moon-dew-herb'?'plant':'prop',bounds,height:bounds[1]/Math.max(...bounds)*longest,frontYawOffset:0,geometryLod:true,sharedLowPolyGeometry:true,lods,mobileNear:structuredClone(lods[0]),highTextures:{shading:'toon-color',textures:{albedo:{url:'./content/'+colorUrls[2048],width:2048,height:2048,bytes:(await readFile(resolve(content,colorUrls[2048]))).length,codec:'etc1s',alpha:false,gpuBlockBytes:8}},resources:['./content/'+colorUrls[2048]]},sourceTask:job.taskId,triangles};
 for(const lod of assets[id].lods)lod.triangles=triangles;assets[id].mobileNear.triangles=triangles;
 report.push({id,triangles,bounds,height:assets[id].height,task:job.taskId});console.log(id,triangles,'triangles');
}
const village=await read(resolve(base,'village.json')),environment=await read(resolve(base,'environment.json'));
const common={version:1,complete:true,shading:'painted-toon-shadow',sourceSettings:{aiModel:'meshy-t2.5',enablePbr:false,textureResolution:'2k'},compression:{format:'KTX2/Basis',defaultCodec:'etc1s',maxResolution:2048},meshCompression:{format:'EXT_meshopt_compression',lossless:true},geometryLod:{nearColorResolution:2048},homes:0};
await writeFile(resolve(base,'quest-props.json'),JSON.stringify({...common,id:'quest-props',availableAssetCount:12,assets},null,2));
const mapAssets={};for(const id of ['tree-01-round-oak','rock-01-mossy-boulder','rail-fence','covered-wagon','crate-barrel-cluster'])mapAssets[id]=structuredClone(village.assets[id]);
const grass=environment.assets['grass-tuft'];
// Keep existing grass geometry. Three small texture tiers use the same loader
// contract; no procedural replacement or paid regeneration is used.
const grassModel=await read(resolve(base,grass.model));const pos=grassModel.meshes.flatMap(m=>m.primitives.map(p=>grassModel.accessors[p.attributes.POSITION]));
const grassBounds=[0,1,2].map(i=>Math.max(...pos.map(a=>a.max[i]))-Math.min(...pos.map(a=>a.min[i])));
const grassTier=level=>({level,model:grass.model,resources:grass.resources,bytes:grass.bytes??0,textureSize:1024});
mapAssets['grass-tuft']={name:'풀 군락',category:'plant',bounds:grassBounds,height:.42,frontYawOffset:0,geometryLod:true,lods:[0,1,2].map(grassTier),mobileNear:grassTier(0)};
for(const id of ['waypost','clue-bandage','chest-common'])mapAssets[id]=assets[id];
await writeFile(resolve(base,'great-plains.json'),JSON.stringify({...common,id:'great-plains',availableAssetCount:Object.keys(mapAssets).length,assets:mapAssets,placementCount:PLAINS_PLACEMENTS.length,newSourceModels:3,reusedSourceModels:6,groundManifest:'great-plains-ground'},null,2));
await writeFile(resolve(work,'layout.json'),JSON.stringify({span:PLAINS_SPAN,routes:PLAINS_ROUTES,clearings:PLAINS_CLEARINGS,stream:PLAINS_STREAM,placements:PLAINS_PLACEMENTS}));
await writeFile(resolve(work,'asset-build.json'),JSON.stringify({credits:180,assets:report,placements:PLAINS_PLACEMENTS.length},null,2));
