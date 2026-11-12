import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {wolfHuntFixture,beginWolfHunt,stepWolfHunt,huntResourceCounts} from './helpers/wolf-hunt-fixture.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
import {WOLF_V02_ACTIONS,WOLF_V02_BY_ID} from '../src/wolf-v02-spec.js';

const evidence=[];
test.after(()=>{
 fs.mkdirSync('reports/wolf-v02-hunt',{recursive:true});
 fs.writeFileSync('reports/wolf-v02-hunt/independent-gameplay.json',JSON.stringify({scope:'Real packed R8 model, CPU NullEngine and actual battle update/contact pipeline on flat unobstructed ground. No browser automation or real-device FPS/heat/GPU claim.',sourceHashes:Object.fromEntries(['src/wolf-v02-spec.js','src/wolf-v02-encounter.js'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),cases:evidence},null,2)+'\n');
});

test('actual default hunt attacks, stalks and faces the player instead of running away at close/mid/long range',async t=>{
 const f=await wolfHuntFixture(t);
 for(const hp of [900,400])for(const distance of [2.15,4,10,25.4]){
  f.player.position.set(0,0,distance);assert.equal(await f.battle.summon(f.player,1,'wolf'),true);const e=f.battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;e.brain.hp=hp;e.brain.configureAttacks({custom:false});e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.behavior='observe';e.brain.observation=0;
  const attacks=[],flee=[],motions=new Set(),stalks=[];let lastSerial=null,stalkSinceAttack=0,hits=0;
  const hitPlayer=e.hitPlayer.bind(e);e.hitPlayer=(...args)=>{const before=e.playerHp;hitPlayer(...args);if(e.playerHp<before)hits++;};
  try{
   for(let frame=0;frame<60*45;frame++){
    e.playerHp=500;const before=e.actor.position.clone(),beforeDistance=Math.hypot(f.player.position.x-before.x,f.player.position.z-before.z);stepWolfHunt(f,e,1/60);motions.add(e.brain.state);
    const dx=f.player.position.x-e.actor.position.x,dz=f.player.position.z-e.actor.position.z,d=Math.hypot(dx,dz),facing=(Math.sin(e.actor.rotation.y)*dx+Math.cos(e.actor.rotation.y)*dz)/Math.max(d,1e-9);
    if(['flank','observe','position'].includes(e.brain.behavior)&&e.brain.mode!=='attack'){
     if(e.brain.behavior==='flank'){stalkSinceAttack++;stalks.push({time:frame/60,facing});}
     if(d>beforeDistance+.012&&facing<-.15)flee.push({time:frame/60,behavior:e.brain.behavior,position:e.actor.position.asArray(),facing,rangeGrowth:d-beforeDistance});
    }
    if(e.brain.mode==='attack'&&e.brain.serial!==lastSerial){lastSerial=e.brain.serial;attacks.push({id:e.brain.actionId,time:frame/60,phase:e.brain.phase,bout:e.brain.boutStrikes,stalkSamples:stalkSinceAttack});stalkSinceAttack=0;}
    if(e.grab.active)f.battle.escapeGrab();
   }
  }finally{e.hitPlayer=hitPlayer;}
  assert.ok(attacks.length>=3,JSON.stringify({hp,distance,attacks,behavior:e.brain.behavior,actor:e.actor.position.asArray()}));
  assert.ok(stalks.length>0,JSON.stringify({hp,distance,attacks,missing:'stalking movement'}));
  assert.equal(flee.length,0,JSON.stringify({hp,distance,flee:flee.slice(0,5)}));
  if(hp>450){assert.ok(attacks.every(a=>a.id!=='chain-bite'),'phase one has one attack before stalking');assert.ok(attacks.slice(1).every(a=>a.stalkSamples>0),'each new phase-one attack follows a stalk');}
  else {assert.ok(attacks.every(a=>a.bout>=1&&a.bout<=3),'phase two bouts stay bounded to at most three strikes');}
  assert.ok(hits>0,JSON.stringify({hp,distance,attacks,missing:'real body contact in free AI'}));
  evidence.push({case:'default-free-hunt',hp,initialDistance:distance,durationSeconds:45,attackCount:attacks.length,actualDamageEvents:hits,attacks,fleeFrames:flee.length,stalkFrames:stalks.length,motions:[...motions]});
 }
});

test('the fourteen existing motion roles remain callable and independent through rest, discovery and combat reactions',async t=>{
 const f=await wolfHuntFixture(t);await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0],visited=new Set([e.brain.state]);
 const tickUntil=(accept,limit=1000)=>{for(let i=0;i<limit&&!accept();i++){e.playerHp=500;stepWolfHunt(f,e,1/60);visited.add(e.brain.state);}assert.ok(accept(),JSON.stringify({state:e.brain.state,mode:e.brain.mode}));};
 e.actor.position.setAll(0);f.player.position.set(0,0,5);tickUntil(()=>e.brain.mode==='alert');tickUntil(()=>e.brain.mode==='rise');tickUntil(()=>e.brain.state===WOLF_CLIPS.watch);
 for(const [clip,mode] of [[WOLF_CLIPS.walk,'move'],[WOLF_CLIPS.run,'move']]){e.brain.start(clip,mode);e.animator.transition(clip,{clipTime:.2,actionId:e.brain.serial,blendDuration:0});e.animator.update(0);e.alignPose();visited.add(e.brain.state);}
 for(const id of ['quick-bite','paw-swipe','lunge','pin']){e.brain.startAction(id);const action=WOLF_V02_BY_ID[id];e.animator.transition(action.sourceClip,{clipTime:action.impact,actionId:e.brain.serial,blendDuration:0});e.animator.update(0);e.alignPose();visited.add(e.brain.state);}
 e.brain.hit({damage:1,interruptsBoss:true});visited.add(e.brain.state);assert.equal(e.brain.state,WOLF_CLIPS.hit);
 e.brain.hit({damage:1,stun:.1});tickUntil(()=>e.brain.state===WOLF_CLIPS.brace);visited.add(e.brain.state);
 e.brain.hit({damage:1,heavy:true});visited.add(e.brain.state);assert.equal(e.brain.state,WOLF_CLIPS.down);tickUntil(()=>e.brain.state===WOLF_CLIPS.recover);visited.add(e.brain.state);tickUntil(()=>e.brain.state===WOLF_CLIPS.watch);
 const expected=[...Object.values(WOLF_CLIPS),'Wolf_Snap_Bite_V02','Wolf_Forepaw_Swipe_V02'];assert.deepEqual([...visited].sort(),expected.sort());assert.equal(e.animator.clips.size,14);assert.equal(f.container.animationGroups.length,12);assert.equal(f.scene._activeAnimatables.length,0);
 const resources=huntResourceCounts(f.scene);for(let i=0;i<3;i++){f.battle.hide();await f.battle.summon(f.player,1,'wolf');assert.deepEqual(huntResourceCounts(f.scene),resources);}
 evidence.push({case:'fourteen-role-lifecycle',visited:[...visited],sharedTemplateClips:f.container.animationGroups.length,actorClips:e.animator.clips.size,warmRepeats:3,resources});
});

