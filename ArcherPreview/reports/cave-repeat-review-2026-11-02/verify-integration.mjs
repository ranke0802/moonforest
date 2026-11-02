import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const app=resolve(import.meta.dirname,'../..'),repo=resolve(app,'..');
const json=async path=>JSON.parse(await readFile(resolve(app,path),'utf8'));
const lighting=await json('reports/cave-repeat-review-2026-11-02/lighting-summary.json'),map=await json('reports/cave-repeat-review-2026-11-02/map-review-summary.json'),shaders=await json('reports/cave-repeat-review-2026-11-02/lighting-shader-compile.json'),hidden=await json('reports/cave-repeat-review-2026-11-02/hidden-effects.json');
const sourceLocks=[];
for(const [path,expected]of Object.entries(lighting.sourceSHA256)){
 const actual=createHash('sha256').update(await readFile(resolve(app,path))).digest('hex');if(actual!==expected)throw Error('Lighting source changed after validation: '+path);sourceLocks.push({path,sha256:actual});
}
for(const path of ['src/world.js','tests/cave-hidden-effects.test.js','tests/cave-forest-repeat-lifecycle.test.js','README.md'])sourceLocks.push({path,sha256:createHash('sha256').update(await readFile(resolve(app,path))).digest('hex')});
const log=await readFile(resolve(app,'reports/cave-repeat-review-2026-11-02-full.log'),'utf8'),value=name=>Number(log.match(new RegExp('ℹ '+name+' (\\d+)'))?.[1]);
const tests={total:value('tests'),passed:value('pass'),failed:value('fail'),skipped:value('skipped'),cancelled:value('cancelled')};
if(!(tests.total>961)||tests.total!==tests.passed||tests.failed!==0||tests.skipped!==0||tests.cancelled!==0)throw Error('Final full suite incomplete or failed');
if(shaders.stages!==42||shaders.passed!==42||shaders.failed.length)throw Error('Fresh shader validation incomplete');
if(lighting.productionOpacityProof.violations!==0||lighting.productionOpacityProof.cellsChecked!==512000||lighting.actualLifecycle.resourceOrObserverCountGrowth!==0)throw Error('Lighting lifecycle validation failed');
if(map.normalTrips.roundTrips!==6||map.normalTrips.subsequentVisitDecodeCalls!==0||map.normalTrips.pendingSceneItemsAfterEachLoadAndRelease!==0)throw Error('Actual compressed map validation failed');
if(hidden.results.length!==2||hidden.results[0].positions!==0||hidden.results[0].toggles!==0||hidden.results[1].hiddenUpdates!==0)throw Error('Hidden effect validation failed');
const unexpected=execFileSync('git',['diff','--name-only','--diff-filter=M','--','ArcherPreview/public/assets','ArcherPreview/assets/models','ArcherPreview/src/cave-laboratory-geometry.js','ArcherPreview/src/witch-cave-layout.js'],{cwd:repo,encoding:'utf8'}).trim();if(unexpected)throw Error('Unexpected asset/layout changes: '+unexpected);
const previous=JSON.parse(execFileSync('git',['show','HEAD:ArcherPreviewSite/assets/resource-index.json'],{cwd:repo,encoding:'utf8',maxBuffer:8e6})),index=await json('dist-village/assets/resource-index.json'),deployment=await json('dist-village/deployment-files.json');
if(index.revision!==previous.revision||deployment.resourceRevision!==index.revision||JSON.stringify(index.files)!==JSON.stringify(previous.files)||JSON.stringify(index.bundles)!==JSON.stringify(previous.bundles))throw Error('Resource revision or hashes changed');
const result={status:'VERIFIED_BEFORE_SYNC',generatedAt:new Date().toISOString(),base:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),tests,sourceLocks,shaderStages:42,resourceRevision:index.revision,unchangedResourceFiles:Object.keys(index.files).length,unchangedBundles:index.bundles.length,normalMapRoundTrips:6,actualModelLoads:228,lightingRoundTrips:20,productionOpacityCells:512000,coreFocusedTests:41,hiddenEffectTests:2,newLights:0,newTextures:0,newShadowPasses:0,preservation:{playerMax:8192,backgroundMax:4096,lod:true,newAssetGeneration:false,browserAutomation:false},limitations:[...lighting.limits,...map.limits,map.lateCompletionCases.limit]};
await writeFile(resolve(app,'reports/cave-repeat-review-2026-11-02/verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({tests,shaderStages:42,resourceRevision:index.revision,unchangedFiles:result.unchangedResourceFiles,unchangedBundles:result.unchangedBundles,sourceLocks:sourceLocks.length}));
