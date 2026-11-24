import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {checkFixedLayouts,sameLayoutText} from '../scripts/build-fixed-layouts.mjs';
import {FIXED_LAYOUT_IDS,fixedLayoutsFor,fixedLayoutsForCharacter,prepareFixedLayouts,isFixedLayoutReady,fixedPlacements,fixedLayoutStats} from '../src/fixed-layouts.js';

const root=resolve(import.meta.dirname,'..'),src=resolve(root,'src');
// The generators run on whichever Node runs the test (CI: 24), while the data was
// generated once; allow last-bit rounding, nothing else.
const sameData=(a,b)=>sameLayoutText(JSON.stringify(a),JSON.stringify(b));
const near=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));

test('committed prebuilt layouts match their generators',async()=>{
 assert.deepEqual(await checkFixedLayouts(),[]);
});

test('the rounding tolerance accepts last-bit noise only',()=>{
 assert.ok(sameLayoutText('{"x":1.2345678901234567,"id":"tree-3"}','{"x":1.2345678901234569,"id":"tree-3"}'));
 assert.ok(!sameLayoutText('{"x":1.25,"id":"tree-3"}','{"x":1.26,"id":"tree-3"}'));
 assert.ok(!sameLayoutText('{"x":1,"id":"tree-3"}','{"x":1,"id":"tree-4"}'));
 assert.ok(!sameLayoutText('{"x":1,"id":"tree"}','{"x":1,"id":"bush"}'));
 assert.ok(!sameLayoutText(null,'{}'));
});

test('a map asks only for its own region',()=>{
 assert.deepEqual(FIXED_LAYOUT_IDS,['village','great-plains']);
 assert.deepEqual(fixedLayoutsForCharacter('warrior-v3'),['village']);
 assert.deepEqual(fixedLayoutsForCharacter('warrior-plains'),['great-plains']);
 for(const character of ['warrior-v4','warrior-v5','archer','warrior'])assert.deepEqual(fixedLayoutsForCharacter(character),[]);
 assert.deepEqual(fixedLayoutsFor({village:true}),['village']);
 assert.deepEqual(fixedLayoutsFor({village:true,plains:true}),['great-plains']);
 assert.deepEqual(fixedLayoutsFor({village:true,forest:true}),[]);
 assert.deepEqual(fixedLayoutsFor({}),[]);
});

test('preparing one region loads its prebuilt data, in generator order, without the other',async()=>{
 const {VILLAGE_PLACEMENTS}=await import('../src/village-layout.js');
 assert.equal(isFixedLayoutReady('village'),false);
 await prepareFixedLayouts(['village']);
 assert.equal(isFixedLayoutReady('village'),true);
 assert.equal(isFixedLayoutReady('great-plains'),false,'the plains stay unloaded until visited');
 const village=fixedPlacements('village');
 assert.equal(village.length,698);
 assert.deepEqual(village.map(p=>p.id),VILLAGE_PLACEMENTS.map(p=>p.id));
 assert.ok(sameData(village,VILLAGE_PLACEMENTS));
 assert.equal(fixedLayoutStats.fallbacks,0);
 const again=await prepareFixedLayouts(['village']);
 assert.ok(again<5,'a revisit waits on nothing');
 assert.equal(fixedPlacements('village'),village,'one shared list per page');
 await prepareFixedLayouts(['great-plains']);
 const {PLAINS_PLACEMENTS}=await import('../src/great-plains-layout.js');
 assert.equal(fixedPlacements('great-plains').length,1424);
 assert.deepEqual(fixedPlacements('great-plains').map(p=>p.id),PLAINS_PLACEMENTS.map(p=>p.id));
 assert.ok(sameData(fixedPlacements('great-plains'),PLAINS_PLACEMENTS));
 await assert.rejects(()=>prepareFixedLayouts(['monster-forest']),/Unknown fixed layout/);
});

test('the shipped page resolves the fallback to the throwing browser variant',async()=>{
 const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
 assert.deepEqual(pkg.imports['#fixed-layout-fallback'],{browser:'./src/fixed-layout-fallback.browser.js',default:'./src/fixed-layout-fallback.js'});
 const browser=await import('../src/fixed-layout-fallback.browser.js');
 assert.throws(()=>browser.fallbackPlacements('village'),/read before it was prepared/);
 const browserSource=await readFile(resolve(src,'fixed-layout-fallback.browser.js'),'utf8');
 assert.doesNotMatch(browserSource,/\bimport\b/);
});

test('game runtime sources import no layout generator',async()=>{
 const allowed=new Set(['great-plains-layout.js','fixed-layout-fallback.js']);
 const generator=/(?:from\s*|import\s*\(\s*)['"](?:\.\.?\/)+(?:[\w-]+\/)*(?:village-layout|great-plains-layout)\.js['"]/;
 const offenders=[];
 async function walk(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   const full=resolve(directory,entry.name);
   if(entry.isDirectory()){await walk(full);continue;}
   if(!entry.name.endsWith('.js')||allowed.has(relative(src,full)))continue;
   if(generator.test(await readFile(full,'utf8')))offenders.push(relative(src,full));
  }
 }
 await walk(src);
 assert.deepEqual(offenders,[]);
});

test('chapter points read the prebuilt anchors and keep their positions',async()=>{
 const [{VILLAGE_PLACEMENTS},{PLAINS_PLACEMENTS},{CHAPTER_POINTS,QUEST_APPLE_TREE}]=await Promise.all([import('../src/village-layout.js'),import('../src/great-plains-layout.js'),import('../src/chapter-quest-points.js')]);
 const tree=VILLAGE_PLACEMENTS.filter(p=>p.kind==='tree').sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];
 assert.equal(QUEST_APPLE_TREE.id,tree.id);assert.ok(near(QUEST_APPLE_TREE.x,tree.x)&&near(QUEST_APPLE_TREE.z,tree.z));
 for(const [point,placement]of [['boundary-a','boundary-a'],['boundary-b','boundary-b'],['bandage','saint-bandage']]){
  const found=CHAPTER_POINTS.find(p=>p.id===point),source=PLAINS_PLACEMENTS.find(p=>p.id===placement);
  assert.ok(found&&source,point);assert.ok(near(found.x,source.x)&&near(found.z,source.z),point);
 }
});
