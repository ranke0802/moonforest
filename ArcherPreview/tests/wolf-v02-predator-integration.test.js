import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from '@babylonjs/core';
import {wolfHuntFixture,stepWolfHunt,huntResourceCounts} from './helpers/wolf-hunt-fixture.js';
import {headAttention,angleDelta} from './helpers/wolf-feral-fixture.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
import {WolfEncounter} from '../src/wolf-encounter.js';
import {WOLF_V02_ACTIONS,WOLF_V02_BY_ID} from '../src/wolf-v02-spec.js';
import {WOLF_V02_COMBAT_R13_CLIPS} from '../src/wolf-v02-authored-clips.js';

const evidence=[];
const watchedSources=['src/wolf-v02-spec.js','src/wolf-v02-encounter.js','src/wolf-v02-locomotion.js','src/wolf-v02-authored-clips.js','src/wolf-v02-predator-clips.json','src/wolf-v02-feral-clips.json'];
const sourceHashes=()=>Object.fromEntries(watchedSources.filter(p=>fs.existsSync(p)).map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const initialSourceHashes=sourceHashes();
const rng=seed=>{let state=seed>>>0;const fn=()=>{fn.calls++;state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};fn.calls=0;return fn;};
const stanceNames=['fore.L.paw','fore.R.paw','hind.L.paw','hind.R.paw'];
const yaw=node=>{const v=Vector3.TransformNormal(Vector3.Up(),node.getWorldMatrix());return Math.atan2(v.x,v.z);};
const span=(rows,key)=>{const start=rows[0]?.[key]??0,values=rows.map(row=>angleDelta(row[key],start)*180/Math.PI);return Math.max(...values)-Math.min(...values);};

test.after(()=>{
 const label=process.env.WOLF_PREDATOR_EVIDENCE_LABEL?.replace(/[^a-z0-9_-]/gi,'-'),name=label?`independent-gameplay-${label}.json`:'independent-gameplay.json';
 fs.mkdirSync('reports/wolf-v02-predator-r11',{recursive:true});
 const finalSourceHashes=sourceHashes();
 fs.writeFileSync('reports/wolf-v02-predator-r11/'+name,JSON.stringify({scope:'Actual packed approved R8 rig and live CPU NullEngine update/pose/contact pipeline, with replacement material. Autonomous observation tests retain the untouched rest/detect/rise path; contact bands are calibrated after the actual rise before a fresh complete observation and autonomous selection. Incoming sword reaction scenarios inject an already-resolved sword contact into the actual combat reaction path. Numerical thresholds do not establish visible aggression, natural collapse, skin quality, device FPS, GPU cost or touch feel.',sourceHashes:finalSourceHashes,initialSourceHashes,cases:evidence},null,2)+'\n');
 assert.deepEqual(finalSourceHashes,initialSourceHashes,'runtime sources changed during the test; evidence must be rerun after source freeze');
});

async function begin(f,{distance=3,hp=900,seed=123,sequence=null,speed=1}={}){
 f.world.navigation=null;f.world.terrain={place(v){v.y=0;},heightAt(){return 0;}};
 f.player.position.set(0,0,distance);assert.equal(await f.battle.summon(f.player,1,'wolf'),true);const e=f.battle.encounters[0];
 e.actor.position.setAll(0);e.actor.rotation.y=0;f.player.rotation.y=Math.PI;e.brain.hp=hp;e.brain.random=rng(seed);e.brain.configureAttacks({custom:!!sequence,sequence:sequence??[],speed});e.playerHp=500;e.playerInvulnerable=0;
 return e;
}
function until(f,e,accept,{fps=60,seconds=20,state='idle'}={}){
 for(let frame=0;frame<fps*seconds;frame++){if(accept())return frame;e.playerHp=500;stepWolfHunt(f,e,1/fps,{state,actionId:state==='idle'?undefined:951});}
 assert.ok(accept(),JSON.stringify({state:e.brain.state,mode:e.brain.mode,behavior:e.brain.behavior,time:e.brain.time}));return fps*seconds;
}
function snapshot(e,f,time){return {time,clip:e.brain.state,mode:e.brain.mode,behavior:e.brain.behavior,sourceTime:e.brain.time,actor:e.actor.position.asArray(),player:f.player.position.asArray(),gaze:headAttention(e,f.player),circleTarget:e.brain.circleTarget,circleElapsed:e.brain.circleElapsed};}

function setStandingEngagement(f,e){
 // The approved rest/rise has real planar travel. Establish the requested
 // engagement band after that motion, before a fresh autonomous observation;
 // otherwise an initial exact minimum legitimately becomes too close.
 until(f,e,()=>e.brain.behavior==='flank');e.v02Pose?.restore();
 e.actor.position.setAll(0);e.actor.rotation.y=0;e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.behavior='observe';e.brain.observation=5;
 e.animator.transition(WOLF_CLIPS.watch,{clipTime:0,actionId:e.brain.serial,blendDuration:0});e.animator.update(0);WolfEncounter.prototype.alignPose.call(e);
 e.v02Pose?.resetPlants();e.v02Pose?.capturePreviousFeet();e.v02StalkRadius=null;e.brain.lastDistance=Vector3.Distance(e.actor.position,f.player.position);e.brain.beginStalk();
}

test('near and far autonomous attacks wait for a genuine random 2–3 second player-centered observation budget',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const hp of [900,400])for(const fps of [30,60])for(const distance of [3,15,35]){
  const e=await begin(f,{distance,hp,seed:0x1200+distance+hp}),circles=[];let current=null,attack=null,moves=0;
  for(let frame=0;frame<fps*22;frame++){
   e.playerHp=500;stepWolfHunt(f,e,1/fps);const time=frame/fps;
   if(e.brain.behavior==='flank'){
    current??={start:time,frames:0,loops:0,lastSource:e.brain.time,target:e.brain.circleTarget,startRadius:Vector3.Distance(e.actor.position,f.player.position),maxRadiusError:0,radialTarget:e.brain.orbitTargetRadius??Vector3.Distance(e.actor.position,f.player.position),gazeMax:0};current.frames++;
    if(e.brain.time<current.lastSource)current.loops++;current.lastSource=e.brain.time;
    current.maxRadiusError=Math.max(current.maxRadiusError,Math.max(0,Math.min(current.startRadius,current.radialTarget)-Vector3.Distance(e.actor.position,f.player.position),Vector3.Distance(e.actor.position,f.player.position)-Math.max(current.startRadius,current.radialTarget)));current.gazeMax=Math.max(current.gazeMax,headAttention(e,f.player).degrees3D);
   }else if(current){circles.push({...current,seconds:current.frames/fps,elapsed:e.brain.circleElapsed});current=null;}
   if(e.brain.mode==='move')moves++;
   if(e.brain.mode==='attack'){attack={id:e.brain.actionId,time,sourceTime:e.brain.time};break;}
  }
  rows.push({hp,fps,distance,circles,attack,moveFrames:moves,randomDraws:e.brain.random.calls});
 }
 evidence.push({case:'autonomous-random-observation-near-far',rows});
 const failures=rows.filter(r=>!r.attack||!r.circles.length||r.circles.some(c=>c.seconds<2-2/r.fps||c.seconds>3+2/r.fps||c.target<2||c.target>3||c.loops<1||c.maxRadiusError>.30||c.gazeMax>25)||r.randomDraws===0);
 assert.deepEqual(failures,[],'both phases and far starts need measured 2–3s observation across several source loops before the first attack');
});

