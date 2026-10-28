import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {splitGlb,hash} from './resource-pack.js';
import {simplifyGeometry,readAccessor} from './web-geometry.js';
import {warriorWebPolicy} from './warrior-web-policy.js';

export const R6_SHA256='1ac9d3f9fd4bc5775555298c5c6b07e6712e831ab68c91f8c7914bc15f19b63a';
const root=resolve(import.meta.dirname,'..');
const accessorBytes=(pack,index)=>{
  const data=readAccessor(pack.gltf,pack.files,index);
  return Buffer.from(data.buffer,data.byteOffset,data.byteLength);
};

// A cape-only update must not silently change the approved body, attachments,
// UVs, weights, materials, root motion, timing or controller clip mapping.
export function verifyCapeRevision(previous,next){
  const a=previous.gltf,b=next.gltf;
  for(const key of ['nodes','meshes','skins','materials','textures','images','samplers','scenes','scene'])assert.deepEqual(b[key],a[key],key+' changed');
  const geometry=new Set();
  for(const mesh of a.meshes)for(const p of mesh.primitives){
    geometry.add(p.indices);for(const i of Object.values(p.attributes))geometry.add(i);
    for(const target of p.targets??[])for(const i of Object.values(target))geometry.add(i);
  }
  for(const skin of a.skins??[])geometry.add(skin.inverseBindMatrices);
  for(const i of geometry)if(i!==undefined)assert.deepEqual(accessorBytes(next,i),accessorBytes(previous,i),'geometry/skin accessor '+i);
  assert.equal(b.animations.length,9);assert.equal(a.animations.length,9);
  const capeNode=b.nodes.find(n=>n.name==='Warrior_Cape'),capeJoints=new Set(b.skins[capeNode.skin].joints);
  const changed={};let preservedChannels=0;
  for(let i=0;i<a.animations.length;i++){
    const old=a.animations[i],clip=b.animations[i];assert.equal(clip.name,old.name);assert.deepEqual(clip.channels,old.channels);
    changed[clip.name]=0;
    for(const channel of clip.channels){
      const before=old.samplers[channel.sampler],after=clip.samplers[channel.sampler];
      assert.equal(after.interpolation??'LINEAR',before.interpolation??'LINEAR');
      assert.deepEqual(accessorBytes(next,after.input),accessorBytes(previous,before.input),'clip timing');
      if(!accessorBytes(next,after.output).equals(accessorBytes(previous,before.output))){
        assert.match(b.nodes[channel.target.node].name,/^DEF-Cloth\./,'non-cape animation changed');
        assert.ok(capeJoints.has(channel.target.node),'changed joint is not in cape skin');changed[clip.name]++;
      }else preservedChannels++;
    }
  }
  assert.ok(Object.values(changed).some(n=>n>0),'candidate must actually update cape motion');
  return {clips:9,geometryAndSkinAccessorsPreserved:geometry.size,preservedChannels,changedCapeChannels:changed};
}

export async function packVillageWarrior(){
  const input=await readFile(resolve(root,'assets/models/violet-warrior-v3.glb'));
  assert.equal(hash(input),R6_SHA256,'unreviewed R6 source');
  const before=splitGlb(await readFile(resolve(root,'assets/models/violet-warrior-v2.glb'))),source=splitGlb(input);
  const verification=verifyCapeRevision(before,source);
  const result=await simplifyGeometry(source.gltf,source.files,warriorWebPolicy);
  const base=resolve(root,'public/assets');await mkdir(resolve(base,'content'),{recursive:true});
  const profile=JSON.parse(await readFile(resolve(root,'assets/warrior-v3-textures.json'),'utf8'));
  assert.equal(profile.sourceSha256,R6_SHA256);assert.equal(profile.maxSize,4096);
  const replaced=new Map(),webpImages=new Set();
  result.files.delete(result.model);
  for(const [index,image]of result.gltf.images.entries()){
    const oldUri=image.uri,record=profile.images[hash(result.files.get(oldUri)?.data??source.files.get(oldUri).data)];
    assert.ok(record&&record.width<=4096&&record.height<=4096&&record.pixelExactAfterResize,'missing validated 4K texture');
    const bytes=await readFile(resolve(base,'content',record.uri));
    assert.equal(hash(bytes),record.uri.split('.')[0]);assert.equal(bytes.length,record.bytes);
    replaced.set(oldUri,record.uri);image.uri=record.uri;image.mimeType=record.mimeType;
    result.files.set(record.uri,{data:bytes,type:record.mimeType});
    if(record.mimeType==='image/webp')webpImages.add(index);
  }
  for(const [oldUri,newUri]of replaced)if(oldUri!==newUri)result.files.delete(oldUri);
  if(webpImages.size){
    for(const texture of result.gltf.textures)if(webpImages.has(texture.source)){
      texture.extensions={...texture.extensions,EXT_texture_webp:{source:texture.source}};delete texture.source;
    }
    result.gltf.extensionsUsed=[...new Set([...(result.gltf.extensionsUsed??[]),'EXT_texture_webp'])];
    result.gltf.extensionsRequired=[...new Set([...(result.gltf.extensionsRequired??[]),'EXT_texture_webp'])];
  }
  const json=Buffer.from(JSON.stringify(result.gltf));result.model=hash(json)+'.gltf';result.files.set(result.model,{data:json});
  for(const [name,{data}]of result.files)await writeFile(resolve(base,'content',name),data);
  const config=JSON.parse(await readFile(resolve(base,'warrior-v2.json'),'utf8'));
  config.model='./content/'+result.model;config.resources=[...result.files.keys()].map(n=>'./content/'+n);
  config.version='전사 v3 · V6 망토 R6 수정본 / 9개 모션';config.modelRevision='v6-cape-r6-fix1-'+R6_SHA256.slice(0,8);
  config.textureProfile={maxSize:4096,encoding:'lossless-webp',sourceSha256:R6_SHA256};
  await writeFile(resolve(base,'warrior-v3.json'),JSON.stringify(config,null,2)+'\n');
  const report={sourceSha256:R6_SHA256,model:result.model,verification,stats:result.stats,textures:profile,bytes:[...result.files.values()].reduce((n,f)=>n+f.data.length,0)};
  await writeFile(resolve(root,'reports/village-warrior-r6.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await packVillageWarrior();
