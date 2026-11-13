import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from '@babylonjs/core';
import {wolfRamFixture} from './helpers/wolf-ram-fixture.js';
import {huntResourceCounts} from './helpers/wolf-hunt-fixture.js';
import {WOLF_V02_ACTIONS,WOLF_V02_BY_ID,WOLF_V02_GAIT,WOLF_V02_ORBIT} from '../src/wolf-v02-spec.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
import {WolfEncounter} from '../src/wolf-encounter.js';
import {segmentDistanceSquared} from '../src/melee-collision.js';
import {WOLF_V02_RAM_CLIPS} from '../src/wolf-v02-authored-clips.js';
import {measureSkinContact} from '../reports/wolf-v02-ram-r12/skin-contact.mjs';

const baseline=JSON.parse(fs.readFileSync(new URL('../reports/wolf-v02-ram-r12/preservation-baseline.json',import.meta.url)));
const sha=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const evidence=[];
const sourcePaths=['src/wolf-v02-spec.js','src/wolf-v02-encounter.js','src/wolf-v02-ram.js','src/wolf-v02-locomotion.js','src/wolf-v02-authored-clips.js','src/wolf-v02-ram-clips.json','src/warrior-v2.js','src/animation.js','src/player-dimensions.js','src/boss-battle.js','src/boss-encounter.js','src/tree-view-surface.js','src/melee-collision.js','tests/helpers/wolf-ram-fixture.js','tests/wolf-v02-ram-integration.test.js','reports/wolf-v02-ram-r12/skin-contact.mjs'];
const hashes=()=>Object.fromEntries(sourcePaths.filter(path=>fs.existsSync(path)).map(path=>[path,sha(path)]));
const initialHashes=hashes();
let sharedApi=null;
test.after(async()=>{
 const finalHashes=hashes();
 const label=process.env.WOLF_RAM_EVIDENCE_LABEL?.replace(/[^a-z0-9_-]/gi,'-'),name=label?`independent-gameplay-${label}.json`:'independent-gameplay.json';
 fs.writeFileSync('reports/wolf-v02-ram-r12/'+name,JSON.stringify({scope:'Actual packed warrior-v2 and approved wolf rigs; native controller/animator, shared combat, real post-animation skeletal contacts. Contact-band cases establish an engagement band after actual rise, then allow a fresh autonomous observation and selection. No player/wolf relocation occurs during successful ram/fall/maul. Explicit escape/invalid-state tests are negative injections. CPU tests do not establish visual motion/skin quality, player feel or device performance.',sourceHashes:finalHashes,initialSourceHashes:initialHashes,cases:evidence},null,2)+'\n');
 assert.deepEqual(finalHashes,initialHashes,'runtime changed during QA; rerun after freeze');
 if(sharedApi)await sharedApi.dispose();
});

