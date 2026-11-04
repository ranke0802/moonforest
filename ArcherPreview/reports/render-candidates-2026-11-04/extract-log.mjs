import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const base=new URL('../../',import.meta.url),folder=new URL('./',import.meta.url),baseline='c65e731';mkdirSync(folder,{recursive:true});
const latest=process.argv[2]??'C:/Users/ryank/.codex/attachments/1c868abd-131f-4885-8a83-491ad4d7c523/붙여넣은 텍스트.txt';
const previous='C:/Users/ryank/.codex/attachments/b8fa1087-7b46-4718-89ef-bb03b9b677c2/붙여넣은 텍스트.txt';
const load=path=>{const bytes=readFileSync(path);return {data:JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),sha256:createHash('sha256').update(bytes).digest('hex')};};
const input=load(latest),log=input.data,old=load(previous),events=log.recentDelays;
const stats=values=>{const list=values.filter(Number.isFinite).sort((a,b)=>a-b);return {samples:list.length,min:list[0]??null,mean:list.length?list.reduce((a,b)=>a+b,0)/list.length:null,p95:list[Math.ceil(list.length*.95)-1]??null,max:list.at(-1)??null};};
const rows=events.map(row=>({atSeconds:row.atSeconds,map:row.map,activity:row.activity,trigger:row.trigger,frameIntervalMs:row.frameMs,cpuSubmitMs:row.jsSubmitMs,texturePending:row.texturePending,geometryPending:row.geometryPending,textureWork:row.textureWork,candidates:row.activeMeshCandidates,position:row.position,camera:row.camera,render:row.render,bossUpdateMs:row.bossUpdateMs,contactsMs:row.contactsMs,worldUpdateMs:row.worldUpdateMs,hudUpdateMs:row.hudUpdateMs}));
const summarize=list=>({events:list.length,frameIntervalMs:stats(list.map(row=>row.frameIntervalMs)),cpuSubmitMs:stats(list.map(row=>row.cpuSubmitMs)),sceneMs:stats(list.map(row=>row.render?.sceneMs)),activeMeshesMs:stats(list.map(row=>row.render?.activeMeshesMs)),drawSubmissionMs:stats(list.map(row=>row.render?.drawSubmissionMs)),renderTargetsMs:stats(list.map(row=>row.render?.renderTargetsMs)),worldUpdateMs:stats(list.map(row=>row.worldUpdateMs)),hudUpdateMs:stats(list.map(row=>row.hudUpdateMs))});
const idle=rows.filter(row=>row.texturePending===0&&row.textureWork?.stage==='idle'),fullyIdle=idle.filter(row=>row.geometryPending===0),moving=rows.filter(row=>row.activity?.includes('이동'));
const candidates=new Map();for(const row of rows){const c=row.candidates;if(!c)continue;const key=JSON.stringify([row.map,c.scanned,c.submitted,c.skipped,c.owned]);if(!candidates.has(key))candidates.set(key,{map:row.map,...c,skippedFraction:c.scanned?c.skipped/c.scanned:null,untracked:c.scanned-c.owned,enabledOrCustomOwned:c.owned-c.skipped,events:0});candidates.get(key).events++;}
const summary=log.summary,prior=old.data.summary;
const oldSources=Object.fromEntries(['src/frame-diagnostics.js','src/village-active-candidates.js'].map(path=>[path,execFileSync('git',['show',baseline+':ArcherPreview/'+path],{cwd:fileURLToPath(base),encoding:'utf8'})]));
const ref=(path,needle)=>({revision:baseline,path,line:oldSources[path].split('\n').findIndex(line=>line.includes(needle))+1});
const evidence={baseline,input:{sha256:input.sha256,createdAt:log.createdAt,bundle:log.bundle,character:log.character,renderSize:log.renderSize,quality:log.quality,gpuStatus:log.renderMetrics?.gpu?.status},
 summary:{reported:summary,fpsWindowSeconds:1,intervalMeanWindowSeconds:10,reciprocalMeanFrameFps:1000/summary.meanFrameMs,lastOneSecondImpliedMeanIntervalMs:1000/summary.fps,targetMissFraction:summary.missedTargetFrames/summary.samples,interpretation:'40.658FPS is the latest1second.24.2777ms is the last10seconds413samples, equivalent41.190FPS. slowFrames0 uses50ms, while233/413=56.4% exceed the separate20.833ms target-overrun threshold. Different windows must not be called inconsistent or interpreted as a controlled before/after result.'},
 priorLogDescriptiveOnly:{sha256:old.sha256,createdAt:old.data.createdAt,bundle:old.data.bundle,character:old.data.character,summary:prior,reciprocalMeanFrameFps:Number.isFinite(prior.meanFrameMs)?1000/prior.meanFrameMs:null,controlledComparison:false,reason:'Different camera paths, map residency, loading phases, observation windows and device thermal history. This is a new observation, not a causal A/B benchmark.'},
 delayedEventGroups:{all:summarize(rows),textureIdle:summarize(idle),textureAndGeometryIdle:summarize(fullyIdle),texturePending:summarize(rows.filter(row=>row.texturePending>0)),moving:summarize(moving),plainsTextureIdle:summarize(idle.filter(row=>row.map==='warrior-plains')),villageTextureIdle:summarize(idle.filter(row=>row.map==='warrior-v3'))},
 candidateSnapshots:[...candidates.values()],currentCandidateSnapshot:log.activeMeshCandidates,currentTextureSnapshot:log.textureWork,textureStreaming:log.textureStreaming,
 confirmed:[
  '31of32 retained delay events have texturePending0 and stageidle;28also have geometryPending0. Texture preparation is not required for the recorded delays.',
  'Six plains movement delay events have3036scanned/1835–1879submitted and1157–1201skipped. The disabled-instance filter is operating, but still scans the full native list and retains all untracked source/LOD/dynamic candidates.',
  'The village final snapshot scans1720, submits1211, skips509, owns753.967candidates are untracked;244owned instances remain submitted. These counts describe work candidates, not actual visible draws.',
  'Target60 is frequently missed inside the last10second summary even though its50ms slow-event count is0. The retained events span earlier portions of the session and are a different population.',
 ],
 unresolved:[
  'The log has no candidate-provider duration; O(n) WeakSet/method checks can be identified in source but their elapsed CPU contribution is unmeasured.',
  'CPU draw-submission counters include driver-call waits and can overlap render-target work; they are not GPU elapsed measurements and must not be added as independent disjoint stages.',
  'A long frame interval with a shorter current JS submission cannot identify input, GC, OS scheduling, GPU throttling or the prior-frame driver delay. No input-event latency timestamp or physical temperature exists in this log.',
 ],
 sourceReferences:[ref('src/frame-diagnostics.js','if(now-this.times[i]>10000)'),ref('src/frame-diagnostics.js','if(now-this.times[i]<=1000)'),ref('src/frame-diagnostics.js','get thresholdMs()'),ref('src/frame-diagnostics.js','if(ms>1250/this.targetFps)'),ref('src/village-active-candidates.js','for(let i=0;i<list.length;i++)')],
 controlledABPlan:{
  baseline:'c65e731 public provider: disabled registered frozen native instances only; compare the new provider against this exact implementation, plus native baseline where useful.',
  fixedInputs:'Four authoritative map layouts/manifests, actual shipped packed geometry and identical lighting/camera/LOD state; omit downloaded images in NullEngine while preserving material feature contracts. Freeze view and enabled/visibility flags within each A/B pair.',
  order:'Render warmup, then alternate baseline/new/baseline on the same engine and scene for each fixed camera. No geometry streaming or texture admission between paired renders.',
  equality:'Assert actual active mesh names, native main-camera and shadow batch source/index ranges/instance names and matrices, geometry/LOD selection, material state and pass order. Record effect/readiness calls and candidate classifications independently.',
  boundaries:'Include visible/hidden shared sources, source LODs, enabled/disabled frozen instances, dynamic player-like meshes, nested parent disable, custom methods, custom/subset providers and release/revisit. A source hidden from its own draw can still be needed for instance preactivation.',
  measurements:'SDK candidate/readiness calls and CPU reference timing only. No GPU driver, phone FPS, heat, texture quality or visual-certification claim.',
 },
 samplingLimitations:['Only32threshold-selected delayed events are retained; groupmeans and maxima describe this biased retained set, not all frames or session frequency.','summary is a rolling latest10seconds; fps is a rolling latest1second.','Draw/active/shadow equality can be validated in NullEngine, but real driver/GPU/mobile behavior remains unmeasured.'],events:rows,
};
if(evidence.sourceReferences.some(row=>row.line<1))throw Error('Missing baseline source reference');
writeFileSync(new URL('log-evidence.json',folder),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({fps:summary.fps,reciprocal10sMeanFps:evidence.summary.reciprocalMeanFrameFps,targetMissPercent:100*evidence.summary.targetMissFraction,retainedEvents:rows.length,textureIdle:idle.length,bothIdle:fullyIdle.length,moving:moving.length,output:'log-evidence.json'}));
