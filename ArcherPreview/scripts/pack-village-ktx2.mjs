import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash} from './resource-pack.js';

const root=resolve(import.meta.dirname,'..');
export function basisModel(model,images){
  const g=structuredClone(model);g.images=images;
  for(const t of g.textures??[]){
    const source=t.extensions?.EXT_texture_webp?.source??t.source;
    if(source===undefined)throw new Error('Missing source image');
    delete t.source;
    t.extensions={...t.extensions,KHR_texture_basisu:{source}};delete t.extensions.EXT_texture_webp;
  }
  for(const key of ['extensionsUsed','extensionsRequired'])g[key]=[...(g[key]??[]).filter(x=>x!=='EXT_texture_webp'&&x!=='KHR_texture_basisu'),'KHR_texture_basisu'];
  return g;
}

export async function packVillageKtx2({output=process.env.VILLAGE_KTX2_DIR??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/village-warrior-v3/2026-10-28/ktx2',publicRoot=resolve(root,'public')}={}){
  const assets=resolve(publicRoot,'assets'),content=resolve(assets,'content');await mkdir(content,{recursive:true});
  const read=async p=>JSON.parse(await readFile(p,'utf8'));
  const approvals=await read(resolve(output,'approval.json')),ledger=await read(resolve(output,'conversions.json'));
  if(approvals.review!=='APPROVED')throw new Error('KTX2 visual review required');
  const manifest=await read(resolve(assets,'village.json')),ground=await read(resolve(assets,'village-ground.json'));
  const before=await read(resolve(output,'village-before.json'));
  // Repacking is idempotent. A new upstream pack must still match the reviewed input.
  if(manifest.compression?.inputManifestSha256!==hash(Buffer.from(JSON.stringify(before)))&&JSON.stringify(manifest)!==JSON.stringify(before))throw new Error('Village changed since compression review');
  const target=structuredClone(before),stored=new Map();
  async function put(bytes,ext){const name=hash(bytes)+'.'+ext;if(!stored.has(name)){await writeFile(resolve(content,name),bytes);stored.set(name,bytes.length);}return name;}
  async function texture(url,codec='etc1s'){
    const source=basename(url).split('.')[0],profile=codec==='uastc'?(approvals.uastcProfile??codec):codec,row=ledger[source+'-'+profile];
    if(!row||row.width>4096)throw new Error('Missing bounded KTX2 conversion: '+source);
    const original=await readFile(row.source),bytes=await readFile(resolve(output,row.file));
    if(hash(original)!==source||hash(bytes)!==row.sha256)throw new Error('Compression content hash mismatch');
    const name=await put(bytes,'ktx2');return {url:'./content/'+name,width:row.width,height:row.height,bytes:bytes.length,codec,alpha:row.alpha,gpuBlockBytes:codec==='uastc'||row.alpha?16:8};
  }
  const models=new Map();
  for(const [id,asset]of Object.entries(target.assets)){
    for(const tier of [...asset.lods,asset.mobileNear]){
      if(!models.has(tier.model)){
        const g=await read(resolve(assets,tier.model)),images=[];
        for(const im of g.images??[]){const t=await texture('./content/'+im.uri);images.push({...im,uri:basename(t.url),mimeType:'image/ktx2'});}
        const packed=basisModel(g,images),bytes=Buffer.from(JSON.stringify(packed));
        const name=await put(bytes,'gltf'),resources=['./content/'+name,...g.buffers.map(b=>'./content/'+b.uri),...images.map(i=>'./content/'+i.uri)];
        let total=0;for(const r of resources)total+=(await readFile(resolve(assets,r))).length;
        models.set(tier.model,{model:'./content/'+name,resources,bytes:total});
      }
      Object.assign(tier,models.get(tier.model));
    }
    const high=asset.highTextures,codec=approvals.uastcAssets.includes(id)?'uastc':'etc1s';
    high.textures.albedo=await texture(high.textures.albedo.url,codec);high.resources=[high.textures.albedo.url];
    high.colorEncoding=`KTX2 ${codec.toUpperCase()} / sRGB / full mip chain`;
  }
  const baselineGround=await read(resolve(output,'village-ground-before.json'));
  Object.assign(ground,baselineGround);ground.color=await texture(ground.color.url,approvals.uastcAssets.includes('ground')?'uastc':'etc1s');
  ground.resources=[ground.color.url,ground.detail.url];ground.gpuBytesWithMips=Math.ceil(2048**2*4/3+256**2*4*4/3);
  ground.compression='KTX2 color; lossless linear packed detail';
  target.compression={format:'KTX2/Basis',defaultCodec:'etc1s',uastcAssets:approvals.uastcAssets,maxResolution:4096,sequential:true,inputManifestSha256:hash(Buffer.from(JSON.stringify(before)))};
  await writeFile(resolve(assets,'village.json'),JSON.stringify(target,null,2)+'\n');
  await writeFile(resolve(assets,'village-ground.json'),JSON.stringify(ground,null,2)+'\n');
  console.log(JSON.stringify({assets:25,images:stored.size-models.size,models:models.size,uastcAssets:approvals.uastcAssets}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await packVillageKtx2();