async function begin(api,{distance=WOLF_V02_BY_ID.lunge.preferredDistance,speed=1,standingBand=true}={}){
 const {f}=api;f.player.position.set(0,0,distance);f.player.rotation.y=Math.PI;
 f.world.terrain.place(f.player.position);
 assert.equal(await f.battle.summon(f.player,1,'wolf'),true);const e=f.battle.encounters[0];
 e.actor.position.setAll(0);f.world.terrain.place(e.actor.position);e.actor.rotation.y=0;e.brain.random=()=>.5;e.brain.configureAttacks({custom:true,sequence:['lunge'],speed});e.playerHp=500;e.playerInvulnerable=0;
 if(standingBand){
  for(let i=0;i<600&&e.brain.behavior!=='flank';i++)api.step(1/60);
  assert.equal(e.brain.behavior,'flank');e.v02Pose?.restore();e.actor.position.setAll(0);f.world.terrain.place(e.actor.position);e.actor.rotation.y=0;
  e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.behavior='observe';e.brain.observation=5;
  e.animator.transition(WOLF_CLIPS.watch,{clipTime:0,actionId:e.brain.serial,blendDuration:0});e.animator.update(0);WolfEncounter.prototype.alignPose.call(e);
  e.v02Pose?.resetPlants();e.v02Pose?.capturePreviousFeet();e.v02StalkRadius=null;e.brain.beginStalk();
 }
 return e;
}
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
function row(api,e){
 const body=api.bodyPoints(),jaw=e.nodes.jaw.getAbsolutePosition().asArray(),head=e.nodes.head.getAbsolutePosition().asArray();
 const clip=e.config.catalog.find(clip=>clip.name===e.brain.state),frames=clip?.rootTrack,index=frames?Math.min(frames.length-1,e.brain.time*clip.fps):0,from=Math.floor(index),to=frames?Math.min(from+1,frames.length-1):0;
 const authoredRoot=frames?frames[from].map((v,k)=>v+(frames[to][k]-v)*(index-from)):null;
 return {time:api.elapsed,sourceTime:e.brain.time,serial:e.brain.serial,mode:e.brain.mode,behavior:e.brain.behavior,wolfState:e.brain.state,authoredRoot,playerState:api.result.state,knockedDown:api.result.knockedDown===true,playerClipTime:api.result.clipTime,playerRoot:api.f.player.position.asArray(),wolfRoot:e.actor.position.asArray(),body,jaw,head,headTorsoDistance:Math.sqrt(segmentDistanceSquared(head,head,body.Hips,body.Spine2)),jawTorsoDistance:Math.sqrt(segmentDistanceSquared(jaw,jaw,body.Hips,body.Spine2)),contact:structuredClone(e.v02LastContact),ram:structuredClone(e.inspect().ram??null)};
}
async function runBout({fps=60,speed=1,distance:range=WOLF_V02_BY_ID.lunge.preferredDistance,standingBand=true,onBeforeStep=null,onAfterStep=null,tailSeconds=.2,elevation=0,surfaceProof=false,dtForFrame=null}={}){
 const api=sharedApi??=await wolfRamFixture(),{f}=api;api.resetPlayer();f.world.mapId='great-plains';f.world.navigation=null;f.world.terrain={place(v){v.y=elevation;},heightAt(){return elevation;}};
 const e=await begin(api,{distance:range,speed,standingBand});
 const rows=[],hits=[],surfaceWindow=[];let lastHp=e.playerHp,serial=null,attackStart=null,attackEnd=null,movementFrames=0,circleFrames=0;
 try{
  for(let frame=0;frame<fps*26;frame++){
   onBeforeStep?.({api,e,frame,hits,serial});api.step(dtForFrame?.({api,e,frame,hits,serial})??1/fps);
   if(e.brain.mode==='move')movementFrames++;if(e.brain.behavior==='flank')circleFrames++;
   if(e.brain.mode==='attack'&&!serial){serial=e.brain.serial;attackStart=api.elapsed;}
   const sample=row(api,e);if(serial)rows.push(sample);
   if(e.playerHp<lastHp){const part=hits.length===0?'head':'jaw';hits.push({...sample,damage:lastHp-e.playerHp,hp:e.playerHp,torsoSkin:api.torsoSkin(),skinContact:surfaceProof?measureSkinContact(api,e,{part,torsoOnly:part==='jaw'}):null});}lastHp=e.playerHp;
   if(surfaceProof&&process.env.WOLF_RAM_SURFACE_SCAN==='max'&&Math.abs(range-WOLF_V02_BY_ID.lunge.maxDistance)<1e-6&&e.brain.mode==='attack'&&((e.brain.time>=3.58&&e.brain.time<=3.73)||(e.brain.time>=4.13&&e.brain.time<=4.28)))surfaceWindow.push({time:api.elapsed,sourceTime:e.brain.time,nativeFallTime:api.result.clipTime,skinContact:measureSkinContact(api,e,{part:'jaw',torsoOnly:true})});
   onAfterStep?.({api,e,frame,hits,serial,sample});
   if(serial&&(!e.active||e.brain.serial!==serial)&&attackEnd===null)attackEnd=api.elapsed;
   if(attackEnd!==null&&api.elapsed>attackEnd+tailSeconds)break;
  }
  return {fps,speed,distance:range,elevation,standingBand,attackStart,attackEnd,movementFrames,circleSeconds:circleFrames/fps,hits,reactions:structuredClone(api.reactions),rows,surfaceWindow,final:{hp:e.playerHp,state:api.result.state,captured:!!api.controller.captured,ram:structuredClone(e.inspect().ram??null)}};
 }finally{f.battle.hide();}
}

test('R12 scope preserves every other attack, movement cadence, original rig data and player size',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(WOLF_V02_ACTIONS.filter(a=>a.id!=='lunge'))),baseline.actions);
 assert.deepEqual(WOLF_V02_GAIT,baseline.gait);assert.deepEqual(WOLF_V02_ORBIT,baseline.orbits);
 for(const [path,expected]of Object.entries(baseline.hashes))assert.equal(sha(path),expected,path);
 const prepared=JSON.parse(fs.readFileSync('src/wolf-v02-ram-clips.json'));assert.notEqual(prepared.preparation?.provisionalAuthoring,true,'final QA requires strict prepared art');
});

test('a real player dodge, block, invulnerability or post-commit miss prevents both the ram knockdown and all maul phases',async()=>{
 const cases=[];
 for(const fps of [30,60])for(const speed of [.5,1,2])for(const defense of ['dodge','block','invulnerable','escape']){
  let applied=false;
  const c=await runBout({fps,speed,onBeforeStep({api,e}){
   if(applied||e.brain.mode!=='attack'||e.brain.time<WOLF_V02_BY_ID.lunge.commitTime)return;
   applied=true;
   if(defense==='dodge')assert.equal(api.dodge(new Vector3(1,0,0)),true);
   if(defense==='block')assert.equal(api.controller.shieldPush(),true);
   if(defense==='invulnerable')e.playerInvulnerable=10;
   if(defense==='escape')api.f.player.position.x+=12;
  }});cases.push({defense,applied,...c});
 }
 evidence.push({case:'real-player-preimpact-defenses-and-postcommit-escape',rows:cases});
 for(const c of cases){assert.equal(c.applied,true);assert.deepEqual(c.hits,[],JSON.stringify({defense:c.defense,fps:c.fps,speed:c.speed,hits:c.hits}));assert.equal(c.reactions.filter(r=>r.options.knockdown&&r.accepted!==false).length,0);assert.equal(c.final.captured,false);}
});