test('seeded observation choices vary and remain actor-owned through independent concurrent wolves',async t=>{
 const f=await wolfHuntFixture(t);f.player.position.set(0,0,5);assert.equal(await f.battle.summon(f.player,3,'wolf'),true);
 const actors=[...f.battle.encounters],seeds=[13,97,991],targets=[];
 for(let i=0;i<actors.length;i++){
  const e=actors[i];e.actor.position.set(i*5-5,0,0);e.brain.random=rng(seeds[i]);e.brain.hp=900;
 }
 for(let i=0;i<1200&&!actors.every(e=>e.brain.circleTarget>=2);i++){for(const e of actors)e.playerHp=500;f.battle.update(1/60,f.player);f.battle.poseAndContacts(f.player,{state:'idle'},null,null);}
 for(let i=0;i<actors.length;i++)targets.push({seed:seeds[i],target:actors[i].brain.circleTarget,draws:actors[i].brain.random.calls});
 const untouched=actors.slice(1).map(e=>({target:e.brain.circleTarget,elapsed:e.brain.circleElapsed,draws:e.brain.random.calls}));
 actors[0].brain.beginStalk();assert.deepEqual(actors.slice(1).map(e=>({target:e.brain.circleTarget,elapsed:e.brain.circleElapsed,draws:e.brain.random.calls})),untouched,'one actor replan must not consume another actor random stream or timer');
 const first=rng(77),second=rng(77);assert.deepEqual(Array.from({length:8},()=>first()),Array.from({length:8},()=>second()));
 evidence.push({case:'seeded-independent-randomness',targets});
 assert.ok(targets.every(r=>r.target>=2&&r.target<=3&&r.draws>0));assert.equal(new Set(targets.map(r=>r.target)).size,3,'separate seeds produce distinct observation lengths');
});

