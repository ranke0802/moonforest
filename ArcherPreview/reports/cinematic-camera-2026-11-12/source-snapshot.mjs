import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../../..'),dir=import.meta.dirname;
const file=path.join(dir,'tested-sources.json');
const hash=p=>createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
if(process.argv[2]==='capture'){
  const prior=JSON.parse(fs.readFileSync(file,'utf8'));
  const backup=path.join(dir,'tested-sources-before-runtime-split.json');
  if(!fs.existsSync(backup))fs.copyFileSync(file,backup);
  const files=[...new Set([...prior.files.map(row=>row.path),'ArcherPreview/src/scenery-distance-state.js'])].sort().map(p=>({path:p,sha256:hash(p),bytes:fs.statSync(path.join(root,p)).size}));
  fs.writeFileSync(file,JSON.stringify({capturedAt:new Date().toISOString(),scope:'Final source after separating lightweight runtime state from lazy cinematic lifecycle',files},null,2)+'\n');
  for(const name of ['regression.log','regression.json'])if(fs.existsSync(path.join(dir,name))&&!fs.existsSync(path.join(dir,'before-split-'+name)))fs.copyFileSync(path.join(dir,name),path.join(dir,'before-split-'+name));
  console.log(JSON.stringify({captured:files.length}));
}else{
  const snapshot=JSON.parse(fs.readFileSync(file,'utf8'));
  const changed=snapshot.files.filter(row=>hash(row.path)!==row.sha256).map(row=>row.path);
  assert.deepEqual(changed,[],'Source changed after final snapshot');
  console.log(JSON.stringify({sourceUnchanged:true,files:snapshot.files.length}));
}
