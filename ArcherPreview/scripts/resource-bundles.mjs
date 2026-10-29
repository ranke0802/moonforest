import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {CONTENT_NAME,RESOURCE_PACK_LIMITS,validateResourceIndex} from '../src/resource-index.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contentName=value=>typeof value==='string'&&/^(?:\.\/)?content\//.test(value)&&CONTENT_NAME.test(value.split('/').at(-1))?value.split('/').at(-1):null;
export async function buildResourceBundles(publicRoot,inventory){
  const assets=resolve(publicRoot,'assets'),files=Object.fromEntries([...inventory].filter(([path])=>path.startsWith('assets/content/')).map(([path,info])=>[path.split('/').at(-1),info.bytes]).sort(([a],[b])=>a.localeCompare(b)));
  const owners=new Map(Object.keys(files).map(name=>[name,new Set()]));
  const own=(name,key)=>{if(owners.has(name))owners.get(name).add(key);};
  for(const [path,info]of inventory)if(/^assets\/[^/]+\.json$/.test(path)&&!path.endsWith('resource-sizes.json')){
    const data=JSON.parse(await readFile(info.absolute,'utf8'));
    const visit=(value,key)=>{
      if(Array.isArray(value)&&value.length&&value.every(v=>contentName(v))){for(const v of value)own(contentName(v),'array:'+key);return;}
      if(Array.isArray(value)){value.forEach((v,i)=>visit(v,key+'.'+i));return;}
      if(value&&typeof value==='object'){for(const [k,v]of Object.entries(value))visit(v,key+'.'+k);return;}
      // Scalar URLs share their manifest's bundle; arrays use the precise asset
      // /LOD/profile group, so distant tiers are never pulled into startup.
      const name=contentName(value);if(name)own(name,'manifest:'+path);
    };visit(data,path);
  }
  const groups=new Map();
  for(const [name,size]of Object.entries(files)){
    if(size>RESOURCE_PACK_LIMITS.member||!owners.get(name).size)continue;
    const all=[...owners.get(name)],arrays=all.filter(key=>key.startsWith('array:'));
    const key=(arrays.length?arrays:all).sort().join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(name);
  }
  const bundles=[];await mkdir(resolve(assets,'bundles'),{recursive:true});
  const pack=async names=>{
    if(names.length<2)return;
    const raw=Buffer.concat(await Promise.all(names.map(name=>readFile(resolve(assets,'content',name))))),encoded=gzipSync(raw,{level:6});
    if(encoded.length>=raw.length+1024)return;
    const url='bundles/'+hash(encoded)+'.mfp.gz';await writeFile(resolve(assets,url),encoded);
    bundles.push({url,bytes:encoded.length,unpackedBytes:raw.length,files:names});
  };
  for(const names of groups.values()){
    let part=[],bytes=0;
    for(const name of names){if(bytes+files[name]>RESOURCE_PACK_LIMITS.unpacked){await pack(part);part=[];bytes=0;}part.push(name);bytes+=files[name];}
    await pack(part);
  }
  bundles.sort((a,b)=>a.url.localeCompare(b.url));
  const revision=hash(JSON.stringify({files,bundles})),index=validateResourceIndex({version:1,revision,files,bundles});
  await writeFile(resolve(assets,'resource-index.json'),JSON.stringify(index)+'\n');
  return index;
}

export async function verifyResourceBundles(root,index,{verifyFiles=true}={}){
  validateResourceIndex(index);
  if(hash(JSON.stringify({files:index.files,bundles:index.bundles}))!==index.revision)throw new Error('Resource index revision mismatch');
  if(verifyFiles)for(const [name,size]of Object.entries(index.files)){
    const bytes=await readFile(resolve(root,'assets/content',name));
    if(bytes.length!==size||hash(bytes)!==name.slice(0,64))throw new Error('Indexed resource mismatch: '+name);
  }
  for(const pack of index.bundles){
    const bytes=await readFile(resolve(root,'assets',pack.url));
    if(bytes.length!==pack.bytes||hash(bytes)!==pack.url.slice(8,72))throw new Error('Bundle checksum mismatch');
    const raw=gunzipSync(bytes,{maxOutputLength:RESOURCE_PACK_LIMITS.unpacked});let offset=0;
    if(raw.length!==pack.unpackedBytes)throw new Error('Bundle extraction size mismatch');
    for(const name of pack.files){const size=index.files[name],part=raw.subarray(offset,offset+size);offset+=size;if(hash(part)!==name.slice(0,64))throw new Error('Extracted member differs: '+name);}
  }
  return {revision:index.revision,files:Object.keys(index.files).length,bundles:index.bundles.length,packedBytes:index.bundles.reduce((n,p)=>n+p.bytes,0),bundledFiles:index.bundles.reduce((n,p)=>n+p.files.length,0)};
}
