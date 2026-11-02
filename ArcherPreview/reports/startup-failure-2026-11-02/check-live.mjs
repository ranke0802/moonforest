import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://ranke0802.github.io/moonforest/ArcherPreviewSite/',names=['warrior-v3','warrior-v3-ios','witch-cave','witch-cave-ground','resource-index','sky','environment','ktx2-decoder','meshopt-decoder','elena'];
const rows=[];
for(const name of names){const path=`assets/${name}.json`;try{const response=await fetch(base+path,{cache:'no-store',signal:AbortSignal.timeout(30000)}),text=await response.text();let parsed;try{parsed=JSON.parse(text);}catch{}const local=await readFile(new URL('../../public/'+path,import.meta.url));rows.push({path,status:response.status,bytes:text.length,json:!!parsed,localEqual:parsed?JSON.stringify(parsed)===JSON.stringify(JSON.parse(local)):false,sha256:createHash('sha256').update(text).digest('hex')});}catch(e){rows.push({path,error:e.message});}}
await writeFile(new URL('./live-manifests.json',import.meta.url),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
