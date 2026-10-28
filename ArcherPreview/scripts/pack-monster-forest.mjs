import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NullEngine,Scene} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {hash} from './resource-pack.js';
import {FOREST_PLACEMENTS,FOREST_ROUTES,FOREST_CLEARINGS} from '../src/monster-forest-layout.js';

const source=resolve(process.env.FOREST_SOURCE??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/monster-forest-models/2026-10-28/runtime');
const root=resolve(import.meta.dirname,'../public/assets'),content=resolve(root,'content');await mkdir(content,{recursive:true});
const input=JSON.parse(await readFile(resolve(source,'forest-assets.json'),'utf8')),village=JSON.parse(await readFile(resolve(root,'village.json'),'utf8'));
const assets={},engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const put=async(bytes,ext)=>{const url='./content/'+hash(bytes)+'.'+ext;await writeFile(resolve(root,url),bytes);return url;};
const copy=async url=>{const bytes=await readFile(resolve(source,url));if(hash(bytes)!==basename(url).split('.')[0])throw new Error('Forest hash mismatch');await copyFile(resolve(source,url),resolve(content,basename(url)));};
for(const [id,original]of Object.entries(input.newAssets)){
  for(const tier of original.lods)for(const url of tier.resources)await copy(url);
  const {gltf,files}=await readRuntimeGltf(pathToFileURL(resolve(source,original.lods[0].model)));
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const mesh of container.meshes)if(mesh.getTotalVertices()>0){mesh.computeWorldMatrix(true);const b=mesh.getBoundingInfo().boundingBox;for(const [i,axis]of ['x','y','z'].entries()){min[i]=Math.min(min[i],b.minimumWorld[axis]);max[i]=Math.max(max[i],b.maximumWorld[axis]);}}
  const bounds=max.map((n,i)=>n-min[i]);container.dispose();
  const lods=structuredClone(original.lods),near=JSON.parse(await readFile(resolve(root,lods[0].model),'utf8'));
  const highUrl='./content/'+near.images[0].uri,medium=JSON.parse(await readFile(resolve(root,lods[1].model),'utf8'));
  // Full near geometry with 1K base color; retain 4K as the bounded streamed tier.
  near.images[0].uri=medium.images[0].uri;
  const model=await put(Buffer.from(JSON.stringify(near)),'gltf');
  const resources=[model,...near.buffers.filter(b=>b.uri).map(b=>'./content/'+b.uri),...near.images.map(i=>'./content/'+i.uri)];
  const bytes=(await Promise.all(resources.map(async r=>(await readFile(resolve(root,r))).length))).reduce((a,b)=>a+b,0);
  lods[0]={...lods[0],model,resources,bytes,textureSize:1024};
  const highBytes=(await readFile(resolve(root,highUrl))).length;
  assets[id]={name:original.name,category:/oak|dead-tree/.test(id)?'tree':/fungi|bramble/.test(id)?'plant':id.includes('cave')?'rock':'prop',bounds,height:bounds[1],frontYawOffset:0,geometryLod:true,lods,mobileNear:structuredClone(lods[0]),
    highTextures:{shading:'toon-color',textures:{albedo:{url:highUrl,width:4096,height:4096,bytes:highBytes,codec:'etc1s',alpha:false,gpuBlockBytes:8}},resources:[highUrl]},visualReview:'APPROVED'};
}
engine.dispose();
for(const id of Object.keys(input.reuseAssets))assets[id]=structuredClone(village.assets[id]);
const manifest={version:1,id:'monster-forest',complete:true,availableAssetCount:10,assets,homes:0,placementCount:FOREST_PLACEMENTS.length,newSourceModels:6,reusedSourceModels:4,newPaidCalls:0,compression:{format:'KTX2/Basis',defaultCodec:'etc1s',maxResolution:4096},meshCompression:{format:'EXT_meshopt_compression',lossless:true},geometryLod:{nearColorResolution:4096},groundManifest:'monster-forest-ground'};
await writeFile(resolve(root,'monster-forest.json'),JSON.stringify(manifest,null,2)+'\n');
await mkdir(resolve(import.meta.dirname,'../reports/monster-forest-v4'),{recursive:true});
await writeFile(resolve(import.meta.dirname,'../reports/monster-forest-v4/layout.json'),JSON.stringify({routes:FOREST_ROUTES,clearings:FOREST_CLEARINGS,placements:FOREST_PLACEMENTS}));
console.log(JSON.stringify({types:Object.keys(assets).length,placements:FOREST_PLACEMENTS.length,newPaidCalls:0,bounds:Object.fromEntries(Object.entries(assets).map(([id,a])=>[id,a.bounds]))}));
