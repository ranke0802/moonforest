import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {caveCollisionManifest} from './cave-collision-source.mjs';

// Content-addressed model URLs identify the exact buffers they reference. Verify
// their actual files too, so editing a buffer under its old name cannot pass QA.
function fingerprint(manifest){
  const hash=createHash('sha256');
  for(const file of ['witch-cave-layout.js','cave-natural-dressing-data.js','cave-laboratory-vault.js','cave-lantern-mounts.js','witch-cave-terrain.js','cave-laboratory-geometry.js','cave-laboratory-terrain-data.js'])hash.update(readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/\r\n?/g,'\n'));
  const base=new URL('../public/assets/',import.meta.url);
  for(const [id,asset]of Object.entries(manifest.assets).sort(([a],[b])=>a.localeCompare(b))){
    hash.update(JSON.stringify({id,bounds:asset.bounds,height:asset.height,frontYawOffset:asset.frontYawOffset??0}));
    const model=new URL(asset.lods[0].model,base),bytes=readFileSync(model),digest=createHash('sha256').update(bytes).digest('hex');
    if(model.pathname.split('/').at(-1).split('.')[0]!==digest)throw Error('Changed near model under an old hash: '+id);
    hash.update(id).update(digest);
    for(const buffer of JSON.parse(bytes).buffers??[])if(buffer.uri){
      const url=new URL(buffer.uri,model),actual=createHash('sha256').update(readFileSync(url)).digest('hex');
      if(url.pathname.split('/').at(-1).split('.')[0]!==actual)throw Error('Changed geometry under an old hash: '+id);
      hash.update(actual);
    }
  }
  return hash.digest('hex');
}

// Body, sight, camera, native distances and edit ownership retain the actual
// pre-budget collision epoch. Their cells are independent of render LOD swaps.
export function caveSourceFingerprint(){
 const current=JSON.parse(readFileSync(new URL('../public/assets/witch-cave.json',import.meta.url)));
 fingerprint(current); // Still verify every delivered render model/buffer hash.
 return fingerprint(caveCollisionManifest(current));
}

export function caveRenderSourceFingerprint(){return fingerprint(JSON.parse(readFileSync(new URL('../public/assets/witch-cave.json',import.meta.url))));}
