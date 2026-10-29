import {resolve} from 'node:path';
import {collectVillageSiteFiles} from './build-village-site.mjs';
import {buildResourceBundles,verifyResourceBundles} from './resource-bundles.mjs';
const root=resolve(import.meta.dirname,'../public'),{files}=await collectVillageSiteFiles(root);
const index=await buildResourceBundles(root,files);
console.log(JSON.stringify(await verifyResourceBundles(root,index)));
