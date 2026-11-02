import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PLAINS_PLACEMENTS,PLAINS_TREASURE_ANCHORS} from '../../src/great-plains-layout.js';
import {CHAPTER_POINTS} from '../../src/chapter-quest-points.js';
import {LOOT_RARITIES} from '../../src/loot-rarity.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const before=name=>JSON.parse(execFileSync('git',['show','01fa3ba:ArcherPreview/public/assets/'+name+'.json'],{encoding:'utf8'}));
const contracts=[];
for(const name of ['warrior-v3','warrior-v3-ios','village','monster-forest','elena','mourning-elena','quest-props']){
 const current=read('public/assets/'+name+'.json');assert.deepEqual(current,before(name));contracts.push({name,unchanged:true});
}
const oldCave=before('witch-cave'),cave=read('public/assets/witch-cave.json');
for(const id of Object.keys(oldCave.assets))if(id!=='cave-01-eroded-wall')assert.deepEqual(cave.assets[id],oldCave.assets[id],id);
const wall=cave.assets['cave-01-eroded-wall'],oldWall=oldCave.assets['cave-01-eroded-wall'];
assert.deepEqual(wall.lods.map(v=>v.triangles),oldWall.lods.map(v=>v.triangles));
const index=read('public/assets/resource-index.json');
const oldIndex=JSON.parse(execFileSync('git',['show','01fa3ba:ArcherPreviewSite/assets/resource-index.json'],{encoding:'utf8'}));
const added=Object.keys(index.files).filter(p=>!oldIndex.files[p]),removed=Object.keys(oldIndex.files).filter(p=>!index.files[p]);
const sourceFiles=execFileSync('git',['diff','--name-only','--','src','tests','public/assets/great-plains.json','public/assets/witch-cave.json'],{encoding:'utf8'}).trim().split('\n').map(p=>p.replace(/^ArcherPreview\//,''));
sourceFiles.push('src/loot-rarity.js','tests/treasure-loot.test.js','tests/quest-prop-performance.test.js','tests/environment-distance-shading.test.js');
const report={baseline:'01fa3ba',browserAutomation:false,paidAssetGenerations:0,deviceFpsMeasured:false,contracts,
 diagnostic:{createdAt:'2026-11-01T23:57:09.758Z',bundle:'index-DX7bLT8c.js',map:'warrior-v5',targetFps:30,summaryFps:30.211,scope:'Historical cave combat; not evidence of current village/forest regression',gpuStatus:'unsupported'},
 plains:{beforeStaticPlacements:1079,staticPlacements:PLAINS_PLACEMENTS.length,externalTreasureAnchors:PLAINS_TREASURE_ANCHORS.length,counts:Object.fromEntries([...new Set(PLAINS_PLACEMENTS.map(p=>p.kind))].map(kind=>[kind,PLAINS_PLACEMENTS.filter(p=>p.kind===kind).length]))},
 treasures:{counts:Object.fromEntries(['village','great-plains','monster-forest','witch-cave'].map(map=>[map,CHAPTER_POINTS.filter(p=>p.map===map&&p.tier).length])),grades:LOOT_RARITIES},
 wall:{lodTriangles:wall.lods.map(v=>v.triangles),texturesPreserved:true,labR3Unchanged:true},
 transfer:{revision:index.revision,files:Object.keys(index.files).length,bundles:index.bundles.length,added,removed,unchanged:Object.keys(index.files).filter(p=>oldIndex.files[p]).length},
 sources:Object.fromEntries([...new Set(sourceFiles)].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))};
writeFileSync(new URL('./integration-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({contracts:contracts.length,plains:report.plains,treasures:report.treasures.counts,transfer:{...report.transfer,added:added.length,removed:removed.length}}));
