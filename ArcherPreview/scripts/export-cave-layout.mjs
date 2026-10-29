import {writeFile,mkdir} from 'node:fs/promises';
import {CAVE_PLACEMENTS,CAVE_ROUTES,CAVE_ROOMS} from '../src/witch-cave-layout.js';
const root=new URL('../reports/witch-cave-v5/',import.meta.url);await mkdir(root,{recursive:true});
await writeFile(new URL('layout.json',root),JSON.stringify({routes:CAVE_ROUTES,rooms:CAVE_ROOMS,placements:CAVE_PLACEMENTS}));
console.log(JSON.stringify({placements:CAVE_PLACEMENTS.length,newTypes:20}));