test('blocked steps, source wraps and player movement cannot reset the ongoing observation budget into a rapid attack',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const blocked of [false,true]){
  const e=await begin(f,{distance:5,seed:810});until(f,e,()=>e.brain.behavior==='flank');const target=e.brain.circleTarget,records=[];let frames=0,firstAttack=null;
  if(blocked)f.world.navigation={segmentClear:(from,to,r,sight)=>!!sight,constrain(){},steer:(from,to)=>from};
  for(;frames<60*12;frames++){
   if(!blocked){f.player.position.x=.30*Math.sin(frames/60);f.player.position.z=5+.15*Math.sin(frames/120);}
   e.playerHp=500;stepWolfHunt(f,e,1/60);records.push(snapshot(e,f,frames/60));
   if(e.brain.mode==='attack'){firstAttack=frames/60;break;}
   if(e.brain.circleElapsed>=target&&e.brain.behavior!=='flank')break;
  }
  rows.push({blocked,target,frames,firstAttack,records});f.world.navigation=null;
 }
 evidence.push({case:'observation-budget-survives-replan',rows});
 for(const row of rows){assert.ok(row.target>=2&&row.target<=3);const elapsed=row.records.map(r=>r.circleElapsed).filter(Number.isFinite);assert.ok(elapsed.length>0);assert.ok(elapsed.every((v,i)=>i===0||v>=elapsed[i-1]-1e-8),'source wrap/reverse cannot reset wall-clock observation elapsed');if(row.firstAttack!==null)assert.ok(row.firstAttack>=row.target-2/60,'obstructed circle cannot bypass observation time');assert.ok(row.frames<720,'a blocked circle remains bounded');}
});

