import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=new URL('../../',import.meta.url),folder=new URL('./',import.meta.url),cwd=fileURLToPath(root),baseline='5a6abaa';
const attachment=process.argv[2]??'C:/Users/ryank/.codex/attachments/33181ab7-bbb5-482e-8f55-6c7a016b9bdb/붙여넣은 텍스트.txt';
const bytes=readFileSync(attachment),log=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),validation=JSON.parse(readFileSync(new URL('boss-material-validation.json',folder)));
const sha=value=>createHash('sha256').update(value).digest('hex'),normalized=value=>value.toString().replace(/\r\n/g,'\n');
const source=path=>readFileSync(new URL(path,root));
const line=(path,needle)=>({path,line:normalized(source(path)).split('\n').findIndex(value=>value.includes(needle))+1});
const proofPaths=['src/boss-shader-warmup.js','src/enemy-death.js','src/hit-feedback.js','src/monster-toon.js','src/mourning-elena-animation.js','src/mourning-death-knee.js','src/mourning-death-knee-data.js','src/mourning-death-depth.js','src/mourning-death-depth-data.js','src/player-texture-profile.js','public/assets/warrior-v3.json','public/assets/elena.json','public/assets/mourning-elena.json'];
const preservation=proofPaths.map(path=>{
 const old=execFileSync('git',['show',baseline+':ArcherPreview/'+path],{cwd,maxBuffer:24*1024*1024}),current=source(path),oldHash=sha(normalized(old)),currentHash=sha(normalized(current));
 return {path,baselineSha256:oldHash,currentSha256:currentHash,unchanged:oldHash===currentHash,hashScope:'UTF8, CRLF normalized to LF'};
});
const delays=log.recentDelays.map(row=>({atSeconds:row.atSeconds,frameMs:row.frameMs,cpuSubmitMs:row.jsSubmitMs,sceneMs:row.render?.sceneMs,animationMs:row.render?.animationMs,bossUpdateMs:row.bossUpdateMs,contactsMs:row.contactsMs,drawCalls:row.render?.drawCalls,bosses:row.bosses,pendingGeometry:row.geometryPending,pendingTexture:row.texturePending}));
const spikes=delays.filter(row=>row.sceneMs>=80),noBossSpikes=spikes.filter(row=>!row.bosses?.length),actual=validation.cases.find(row=>row.case==='actual-player-both-phases-complete-death');
const report={
 baseline,attachment:{sha256:sha(bytes),createdAt:log.createdAt,bundle:log.bundle,gpuStatus:log.renderMetrics?.gpu?.status??'unsupported',gpuMeasured:false},
 observed:{comparison:{label:log.bossComparison.label,mode:log.bossComparison.mode,prepareMs:log.bossComparison.prepareMs,preparation:log.bossComparison.preparation,during:log.bossComparison.during,before:log.bossComparison.before,after:log.bossComparison.after,cameraChanged:log.bossComparison.cameraChanged,positionChanged:log.bossComparison.positionChanged},sceneSpikes:spikes,noBossSceneSpikes:noBossSpikes,recentDelaySamples:delays},
 confirmedFix:{path:'src/character-outlines.js',scope:'Remove only repeated morph-parameter/texture-manager bind from the shared ink onBind observer. Preserve explicit bone binding.',beforeTextureManagerBindsPerDraw:2,afterTextureManagerBindsPerDraw:1,baselineEvidence:'boss-material-baseline.log: actual packed11-target manager binds2, expected1',passEvidence:'boss-material-validation.json',reason:'Babylon9.31 unfrozen ShaderMaterial.bind calls BindMorphTargetParameters and manager._bind immediately before _afterBind/onBind, for every mesh even on cached consecutive draws.',gpuCallSavingsMeasured:false,phoneFpsSavingsMeasured:false},
 excludedInTestedScope:{perSubmeshInk:true,phase1And2AnimatedIdleFrames:240,postDeathFrames:120,steadyEffectRequests:actual.steady.map(row=>({label:row.label,frames:row.frames,effectRequests:row.effectRequests,refGrowth:row.refGrowth})),deathFrames:606,deathDurationSeconds:actual.deathDuration,deathNewEffects:actual.deathNewEffects,deathNewRawTextures:actual.deathNewRawTextures,deathCachedRequests:actual.deathFrames,resourceInventoryStable:actual.resourcesStable},
 findings:[
  {certainty:'confirmed',finding:'Duplicate morph bindings in unfrozen character ink were present; exact current manager/independent bone binding is retained after removal.'},
  {certainty:'confirmed-in-CPU-SDK-probe',finding:'Actual warrior vertex attributes alongside both packed Elena phases do not reproduce the scenery global-wrapper COLOR_0 churn: shared character ink stores effects per submesh. Animated idle and post-death360frames request0 cached effects and grow0 effect references.'},
  {certainty:'confirmed-in-CPU-SDK-probe',finding:'Actual encounter first death plus all10seconds, including fade firstopacity at5.8667s, introduces0 new Effect objects and0 new RawTexture allocations. A few existing PBR cache requests occur only at discrete state/morph/visibility transitions; they were not rewritten.'},
  {certainty:'unresolved-on-device',finding:'The148ms transformation,199.3ms death and134.2ms later scene peaks are not reproduced as new SDK shader compilation/effect creation. Warm preparation18ms is not the measured148ms scene call. Driver first draw/pipeline cost, GC and full-map render work remain unseparated in the old diagnostics.'},
  {certainty:'confirmed-log-scope',finding:'Large scene spikes also occur with no active boss, so neither death animation nor the small morph-binding duplication alone explains all delays. The attachment has no usable GPU timings or temperature measurement.'},
 ],
 sources:[line('src/character-outlines.js','new ShaderMaterial'),line('src/character-outlines.js','BindBonesParameters(mesh'),line('node_modules/@babylonjs/core/Materials/shaderMaterial.pure.js','constructor(name, scene, shaderPath'),line('node_modules/@babylonjs/core/Materials/shaderMaterial.pure.js','if (effect && mesh && (mustRebind || !this.isFrozen))'),line('src/boss-shader-warmup.js','const variants='),line('src/boss-shader-warmup.js','checkReadyOnEveryCall=true'),line('src/enemy-death.js','MOURNING_CORPSE_SECONDS=10')],
 preservation,allProtectedPathsUnchanged:preservation.every(row=>row.unchanged),
 validation:{passed:validation.passed,focusedTests:20,failed:0,log:'boss-material-focused.log',newTest:'tests/character-material-steady-state.test.js',command:'node --test tests/character-material-steady-state.test.js tests/character-outlines.test.js tests/boss-shader-warmup.test.js tests/character-render-cost.test.js'},
 limitations:validation.limitations,
 nextDeviceEvidence:'Use the parent-added CPU scene substage and target-overrun diagnostics on a fresh same-position replay. Effect creation/cache identity counts here do not measure GPU driver compilation, GPU time, phone thermal behavior or FPS improvement.'
};
if(report.sources.some(row=>row.line<1))throw Error('Source reference not found');
if(!report.allProtectedPathsUnchanged)throw Error('A protected scope file changed; inspect rather than claiming preservation');
writeFileSync(new URL('boss-material-assessment.json',folder),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({protectedPaths:preservation.length,unchanged:report.allProtectedPathsUnchanged,focusedTests:20,fix:'morph2->1',bossSpikesNotReproduced:true,report:'boss-material-assessment.json'}));
