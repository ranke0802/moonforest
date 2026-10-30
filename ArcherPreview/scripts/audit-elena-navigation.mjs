// Opt-in integration audit. --baseline uses an immutable Git source snapshot;
// --label after uses the current runtime with exactly the same scenario seeds.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,symlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];},baseline=process.argv.includes('--baseline'),label=arg('--label')??(baseline?'before':'after'),seconds=Number(arg('--seconds')??60),revision='b3a981c';
let source=repo;
if(baseline){
  const snapshot=mkdtempSync(join(tmpdir(),'elena-navigation-baseline-'));
  const archive=execFileSync('git',['archive',revision,'ArcherPreview/src'],{cwd:resolve(repo,'..'),maxBuffer:30e6});
  execFileSync('tar',['-xf','-','-C',snapshot],{input:archive});source=join(snapshot,'ArcherPreview');
  writeFileSync(join(source,'package.json'),'{"type":"module"}');symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'junction');
}
const loadSource=name=>import(pathToFileURL(join(source,'src',name+'.js')).href);
const [{BossModelLibrary},{MourningElenaEncounter},{createWitchCaveTerrain},{CaveNavigation},{caveObstacles},{setWorldCharacter},{ELENA_HOME,MOURNING_MOVEMENT},{MOURNING_CAVE_CLEARANCE_DATA:mask}]=await Promise.all(['boss-models','mourning-elena-encounter','witch-cave-terrain','witch-cave-navigation','witch-cave-layout','world-limits','elena-spec','mourning-cave-clearance-data'].map(loadSource));
setWorldCharacter('warrior-v5');
const round=n=>Math.round(n*1e5)/1e5,point=p=>({x:round(p.x),z:round(p.z)}),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;Object.assign(engine.getCaps(),{textureFloat:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
const base=pathToFileURL(join(repo,'public/assets/')),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base))),packed=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(packed.gltf);
for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(v=>v!=='EXT_meshopt_compression');
for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+packed.files.get(buffer.uri).data.toString('base64');
const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const group of container.animationGroups)group.stop();for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial('navigation-offline',scene);
const models=new BossModelLibrary(scene,'mourning-elena');models.config=config;models.container=container;models.load=async()=>{};
const world={scene,cave:true,terrain:createWitchCaveTerrain(),navigation:new CaveNavigation(caveObstacles()),shadows:{addShadowCaster(){},removeShadowCaster(){}}},player=new TransformNode('navigation-audit-player',scene);
let hits=[],clock=0;
const e=new MourningElenaEncounter(world,()=>{},(p,damage,heavy,kind)=>{if(kind==='player')hits.push({time:round(clock),serial:e.brain.serial,kind:e.brain.repositioning?e.brain.moveKind:'spell:'+e.brain.spell?.pattern,actionTime:round(e.brain.time),damage});},()=>{},{loadAsset:()=>models.instantiate()});
const nav=e.movementNavigation,rawClearance=nav.clearanceAt.bind(nav),rawFree=nav.free.bind(nav),worldFree=world.navigation.free.bind(world.navigation);let barriers=[],pocket=null;
// Actual analytic obstacle distance enters the same free/segment/swept-move
// methods as the baked cave; no forced movement/state/contact result is used.
nav.clearanceAt=(x,z,r=0)=>{
  let clearance=rawClearance(x,z,r);
  for(const b of barriers)clearance=Math.min(clearance,Math.hypot(x-b.x,z-b.z)-b.radius);
  if(pocket)clearance=Math.min(clearance,r+.08+pocket.radius-Math.hypot(x-pocket.x,z-pocket.z));
  return clearance;
};
const counts={},worldCounts={},planningCounts={};let lastSteer=null;
for(const [object,bag]of [[nav,counts],[world.navigation,worldCounts]])for(const name of ['free','findFree','segmentClear','obstacleContact','move','constrain','steer','path']){const original=object[name].bind(object);object[name]=(...args)=>{bag[name]=(bag[name]??0)+1;const value=original(...args);if(object===nav&&name==='steer')lastSteer={time:clock,from:point(args[0]),goal:point(args[1]),result:point(value)};return value;};}
const originalPlan=e.movementPlan.bind(e);e.movementPlan=(...args)=>{const before={...counts},value=originalPlan(...args);planningCounts.calls=(planningCounts.calls??0)+1;for(const name of Object.keys(counts))planningCounts[name]=(planningCounts[name]??0)+counts[name]-(before[name]??0);return value;};
const safe=[];for(let r=0;r<mask.runs.length;r+=2)for(let i=mask.runs[r];i<mask.runs[r]+mask.runs[r+1];i++){const p={x:mask.minX+(i%mask.width+.5)*mask.step,z:mask.minZ+(Math.floor(i/mask.width)+.5)*mask.step};if(rawFree(p,e.radius)&&rawClearance(p.x,p.z,e.radius)>e.radius+.12)safe.push(p);}
const extremes=[['west',-1,0],['east',1,0],['altar',0,-1],['front',0,1]].map(([name,x,z])=>({name,position:safe.reduce((a,b)=>b.x*x+b.z*z>a.x*x+a.z*z?b:a)}));
const starts=[{name:'home',position:ELENA_HOME},...extremes];
const report={generatedAt:new Date().toISOString(),label,sourceRevision:baseline?revision:execFileSync('git',['rev-parse','--short','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),sourceMode:baseline?'immutable Git snapshot':'current working sources',secondsPerNaturalScenario:seconds,model:config.model,home:ELENA_HOME,starts,method:['Actual packed r8 rig, encounter, full-pose cave navigation, ground warning and damage callbacks. NullEngine; no GPU timing claim.','Player feet follow constrained stationary/orbit/ping-pong trajectories, face the boss, receive real damage and use at most the normal three healing potions. HP is not reset during a scenario.','Blocked trials seed the initial public charge action, then change analytic obstacle geometry only. No success/HP/state flags are forced during recovery.','Longest stalled walk excludes intentional 0.9-second charge warning and casts. A slow walk is less than 2 cm/s actual root progress.'],scenarios:[]};
const out=join(repo,'reports/elena-navigation',label+'.json');mkdirSync(dirname(out),{recursive:true});
const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');
function playerStart(origin){
  const candidates=Array.from({length:16},(_,i)=>({x:ELENA_HOME.x+Math.sin(i*Math.PI/8)*5.5,z:ELENA_HOME.z+Math.cos(i*Math.PI/8)*5.5,phase:i*Math.PI/8})).filter(p=>worldFree(p,.32)&&distance(p,origin)>3.2&&distance(p,origin)<8.5);
  return candidates.sort((a,b)=>distance(b,origin)-distance(a,origin))[0];
}
async function run({name,position,pattern='stationary',fps,blocked=null}){
  barriers=[];pocket=null;clock=0;hits=[];lastSteer=null;const start=blocked?{x:25.5,z:-24.125}:position,playerAt=blocked?{x:31.5,z:-24.125,phase:0}:playerStart(start);if(!playerAt)throw new Error('No legal player start '+name);
  player.position.set(playerAt.x,0,playerAt.z);world.terrain.place(player.position);player.rotation.y=Math.atan2(start.x-playerAt.x,start.z-playerAt.z);
  await e.summon(player,{position:new Vector3(start.x,0,start.z),rotationY:0});e.home=ELENA_HOME;e.renderVisible=true;
  for(const bag of [counts,worldCounts,planningCounts])for(const k of Object.keys(bag))delete bag[k];
  if(blocked==='before-charge')barriers=[{x:29,z:-24.125,radius:.1}];
  if(blocked==='all-blocked')pocket={x:e.actor.position.x,z:e.actor.position.z,radius:.07};
  if(blocked){e.brain.movementTurn=3;e.brain.reposition();}
  const result={name,pattern,fps,blocked,requestedStart:point(start),actualStart:point(e.actor.position),playerStart:point(player.position),simulatedSeconds:0,travel:0,visitedGrid:0,casts:0,castPatterns:{},movements:{},longestStalledWalk:0,longestNoProgress:0,twoPointReturns:0,maxTwoPointChain:0,unsafeFrames:0,changedLockedChargeTargets:0,staleChargeWarningFrames:0,chargeHitMax:0,playerHp:500,potionsUsed:0,obstacleInsertedAt:null,recoveryAfterObstacle:null,trace:[],stalls:[],queries:{},worldQueries:{}};
  const cells=new Set(),actionEnds=[],chargeTargets=new Map();let stalled=0,noProgress=0,stallDetail=null,serial=e.brain.serial,priorMode=e.brain.mode,previous=e.actor.position.clone(),twoChain=0,inserted=false,blockedSerial=null;const duration=blocked?20:seconds;
  const finishStall=()=>{if(stallDetail&&stalled>.1)result.stalls.push({...stallDetail,duration:round(stalled),end:round(clock),endPosition:point(e.actor.position),lastSteer});stallDetail=null;};
  const finishAction=()=>{const p=point(e.actor.position);actionEnds.push(p);const n=actionEnds.length;if(n>=3&&distance(p,actionEnds[n-3])<.3&&distance(p,actionEnds[n-2])>.7){result.twoPointReturns++;twoChain++;result.maxTwoPointChain=Math.max(result.maxTwoPointChain,twoChain);}else twoChain=0;};
  for(let frame=0;frame<Math.ceil(duration*fps);frame++){
    clock=frame/fps;const dt=1/fps;
    let target=playerAt;
    if(pattern==='orbit')target={x:ELENA_HOME.x+Math.sin(playerAt.phase+clock*.22)*5.5,z:ELENA_HOME.z+Math.cos(playerAt.phase+clock*.22)*5.5};
    if(pattern==='ping-pong')target={x:ELENA_HOME.x+Math.sin(playerAt.phase+clock*.4)*5.5,z:playerAt.z};
    const beforePlayer=player.position.clone(),d=distance(target,player.position),step=Math.min(2*dt,d);if(d>.001){player.position.x+=(target.x-player.position.x)/d*step;player.position.z+=(target.z-player.position.z)/d*step;world.navigation.constrain(player.position,beforePlayer,.32);world.terrain.place(player.position);}
    player.rotation.y=Math.atan2(e.actor.position.x-player.position.x,e.actor.position.z-player.position.z);
    if(e.playerHp<340&&!e.potions.active)e.usePotion();
    if(!inserted&&((blocked==='during-warning'&&e.chargeOrigin&&e.brain.time>=.35)||(blocked==='during-charge'&&e.chargeOrigin&&e.brain.time>=1.05))){
      const origin=e.actor.position,target=e.repositionTarget,dx=target.x-origin.x,dz=target.z-origin.z,length=Math.hypot(dx,dz),gap=Math.min(length-.15,e.radius+.55);
      barriers=[{x:origin.x+dx/length*gap,z:origin.z+dz/length*gap,radius:.1}];inserted=true;blockedSerial=e.brain.serial;result.obstacleInsertedAt=clock;result.insertedBarrier=barriers[0];
    }
    e.update(dt,player);scene._animate(0);e.poseAndContacts(player,{state:'idle',actionId:null},null,null);
    const moved=distance(previous,e.actor.position),warning=e.brain.repositioning&&e.brain.moveKind==='charge'&&e.brain.time<MOURNING_MOVEMENT.chargeWarning,walking=e.brain.mode==='move'&&!warning&&e.playerAlive&&e.brain.stagger===0;
    if(walking&&moved<.02*dt){if(!stallDetail)stallDetail={start:round(clock),position:point(e.actor.position),engaged:e.engaged,player:point(player.position),target:e.repositionTarget?point(e.repositionTarget):null,home:e.home,kind:e.brain.moveKind,serial:e.brain.serial,firstSteer:lastSteer};stalled+=dt;}else{finishStall();stalled=0;}if(moved<.02*dt&&e.playerAlive)noProgress+=dt;else noProgress=0;
    result.longestStalledWalk=Math.max(result.longestStalledWalk,stalled);result.longestNoProgress=Math.max(result.longestNoProgress,noProgress);result.travel+=moved;cells.add(`${Math.floor(e.actor.position.x/.5)}:${Math.floor(e.actor.position.z/.5)}`);
    if(!rawFree(e.actor.position,e.radius))result.unsafeFrames++;
    if(e.brain.serial!==serial){if(priorMode==='move')finishAction();result.trace.push({time:round(clock),mode:e.brain.mode,kind:e.brain.moveKind,position:point(e.actor.position),target:e.repositionTarget?point(e.repositionTarget):null});serial=e.brain.serial;if(e.brain.mode==='attack'){result.casts++;result.castPatterns[e.brain.spell.pattern]=(result.castPatterns[e.brain.spell.pattern]??0)+1;}if(e.brain.mode==='move')result.movements[e.brain.moveKind]=(result.movements[e.brain.moveKind]??0)+1;}
    if(e.chargeOrigin&&e.brain.repositioning&&e.brain.moveKind==='charge'){
      const target=point(e.repositionTarget),old=chargeTargets.get(serial);if(old&&distance(old,target)>.001)result.changedLockedChargeTargets++;else chargeTargets.set(serial,target);
    }
    if(typeof e.spell?.serial==='string'&&e.spell.serial.startsWith('charge:')&&(!e.brain.repositioning||e.brain.moveKind!=='charge'||e.spell.serial!=='charge:'+e.brain.serial))result.staleChargeWarningFrames++;
    if(inserted&&result.recoveryAfterObstacle===null&&e.brain.serial!==blockedSerial&&(e.brain.mode==='attack'||e.brain.moveKind!=='charge'))result.recoveryAfterObstacle=clock-result.obstacleInsertedAt;
    previous.copyFrom(e.actor.position);priorMode=e.brain.mode;result.simulatedSeconds=(frame+1)/fps;
    if(!e.playerAlive){result.playerDiedAt=result.simulatedSeconds;break;}
  }
  finishStall();if(priorMode==='move')finishAction();result.movementEndpoints=actionEnds;const perCharge={};for(const hit of hits)if(hit.kind==='charge')perCharge[hit.serial]=(perCharge[hit.serial]??0)+1;
  Object.assign(result,{travel:round(result.travel),longestStalledWalk:round(result.longestStalledWalk),longestNoProgress:round(result.longestNoProgress),visitedGrid:cells.size,playerHp:e.playerHp,potionsUsed:3-e.potions.remaining,chargeHitMax:Math.max(0,...Object.values(perCharge)),hits,queries:{...counts},worldQueries:{...worldCounts},planningQueries:{...planningCounts},recoveryAfterObstacle:result.recoveryAfterObstacle===null?null:round(result.recoveryAfterObstacle)});
  report.scenarios.push(result);save();console.log(JSON.stringify({name,pattern,fps,blocked,travel:result.travel,grid:result.visitedGrid,casts:result.casts,stall:result.longestStalledWalk,returns:result.maxTwoPointChain,unsafe:result.unsafeFrames,hp:result.playerHp,recovery:result.recoveryAfterObstacle}));
  e.hide();await new Promise(resolve=>setImmediate(resolve));
}
try{
  for(const fps of [30,60])for(const start of starts)for(const pattern of ['stationary','orbit','ping-pong'])await run({...start,pattern,fps});
  for(const fps of [30,60])for(const blocked of ['charge-control','before-charge','during-warning','during-charge','all-blocked'])await run({name:blocked,position:ELENA_HOME,fps,blocked});
  report.summary={scenarios:report.scenarios.length,simulatedSeconds:report.scenarios.reduce((n,s)=>n+s.simulatedSeconds,0),maxStalledWalk:Math.max(...report.scenarios.map(s=>s.longestStalledWalk)),unsafeFrames:report.scenarios.reduce((n,s)=>n+s.unsafeFrames,0),changedChargeTargets:report.scenarios.reduce((n,s)=>n+s.changedLockedChargeTargets,0),staleChargeWarningFrames:report.scenarios.reduce((n,s)=>n+s.staleChargeWarningFrames,0),maxChargeHits:Math.max(...report.scenarios.map(s=>s.chargeHitMax)),naturalDeaths:report.scenarios.filter(s=>s.playerDiedAt).map(s=>({name:s.name,pattern:s.pattern,fps:s.fps,time:s.playerDiedAt})),maxTwoPointChain:Math.max(...report.scenarios.map(s=>s.maxTwoPointChain))};
  const natural=report.scenarios.filter(s=>!s.blocked),totalQueries=key=>report.scenarios.reduce((n,s)=>n+(s.planningQueries[key]??0),0);
  report.summary.queryCost={planningSegmentCalls:totalQueries('segmentClear'),planningFreeCalls:totalQueries('free'),planningSegmentCallsPerSecond:round(totalQueries('segmentClear')/report.summary.simulatedSeconds),globalPathCalls:report.scenarios.reduce((n,s)=>n+(s.queries.path??0),0),note:'Call counts, not isolated CPU or GPU timings. Candidate evaluation is bounded per action; comparable 30/60 fps scenarios retain near-equal planning query counts.'};
  report.summary.natural={meanTravelPerMinute:round(natural.reduce((n,s)=>n+s.travel*60/s.simulatedSeconds,0)/natural.length),meanVisitedHalfMetreCells:round(natural.reduce((n,s)=>n+s.visitedGrid,0)/natural.length),maxStalledWalk:Math.max(...natural.map(s=>s.longestStalledWalk))};save();console.log(JSON.stringify(report.summary));
  if(process.argv.includes('--check')){
    assert.equal(report.summary.unsafeFrames,0);assert.equal(report.summary.changedChargeTargets,0);assert.equal(report.summary.staleChargeWarningFrames,0);assert.ok(report.summary.maxChargeHits<=1);assert.equal(report.summary.naturalDeaths.length,0);
    for(const result of report.scenarios){assert.ok(result.longestStalledWalk<=.45,`${result.name}/${result.pattern}/${result.fps}: ${result.longestStalledWalk}s stalled walk`);assert.ok(result.casts>=3);if(result.blocked==='all-blocked')assert.ok(result.travel<.2);if(result.blocked==='charge-control')assert.equal(result.chargeHitMax,1,'unobstructed charge must actually contact the stationary player once');if(result.obstacleInsertedAt!==null)assert.ok(result.recoveryAfterObstacle<=.45,`${result.name}: ${result.recoveryAfterObstacle}s recovery`);}
  }
}finally{e.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();}