test('ground bites require live native knockdown, actual prone nodes, reach and ordinary invulnerability at each phase',async()=>{
 const cases=[];
 for(const invalidation of ['move-away','standing','get-up','missing-nodes','missing-result','invulnerable']){
  let applied=false;
  const c=await runBout({onBeforeStep({api,e,hits}){
   if(invalidation==='get-up')api.controller.setMotionSpeed('knockdown',2);
   if(applied||hits.length!==1||api.elapsed<hits[0].time+.4)return;
   applied=true;
   if(invalidation==='move-away')api.f.player.position.x+=12;
   if(invalidation==='standing')api.controller.cancelAttack();
   if(invalidation==='missing-nodes')api.f.battle.playerNodes=null;
   if(invalidation==='missing-result'){const pose=e.poseAndContacts.bind(e);e.poseAndContacts=(player,result,sample,shield)=>pose(player,{state:'idle'},sample,shield);}
   if(invalidation==='invulnerable')e.playerInvulnerable=10;
  }});cases.push({invalidation,applied,...c});
 }
 evidence.push({case:'live-prone-pose-and-each-phase-validation',rows:cases});
 for(const c of cases){
  assert.equal(c.applied,true);assert.deepEqual(c.hits.map(h=>h.damage),c.invalidation==='get-up'?[40,30]:[40],c.invalidation);
  if(c.invalidation==='get-up'){assert.ok(c.rows.some(r=>r.playerState==='getUp'));assert.ok(c.hits.every(h=>h.playerState!=='getUp'));}
  assert.equal(c.final.captured,false);
 }
});

test('a ram cannot acquire maul ownership from a pre-existing fall or an unaccepted knockdown callback',async()=>{
 const cases=[];
 for(const condition of ['already-down','callback-false','callback-undefined']){
  let applied=false;
  const c=await runBout({onBeforeStep({api,e}){
   if(applied||e.brain.mode!=='attack'||e.brain.time<WOLF_V02_BY_ID.lunge.contactStart-.15)return;applied=true;
   if(condition==='already-down')assert.equal(api.controller.knockdown(),true);
   if(condition==='callback-false')api.f.battle.onPlayerHit=()=>false;
   if(condition==='callback-undefined')api.f.battle.onPlayerHit=()=>undefined;
  }});cases.push({condition,applied,...c});
 }
 evidence.push({case:'ram-specific-real-knockdown-ownership',rows:cases});
 for(const c of cases){assert.equal(c.applied,true);assert.ok(c.hits.length<=1,c.condition);assert.ok(c.hits.reduce((sum,h)=>sum+h.damage,0)<=40,c.condition);assert.equal(c.reactions.filter(r=>r.options.knockdown&&r.accepted===true).length,0);assert.equal(c.final.captured,false);}
});

test('wolf interruption, death, player death, map exit and hide cancel pending mauls without stale damage',async()=>{
 const cases=[];
 for(const cancellation of ['interrupt','wolf-death','player-death','map-exit','hide']){
  let applied=false;
  const c=await runBout({tailSeconds:1.9,onBeforeStep({api,e,hits}){
   if(applied||hits.length!==1||api.elapsed<hits[0].time+.4)return;applied=true;
   if(cancellation==='interrupt')e.brain.hit({damage:20,interruptsBoss:true});
   if(cancellation==='wolf-death')e.brain.hit({damage:900,ignoreDefense:true});
   if(cancellation==='player-death')e.playerHp=0;
   if(cancellation==='map-exit'){api.f.world.mapId='witch-cave';api.f.battle.hide();}
   if(cancellation==='hide')api.f.battle.hide();
  }});cases.push({cancellation,applied,...c});
 }
 evidence.push({case:'pending-phase-lifecycle-cancellation',rows:cases});
 for(const c of cases){assert.equal(c.applied,true);const realHits=c.hits.filter(h=>!(c.cancellation==='player-death'&&h.hp===0));assert.deepEqual(realHits.map(h=>h.damage),[40],c.cancellation);assert.equal(c.final.captured,false);}
});

