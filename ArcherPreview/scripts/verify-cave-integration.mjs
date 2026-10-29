// Verify the current integration catalogue and bundled downloads, rather than
// an isolated legacy fixture that could hide stale resource-index entries.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {collectVillageSiteFiles} from './build-village-site.mjs';
import {verifyResourceBundles} from './resource-bundles.mjs';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'reports/cave-integration');
await mkdir(out,{recursive:true});
const {files}=await collectVillageSiteFiles(resolve(root,'public'));
const sizes=Object.fromEntries([...files].filter(([name])=>name.startsWith('assets/content/')).map(([name,info])=>[name.split('/').at(-1),info.bytes]));
const index=JSON.parse(await readFile(resolve(root,'public/assets/resource-index.json'),'utf8'));
assert.deepEqual(index.files,sizes,'Current resource-index is stale; run npm run build:village before verification');
const bundleAudit=await verifyResourceBundles(resolve(root,'public'),index);
const result=spawnSync(process.execPath,['--test','tests/witch-cave.test.js','tests/witch-cave-improvements.test.js','tests/witch-cave-resources.test.js','tests/witch-cave-roundtrip.test.js'],{cwd:root,encoding:'utf8',windowsHide:true});
await writeFile(resolve(out,'cave-tests.log'),(result.stdout??'')+(result.stderr??''));
const report={exitCode:result.status,bundleAudit,sharedCatalogueModified:false,browserAutomationUsed:false,error:result.error?.message??null};
await writeFile(resolve(out,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));console.log((result.stdout??'').split('\n').slice(-9).join('\n'));
if(result.status!==0)process.exitCode=result.status??1;