test('bounded physical contact windows deduplicate hits, consume a dodged strike and do not hit through walls or behind the wolf',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const id of ['quick-bite','paw-swipe','lunge'])for(const fps of [30,60])for(const speed of [.5,1,2]){
  const e=await beginWolfHunt(f,id,{speed}),serial=e.brain.serial;let hits=0;const hitPlayer=e.hitPlayer.bind(e);
  e.hitPlayer=(...args)=>{const before=e.playerHp;hitPlayer(...args);if(e.playerHp<before)hits++;};
  try{
   for(let i=0;i<1800&&e.brain.mode==='attack'&&e.brain.serial===serial;i++){
    e.playerHp=500;e.playerInvulnerable=0;stepWolfHunt(f,e,1/fps);
    // Multiple pose passes in one render frame cannot damage twice either.
    e.playerInvulnerable=0;f.battle.poseAndContacts(f.player,{state:'idle'},null,null);
   }
  }finally{e.hitPlayer=hitPlayer;}
  assert.equal(hits,1,JSON.stringify({id,fps,speed,hits}));rows.push({id,fps,speed,hits});
 }
 let e=await beginWolfHunt(f,'quick-bite');const dodgedSerial=e.brain.serial;
 for(let i=0;i<200&&e.v02ResolvedSerial!==dodgedSerial;i++)stepWolfHunt(f,e,1/60,{state:'dodge',actionId:33});
 assert.equal(e.v02ResolvedSerial,dodgedSerial,'actual contact consumes a defended strike');assert.equal(e.playerHp,500);
 for(let i=0;i<100&&e.brain.mode==='attack';i++){e.playerInvulnerable=0;stepWolfHunt(f,e,1/60);}
 assert.equal(e.playerHp,500,'ending the dodge inside the same contact window cannot cause a delayed hit');
 e=await beginWolfHunt(f,'quick-bite');while(e.brain.time<e.brain.action.commitTime+.005)stepWolfHunt(f,e,1/240);
 // Reposition before contact opens, rather than sweeping a synthetic 4m
 // teleport straight through the jaw during its active collision window.
 f.player.position.set(0,0,-2.15);for(let i=0;i<1200&&e.brain.mode==='attack';i++)stepWolfHunt(f,e,1/240);assert.equal(e.playerHp,500,'committed attacks do not turn or hit behind the body');
 e=await beginWolfHunt(f,'quick-bite',{z:12});for(let i=0;i<300&&e.brain.mode==='attack';i++)stepWolfHunt(f,e,1/60);assert.equal(e.playerHp,500,'distant root range does not create a body hit');
 e=await beginWolfHunt(f,'quick-bite');f.world.navigation={segmentClear:()=>false,constrain(){},steer:(origin,target)=>target};
 try{for(let i=0;i<300&&e.brain.mode==='attack';i++)stepWolfHunt(f,e,1/60);assert.equal(e.playerHp,500,'blocked world sight prevents damage');}finally{f.world.navigation=null;}
 evidence.push({case:'contact-safety',singleDamagePerSerial:rows,dodgeConsumedWithoutLateDamage:true,behindMiss:true,distantMiss:true,wallBlocked:true});
});