test('real warrior native knockdown lowers its torso before get-up and retains the normal bounded recoil',async t=>{
 const rows=[];
 for(const fps of [30,60]){
  const api=await wolfRamFixture(),{f,controller,animator}=api;
  try{
   f.player.position.setAll(0);for(let frame=0;frame<fps/2;frame++)api.step(1/fps);
   const upright=api.bodyPoints();assert.ok(upright.Spine2[1]>1);
   assert.equal(controller.knockdown(),true);f.battle.playerReaction.start(new Vector3(0,0,1));
   let low=null,getUp=null,idle=null,minimumChest=Infinity;const samples=[];
   for(let frame=1;frame<=fps*3.5;frame++){
    const result=api.step(1/fps),body=api.bodyPoints(),time=frame/fps;
    if(result.state==='knockdown'&&body.Spine2[1]<.45)low??=time;
    if(result.state==='getUp')getUp??=time;if(getUp!==null&&result.state==='idle')idle??=time;
    minimumChest=Math.min(minimumChest,body.Spine2[1]);samples.push({time,state:result.state,clipTime:result.clipTime,chest:body.Spine2,hips:body.Hips,root:f.player.position.asArray()});
   }
   assert.ok(low>=.8&&low<=.9,'a real fall must progress before ground contact is allowed');
   assert.ok(minimumChest<.25);assert.ok(Math.abs(getUp-animator.durations.knockdown)<=1/fps+1e-5);
   assert.ok(Math.abs(idle-animator.durations.knockdown-animator.durations.getUp)<=1/fps+1e-5);
   assert.ok(Math.abs(f.player.position.z-.28)<1e-8);assert.ok(!controller.captured);
   rows.push({fps,low,getUp,idle,minimumChest,samples});
  }finally{await api.dispose();}
 }
 fs.writeFileSync('reports/wolf-v02-ram-r12/native-warrior-test.json',JSON.stringify({scope:'Calibration of genuine player animation only; the final ram tests must trigger knockdown through actual wolf head contact.',rows},null,2)+'\n');
});

test('autonomous ram hits with its head, then real fall precedes two jaw contacts on the actual prone torso across range, frame rate and speed',async()=>{
 const a=WOLF_V02_BY_ID.lunge,rows=[];
 for(const fps of [30,60])for(const speed of [.5,1,2])for(const range of [a.minDistance,a.preferredDistance,a.maxDistance,a.maxDistance+5])rows.push(await runBout({fps,speed,distance:range,surfaceProof:true}));
 evidence.push({case:'actual-warrior-headram-fall-prone-maul-matrix',rows});
 for(const c of rows){
  const label=JSON.stringify({fps:c.fps,speed:c.speed,distance:c.distance});
  assert.ok(c.attackStart!==null,label+' autonomous attack missing');assert.ok(c.circleSeconds>=2.5-2/c.fps,label+' full observation required');
  if(c.distance>a.maxDistance)assert.ok(c.movementFrames>0,label+' outside-band approach missing');
  assert.deepEqual(c.hits.map(hit=>hit.damage),[40,30,30],label+' one damage per ram/maul phase');
  for(const hit of c.hits)assert.equal(hit.skinContact?.surfacesIntersect,true,label+' actual deformed wolf-part/warrior skin overlap: '+JSON.stringify(hit.skinContact));
  const [ram,first,second]=c.hits;assert.equal(ram.contact?.part,'head',label+' first impact must be head-owned');
  assert.ok(ram.body.Spine2[1]>.8,label+' ram starts against upright actual body');
  const knockdowns=c.reactions.filter(r=>r.options.knockdown&&r.accepted!==false);assert.equal(knockdowns.length,1,label+' only ram starts knockdown');
  for(const hit of [first,second]){
   assert.equal(hit.playerState,'knockdown',label+' no bite during standing/get-up');assert.equal(hit.knockedDown,true);
   assert.ok(hit.body.Spine2[1]<.45,label+' native torso has really fallen');assert.equal(hit.contact?.part,'jaw',label+' maul uses jaw');
   assert.ok(hit.torsoSkin.count>100,label+' actual torso skin must be evaluated');assert.ok(hit.torsoSkin.centroid[1]<.55,label+' skin torso must fall with the native bones');
   assert.ok(hit.jawTorsoDistance<.85,label+' jaw must meet actual lowered Hips–Spine2 segment');assert.ok(hit.jaw[1]<.9,label+' jaw must lower to ground-body height');
  }
  assert.ok(first.time-ram.time>=.85-1/c.fps&&first.time-ram.time<1.2,label+' first maul follows the real fall');
  assert.ok(second.time-ram.time>1.35&&second.time-ram.time<1.85,label+' second maul remains in the native prone interval');
  assert.ok(Math.abs((second.time-first.time)-(second.sourceTime-first.sourceTime))<2/c.fps+1e-5,label+' both ground bites use the fixed real clock');
  const fixedClock=c.rows.filter(r=>r.serial===ram.serial&&r.mode==='attack'&&r.sourceTime>2.74&&r.sourceTime<5.19);
  for(let i=1;i<fixedClock.length;i++)assert.ok(Math.abs(fixedClock[i].sourceTime-fixedClock[i-1].sourceTime-(fixedClock[i].time-fixedClock[i-1].time))<1e-5,label+' post-ram phase speed is 1x');
  const afterRecoil=c.rows.filter(r=>r.time>=ram.time+.25&&r.time<=second.time+.01);
  assert.ok(afterRecoil.length>0);assert.ok(Math.max(...afterRecoil.map(r=>distance(r.playerRoot,afterRecoil[0].playerRoot)))<1e-7,label+' mauls add no recoil or player teleport');
  assert.ok(Math.abs(distance(ram.playerRoot,afterRecoil[0].playerRoot)-.28)<1e-7,label+' normal ram recoil remains exactly bounded');
  const attackRows=c.rows.filter(r=>r.serial===ram.serial&&r.mode==='attack');
  for(let i=1;i<attackRows.length;i++){
   const previous=attackRows[i-1],next=attackRows[i],sourceStep=Math.hypot(next.authoredRoot[0]-previous.authoredRoot[0],next.authoredRoot[2]-previous.authoredRoot[2])*2.5,worldStep=Math.hypot(next.wolfRoot[0]-previous.wolfRoot[0],next.wolfRoot[2]-previous.wolfRoot[2]);
   assert.ok(worldStep<=sourceStep+.04,label+' actor travel must follow the authored root rather than teleport to the prone target');
  }
  assert.ok(c.rows.some(r=>r.time>ram.time+.5&&r.time<first.time&&r.body.Spine2[1]>.45),label+' fall progression must occur between impact and maul');
  assert.equal(c.final.captured,false,label+' native fall must not freeze through capture');
 }
});

