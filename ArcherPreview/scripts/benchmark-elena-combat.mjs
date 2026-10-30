import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {cpus,platform,arch} from 'node:os';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'reports/elena-combat-followup'),base='b983cfc';mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=name=>execFileSync('git',['show',`${base}:ArcherPreview/src/${name}`],{cwd:root,maxBuffer:20*1024*1024});
const snapshot={};
for(const [name,target,rewrite]of [['elena-ground-magic.js','elena-ground-magic-before.js',false],['boss-encounter.js','boss-encounter-before.js',true],['elena-spec.js','elena-spec-before.js',false]]){
  const bytes=source(name);let text=bytes.toString('utf8');
  if(rewrite)text=text.replace(/from\s+(['"])\.\/([^'"]+)\1/g,(_,quote,path)=>`from ${quote}../../src/${path}${quote}`);
  writeFileSync(resolve(out,target),text);snapshot[name]={base,originalSha256:sha(bytes),snapshotFile:target,snapshotSha256:sha(Buffer.from(text)),relativeImportsRebasedToCurrentUnchangedDependencies:rewrite};
}
if(process.argv.includes('--prepare-only')){console.log(JSON.stringify({prepared:true,snapshot}));process.exit(0);}
const mode=process.argv.includes('--current')?'current':'baseline';
const importFile=path=>import(pathToFileURL(path).href);
const [{NullEngine,Scene,Vector3,TransformNode,VertexBuffer},ground,boss,{MOURNING_SPELLS},{createWitchCaveTerrain},{CaveNavigation},{caveObstacles}]=await Promise.all([
  import('@babylonjs/core'),importFile(resolve(mode==='baseline'?out:resolve(root,'src'),mode==='baseline'?'elena-ground-magic-before.js':'elena-ground-magic.js')),
  importFile(resolve(mode==='baseline'?out:resolve(root,'src'),mode==='baseline'?'boss-encounter-before.js':'boss-encounter.js')),
  importFile(resolve(out,'elena-spec-before.js')),import('../src/witch-cave-terrain.js'),import('../src/witch-cave-navigation.js'),import('../src/witch-cave-layout.js')]);
const stats=values=>{const a=[...values].sort((a,b)=>a-b);return {samples:a.length,meanMs:a.reduce((n,v)=>n+v,0)/a.length,p50Ms:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],maxMs:a.at(-1)};};
const counts=scene=>({meshes:scene.meshes.length,materials:scene.materials.length,geometries:scene.geometries.length,textures:scene.textures.length,skeletons:scene.skeletons.length,morphManagers:scene.morphTargetManagers.length});
const memory=()=>{const {rss,heapUsed,external,arrayBuffers}=process.memoryUsage();return {rss,heapUsed,external,arrayBuffers};};
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const terrain=createWitchCaveTerrain(),actualHeightAt=terrain.heightAt.bind(terrain);let heightSamples=0;
terrain.heightAt=(x,z)=>{heightSamples++;return actualHeightAt(x,z);};
const world={scene,terrain},origin=new Vector3(29,terrain.heightAt(29,-27),-27),target=new Vector3(29,6,-20);
const cases=MOURNING_SPELLS.map(s=>({pattern:s.pattern,range:s.range,bossRadius:1.05}));
const report={generatedAt:new Date().toISOString(),mode,baseCommit:base,scope:'CPU only: actual ground-spell geometry generation/NullEngine buffer replacement plus actual CaveNavigation invoked by isolated BossEncounter update/contact methods. No rendering, GPU, FPS, full actor animation or whole-game timing claim.',runtime:{node:process.version,babylon:'9.31.0',cpu:cpus()[0]?.model,platform:platform(),arch:arch(),explicitGC:!!global.gc},snapshot,sources:{},method:{warmupCastsPerPattern:20,measuredCastsPerPattern:200,navigationWarmupFrames:120,navigationMeasuredFrames:600,dt:1/60,terrain:'createWitchCaveTerrain(): actual 160m/192 subdivision TerrainHeightField',phase2PatternOptions:cases,timingCoordination:process.env.ELENA_BENCHMARK_WINDOW??'Unspecified; assess host contention before interpreting CPU values'},ground:[],navigation:[]};
for(const name of ['elena-ground-magic.js','boss-encounter.js','witch-cave-navigation.js','village-navigation.js','navigation.js','witch-cave-terrain.js','terrain.js','witch-cave-collision.js'])report.sources[name]={currentSha256:sha(readFileSync(resolve(root,'src',name))),baselineSha256:sha(source(name))};
const bufferKinds=['positionVertexBuffers','normalVertexBuffers','indexBuffers','cpuPositionArrays','positionDataBuffers','normalDataBuffers'];
function buffers(fx){return [fx.mesh,fx.rim].flatMap(m=>{
  const position=m.getVertexBuffer(VertexBuffer.PositionKind),normal=m.getVertexBuffer(VertexBuffer.NormalKind);
  return [position,normal,m.geometry?.getIndexBuffer(),m.getVerticesData(VertexBuffer.PositionKind),position?.getBuffer(),normal?.getBuffer()];
});}
function shape(fx){return [fx.mesh,fx.rim].map(m=>({name:m.name,vertices:m.getTotalVertices(),triangles:m.getTotalIndices()/3,positionUpdatable:m.getVertexBuffer(VertexBuffer.PositionKind)?.isUpdatable(),indexUpdatable:m.geometry?.getIndexBuffer()?.isUpdatable}));}
for(const options of [...cases,{pattern:'mixed-five',mixed:true}]){
  const fx=new ground.GroundSpellTelegraph(world);let serial=0;
  function cast(i){const selected=options.mixed?cases[i%cases.length]:options,a=i*.137;target.set(origin.x+Math.sin(a)*8,origin.y,origin.z+Math.cos(a)*8);fx.aim(++serial,selected.pattern,origin,target,selected);fx.show(.8,1.65);}
  const kinds=bufferKinds,seen=Object.fromEntries(kinds.map(k=>[k,new WeakSet()])),uniqueNew=Object.fromEntries(kinds.map(k=>[k,0]));
  function observe(measured=false){const current=buffers(fx);for(let n=0;n<2;n++)for(const [j,k]of kinds.entries()){const value=current[n*kinds.length+j];if(value&&typeof value==='object'&&!seen[k].has(value)){seen[k].add(value);if(measured)uniqueNew[k]++;}}}
  for(let i=0;i<20;i++){cast(i);observe();}global.gc?.();const beforeCounts=counts(scene),beforeMemory=memory(),beforeHeight=heightSamples,timings=[];
  const changed=Object.fromEntries(kinds.map(k=>[k,0]));let previous=buffers(fx),peakHeap=beforeMemory.heapUsed;
  for(let i=0;i<200;i++){
    const start=performance.now();cast(i);timings.push(performance.now()-start);const next=buffers(fx);
    for(let n=0;n<2;n++)for(const [j,k]of kinds.entries())if(previous[n*kinds.length+j]!==next[n*kinds.length+j])changed[k]++;
    previous=next;observe(true);if(i%20===0)peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);
  }
  global.gc?.();const afterMemory=memory(),afterCounts=counts(scene);assert.deepEqual(afterCounts,beforeCounts);
  const cachedHeight=heightSamples,cachedBefore=buffers(fx),cachedTimes=[];
  for(let i=0;i<200;i++){const start=performance.now();fx.aim(serial,fx.plan.pattern,origin,target,options);fx.show(i/200,1.65);cachedTimes.push(performance.now()-start);}
  assert.equal(heightSamples,cachedHeight);assert.deepEqual(buffers(fx),cachedBefore);
  report.ground.push({pattern:options.pattern,options,timing:stats(timings),repeatedSameSerialAimAndOpacity:stats(cachedTimes),terrainHeightSamples:cachedHeight-beforeHeight,terrainHeightSamplesPerCast:(cachedHeight-beforeHeight)/200,bufferIdentityChangesAcross200SameTopologyCasts:changed,newBufferObjectsAfterWarmup:uniqueNew,bufferCountingNote:'Identity changes can indicate swapping preexisting cached geometry; newBufferObjectsAfterWarmup uses WeakSets seeded by all warmup patterns to distinguish creation from reuse.',geometry:shape(fx),countsBefore:beforeCounts,countsAfter:afterCounts,memoryBefore:beforeMemory,memoryAfterGC:afterMemory,retainedHeapDeltaBytes:afterMemory.heapUsed-beforeMemory.heapUsed,sampledPeakHeapBytes:peakHeap,memoryScope:'Retained process heap after explicit GC; allocation rate/GPU bytes are not measured.'});
  fx.dispose();assert.equal(scene.meshes.length,0);assert.equal(scene.materials.length,0);assert.equal(scene.geometries.length,0);
}
const nav=new CaveNavigation(caveObstacles());let navCounts={segmentClear:0,steer:0,constrain:0,path:0};
for(const name of Object.keys(navCounts)){const original=nav[name].bind(nav);nav[name]=(...args)=>{navCounts[name]++;return original(...args);};}
world.navigation=nav;
// Initialize static clearance caches outside measurements.
nav.segmentClear(origin,target,0,true);nav.free(origin,.75);
for(const scenario of [{name:'stationary-cast',mode:'attack',state:'cast'},{name:'stationary-idle',mode:'idle',state:'idle'}]){
  const encounter=new boss.BossEncounter(world,()=>{});encounter.ownsCombat=false;encounter.active=true;encounter.motionRootTravel=false;encounter.radius=.75;encounter.stopDistance=1.08;
  encounter.actor=new TransformNode('bench-boss',scene);encounter.actor.position.copyFrom(origin);encounter.carrier=new TransformNode('bench-carrier',scene);encounter.carrier.parent=encounter.actor;
  const player=new TransformNode('bench-player',scene);player.position.set(origin.x,origin.y,origin.z+6);
  encounter.config={scale:1,catalog:['idle','cast'].map(name=>({name,fps:30,rootTrack:[[0,0,0],[0,0,0]],groundTrack:[0,0],duration:3}))};
  encounter.brain={hp:1800,maxHp:1800,mode:scenario.mode,state:scenario.state,time:0,serial:1,stagger:0,flash:0,flashDuration:.18,impacted:false,durations:{idle:3,cast:3},update(dt){this.time+=dt;return {events:[],speed:0};}};
  encounter.animator={transition(){},update(){}};encounter.asset={meshes:[]};encounter.nodes={};encounter.poseNodes=[];encounter.alignPose=()=>{};encounter.grab={active:false,holding:false,update(){}};encounter.ring={isVisible:false};encounter.warningRing={update(){}};
  encounter.motionSpec=()=>({range:13});encounter.attackRange=()=>13;
  const frame=()=>{encounter.update(1/60,player);encounter.poseAndContacts(player,{state:'idle'},null,null);};
  for(let i=0;i<120;i++)frame();navCounts={segmentClear:0,steer:0,constrain:0,path:0};const heightBefore=heightSamples,startPosition=encounter.actor.position.clone(),times=[];global.gc?.();const before=memory();
  for(let i=0;i<600;i++){const t=performance.now();frame();times.push(performance.now()-t);}
  global.gc?.();report.navigation.push({scenario:scenario.name,timing:stats(times),navigationCalls:navCounts,callsPerFrame:Object.fromEntries(Object.entries(navCounts).map(([k,v])=>[k,v/600])),terrainHeightSamples:heightSamples-heightBefore,startPosition:startPosition.asArray(),endPosition:encounter.actor.position.asArray(),memoryBefore:before,memoryAfterGC:memory(),fixture:'Actual BossEncounter methods and CaveNavigation; fixed zero-speed brain result, no pending events/player sample, stub animation and pose/contact geometry to isolate navigation decisions.'});
  encounter.actor.dispose();encounter.carrier.dispose();player.dispose();
}
report.finalSceneCounts=counts(scene);report.sourceUnchangedDuringRun=Object.entries(report.sources).every(([name,v])=>sha(readFileSync(resolve(root,'src',name)))===v.currentSha256);
assert.ok(report.sourceUnchangedDuringRun,'Source changed during benchmark; repeat in quiet window');
const filename=mode==='baseline'?'performance-baseline.json':'performance-current.json';writeFileSync(resolve(out,filename),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({file:filename,mode,ground:report.ground.map(p=>({pattern:p.pattern,meanMs:p.timing.meanMs,p95Ms:p.timing.p95Ms,changed:p.bufferIdentityChangesAcross200SameTopologyCasts,retainedHeapDeltaBytes:p.retainedHeapDeltaBytes})),navigation:report.navigation.map(p=>({scenario:p.scenario,timing:p.timing,callsPerFrame:p.callsPerFrame})),finalSceneCounts:report.finalSceneCounts}));
scene.dispose();engine.dispose();