test('a modest lateral moving target is contacted without altering its position or extending a missed strike indefinitely',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const id of ['quick-bite','paw-swipe','lunge','pin'])for(const fps of [30,60]){
  const e=await beginWolfHunt(f,id),start=f.player.position.clone(),serial=e.brain.serial;let frames=0,damage=0,gotCapture=false;const hitPlayer=e.hitPlayer.bind(e);
  e.hitPlayer=(...args)=>{const before=e.playerHp;hitPlayer(...args);if(e.playerHp<before)damage++;};
  try{
   while(frames++<1800&&(e.brain.mode==='attack'&&e.brain.serial===serial||e.grab.active)){
    f.player.position.x=start.x+Math.min(.35,frames/fps*.3);const expected=f.player.position.clone();stepWolfHunt(f,e,1/fps);gotCapture||=e.grab.active;
    assert.ok(f.player.position.equalsWithEpsilon(expected,1e-7),'attack cannot teleport the player to its jaw/paw');
   }
  }finally{e.hitPlayer=hitPlayer;}
  assert.ok(damage===1,JSON.stringify({id,fps,damage,gotCapture,contact:e.v02LastContact}));assert.equal(gotCapture,id==='pin');rows.push({id,fps,damage,captured:gotCapture,lateralSpeed:.3,maximumLateralOffset:.35});
 }
 evidence.push({case:'moving-body-contact',rows});
});

test('both ends of every automatic engagement band contact the standing player at 30/60Hz and 0.5/1/2x speed',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const fps of [30,60])for(const speed of [.5,1,2])for(const a of WOLF_V02_ACTIONS.filter(a=>!a.chain))for(const band of ['minDistance','maxDistance']){
  const e=await beginWolfHunt(f,a.id,{z:a[band],speed});let ticks=0,captured=false;
  while(ticks++<1800&&(e.brain.mode==='attack'||e.brain.behavior==='recovery'||e.grab.active)){stepWolfHunt(f,e,1/fps);captured||=e.grab.active;}
  assert.ok(e.playerHp<500,JSON.stringify({id:a.id,fps,speed,band,distance:a[band],contact:e.v02LastContact}));assert.equal(captured,a.capture);
  rows.push({id:a.id,fps,speed,band,distance:a[band],hit:true,captured});
 }
 assert.equal(rows.length,48);evidence.push({case:'engagement-band-endpoints',rows});
});

test('watching and recovery hold their ground, and a blocked authored stalk stops instead of sliding or teleporting',async t=>{
 const f=await wolfHuntFixture(t);await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);f.player.position.set(0,0,8);e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.behavior='observe';e.brain.observation=5;
 const origin=e.actor.position.clone();for(let i=0;i<100;i++)stepWolfHunt(f,e,1/60);assert.ok(e.actor.position.equalsWithEpsilon(origin,1e-7),'idle watch root cannot drift during observation');
 e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.behavior='recovery';e.brain.recoveryRemaining=e.brain.recoveryFull=3;e.brain.recoveryElapsed=0;e.brain.followupId=null;
 for(let i=0;i<100;i++)stepWolfHunt(f,e,1/60);assert.equal(e.brain.behavior,'recovery');assert.ok(e.actor.position.equalsWithEpsilon(origin,1e-7),'watch root cannot drift during punishable recovery');
 e.brain.beginStalk();f.world.navigation={segmentClear:()=>false,constrain(){},steer:(from,to)=>to};
 try{for(let i=0;i<30&&e.brain.behavior==='flank';i++)stepWolfHunt(f,e,1/60);assert.ok(e.actor.position.equalsWithEpsilon(origin,1e-7),'blocked stalk cannot move through an obstruction');assert.notEqual(e.brain.behavior,'flank','blocked stalk exits rather than looping forever');}
 finally{f.world.navigation=null;}
 evidence.push({case:'stationary-watch-and-blocked-stalk',idleFrames:100,recoveryFrames:100,rootDrift:0,blockedStalkMoved:false});
});
