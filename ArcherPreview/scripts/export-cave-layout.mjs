import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {CAVE_PLACEMENTS,CAVE_ROUTES,CAVE_ROOMS,CAVE_POOLS,CAVE_WATERFALLS} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
const root=process.env.CAVE_REVIEW_OUT?pathToFileURL(resolve(process.env.CAVE_REVIEW_OUT)+'/'):new URL('../reports/witch-cave-v5/',import.meta.url);await mkdir(root,{recursive:true});
await writeFile(new URL('layout.json',root),JSON.stringify({routes:CAVE_ROUTES,rooms:CAVE_ROOMS,placements:CAVE_PLACEMENTS,pools:CAVE_POOLS,waterfalls:CAVE_WATERFALLS}));
const {readFile}=await import('node:fs/promises'),manifest=JSON.parse(await readFile(new URL('../public/assets/witch-cave.json',import.meta.url),'utf8')),terrain=createWitchCaveTerrain();
if(process.argv.includes('--update-manifest')){manifest.placementCount=CAVE_PLACEMENTS.length;await writeFile(new URL('../public/assets/witch-cave.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');}
await writeFile(new URL('review-scene.json',root),JSON.stringify({assets:manifest.assets,terrain:{size:terrain.size,subdivisions:terrain.subdivisions,heights:Array.from(terrain.heights)}}));
console.log(JSON.stringify({placements:CAVE_PLACEMENTS.length,newTypes:20}));
