import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PLAINS_PLACEMENTS,PLAINS_ROUTES,PLAINS_CLEARINGS,PLAINS_TREASURE_ANCHORS} from '../../src/great-plains-layout.js';
import {greatPlainsHeight} from '../../src/great-plains-terrain.js';
const read=name=>readFile(new URL('../../'+name,import.meta.url));
const manifest=JSON.parse(await read('public/assets/great-plains.json'));
const grass=PLAINS_PLACEMENTS.filter(p=>p.asset==='grass-tuft'),anchors=PLAINS_PLACEMENTS.filter(p=>['tree','rock'].includes(p.kind)&&Math.hypot(p.x,p.z)<103);
const report={timestamp:new Date().toISOString(),phase:'before landscape edit',browserAutomation:false,gpuTimingMeasured:false,sourceHashes:{},placementCount:PLAINS_PLACEMENTS.length,kindCounts:{},grassCount:grass.length,grassNearScenery:{},routes:[],clearings:PLAINS_CLEARINGS,treasures:PLAINS_TREASURE_ANCHORS,assetGraphs:manifest.assets,assetShapeEvidence:{'rock-01-mossy-boulder':'Actual packaged near/mid/far front render: C:/Users/ryank/Documents/ChatGPT/MM Project/output/village-warrior-v3/2026-10-28/geometry-lod/review/rock-01-mossy-boulder-front.png; rounded ground-based dome with flat base, all three LODs inspected.','rock-02-jagged-outcrop':'Actual packaged near/mid/far front render in the same review folder: tall multi-spire rock, suitable as contrasting outcrop rather than the requested dome.'}};
for(const path of ['src/great-plains-layout.js','src/great-plains-terrain.js','src/plains-view-distance.js','public/assets/great-plains.json','public/assets/great-plains-ground.json'])report.sourceHashes[path]=createHash('sha256').update(await read(path)).digest('hex');
for(const p of PLAINS_PLACEMENTS)report.kindCounts[p.kind]=(report.kindCounts[p.kind]??0)+1;
for(const radius of [2,3,4])report.grassNearScenery[radius]=grass.filter(g=>anchors.some(p=>Math.hypot(p.x-g.x,p.z-g.z)<radius)).length;
for(const route of PLAINS_ROUTES){let maximumGrade=0;for(let i=1;i<route.samples.length;i++){const a=route.samples[i-1],b=route.samples[i];maximumGrade=Math.max(maximumGrade,Math.abs(greatPlainsHeight(...a)-greatPlainsHeight(...b))/Math.hypot(b[0]-a[0],b[1]-a[1]));}report.routes.push({id:route.id,points:route.points,maximumGrade});}
await writeFile(new URL('baseline.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({placementCount:report.placementCount,kindCounts:report.kindCounts,grassNearScenery:report.grassNearScenery,routes:report.routes},null,2));
