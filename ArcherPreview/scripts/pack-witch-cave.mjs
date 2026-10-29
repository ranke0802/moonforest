import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {NullEngine,Scene} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {hash} from './resource-pack.js';
import {CAVE_PLACEMENTS,CAVE_ROUTES,CAVE_ROOMS,CAVE_ASSET_IDS} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';

const source=resolve(process.env.CAVE_SOURCE??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/witch-cave-models/2026-10-29');
const root=resolve(import.meta.dirname,'../public/assets'),content=resolve(root,'content'),report=resolve(import.meta.dirname,'../reports/witch-cave-v5');
await mkdir(content,{recursive:true});await mkdir(report,{recursive:true});
const read=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const ledger=await read(resolve(source,'generation-ledger.json')),village=await read(resolve(root,'village.json')),forest=await read(resolve(root,'monster-forest.json'));
assert.equal(ledger.tasks.length,20);assert.equal(ledger.spentCredits,400);
assert.ok(ledger.tasks.every(t=>t.status==='LOCAL_REVIEW_PASSED'&&t.attempts===1&&t.qualityReview?.result==='PASS'));
const assets={},engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const put=async(bytes,ext)=>{const url='./content/'+hash(bytes)+'.'+ext;await writeFile(resolve(root,url),bytes);return url;};
for(const id of CAVE_ASSET_IDS){
  const original=await read(resolve(source,'runtime/assets',id+'.json'));
  for(const tier of original.lods)for(const url of tier.resources){
    const bytes=await readFile(resolve(source,'runtime',url));assert.equal(hash(bytes),basename(url).split('.')[0]);await copyFile(resolve(source,'runtime',url),resolve(content,basename(url)));
  }
  const {gltf,files}=await readRuntimeGltf(pathToFileURL(resolve(source,'runtime',original.lods[0].model)));
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const mesh of container.meshes)if(mesh.getTotalVertices()>0){mesh.computeWorldMatrix(true);const b=mesh.getBoundingInfo().boundingBox;for(const [i,axis]of ['x','y','z'].entries()){min[i]=Math.min(min[i],b.minimumWorld[axis]);max[i]=Math.max(max[i],b.maximumWorld[axis]);}}
  // The 5,000-triangle rock reduction shifts its lowest vertex by up to 3.5 mm.
  // Keep the authored origin shared by every LOD instead of introducing a jump.
  const bounds=max.map((n,i)=>n-min[i]);container.dispose();assert.ok(bounds.every(x=>Number.isFinite(x)&&x>0));assert.ok(Math.abs(min[1])<.005,JSON.stringify({id,min,max}));
  const lods=structuredClone(original.lods),near=await read(resolve(root,lods[0].model)),medium=await read(resolve(root,lods[1].model));
  const highUrl='./content/'+near.images[0].uri;near.images[0].uri=medium.images[0].uri;
  const model=await put(Buffer.from(JSON.stringify(near)),'gltf');
  const resources=[model,...near.buffers.filter(b=>b.uri).map(b=>'./content/'+b.uri),...near.images.map(i=>'./content/'+i.uri)];
  const bytes=(await Promise.all(resources.map(async r=>(await readFile(resolve(root,r))).length))).reduce((a,b)=>a+b,0);
  lods[0]={...lods[0],model,resources,bytes,textureSize:1024};
  const highBytes=(await readFile(resolve(root,highUrl))).length;
  assets[id]={name:ledger.tasks.find(t=>t.id===id).name,category:Number(id.slice(5,7))<=7?'rock':'prop',bounds,height:bounds[1],frontYawOffset:0,geometryLod:true,lods,mobileNear:structuredClone(lods[0]),
    highTextures:{shading:'toon-color',textures:{albedo:{url:highUrl,width:4096,height:4096,bytes:highBytes,codec:'etc1s',alpha:false,gpuBlockBytes:8}},resources:[highUrl]},visualReview:'APPROVED'};
}
engine.dispose();
const reuse=[...new Set(CAVE_PLACEMENTS.map(p=>p.asset))].filter(id=>!CAVE_ASSET_IDS.includes(id));
for(const id of reuse){const existing=village.assets[id]??forest.assets[id];assert.ok(existing,id);assets[id]=structuredClone(existing);}
const manifest={version:1,id:'witch-cave',complete:true,availableAssetCount:Object.keys(assets).length,assets,homes:0,placementCount:CAVE_PLACEMENTS.length,newSourceModels:20,reusedSourceModels:reuse.length,spentCredits:400,sourceSettings:{aiModel:'meshy-t2.5',modelType:'smart-topology',targetPolycount:5000,textureResolution:8192,autoSize:true,enablePbr:false},compression:{format:'KTX2/Basis',defaultCodec:'etc1s',maxResolution:4096},meshCompression:{format:'EXT_meshopt_compression',lossless:true},geometryLod:{nearColorResolution:4096},groundManifest:'witch-cave-ground'};
await writeFile(resolve(root,'witch-cave.json'),JSON.stringify(manifest,null,2)+'\n');
const terrain=createWitchCaveTerrain();
await writeFile(resolve(report,'layout.json'),JSON.stringify({routes:CAVE_ROUTES,rooms:CAVE_ROOMS,placements:CAVE_PLACEMENTS}));
await writeFile(resolve(report,'review-scene.json'),JSON.stringify({assets,terrain:{size:terrain.size,subdivisions:terrain.subdivisions,heights:Array.from(terrain.heights)}}));
console.log(JSON.stringify({types:Object.keys(assets).length,placements:CAVE_PLACEMENTS.length,reuse,paidCredits:400}));
