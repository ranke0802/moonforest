import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {CAVE_PLACEMENTS,CAVE_WATERFALLS} from '../src/witch-cave-layout.js';
import {caveFlowGeometry} from '../src/witch-cave-water.js';
import {CAVE_COLLISION_DATA} from '../src/witch-cave-collision-data.js';
const root=resolve(import.meta.dirname,'..'),baseline=process.argv[2]??'e0cd9f756a80c4b97508d447672c4203eb2fc430';
const read=async name=>JSON.parse(await readFile(resolve(root,'public/assets',name),'utf8'));
const previous=path=>JSON.parse(execFileSync('git',['show',`${baseline}:${path}`],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}));
const before=previous('ArcherPreviewSite/assets/resource-index.json'),after=await read('resource-index.json');
const oldCave=previous('ArcherPreview/public/assets/witch-cave.json'),cave=await read('witch-cave.json');
for(const [id,asset]of Object.entries(oldCave.assets))assert.deepEqual(cave.assets[id],asset,`existing cave model changed: ${id}`);
const preserved=[];
for(const name of await readdir(resolve(root,'public/assets'))){
  if(!name.endsWith('.json')||['resource-index.json','resource-sizes.json','witch-cave.json','village-fixture.json'].includes(name))continue;
  assert.deepEqual(await read(name),previous('ArcherPreview/public/assets/'+name),`shared manifest changed: ${name}`);preserved.push(name);
}
for(const [name,bytes]of Object.entries(before.files))assert.equal(after.files[name],bytes,`previous content changed/removed: ${name}`);
const added=Object.entries(after.files).filter(([name])=>before.files[name]===undefined);
assert.equal(added.length,18,'two new models, each with three geometry tiers and three texture tiers');
assert.equal(cave.placementCount,CAVE_PLACEMENTS.length);assert.equal(cave.availableAssetCount,28);
const report={baseline,resourceRevision:after.revision,existingContentPreserved:Object.keys(before.files).length,addedContent:added.length,addedBytes:added.reduce((n,[,bytes])=>n+bytes,0),unchangedSharedManifests:preserved,unchangedExistingCaveAssets:Object.keys(oldCave.assets).length,placements:CAVE_PLACEMENTS.length,solidFoundations:CAVE_PLACEMENTS.filter(p=>p.foundation).length,spillways:CAVE_WATERFALLS.length,waterTriangles:256+CAVE_WATERFALLS.reduce((sum,p)=>sum+caveFlowGeometry(p).indices.length/3,0),waterMaterials:2,collisionFingerprint:CAVE_COLLISION_DATA.fingerprint,newGenerationCalls:0,browserAutomation:false,physicalS23Tested:false,playerMax:8192,backgroundMax:4096,lodLevels:3};
const out=resolve(root,'reports/witch-cave-v5');await mkdir(out,{recursive:true});await writeFile(resolve(out,'integration-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
