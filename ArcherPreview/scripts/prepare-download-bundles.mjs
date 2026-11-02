import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {collectVillageSiteFiles} from './build-village-site.mjs';
import {buildResourceBundles,verifyResourceBundles} from './resource-bundles.mjs';
const root=resolve(import.meta.dirname,'../public');
// Pretest/dev preparation must use the same live size inventory as a release.
// Replacing a model changes hashes even when its texture stays unchanged.
const inventory=await collectVillageSiteFiles(root);
const sizes=Object.fromEntries([...inventory.files].filter(([path])=>path.startsWith('assets/content/')).map(([path,info])=>[path.split('/').at(-1),info.bytes]).sort(([a],[b])=>a.localeCompare(b)));
await writeFile(resolve(root,'assets/resource-sizes.json'),JSON.stringify({version:1,files:sizes})+'\n');
const {files}=await collectVillageSiteFiles(root);
const index=await buildResourceBundles(root,files);
console.log(JSON.stringify(await verifyResourceBundles(root,index)));