test('nonlethal heavy contact uses improved collapse/getup and block contact plays a real hit motion without collapse',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const id of ['judgment','shield-push']){
  const e=await begin(f,{distance:3});until(f,e,()=>e.brain.mode==='attack');const beforeHp=e.brain.hp,origin=e.actor.position.clone(),away=origin.subtract(f.player.position).normalize();
  e.gate.collect=()=>({hits:[{id,damage:20,heavy:id==='judgment'}],hitStop:.03});
  try{e.poseAndContacts(f.player,{state:'idle'},{actionId:921},null);}finally{delete e.gate.collect;}
  const immediate={clip:e.brain.state,mode:e.brain.mode,hp:e.brain.hp,flash:e.brain.flash,velocity:e.knockVelocity.asArray()},samples=[];
  for(let i=0;i<300;i++){stepWolfHunt(f,e,1/60);if(!['down','recover'].includes(e.brain.mode))break;samples.push({clip:e.brain.state,mode:e.brain.mode,sourceTime:e.brain.time,chestHeight:e.nodes.chest.getAbsolutePosition().y,position:e.actor.position.asArray()});}
  const travel=Vector3.FromArray(samples.at(-1).position).subtract(origin);rows.push({id,beforeHp,immediate,backwardDistance:Vector3.Dot(travel,away),minimumChestHeight:Math.min(...samples.map(s=>s.chestHeight)),samples});
 }
 const e=await begin(f,{distance:3,sequence:['quick-bite']});until(f,e,()=>e.brain.mode==='attack');let block=null;
 for(let i=0;i<360&&!block;i++){stepWolfHunt(f,e,1/60,{state:'shieldPush',actionId:922});if(e.v02LastOutcome?.blocked)block={clip:e.brain.state,mode:e.brain.mode,time:e.brain.time,flash:e.brain.flash,stagger:e.brain.stagger,position:e.actor.position.clone()};}
 const start=e.nodes.chest.rotationQuaternion.clone(),blockSamples=[];
 for(let i=0;i<15;i++){stepWolfHunt(f,e,1/60);blockSamples.push({clip:e.brain.state,mode:e.brain.mode,time:e.brain.time,rotation:e.nodes.chest.rotationQuaternion.asArray(),position:e.actor.position.asArray()});}
 const chestMovement=1-Math.abs(start.dot(e.nodes.chest.rotationQuaternion));rows.push({id:'player-blocks-wolf',block:block?{...block,position:block.position.asArray()}:null,chestMovement,playerHp:e.playerHp,samples:blockSamples});
 evidence.push({case:'live-heavy-shove-and-block-motion',rows});
 for(const row of rows.filter(r=>r.id!=='player-blocks-wolf')){assert.ok(row.immediate.hp>0&&row.immediate.hp<row.beforeHp);assert.ok(row.immediate.flash>0);assert.ok(![WOLF_CLIPS.down,WOLF_CLIPS.recover].includes(row.immediate.clip),'nonlethal strong hit must not select the Lego-like knockdown');assert.ok(row.samples.some(s=>s.mode==='down')&&row.samples.some(s=>s.mode==='recover'));assert.ok(row.minimumChestHeight<row.samples[0].chestHeight*.6);assert.ok(row.backwardDistance>0,'collapse retains bounded outward recoil');}
 assert.ok(block&&block.flash>0);assert.equal(e.playerHp,500);assert.ok(block.stagger<=0,'block response plays motion rather than holding the attack pose for one second');assert.ok(![WOLF_V02_BY_ID['quick-bite'].sourceClip,WOLF_CLIPS.down,WOLF_CLIPS.recover].includes(block.clip));assert.ok(blockSamples.some(r=>r.time>block.time+.05));assert.ok(chestMovement>1e-5,'actual hit pose must visibly change more than a flash');
});

test('the live upper-body diagonal remains large after runtime attention and retains the authored strike direction',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const id of ['quick-bite','paw-swipe'])for(const fps of [30,60])for(const speed of [.5,1,2]){
  const a=WOLF_V02_BY_ID[id],e=await begin(f,{distance:a.preferredDistance,sequence:[id],speed});until(f,e,()=>e.brain.mode==='attack',{fps});const serial=e.brain.serial,samples=[];let locked=null,maxBodyTurn=0;
  for(let i=0;i<fps*4&&e.brain.serial===serial&&e.brain.mode==='attack';i++){
   stepWolfHunt(f,e,1/fps);if(e.brain.serial!==serial||e.brain.mode!=='attack')break;
   const liveHead=yaw(e.nodes.head),liveChest=yaw(e.nodes.chest),jaw=e.nodes.jaw.getAbsolutePosition().asArray();e.v02Pose?.restore();e.animator.ensurePoseCurrent();const rawHead=yaw(e.nodes.head),rawChest=yaw(e.nodes.chest);e.alignPose();
   samples.push({time:e.brain.time,liveHead,liveChest,rawHead,rawChest,jaw});
   if(e.brain.time>=a.commitTime){locked??=e.motionYaw;maxBodyTurn=Math.max(maxBodyTurn,Math.abs(angleDelta(e.motionYaw,locked)));}
  }
  rows.push({id,fps,speed,clip:a.sourceClip,liveHeadSpan:span(samples,'liveHead'),rawHeadSpan:span(samples,'rawHead'),liveChestSpan:span(samples,'liveChest'),rawChestSpan:span(samples,'rawChest'),maxCommittedBodyTurn:maxBodyTurn,samples});
 }
 evidence.push({case:'actual-large-upper-body-diagonal',rows});
 for(const row of rows){assert.ok(row.clip.startsWith('Wolf_Predator_'),'current attacks must use new separately authored R11 motion');assert.ok(row.liveChestSpan>=35,'torso must drive a large diagonal, not just the jaw');assert.ok(row.liveHeadSpan>=50);assert.ok(row.liveHeadSpan>=row.rawHeadSpan*.65,'runtime aiming cannot cancel the visible diagonal');assert.ok(row.maxCommittedBodyTurn<1e-7);}
});

