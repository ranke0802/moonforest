import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../../..'),dir=import.meta.dirname;
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),join=p=>path.join(root,p);
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const snapshot=read(path.join(dir,'tested-sources.json'));
assert.deepEqual(snapshot.files.filter(row=>sha(join(row.path))!==row.sha256),[],'Final tested sources changed');
const log=fs.readFileSync(path.join(dir,'regression.log'),'utf8');
const number=name=>Number(log.match(new RegExp('^# '+name+' ([0-9.]+)','m'))?.[1]);
assert.equal(number('tests'),279);assert.equal(number('pass'),279);assert.equal(number('fail'),0);assert.equal(number('skipped'),0);
const regression={passed:true,completedAt:new Date().toISOString(),tests:number('tests'),pass:number('pass'),fail:number('fail'),skipped:number('skipped'),durationMs:number('duration_ms'),sourceFiles:snapshot.files.length,sourceUnchanged:true,scope:'All cinematic and affected tool, plains, LOD, demand, texture, cave-fog regressions after runtime bridge split.',priorWholeSuite:'../cinematic-mobile-2026-11-11/regression-scope.json',wholeSuiteRepeated:false,log:'regression.log'};
fs.writeFileSync(path.join(dir,'regression.json'),JSON.stringify(regression,null,2)+'\n');
const independent=read(path.join(dir,'verification-summary.json'));
assert.equal(independent.passed,true);assert.equal(independent.total,26);assert.equal(independent.sourceUnchanged,true);
for(const [file,expected]of Object.entries(independent.currentSourceHashes))assert.equal(sha(join('ArcherPreview/'+file)),expected,file);
const preserved=['asset-catalog.js','resource-index.json','resource-sizes.json'].map(file=>{
 const p=file==='asset-catalog.js'?'ArcherPreview/src/'+file:'ArcherPreview/public/assets/'+file;
 const before=sha(path.join(dir,'pre-build',file)),after=sha(join(p));assert.equal(after,before,p);return {path:p,sha256:after};
});
const baseline=read(path.join(dir,'published-before.json')),manifest=read(join('ArcherPreviewSite/deployment-files.json'));
const before=new Map(baseline.files.map(row=>[row.path,row])),after=new Map(manifest.files.map(row=>[row.path,row]));
assert.equal(manifest.resourceRevision,baseline.resourceRevision);assert.equal(manifest.files.length,2044);
const changed=manifest.files.filter(row=>before.has(row.path)&&before.get(row.path).sha256!==row.sha256);
const added=manifest.files.filter(row=>!before.has(row.path)),removed=baseline.files.filter(row=>!after.has(row.path));
const resourcePath=p=>/^assets\/(content|bundles|maps|manifests|models|textures|audio)\//.test(p)||/resource-(index|sizes)\.json$/.test(p);
assert.ok([...changed,...added,...removed].every(row=>!resourcePath(row.path)),'Prepared asset changed');
assert.ok(changed.every(row=>['index.html','cinematic-studio.html','moonforest-help.html'].includes(row.path)),'Unexpected existing file change');
assert.ok([...added,...removed].every(row=>/^assets\/[\w~.-]+\.(js|css)$/.test(row.path)),'Unexpected graph path change');
let bytes=0;
for(const row of manifest.files){
 for(const base of ['ArcherPreview/dist-village','ArcherPreviewSite','exports/portable/cinematic-camera-2026-11-12/pages/ArcherPreviewSite']){
  const p=join(base+'/'+row.path);assert.equal(fs.statSync(p).size,row.bytes,row.path);assert.equal(sha(p),row.sha256,row.path);
 }
 bytes+=row.bytes;
}
assert.equal(bytes,manifest.bytes);
const graph=read(join('ArcherPreview/reports/runtime-module-origins.json')),chunks=new Map(graph.chunks.map(c=>[c.fileName,c]));
const entry=graph.chunks.find(c=>c.isEntry&&c.moduleIds.some(m=>m.endsWith('/src/main.js')));assert.ok(entry);
const closure=new Set(),visit=name=>{if(closure.has(name))return;closure.add(name);for(const imported of chunks.get(name)?.imports??[])visit(imported);};visit(entry.fileName);
const initialModules=[...closure].flatMap(name=>chunks.get(name)?.moduleIds??[]);
assert.ok(initialModules.some(m=>m.endsWith('/src/scenery-distance-state.js')));
for(const tail of ['cinematic-scenery-distance.js','cinematic-camera-controls.js','cinematic-scene-host.js','cinematic-studio.js'])assert.ok(!initialModules.some(m=>m.endsWith('/src/'+tail)),tail+' eagerly loaded');
assert.equal(execFileSync('git',['diff','--numstat','--','ArcherPreview/scripts/runtime-module-graph.mjs'],{cwd:root,encoding:'utf8'}),'');
const sourceFiles=[...execFileSync('git',['diff','--name-only','--','ArcherPreview/src','ArcherPreview/public/moonforest-help.html'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean),'ArcherPreview/src/cinematic-camera-controls.js','ArcherPreview/src/cinematic-scenery-distance.js','ArcherPreview/src/scenery-distance-state.js','ArcherPreview/tests/cinematic-camera-controls.test.js','ArcherPreview/tests/cinematic-camera-movement.test.js','ArcherPreview/tests/cinematic-scenery-distance.test.js'];
assert.equal(new Set(sourceFiles).size,24);
const report={validatedAt:new Date().toISOString(),passed:true,release:'MoonForest 0.1 ver',baselineHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),scope:'Saved cutscene scenery distance100..240%, native LOD/fog/culling/demand coordination, mobile parent-DOM camera joystick. Normal gameplay remains inherited without a cutscene override.',tests:{related:regression,independent:{tests:26,pass:26,fail:0}},sourceFiles:sourceFiles.map(p=>({path:p,bytes:fs.statSync(join(p)).size,sha256:sha(join(p))})),preparedResources:{revision:manifest.resourceRevision,preservedInputs:preserved,allPublishedAssetEntriesUnchanged:true},initialGameGraph:{entry:entry.fileName,chunks:closure.size,modules:initialModules.length,lightweightBridgeReachable:true,cinematicLifecycleAndUiExcluded:true,guardUnchanged:true},published:{files:manifest.files.length,bytes,distSiteStageAllHashesMatch:true,unchangedExistingFiles:manifest.files.length-changed.length-added.length,changed:changed.map(row=>row.path),added:added.map(row=>row.path),retiredChunksExcluded:removed.map(row=>row.path)},limits:{browserAutomation:false,pixels:'not inspected',physicalMobileTouch:'unverified',devicePerformance:'unmeasured',wholeSuite:'Known unrelated55 failures from previous whole run remain; this is a related279-test pass.'}};
fs.writeFileSync(path.join(dir,'release-validation.json'),JSON.stringify(report,null,2)+'\n');
const state=read(path.join(dir,'work-state.json'));Object.assign(state,{status:'validated',updatedAt:report.validatedAt,verification:{...state.verification,regression},build:{passed:true,preparedResourcesUnchanged:true,initialGameLifecycleAndUiExcluded:true,releaseValidation:'release-validation.json'},nextAction:'Commit only task-owned code, tests and reviewed deployment files; publish to archer and verify workflow and public file hashes.'});
fs.writeFileSync(path.join(dir,'work-state.json'),JSON.stringify(state,null,2)+'\n');
const reports=['work-state.json','regression.json','release-validation.json','verification-summary.json','verification-controls.json','verification-movement.json','verification-scenery.json','verification-fixtures.mjs','verification-summary.mjs','tested-sources.json','source-snapshot.mjs','prepare-release.mjs','check-publication.mjs'];
const commitFiles=[...sourceFiles,...changed.map(row=>'ArcherPreviewSite/'+row.path),...added.map(row=>'ArcherPreviewSite/'+row.path),'ArcherPreviewSite/deployment-files.json',...reports.map(p=>'ArcherPreview/reports/cinematic-camera-2026-11-12/'+p),'ArcherPreview/reports/cinematic-distance-joystick-2026-11-12/render-module-factor.json','ArcherPreview/reports/cinematic-distance-joystick-2026-11-12/ui-focused.json'];
assert.ok(commitFiles.every(p=>fs.existsSync(join(p))),JSON.stringify(commitFiles.filter(p=>!fs.existsSync(join(p)))));
fs.writeFileSync(path.join(dir,'commit-files.txt'),commitFiles.join('\n')+'\n');
console.log(JSON.stringify({passed:true,files:manifest.files.length,bytes,sourceFiles:sourceFiles.length,commitFiles:commitFiles.length,changed:changed.length,added:added.length,removed:removed.length,relatedTests:279,independentTests:26,preparedResourcesUnchanged:true,initialGameGraph:report.initialGameGraph}));
