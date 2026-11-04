import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PLAINS_PLACEMENTS,PLAINS_ROUTES,PLAINS_LOOKOUT,PLAINS_TREASURE_ANCHORS,plainsObstacles} from '../src/great-plains-layout.js';
import {PLAINS_TREE_TRANSITION_PLAN,applyPlainsTreeTransition} from '../src/plains-tree-transition.js';
import {CHAPTER_POINTS} from '../src/chapter-quest-points.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {originalInputText} from './helpers/mobile-profile-contract.js';

const baseline=JSON.parse(readFileSync(new URL('../reports/plains-tree-mix-2026-11-03/baseline.json',import.meta.url))),oldById=new Map(baseline.placements.map(p=>[p.id,p])),currentById=new Map(PLAINS_PLACEMENTS.map(p=>[p.id,p])),facts=[];
const changed=PLAINS_PLACEMENTS.filter(p=>JSON.stringify(p)!==JSON.stringify(oldById.get(p.id))),hash=x=>createHash('sha256').update(x).digest('hex');
test('tree mixing changes only24 existing species/heights and preserves both exact shared boundaries and all chest supports',()=>{
 assert.equal(PLAINS_PLACEMENTS.length,1424);assert.equal(new Set(PLAINS_PLACEMENTS.map(p=>p.id)).size,1424);assert.equal(changed.length,24);assert.deepEqual(changed.map(p=>p.id).sort(),PLAINS_TREE_TRANSITION_PLAN.map(p=>p.id).sort());
 for(const p of PLAINS_PLACEMENTS){const old=oldById.get(p.id);assert.ok(old);if(p.forestTransition){const a={...p},b={...old};for(const key of['asset','scale','forestTransition']){delete a[key];delete b[key];}assert.deepEqual(a,b,p.id+' changed position, roots or collision');}else assert.deepEqual(p,old,p.id+' outside the transition changed');}
 const native=PLAINS_PLACEMENTS.filter(p=>p.forestBoundary),town=PLAINS_PLACEMENTS.filter(p=>p.villageBoundary);assert.equal(native.filter(p=>p.kind==='tree').length,68);assert.equal(native.length,158);assert.equal(town.length,32);
 assert.deepEqual(PLAINS_ROUTES,baseline.routes);assert.deepEqual(PLAINS_LOOKOUT,baseline.lookout);assert.deepEqual(PLAINS_TREASURE_ANCHORS,baseline.treasureAnchors);
 for(const point of baseline.chests.filter(p=>p.tier))for(const original of baseline.placements.filter(p=>p.kind==='tree'&&Math.hypot(p.x-point.x,p.z-point.z)<4.5))assert.deepEqual(currentById.get(original.id),original,point.id+' supporting tree changed');
 for(const p of baseline.manifests.sidecar.placements.filter(p=>p.sourcePlacementId))assert.deepEqual(currentById.get(p.sourcePlacementId),oldById.get(p.sourcePlacementId),'reciprocal town vista must remain exact');
 facts.push({case:'restricted-tree-only-edit',changedTrees:changed.length,changedSpecies:changed.filter(p=>p.asset!==oldById.get(p.id).asset).length,addedPlacements:0,forestBoundaryTrees:68,townBoundaryTrees:32,sidecarSourcesChanged:0,chestSupportsChanged:0});
});

test('the original forest, source models/textures, LOD and240% options remain exact apart from bounded additive mobile color profiles',()=>{
 for(const[file,sha]of Object.entries(baseline.hashes))assert.equal(hash(originalInputText(file,readFileSync(new URL('../'+file,import.meta.url),'utf8'))),sha,file+' original inputs changed');
 const contracts={'forest-01-sickly-oak':.62,'forest-02-dead-tree':.48,'tree-02-slender-pine':.48,'tree-01-round-oak':.4};
 for(const p of changed){const config=baseline.manifests.plains.assets[p.asset];assert.ok(config);if(p.asset!=='tree-01-round-oak')assert.deepEqual(config,baseline.manifests.forest.assets[p.asset],p.asset+' differs from the existing forest source');assert.ok(p.scale*contracts[p.asset]<=p.colliderRadius*.95+1e-9,p.id+' native trunk exceeds its previous collider');assert.ok(p.scale*config.height>=4.5&&p.scale*config.height<=10.6);}
 const once=applyPlainsTreeTransition(structuredClone(baseline.placements)),twice=applyPlainsTreeTransition(structuredClone(once));assert.deepEqual(twice,once,'setup is idempotent');
 facts.push({case:'source-quality-and-solid-envelope',protectedSourceFiles:Object.keys(baseline.hashes).length,newModels:0,newTextures:0,allOriginalLodsAndTextureBudgetsUnchanged:true,trunkEnvelopesExpanded:0});
});