test('every autonomous attack engagement band contacts once with dodge, escape and capture ownership intact',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const fps of [30,60])for(const speed of [.5,1,2])for(const action of WOLF_V02_ACTIONS)for(const band of ['minDistance','preferredDistance','maxDistance','approachOutside']){
  const distance=band==='approachOutside'?action.maxDistance+.8:action[band],e=await begin(f,{distance,sequence:[action.id],speed,seed:601});setStandingEngagement(f,e);const initial=f.player.position.clone();let serial=null,actualId=null,damage=0,damageAmount=0,captured=false,frames=0,knockdowns=0,startDistance=null,circleStartDistance=null;const original=e.hitPlayer.bind(e),originalReaction=e.onPlayerHit;
  e.hitPlayer=(...args)=>{const before=e.playerHp;original(...args);if(e.playerHp<before){damage++;damageAmount+=before-e.playerHp;}};
  e.onPlayerHit=(...args)=>{if(args[1]?.knockdown)knockdowns++;return originalReaction(...args);};
  try{for(;frames<fps*24;frames++){
   const expected=f.player.position.clone();stepWolfHunt(f,e,1/fps);assert.ok(f.player.position.equalsWithEpsilon(expected,1e-7),'wolf cannot teleport the player');
   if(circleStartDistance===null&&e.brain.behavior==='flank')circleStartDistance=Vector3.Distance(e.actor.position,f.player.position);
   if(serial===null&&e.brain.mode==='attack'){serial=e.brain.serial;actualId=e.brain.actionId;startDistance=Vector3.Distance(e.actor.position,f.player.position);}captured||=e.grab.active;
   if(serial!==null&&(e.brain.serial!==serial||e.brain.mode!=='attack')&&!e.grab.active)break;
  }}finally{e.hitPlayer=original;e.onPlayerHit=originalReaction;}
  rows.push({id:action.id,band,fps,speed,distance,circleStartDistance,startDistance,actualId,damage,damageAmount,captured,knockdowns,frames,playerUnchanged:f.player.position.equalsWithEpsilon(initial,1e-7),contact:e.v02LastContact});
 }
 evidence.push({case:'autonomous-physical-contact-matrix',setup:'Requested engagement band is established after the actual rest/rise motion, before a fresh complete2–3s observation and autonomous selection/approach. The player is never moved and startAction is never called. Separate near/far observation cases retain the untouched complete summon path.',rows});
 assert.equal(rows.length,120);assert.deepEqual(rows.filter(r=>r.id!==r.actualId||r.damage!==1||r.captured!==WOLF_V02_BY_ID[r.id].capture||r.knockdowns!==(['lunge','pin'].includes(r.id)?1:0)||!r.playerUnchanged||r.frames>=r.fps*24),[]);
 assert.ok(rows.filter(r=>r.id==='lunge').every(r=>r.damageAmount===40&&r.contact?.part==='head'),'standing dummies receive only head ram40; actual native prone-body mauls have a separate coupled integration test');
 const negatives=[];for(const mode of ['dodge','height','distant','behind','wall']){
  const a=WOLF_V02_BY_ID['quick-bite'],e=await begin(f,{distance:a.preferredDistance,sequence:['quick-bite']});until(f,e,()=>e.brain.mode==='attack'&&e.brain.time>=a.commitTime,{fps:240});const serial=e.brain.serial;
  if(mode==='height'){f.player.position.y=8;f.world.terrain.place=v=>{if(v!==f.player.position)v.y=0;};}if(mode==='distant')f.player.position.z+=12;if(mode==='behind')f.player.position.set(0,0,-a.preferredDistance);if(mode==='wall')f.world.navigation={segmentClear:()=>false,constrain(){},steer:(from,to)=>from};
  for(let i=0;i<1200&&e.brain.serial===serial&&e.brain.mode==='attack';i++)stepWolfHunt(f,e,1/240,{state:mode==='dodge'?'dodge':'idle',actionId:mode==='dodge'?958:undefined});
  negatives.push({mode,hp:e.playerHp,captured:e.grab.active});f.world.navigation=null;
 }
 evidence.push({case:'contact-negatives',rows:negatives});assert.ok(negatives.every(r=>r.hp===500&&!r.captured));
});

