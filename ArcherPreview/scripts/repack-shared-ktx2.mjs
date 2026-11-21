// Second half of apply-shared-ktx2.py for the published site: the release check wants the resource
// index to list exactly the content the manifests use. Drops the replaced JPG/PNG and glTF names
// from the index, rebuilds the five download packs that carried them (same member order, the new
// glTF in the old one's place; same gzip settings as resource-bundles.mjs), and updates the 0.1
// inventory. Removes the replaced files and packs from the site folder.
import {readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {verifyResourceBundles} from './resource-bundles.mjs';
const site=resolve(import.meta.dirname,'../../ArcherPreviewSite'),assets=resolve(site,'assets');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const names=async()=>Object.keys(JSON.parse(await readFile(resolve(assets,'resource-index.json'),'utf8')).files);
const pick=(all,prefix)=>{const found=all.filter(name=>name.startsWith(prefix));if(found.length!==1)throw new Error('Expected one file for '+prefix);return found[0];};
const index=JSON.parse(await readFile(resolve(assets,'resource-index.json'),'utf8')),all=Object.keys(index.files);
const renamed=Object.entries({'0913c927':'70f9ae66','1011a8ce':'86ebcf5f','97f04d98':'6f2a572c','a1b992ec':'d0f77247','c8d98d90':'95775b6d'}).map(([from,to])=>[pick(all,from),pick(all,to)]);
const dropped=['a22ee8b1e9ac7a3b','a7a6bc98a461f098','1b34cc211da0bfae'].map(prefix=>pick(all,prefix));
const gone=new Set([...renamed.map(([from])=>from),...dropped]),replace=new Map(renamed),removedPacks=[],addedPacks=[];
for(const pack of index.bundles){
  if(!pack.files.some(name=>gone.has(name)))continue;
  const files=pack.files.filter(name=>!dropped.includes(name)).map(name=>replace.get(name)??name);
  if(files.length<2)throw new Error('A pack would hold fewer than two files: '+pack.url);
  const raw=Buffer.concat(await Promise.all(files.map(name=>readFile(resolve(assets,'content',name))))),encoded=gzipSync(raw,{level:6}),url='bundles/'+hash(encoded)+'.mfp.gz';
  await writeFile(resolve(assets,url),encoded);removedPacks.push(pack.url);addedPacks.push(url);
  Object.assign(pack,{url,bytes:encoded.length,unpackedBytes:raw.length,files});
}
for(const name of gone)delete index.files[name];
index.files=Object.fromEntries(Object.entries(index.files).sort(([a],[b])=>a.localeCompare(b)));
index.bundles.sort((a,b)=>a.url.localeCompare(b.url));
index.revision=hash(JSON.stringify({files:index.files,bundles:index.bundles}));
await writeFile(resolve(assets,'resource-index.json'),JSON.stringify(index)+'\n');
const inventoryPath=resolve(site,'deployment-files.json'),inventory=JSON.parse(await readFile(inventoryPath,'utf8'));
const leaving=new Set([...[...gone].map(name=>'assets/content/'+name),...removedPacks.map(url=>'assets/'+url)]);
const entries=new Map(inventory.files.filter(item=>!leaving.has(item.path)).map(item=>[item.path,item]));
for(const path of ['assets/resource-index.json',...addedPacks.map(url=>'assets/'+url)]){const bytes=await readFile(resolve(site,path));entries.set(path,{path,bytes:bytes.length,sha256:hash(bytes)});}
inventory.files=[...entries.values()];// existing order kept, new paths last
inventory.bytes=inventory.files.reduce((sum,item)=>sum+item.bytes,0);inventory.resourceRevision=index.revision;
await writeFile(inventoryPath,JSON.stringify(inventory,null,2)+'\n');
for(const path of leaving)await rm(resolve(site,path),{force:true});
console.log(JSON.stringify({...(await verifyResourceBundles(site,index)),repacked:addedPacks.length,removed:leaving.size}));
