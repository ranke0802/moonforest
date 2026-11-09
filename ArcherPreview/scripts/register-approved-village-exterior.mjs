import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {projectRoot,sourcePath} from '../../Sources/resolve-source.mjs';

// Register only this explicitly reviewed exterior. Do not change other inputs.
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const planPath=sourcePath('village-exterior-shell-review','runtime','plan.json');
const planBytes=fs.readFileSync(planPath);
assert.equal(digest(planBytes),'1e632a699678042941b62f2aa80d582f2fea94d8d015dfc983ed736044602cfd');
const plan=JSON.parse(planBytes);assert.equal(plan.assetId,'village-approach');
const files=[{name:'plan.json',sha256:digest(planBytes),bytes:planBytes.length},...plan.stagedFiles];
const unique=new Set(),inputs=[];
for(const file of files){
 assert.match(file.name,/^[a-zA-Z0-9._-]+$/);assert.ok(!unique.has(file.name));unique.add(file.name);
 const absolute=sourcePath('village-exterior-shell-review','runtime',file.name),data=fs.readFileSync(absolute);
 assert.equal(data.length,file.bytes,file.name);assert.equal(digest(data),file.sha256,file.name);
 const relative=path.relative(projectRoot,absolute).replaceAll('\\','/');
 inputs.push({id:'file:'+relative,path:relative,bytes:data.length,sha256:digest(data),origins:['MoonForest user-approved village exterior review / 2026-11-09'],requiredBy:['village-exterior-shell-review'],status:'bundled'});
}
const registryPath=path.join(projectRoot,'Sources/source-inputs.json'),original=fs.readFileSync(registryPath),registry=JSON.parse(original);
for(const entry of inputs){const index=registry.inputs.findIndex(x=>x.id===entry.id||x.path===entry.path);if(index>=0)assert.deepEqual(registry.inputs[index],entry);else registry.inputs.push(entry);}
assert.ok(fs.readFileSync(registryPath).equals(original),'Source registry changed concurrently; retry from fresh state');
fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
console.log(JSON.stringify({registered:inputs.length,planSha256:digest(planBytes),sourceRegistryId:plan.sourceRegistryId}));