test('a disadvantaged live wolf steps backward while facing the player then waits another 2–3 seconds before reattacking',async t=>{
 const f=await wolfHuntFixture(t),e=await begin(f,{distance:3,seed:819,sequence:['quick-bite']});until(f,e,()=>e.brain.mode==='attack');
 until(f,e,()=>e.v02LastOutcome?.blocked,{state:'shieldPush'});let retreat=null,circle=null,attack=null,oldCircle=e.brain.circleTarget,retreatSamples=[];
 for(let frame=0;frame<60*15;frame++){
  e.playerHp=500;stepWolfHunt(f,e,1/60);const time=frame/60;
  if(e.brain.behavior==='retreat'){
   retreat??={start:time,first:e.actor.position.asArray(),startRadius:Vector3.Distance(e.actor.position,f.player.position)};
   const p=e.actor.position,dx=f.player.position.x-p.x,dz=f.player.position.z-p.z,d=Math.hypot(dx,dz);retreatSamples.push({time,radius:d,facing:(Math.sin(e.actor.rotation.y)*dx+Math.cos(e.actor.rotation.y)*dz)/Math.max(1e-8,d),clip:e.brain.state,source:e.brain.time});
  }
  if(retreat&&e.brain.behavior==='flank'){circle??={start:time,frames:0,target:e.brain.circleTarget};circle.frames++;}
  if(retreat&&e.brain.mode==='attack'){attack={time,id:e.brain.actionId};break;}
 }
 const row={retreat,circle,attack,oldCircle,retreatSamples};evidence.push({case:'facing-backstep-reset',...row});
 assert.ok(retreat&&retreatSamples.length>10&&circle&&attack);assert.ok(retreatSamples.at(-1).radius-retreat.startRadius>.65);assert.ok(retreatSamples.every(r=>r.facing>.85),'backstep cannot turn its back to the player');assert.ok(circle.frames/60>=2-2/60&&circle.frames/60<=3+2/60);assert.ok(attack.time-circle.start>=2-2/60);
});

test('lethal collapse is separate from live reactions and resource reuse retains independent rigs and cleanup ownership',async t=>{
 const f=await wolfHuntFixture(t),e=await begin(f,{distance:3});until(f,e,()=>e.brain.mode==='attack');let rewards=0;e.onDefeat=()=>rewards++;e.brain.hit({damage:10000,heavy:true,ignoreDefense:true});const lethalClip=e.brain.state,heights=[],modes=[],hold=[];
 for(let i=0;i<500&&!e.corpseGone;i++){stepWolfHunt(f,e,1/60);if(!e.corpseGone){heights.push(e.nodes.chest.getAbsolutePosition().y);modes.push(e.brain.mode);if(e.brain.time>=1.42)hold.push({time:e.brain.time,chest:e.nodes.chest.getAbsolutePosition().clone(),head:e.nodes.head.getAbsolutePosition().clone()});}}
 const holdMovement=hold.length?Math.max(...hold.flatMap(s=>[Vector3.Distance(s.chest,hold[0].chest),Vector3.Distance(s.head,hold[0].head)])):Infinity;
 evidence.push({case:'separate-natural-collapse-lifetime',lethalClip,rewards,corpseGone:e.corpseGone,minimumChestHeight:Math.min(...heights),modes:[...new Set(modes)],relaxedHoldSamples:hold.length,relaxedHoldMotionMeters:holdMovement,scope:'Endpoint stability and lifetime only; cheek/fur/body ground contact and the reference-image silhouette require actual evaluated skin renders.'});
 assert.notEqual(lethalClip,WOLF_CLIPS.down,'R11 natural collapse must be a separate new clip');assert.ok(!modes.includes('recover'));assert.equal(e.grab.active,false);assert.equal(f.battle.combat.grabOwner,null);assert.equal(rewards,1);assert.equal(e.corpseGone,true);assert.ok(hold.length>=8&&holdMovement<.03,'the authored relaxed endpoint remains settled before fading');
 f.player.position.set(0,0,3);assert.equal(await f.battle.summon(f.player,5,'wolf'),true);const actors=[...f.battle.encounters],before=huntResourceCounts(f.scene);assert.equal(new Set(actors.map(a=>a.asset.skeletons[0])).size,5);
 for(let i=0;i<3;i++){f.battle.hide();assert.equal(await f.battle.summon(f.player,5,'wolf'),true);assert.deepEqual(huntResourceCounts(f.scene),before);assert.deepEqual(f.battle.encounters,actors);}
 assert.equal(f.scene._activeAnimatables.length,0);evidence.push({case:'warm-five-wolf-cleanup',repeats:3,resources:before,independentSkeletons:5,sharedTemplateClips:f.container.animationGroups.length});
});