test('repeated pose passes cannot advance clocks or duplicate any ram or maul phase',async()=>{
 const cases=[];
 for(const fps of [30,60])for(const speed of [.5,1,2]){
  let repeated=0,maxRootChange=0;
  const c=await runBout({fps,speed,onAfterStep({api,e}){
   if(e.brain.mode!=='attack')return;
   const before={time:e.brain.time,elapsed:e.brain.actionElapsed,hp:e.playerHp,playerTime:api.controller.action?.time,root:e.actor.position.clone()};
   for(let i=0;i<4;i++){e.poseAndContacts(api.f.player,api.result,null,api.playerNodes.Bunnyguard_Shield);repeated++;}
   assert.equal(e.brain.time,before.time);assert.equal(e.brain.actionElapsed,before.elapsed);assert.equal(api.controller.action?.time,before.playerTime);assert.equal(e.playerHp,before.hp,'one current phase can resolve only once');
   maxRootChange=Math.max(maxRootChange,Vector3.Distance(before.root,e.actor.position));
  }});cases.push({...c,repeated,maxRootChange});
 }
 evidence.push({case:'phase-deduplication-and-clock-ownership',rows:cases});
 for(const c of cases){assert.deepEqual(c.hits.map(h=>h.damage),[40,30,30]);assert.ok(c.repeated>100);assert.ok(c.maxRootChange<1e-7);}
});

test('bounded 100ms hitches retain clipped prone-body phase contact and cannot turn a moved-away victim into a phantom maul',async()=>{
 const cases=[];
 for(const speed of [.5,1,2])for(const escape of [false,true]){
  const hitches=[];
  const c=await runBout({speed,onBeforeStep({api,e}){if(escape&&hitches.length===0&&e.brain.mode==='attack'&&e.brain.time>=3.62)api.f.player.position.x+=12;},dtForFrame({e}){
   if(e.brain.mode==='attack'&&((hitches.length===0&&e.brain.time>=3.62)||(hitches.length===1&&e.brain.time>=4.17))){hitches.push(e.brain.time);return .1;}return 1/60;
  }});cases.push({escape,hitches,...c});
 }
 evidence.push({case:'bounded-hitch-relative-source-window-and-escape',rows:cases});
 for(const c of cases){
  assert.ok(c.hitches.length>=1);assert.deepEqual(c.hits.map(h=>h.damage),c.escape?[40]:[40,30,30]);
  for(const hit of c.hits.slice(1)){const phase=WOLF_V02_BY_ID.lunge.ramPhases.find(phase=>phase.id===hit.contact?.phase);assert.ok(phase);assert.ok(hit.contact.sourceTime>=phase.contactStart-1e-6&&hit.contact.sourceTime<=phase.contactEnd+1e-6);assert.equal(hit.playerState,'knockdown');assert.ok(hit.body.Spine2[1]<.45);}
 }
});

