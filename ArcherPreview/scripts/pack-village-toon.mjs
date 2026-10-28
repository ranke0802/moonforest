import {readFile,writeFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash} from './resource-pack.js';

export function colorOnlyVillageModel(input){
  const g=structuredClone(input),images=[],textures=[];
  for(const material of g.materials??[]){
    const pbr=material.pbrMetallicRoughness??{},base=pbr.baseColorTexture;
    if(!base)throw new Error('Painted village model has no base-color texture');
    const texture=g.textures[base.index],image=g.images[texture.source];
    const next=textures.length;textures.push({...texture,source:images.length});images.push(image);
    delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;
    delete material.emissiveFactor;delete material.extensions;
    material.pbrMetallicRoughness={...pbr,baseColorTexture:{...base,index:next},metallicFactor:0,roughnessFactor:1};
    delete material.pbrMetallicRoughness.metallicRoughnessTexture;
  }
  g.images=images;g.textures=textures;
  for(const key of ['extensionsUsed','extensionsRequired'])if(g[key])g[key]=g[key].filter(name=>!name.startsWith('KHR_materials_'));
  return g;
}

export async function packVillageToon(root=resolve(import.meta.dirname,'../public/assets')){
  const manifest=JSON.parse(await readFile(resolve(root,'village.json'),'utf8'));
  for(const asset of Object.values(manifest.assets)){
    asset.toonSourceModelSha256??=basename(asset.lods[0].model,'.gltf');
    for(const lod of [...asset.lods,asset.mobileNear]){
      const original=JSON.parse(await readFile(resolve(root,lod.model),'utf8')),g=colorOnlyVillageModel(original);
      // Materials alone may change; every geometry/accessor/transform stays exact.
      for(const key of ['buffers','bufferViews','accessors','meshes','nodes','scenes'])if(JSON.stringify(original[key])!==JSON.stringify(g[key]))throw new Error('Geometry changed: '+key);
      const bytes=Buffer.from(JSON.stringify(g)),model='./content/'+hash(bytes)+'.gltf';
      await writeFile(resolve(root,model),bytes);lod.model=model;lod.normalMap=false;
      lod.resources=[model,...[...g.buffers,...g.images].map(item=>'./content/'+item.uri)];
      lod.bytes=0;for(const ref of new Set(lod.resources))lod.bytes+=(await readFile(resolve(root,ref))).length;
    }
    const high=asset.highTextures;
    high.textures={albedo:high.textures.albedo};high.resources=[high.textures.albedo.url];high.shading='toon-color';
  }
  manifest.geometryLod.textureProfile='mobile-4k-toon-color-v1';
  manifest.shading='painted-toon-shadow';
  await writeFile(resolve(root,'village.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({assets:Object.keys(manifest.assets).length,shading:manifest.shading,nearColorMax:4096,auxiliaryMaps:0}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await packVillageToon();