test('runtime circling, bite, shove and retreat preserve approved bind attachment lengths and scales',async t=>{
 const f=await wolfHuntFixture(t),e=await begin(f,{distance:3,seed:77});
 const config=JSON.parse(fs.readFileSync(new URL('../public/assets/alpha-wolf.json',import.meta.url))),gltf=JSON.parse(fs.readFileSync(new URL('../public/assets/'+config.model,import.meta.url))),bind=new Map(gltf.nodes.map(n=>[n.name,n]));
 let maxLengthError=0,maxScaleError=0,checks=0,worstAttachment=null,legacyNonlimbVariation=null;const visited=new Set();
 const measure=()=>{visited.add(e.brain.state);for(const [name,node]of Object.entries(e.nodes)){
  const original=bind.get(name);if(!original)continue;
  if(!['root','pelvis'].includes(name)){
   const error=Math.abs(node.position.length()-Math.hypot(...(original.translation??[0,0,0]))),row={name,clip:e.brain.state,time:e.brain.time,error,local:node.position.asArray(),bind:original.translation};
   const checked=name.startsWith('fore.')||name.startsWith('hind.')||(e.animator.blend===1&&(e.brain.state.startsWith('Wolf_Predator_')||['Wolf_Backward_Brace_V02','Wolf_Staggered_Collapse_V02'].includes(e.brain.state)));
   if(checked&&error>maxLengthError){maxLengthError=error;worstAttachment=row;}
   else if(!checked&&(!legacyNonlimbVariation||error>legacyNonlimbVariation.error))legacyNonlimbVariation=row;
  }
  const scale=original.scale??[1,1,1];for(let k=0;k<3;k++)maxScaleError=Math.max(maxScaleError,Math.abs(node.scaling.asArray()[k]-scale[k]));checks++;
 }};
 for(let frame=0;frame<60*15;frame++){
  e.playerHp=500;stepWolfHunt(f,e,1/60,{state:frame>60*7&&frame<60*9?'shieldPush':'idle',actionId:frame>60*7&&frame<60*9?970:undefined});measure();
  if(frame===60*10){e.gate.collect=()=>({hits:[{id:'judgment',damage:20,heavy:true}],hitStop:.03});try{e.poseAndContacts(f.player,{state:'idle'},{actionId:971},null);}finally{delete e.gate.collect;}measure();}
  if(e.grab.active)f.battle.escapeGrab();
 }
 evidence.push({case:'runtime-fixed-bind-anatomy',checks,visited:[...visited],maximumAttachmentLengthErrorMeters:maxLengthError,maximumScaleError:maxScaleError,worstAttachment,preservedLegacyNonlimbVariation:legacyNonlimbVariation,scope:'All limb offsets throughout the actual fight including transitions, plus every non-root/pelvis attachment in fully blended new R11 poses, are compared with approved bind lengths. Original unmodified nonlimb translations and their transition blends are recorded separately. Evaluated skin cores, joint collars, fur pattern and relaxed collapse silhouette require the separate actual-color runtime render review.'});
 assert.ok(checks>1000);assert.ok(maxLengthError<1e-5);assert.ok(maxScaleError<2e-6);
});