test('rear critical is sampled once at ram and stays coherent while the real fallen torso turns',async()=>{
 const cases=[];
 for(const fps of [30,60])for(const speed of [.5,1,2]){
  const c=await runBout({fps,speed,surfaceProof:true,onBeforeStep({api,frame}){if(frame===0)api.f.player.rotation.y=0;}});cases.push(c);
 }
 evidence.push({case:'ram-rear-critical-snapshot-through-real-fall',rows:cases});
 for(const c of cases){assert.deepEqual(c.hits.map(h=>h.damage),[52,39,39],JSON.stringify({fps:c.fps,speed:c.speed}));for(const hit of c.hits){assert.equal(hit.skinContact?.surfacesIntersect,true,JSON.stringify({fps:c.fps,speed:c.speed,part:hit.skinContact?.part,skin:hit.skinContact}));}for(const hit of c.hits.slice(1)){assert.equal(hit.playerState,'knockdown');assert.ok(hit.body.Spine2[1]<.45);assert.ok(hit.jawTorsoDistance<.85);}assert.equal(c.reactions.filter(r=>r.options.knockdown&&r.accepted===true).length,1);}
});

test('untouched far summons rise, observe and approach before the real ram-to-prone-maul sequence',async()=>{
 const cases=[];
 for(const fps of [30,60])cases.push(await runBout({fps,distance:35,standingBand:false}));
 evidence.push({case:'untouched-far-summon-to-coupled-ram-maul',rows:cases});
 for(const c of cases){assert.ok(c.movementFrames>0);assert.ok(c.circleSeconds>=2.5-2/c.fps);assert.deepEqual(c.hits.map(h=>h.damage),[40,30,30]);assert.ok(c.hits.slice(1).every(h=>h.playerState==='knockdown'&&h.body.Spine2[1]<.45&&h.torsoSkin.centroid[1]<.55));}
});

test('real prone contact is invariant under a shared flat +3m or -2m ground elevation',async()=>{
 const cases=[];
 for(const elevation of [3,-2])for(const fps of [30,60])for(const speed of [.5,1,2])cases.push(await runBout({elevation,fps,speed}));
 evidence.push({case:'actual-skeleton-contact-ground-elevation-invariance',rows:cases});
 for(const c of cases){
  const label=JSON.stringify({elevation:c.elevation,fps:c.fps,speed:c.speed});assert.deepEqual(c.hits.map(h=>h.damage),[40,30,30],label);
  for(const hit of c.hits){assert.ok(Math.abs(hit.playerRoot[1]-c.elevation)<1e-7);assert.ok(Math.abs(hit.wolfRoot[1]-c.elevation)<1e-7);}
  for(const hit of c.hits.slice(1)){assert.equal(hit.playerState,'knockdown');assert.equal(hit.knockedDown,true);assert.ok(hit.body.Spine2[1]-hit.playerRoot[1]<.45,label+' ground-relative actual torso');assert.ok(hit.torsoSkin.centroid[1]-hit.playerRoot[1]<.55,label+' ground-relative actual skin');assert.ok(hit.jawTorsoDistance<.85);}
  assert.equal(c.reactions.filter(r=>r.options.knockdown&&r.accepted===true).length,1);assert.equal(c.final.captured,false);
 }
});

