import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const app=resolve(import.meta.dirname,'../..'),repo=resolve(app,'..');
const json=async path=>JSON.parse(await readFile(resolve(app,path),'utf8'));
const boss=await json('reports/elena-transform-performance-2026-11-02/implementation-summary.json');
const light=await json('reports/cave-followup-2026-11-02/lighting-validation.json');
const checked=[];
for(const [path,expected] of Object.entries({...boss.sourceSHA256,...light.sourceSha256})){
  const actual=createHash('sha256').update(await readFile(resolve(app,path))).digest('hex');
  if(actual!==expected)throw new Error('Source differs from locked validation: '+path);
  checked.push({path,sha256:actual});
}
const changedAssets=execFileSync('git',['diff','--name-only','--diff-filter=M','--','ArcherPreview/public/assets','ArcherPreview/assets/models','ArcherPreview/src/cave-laboratory-geometry.js','ArcherPreview/src/witch-cave-layout.js'],{cwd:repo,encoding:'utf8'}).trim();
if(changedAssets)throw new Error('Unexpected resource/structure edits: '+changedAssets);
const previous=JSON.parse(execFileSync('git',['show','HEAD:ArcherPreviewSite/assets/resource-index.json'],{cwd:repo,encoding:'utf8',maxBuffer:8e6}));
const index=await json('dist-village/assets/resource-index.json'),deployment=await json('dist-village/deployment-files.json');
if(index.revision!==previous.revision||deployment.resourceRevision!==index.revision)throw new Error('Resource revision changed');
if(JSON.stringify(index.files)!==JSON.stringify(previous.files)||JSON.stringify(index.bundles)!==JSON.stringify(previous.bundles))throw new Error('Resource files or bundles changed');
const shaders=await json('reports/cave-followup-2026-11-02/lighting-shader-compilation.json');
if(shaders.length!==42||shaders.some(s=>s.exit!==0))throw new Error('Standalone shader gate incomplete');
const log=await readFile(resolve(app,'reports/cave-followup-2026-11-02-full-final.log'),'utf8');
const number=name=>Number(log.match(new RegExp('ℹ '+name+' (\\d+)'))?.[1]);
if(number('tests')!==961||number('pass')!==961||number('fail')!==0||number('skipped')!==0||number('cancelled')!==0)throw new Error('Final regression suite did not pass');
const result={status:'VERIFIED_BEFORE_SYNC',generatedAt:new Date().toISOString(),base:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),tests:{total:961,passed:961,failed:0,skipped:0,cancelled:0},sourceLocks:checked,shaderStages:42,resourceRevision:index.revision,unchangedResourceFiles:Object.keys(index.files).length,unchangedBundles:index.bundles.length,sourceGeometryLayoutAndManifestEdits:0,preservation:{playerMax:8192,backgroundMax:4096,lod:true,newAssetGeneration:false,browserAutomation:false},limitations:['No physical S23/iPhone temperature or GPU driver timing measured.','Node/NullEngine readiness is not a physical browser or visual inspection.','One library clone/animator/driver operation can still exceed the soft slice budget.']};
await writeFile(resolve(app,'reports/cave-followup-2026-11-02/source-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({tests:result.tests,sourceLocks:checked.length,shaderStages:42,resourceRevision:index.revision,unchangedFiles:result.unchangedResourceFiles,unchangedBundles:result.unchangedBundles}));