test('far autonomous pursuit uses a fast matched gallop into compact grounded ram',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const distance of [6,15,35]){
  const e=await begin(f,{distance,seed:1234}),moves=[];let previous=e.actor.position.clone(),attack=null;
  for(let frame=0;frame<60*20;frame++){
   stepWolfHunt(f,e,1/60);if(e.brain.mode==='move')moves.push({clip:e.brain.state,speed:Vector3.Distance(previous,e.actor.position)*60});previous.copyFrom(e.actor.position);
   if(e.brain.mode==='attack'){attack={id:e.brain.actionId,clip:e.brain.state};break;}
  }
  assert.ok(attack);rows.push({distance,attack,moveFrames:moves.length,peakWorldSpeed:Math.max(0,...moves.map(m=>m.speed)),walkFrames:moves.filter(m=>m.clip===WOLF_CLIPS.walk).length});
  if(distance===35){
   const origin=e.actor.position.clone(),heading=e.actor.rotation.y,serial=e.brain.serial,samples=[];let wall=0;
   for(let frame=0;frame<60*5&&e.brain.serial===serial&&e.brain.mode==='attack'&&e.brain.time<WOLF_V02_BY_ID.lunge.impact;frame++){
    stepWolfHunt(f,e,1/60);wall+=1/60;if(e.brain.serial!==serial||e.brain.mode!=='attack')break;
   const p=e.actor.position,dx=p.x-origin.x,dz=p.z-origin.z;samples.push({wall,source:e.brain.time,lateral:dx*Math.cos(heading)-dz*Math.sin(heading),pelvisAboveActor:e.nodes.pelvis.getAbsolutePosition().y-p.y,feet:Object.fromEntries(stanceNames.map(n=>[n,e.nodes[n].getAbsolutePosition().asArray()]))});
   }
   const lateral=Math.max(...samples.map(s=>s.lateral))-Math.min(...samples.map(s=>s.lateral)),flight=Math.max(...samples.map(s=>s.pelvisAboveActor))-Math.min(...samples.map(s=>s.pelvisAboveActor));
   const clip=WOLF_V02_COMBAT_R13_CLIPS.find(c=>c.name===attack.clip),drifts=[];
   for(const phase of clip.supportPhases){const support=samples.filter(s=>s.source>=phase.start+1/60&&s.source<=phase.end-1/60);if(!support.length)continue;for(const name of phase.feet)drifts.push(Math.max(...support.map(s=>Vector3.Distance(Vector3.FromArray(s.feet[name]),Vector3.FromArray(support[0].feet[name])))));}
   rows.at(-1).lunge={ramPrefixWallSeconds:wall,lateralMeters:lateral,pelvisHeightSpan:flight,namedSupportDrifts:drifts,samples};assert.equal(attack.id,'lunge');assert.ok(wall<1.1,'the head-ram run-up stays fast while later mauls use the real fall clock');assert.ok(lateral<.25,'compact ram has no obsolete airborne dodge');assert.ok(drifts.length>=2&&drifts.every(d=>d<.025),'grounded ram preserves named supported feet despite torso pitch/height changes');
  }
 }
 evidence.push({case:'actual-fast-approach-dodge-leap',rows});assert.ok(rows.every(r=>r.walkFrames===0&&r.peakWorldSpeed>=6.5));assert.ok(rows.at(-1).peakWorldSpeed>8.5);
});

test('escaping a real pin before the bite prevents damage and takedown while dodge or block prevents capture',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const defense of ['escape','dodge','shieldPush']){
  const action=WOLF_V02_BY_ID.pin,e=await begin(f,{distance:action.preferredDistance,sequence:['pin'],seed:410}),initial=f.player.position.clone();let knockdowns=0;const original=e.onPlayerHit;e.onPlayerHit=(...args)=>{if(args[1]?.knockdown)knockdowns++;return original(...args);};
  until(f,e,()=>e.brain.mode==='attack');const serial=e.brain.serial;let captured=false,escaped=false;
  try{
   for(let i=0;i<900&&e.brain.serial===serial&&e.brain.mode==='attack';i++){
    stepWolfHunt(f,e,1/120,{state:defense==='escape'?'idle':defense,actionId:defense==='escape'?undefined:992});captured||=e.grab.active;
    if(defense==='escape'&&e.grab.active&&!escaped){assert.equal(e.playerHp,500,'capture alone does not apply bite damage');assert.equal(knockdowns,0);assert.strictEqual(f.battle.combat.grabOwner,e);escaped=f.battle.escapeGrab();}
   }
  }finally{e.onPlayerHit=original;}
  rows.push({defense,captured,escaped,knockdowns,hp:e.playerHp,grabActive:e.grab.active,ownerReleased:f.battle.combat.grabOwner===null,playerUnchanged:f.player.position.equalsWithEpsilon(initial,1e-7)});
 }
 evidence.push({case:'pin-defense-escape-before-bite',rows});
 for(const row of rows){assert.equal(row.hp,500);assert.equal(row.knockdowns,0);assert.equal(row.grabActive,false);assert.ok(row.ownerReleased&&row.playerUnchanged);if(row.defense==='escape')assert.ok(row.captured&&row.escaped);else assert.equal(row.captured,false);}
});