test('actual navigation, entire portal approach and every reward interaction stay unchanged',()=>{
 const obstacles=plainsObstacles();assert.deepEqual(obstacles,baseline.obstacles);const nav=new VillageNavigation(obstacles),road=PLAINS_ROUTES.find(r=>r.id==='forest-road');let segments=0;
 for(let i=1;i<road.samples.length;i++){const a={x:road.samples[i-1][0],z:road.samples[i-1][1]},b={x:road.samples[i][0],z:road.samples[i][1]};if(Math.hypot(b.x-65,b.z+72)<3)break;assert.ok(nav.segmentClear(a,b,road.width/2-.05),'full forest approach narrowed');segments++;}
 for(const point of CHAPTER_POINTS.filter(p=>p.map==='great-plains'&&p.tier)){assert.ok(nav.free(point,.65,105),point.id);let free=0;for(let i=0;i<16;i++){const a=i*Math.PI/8,p={x:point.x+Math.cos(a)*2.2,z:point.z+Math.sin(a)*2.2};if(nav.free(p,WARRIOR_DIMENSIONS.moveRadius,105)&&nav.segmentClear(p,point,.05))free++;}assert.ok(free>=2,point.id+' lost interaction approaches');}
 for(const p of changed)assert.equal(nav.free(p,WARRIOR_DIMENSIONS.moveRadius,106),false,p.id+' lost its solid trunk');
 facts.push({case:'actual-navigation',identicalObstacles:obstacles.length,fullWidthApproachSegments:segments,allChestApproachesPreserved:true});
});

test('existing islands form a restrained woodland-to-meadow gradient with a bounded per-tier triangle budget',()=>{
 const zone=p=>p.x>10&&p.x<60&&p.z<0?'approach':p.x>0&&p.x<65&&p.z>=0&&p.z<85?'meadow':p.x<-55?'village':'other';
 const measure=list=>Object.fromEntries(['village','meadow','approach'].map(z=>{const trees=list.filter(p=>p.kind==='tree'&&!p.forestBoundary&&!p.villageBoundary&&zone(p)===z);return[z,{trees:trees.length,forestOaksAndDeadTrees:trees.filter(p=>p.asset.startsWith('forest-')).length}];}));
 const before=measure(baseline.placements),after=measure(PLAINS_PLACEMENTS);assert.equal(after.village.forestOaksAndDeadTrees,before.village.forestOaksAndDeadTrees);assert.equal(after.meadow.forestOaksAndDeadTrees-before.meadow.forestOaksAndDeadTrees,4);assert.ok(after.approach.forestOaksAndDeadTrees/after.approach.trees>after.meadow.forestOaksAndDeadTrees/after.meadow.trees);assert.ok(after.approach.forestOaksAndDeadTrees>before.approach.forestOaksAndDeadTrees);
 const budget=list=>[0,1,2].map(level=>list.filter(p=>p.kind==='tree').reduce((sum,p)=>sum+baseline.manifests.plains.assets[p.asset].lods.find(l=>l.level===level).triangles,0)),old=budget(baseline.placements),current=budget(PLAINS_PLACEMENTS);assert.ok(current[0]<old[0]*1.01);assert.ok(current[1]<=old[1]);assert.ok(current[2]<=old[2]);
 facts.push({case:'gradient-and-theoretical-budget',before,after,allTreesSingleTierTriangleUpperBounds:{before:old,after:current,delta:current.map((v,i)=>v-old[i])},gpuPerformanceMeasured:false,note:'Simultaneous whole-map single-tier upper bounds; does not assert submitted geometry or FPS.'});
});
test.after(()=>writeFileSync(new URL('../reports/plains-tree-mix-2026-11-03/validation.json',import.meta.url),JSON.stringify({scope:'Source/resource preservation, actual analytic navigation and bounded authoring costs; no browser/GPU measurements',facts},null,2)+'\n'));