test('ram-to-maul keeps fixed limb attachments and scale, and named maul support feet stay planted',async()=>{
 const api=await wolfRamFixture(),{f}=api,e=await begin(api),gltf=JSON.parse(fs.readFileSync(new URL('../public/assets/'+f.config.model,import.meta.url))),bind=new Map(gltf.nodes.map(n=>[n.name,n]));
 const oldTracks=new Map(f.container.animationGroups.find(group=>group.name===WOLF_CLIPS.lunge).targetedAnimations.filter(row=>['position','scaling'].includes(row.animation.targetProperty)).map(({target,animation})=>[target.name+':'+animation.targetProperty,animation]));
 const watchPositions=new Map(f.container.animationGroups.find(group=>group.name===WOLF_CLIPS.watch).targetedAnimations.filter(({animation})=>animation.targetProperty==='position').map(({target,animation})=>[target.name,animation.getKeys()[0].value.asArray()]));
 const recoveryCarriers=new Set(['spine','chest','neck','head','jaw','tail_1','tail_2','tail_3','fore.L.scapula','fore.R.scapula']);
 const sourcePositions=new Map(WOLF_V02_RAM_CLIPS[0].channels.filter(channel=>channel.path==='translation').map(channel=>[channel.node,channel]));
 const authoredPosition=(name,time)=>{const channel=sourcePositions.get(name);if(!channel)return bind.get(name)?.translation??[0,0,0];const {times,values}=channel;let i=0;while(i<times.length-2&&time>times[i+1])i++;const j=Math.min(i+1,times.length-1),t=Math.max(0,Math.min(1,(time-times[i])/Math.max(1e-9,times[j]-times[i])));return values[i].map((v,k)=>v+(values[j][k]-v)*t);};
 const oldValue=(name,property,time,fallback)=>{const animation=oldTracks.get(name+':'+property);if(!animation)return fallback;const keys=animation.getKeys(),frame=time*animation.framePerSecond;let i=0;while(i<keys.length-2&&frame>keys[i+1].frame)i++;const a=keys[i],b=keys[Math.min(i+1,keys.length-1)],t=Math.max(0,Math.min(1,(frame-a.frame)/Math.max(1e-9,b.frame-a.frame)));return a.value.asArray().map((v,k)=>v+(b.value.asArray()[k]-v)*t);};
 let checks=0,newPoseChecks=0,prefixChecks=0,maxLengthError=0,maxScaleError=0,maxPrefixLengthError=0,maxPrefixScaleError=0,maxPrefixCarrierSourceError=0,prefixCarrierReferenceDeviation=0,maxRecoveryCarrierSourceError=0,maxRecoveryCarrierEndpointError=0,worst=null,legacyLengthError=0,legacyScaleError=0;const recoveryCarrierDifferences={},support=[],names=['fore.L.paw','fore.R.paw','hind.L.paw','hind.R.paw'],named=(WOLF_V02_RAM_CLIPS[0].supportPhases??[]).map(phase=>({...phase,samples:[]})),transition=[];
 try{
  let serial=null,ended=null,lastAttackFeet=null;
  for(let frame=0;frame<60*20;frame++){
   api.step(1/60);if(e.brain.mode==='attack'&&!serial)serial=e.brain.serial;
   if(serial&&e.brain.serial!==serial){ended??=api.elapsed;transition.push({time:api.elapsed,clip:e.brain.state,sourceTime:e.brain.time,actor:e.actor.position.asArray(),feet:Object.fromEntries(names.map(name=>[name,e.nodes[name].getAbsolutePosition().asArray()]))});if(api.elapsed>ended+.2)break;}
   for(const [name,node]of Object.entries(e.nodes)){
    const original=bind.get(name);if(!original)continue;
    const newPose=e.brain.mode==='attack'&&e.brain.action?.id==='lunge'&&e.brain.time>=2.75&&e.animator.blend===1;
    const prefix=e.brain.mode==='attack'&&e.brain.action?.id==='lunge'&&e.brain.time<2.75&&e.animator.blend===1;
    if(!['root','pelvis'].includes(name)){
     const error=Math.abs(node.position.length()-Math.hypot(...(original.translation??[0,0,0])));
     const inheritedCarrier=newPose&&recoveryCarriers.has(name)&&e.brain.time>=4.45;
     if(inheritedCarrier){
      const sourceError=distance(node.position.asArray(),authoredPosition(name,e.brain.time)),endpointError=distance(authoredPosition(name,5.2),watchPositions.get(name)??original.translation);
      maxRecoveryCarrierSourceError=Math.max(maxRecoveryCarrierSourceError,sourceError);maxRecoveryCarrierEndpointError=Math.max(maxRecoveryCarrierEndpointError,endpointError);
      const previous=recoveryCarrierDifferences[name]??{maximumBindLengthDeviation:0,maximumSourcePositionError:0,endpointWatchError:endpointError};previous.maximumBindLengthDeviation=Math.max(previous.maximumBindLengthDeviation,error);previous.maximumSourcePositionError=Math.max(previous.maximumSourcePositionError,sourceError);recoveryCarrierDifferences[name]=previous;
     }
     else if(newPose&&error>maxLengthError){maxLengthError=error;worst={name,error,clip:e.brain.state,sourceTime:e.brain.time,position:node.position.asArray()};}else if(!newPose)legacyLengthError=Math.max(legacyLengthError,error);
     if(prefix){
      if(/^(fore|hind)\.[LR]\.(upper|lower|metatarsal|paw)$/.test(name))maxPrefixLengthError=Math.max(maxPrefixLengthError,error);
      else{maxPrefixCarrierSourceError=Math.max(maxPrefixCarrierSourceError,distance(node.position.asArray(),authoredPosition(name,e.brain.time)));prefixCarrierReferenceDeviation=Math.max(prefixCarrierReferenceDeviation,Math.min(error,Math.abs(node.position.length()-Math.hypot(...oldValue(name,'position',e.brain.time,original.translation??[0,0,0])))));}
     }
    }
    const oldScale=prefix?oldValue(name,'scaling',e.brain.time,original.scale??[1,1,1]):null;
    for(let k=0;k<3;k++){const error=Math.abs(node.scaling.asArray()[k]-(original.scale??[1,1,1])[k]);if(newPose)maxScaleError=Math.max(maxScaleError,error);else legacyScaleError=Math.max(legacyScaleError,error);if(prefix)maxPrefixScaleError=Math.max(maxPrefixScaleError,Math.min(error,Math.abs(node.scaling.asArray()[k]-oldScale[k])));}checks++;if(newPose)newPoseChecks++;if(prefix)prefixChecks++;
   }
   if(e.brain.mode==='attack'&&e.brain.time>=3.35&&e.brain.time<=4.28)support.push({sourceTime:e.brain.time,feet:Object.fromEntries(names.map(name=>[name,e.nodes[name].getAbsolutePosition().asArray()]))});
   if(e.brain.mode==='attack'){
    lastAttackFeet=Object.fromEntries(names.map(name=>[name,e.nodes[name].getAbsolutePosition().asArray()]));
    for(const phase of named)if(e.brain.time>=phase.start&&e.brain.time<=phase.end)phase.samples.push({sourceTime:e.brain.time,playerState:api.result.state,feet:Object.fromEntries(phase.feet.map(name=>[name,e.nodes[name].getAbsolutePosition().asArray()]))});
   }
  }
  const footDrift=Object.fromEntries(names.map(name=>[name,support.length?Math.max(...support.map(sample=>distance(sample.feet[name],support[0].feet[name]))):Infinity]));
  const phaseDrift=named.map(phase=>({...phase,drift:Object.fromEntries(phase.feet.map(name=>[name,phase.samples.length?Math.max(...phase.samples.map(sample=>distance(sample.feet[name],phase.samples[0].feet[name]))):Infinity]))}));
  const watchTransitionDrift=Object.fromEntries(names.map(name=>[name,lastAttackFeet&&transition.length?Math.max(...transition.map(sample=>distance(sample.feet[name],lastAttackFeet[name]))):Infinity]));
  evidence.push({case:'actual-runtime-fixed-anatomy-and-maul-support',checks,newPoseChecks,prefixChecks,maxLengthError,maxScaleError,maxPrefixLengthError,maxPrefixScaleError,maxPrefixCarrierSourceError,prefixCarrierReferenceDeviation,maxRecoveryCarrierSourceError,maxRecoveryCarrierEndpointError,recoveryCarrierDifferences,recoveryCarrierPolicy:'Explicit non-limb prefix carriers use the authored R12 translation oracle. Only the listed source4.45+ recovery carriers inherit the authored trajectory whose endpoint must equal original WATCH0. Fore/hind upper, lower, metatarsal and paw attachments stay strict through prefix, mauls and recovery; all maul attachments remain strict.',worst,unchangedLegacySourceDeviation:{legacyLengthError,legacyScaleError},scaleTolerance:1e-6,scaleToleranceReason:'The approved R8 bind and authored TRS contain sub-1e-6 float scale residue around unit scale; the source rig and skin remain hash-preserved.',footDrift,support,namedSupportPhases:phaseDrift,watchTransitionDrift,transition});
  assert.ok(checks>5000&&newPoseChecks>1000&&prefixChecks>100);assert.ok(maxLengthError<1e-5,JSON.stringify(worst));assert.ok(maxScaleError<1e-6);assert.ok(maxPrefixLengthError<1e-5,'R12 fixed limb segments cannot stretch during the prefix');assert.ok(maxPrefixScaleError<1e-6);assert.ok(maxPrefixCarrierSourceError<1e-5);assert.ok(maxRecoveryCarrierSourceError<1e-5);assert.ok(maxRecoveryCarrierEndpointError<1e-5);assert.ok(support.length>30);
  for(const [name,drift]of Object.entries(footDrift))assert.ok(drift<.025,name+' planted during both mauls: '+drift);
  assert.ok(phaseDrift.length>=4,'support contracts must cover every leg');for(const phase of phaseDrift)for(const [name,drift]of Object.entries(phase.drift))assert.ok(drift<.025,JSON.stringify({name,start:phase.start,end:phase.end,drift}));
  for(const [name,drift]of Object.entries(watchTransitionDrift))assert.ok(drift<.05,name+' recovery-to-watch transition slides '+drift);
 }finally{await api.dispose();}
});

