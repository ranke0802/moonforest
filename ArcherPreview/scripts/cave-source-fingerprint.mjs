import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Content-addressed model URLs identify the exact buffers they reference. Verify
// their actual files too, so editing a buffer under its old name cannot pass QA.
export function caveSourceFingerprint(){
  const hash=createHash('sha256');
  for(const file of ['witch-cave-layout.js','witch-cave-terrain.js','cave-laboratory-geometry.js','cave-laboratory-terrain-data.js'])hash.update(readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/\r\n?/g,'\n'));
  const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base)));
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