test('a pooled wolf life resets all ram phase ownership and reuses its rig without resource growth',async()=>{
 const api=await wolfRamFixture(),{f}=api,rows=[];let firstActor=null,resources=null;
 try{
  for(let life=0;life<3;life++){
   const e=await begin(api),hits=[];let serial=null,hp=e.playerHp;
   for(let frame=0;frame<60*20;frame++){
    api.step(1/60);if(e.brain.mode==='attack'&&!serial)serial=e.brain.serial;
    if(e.playerHp<hp)hits.push({damage:hp-e.playerHp,...row(api,e)});hp=e.playerHp;
    if(serial&&e.brain.serial!==serial)break;
   }
   assert.deepEqual(hits.map(h=>h.damage),[40,30,30],'each new life must resolve three fresh phases');
   if(firstActor)assert.equal(e.actor,firstActor);firstActor??=e.actor;
   f.battle.hide();const stoppedHp=e.playerHp;
   for(let frame=0;frame<60*4;frame++)api.step(1/60);
   assert.equal(e.playerHp,stoppedHp);assert.equal(f.battle.combat.grabOwner,null);assert.equal(e.grab.active,false);assert.equal(api.controller.knockedDown,false);assert.ok(!api.controller.captured);
   const count=huntResourceCounts(f.scene);if(resources)assert.deepEqual(count,resources);resources??=count;
   rows.push({life,hits,postHideRam:structuredClone(e.inspect().ram??null),resources:count});
  }
  evidence.push({case:'three-pooled-lives-phase-reset-and-cleanup',rows});
 }finally{await api.dispose();}
});
