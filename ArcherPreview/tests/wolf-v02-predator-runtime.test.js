import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WOLF_BALANCE,WOLF_CLIPS} from '../src/wolf-spec.js';
import {WolfV02Brain,WOLF_V02_ACTIONS,WOLF_V02_BY_ID,WOLF_V02_BRACE,WOLF_V02_DEATH,WOLF_V02_GET_UP,WOLF_V02_SNAP,WOLF_V02_SWIPE,WOLF_V02_ORBIT,WOLF_V02_GAIT,actionDuration,sampleWhipTime,whipElapsedAt} from '../src/wolf-v02-spec.js';
import {wolfHuntFixture,beginWolfHunt,stepWolfHunt} from './helpers/wolf-hunt-fixture.js';

const base=JSON.parse(fs.readFileSync(new URL('../public/assets/alpha-wolf.json',import.meta.url)));
const durations=Object.fromEntries(base.catalog.map(c=>[c.name,c.duration]));
Object.assign(durations,{[WOLF_V02_SNAP]:.8,[WOLF_V02_SWIPE]:52/60,[WOLF_V02_BRACE]:.9,[WOLF_V02_DEATH]:1.65,[WOLF_V02_GET_UP]:2.2,[WOLF_V02_ORBIT.right]:.9,[WOLF_V02_ORBIT.left]:.9});
function awake(random=()=>.5,hp=900){const b=new WolfV02Brain(durations,WOLF_BALANCE,random);b.hp=hp;b.start(WOLF_CLIPS.watch,'idle');b.behavior='observe';b.observation=0;return b;}

test('seeded 2–3 second observation is wall time at near/far ranges and survives blocked replans without resetting or stalling',()=>{
 for(const fps of [30,60])for(const hp of [451,450])for(const sample of [0,.25,.75,1])for(const startDistance of [3,10,25.4,35]){
  let draws=0;const b=awake(()=>{draws++;return sample;},hp),dt=1/fps;
  let distance=startDistance,entered=null,left=null,attack=null,blocked=0,target=null;
  for(let frame=0;frame<fps*15;frame++){
   if(b.behavior==='flank'&&blocked<2&&b.circleElapsed>=(blocked+1)*.1){b.stalkBlocked=true;blocked++;}
   const r=b.update(dt,distance),wall=frame*dt;
   if(b.behavior==='flank'&&entered===null){entered=wall;target=b.circleTarget;}
   if(entered!==null&&b.behavior!=='flank'&&left===null)left=wall;
   if(r.speed){assert.equal(r.retreat,false);distance=Math.max(r.stopDistance,distance-r.speed*dt);assert.ok(Math.abs(b.approachPlaybackRate*WOLF_V02_GAIT.runSourceSpeed*2.5-r.speed)<1e-9);}
   if(b.mode==='attack'){attack=wall;break;}
   if(target!==null){assert.equal(b.circleTarget,target,'navigation cannot draw a replacement observation duration');assert.ok(b.circleElapsed<=target+1e-8);}
  }
  assert.equal(draws,1);assert.equal(target,2+sample);assert.ok(left!==null&&attack!==null,JSON.stringify({fps,hp,startDistance,behavior:b.behavior}));
  assert.ok(Math.abs(left-entered-target)<=2*dt+1e-7,JSON.stringify({fps,hp,startDistance,target,entered,left}));
  assert.ok(attack-entered>=target-dt);assert.equal(blocked,2);assert.ok(b.boutStrikes===1);
 }
});

test('every new bout samples independently while the three-strike low-health bout remains finite',()=>{
 for(const hp of [451,450]){
  const samples=[.1,.9,.3,.7,.5];let draws=0;const b=awake(()=>samples[draws++%samples.length],hp),targets=[],bouts=[];let current=[],serial=null,wasFlank=false;
  for(let frame=0;frame<60*35;frame++){
   const r=b.update(1/60,3.0);
   if(b.behavior==='flank'&&!wasFlank){targets.push(b.circleTarget);if(current.length)bouts.push(current);current=[];}
   wasFlank=b.behavior==='flank';
   if(b.mode==='attack'&&b.serial!==serial){serial=b.serial;current.push(b.actionId);}
   for(const event of r.events)if(event.type==='attack')b.noteAttackResult({hit:true});
  }
  assert.ok(targets.length>=4);assert.deepEqual(targets.slice(0,4),[2.1,2.9,2.3,2.7]);assert.equal(draws,targets.length);
  assert.ok(bouts.every(bout=>bout.length===(hp>450?1:3)),JSON.stringify({hp,bouts}));
 }
});

test('live heavy hits collapse/getup, blocked attacks play a hit motion, and lethal collapse remains terminal',()=>{
 const heavy=awake();heavy.startAction('quick-bite');heavy.hit({damage:30,heavy:true});assert.equal(heavy.state,WOLF_V02_DEATH);assert.equal(heavy.mode,'down');assert.equal(heavy.stagger,0);assert.equal(heavy.hp,870);
 heavy.update(.1,3);assert.ok(heavy.time>.09,'a live heavy reaction must animate immediately instead of freezing a fall');
 for(let i=0;i<300&&heavy.behavior!=='flank';i++)heavy.update(1/60,4.2);
 assert.equal(heavy.behavior,'flank');assert.ok(heavy.visited.has(WOLF_V02_DEATH)&&heavy.visited.has(WOLF_V02_GET_UP));assert.ok(!heavy.visited.has(WOLF_CLIPS.down)&&!heavy.visited.has(WOLF_CLIPS.recover));assert.equal(heavy.circleTarget,2.5);
 const blocked=awake();blocked.startAction('quick-bite');assert.equal(blocked.parry(),true);assert.equal(blocked.state,WOLF_CLIPS.hit);assert.equal(blocked.stagger,0);assert.ok(blocked.flash>0);
 blocked.update(.1,3);assert.ok(blocked.time>.1);assert.ok(!blocked.visited.has(WOLF_CLIPS.down));
 for(let i=0;i<120&&blocked.mode!=='retreat';i++)blocked.update(1/60,3);assert.equal(blocked.mode,'retreat');assert.equal(blocked.retreatReason,'blocked');
 for(let i=0;i<80&&blocked.behavior!=='flank';i++)blocked.update(1/60,4.2);assert.equal(blocked.circleElapsed,0);assert.equal(blocked.circleTarget,2.5);assert.ok(blocked.retreatCooldown>5);
 blocked.requestRetreat('blocked');assert.equal(blocked.retreatPending,null,'the cooldown prevents a permanent retreat loop');
 const pressured=awake(()=>.5,450);pressured.startAction('chain-bite');pressured.hit({damage:14});
 for(let i=0;i<180&&pressured.mode==='attack';i++){const r=pressured.update(1/60,3);if(r.events.length)pressured.noteAttackResult({hit:true});}
 assert.equal(pressured.behavior,'recovery');assert.equal(pressured.followupId,null,'a disadvantaged successful strike still ends its bout before backing away');
 const lethal=awake();lethal.hit({damage:900,heavy:true});assert.equal(lethal.state,WOLF_V02_DEATH);assert.equal(lethal.mode,'down');
 for(let i=0;i<300;i++)lethal.update(1/60,3);assert.equal(lethal.time,durations[WOLF_V02_DEATH]);assert.equal(lethal.hp,0);assert.ok(!lethal.visited.has(WOLF_CLIPS.recover));
});

test('the ram prefix stays fast while its maul tail uses real time, and pin preserves its accelerated full timing',()=>{
 const lunge=WOLF_V02_BY_ID.lunge,ramPrefix=whipElapsedAt(lunge,lunge.impact);assert.ok(ramPrefix<1);assert.ok(Math.abs(actionDuration(lunge)-ramPrefix-(lunge.clipEnd-lunge.impact))<1e-9);assert.ok(actionDuration(WOLF_V02_BY_ID.pin)<=1.6);
 for(const id of ['lunge','pin'])for(const fps of [30,60])for(const speed of [.5,1,2]){
  const a=WOLF_V02_BY_ID[id],b=awake();b.configureAttacks({speed});b.startAction(id);let prior=0,events=0,elapsed=0,sawPinBite=false;
  for(let i=0;i<1000&&b.mode==='attack';i++){
   const r=b.update(1/fps,a.preferredDistance);elapsed+=1/fps;
   if(b.mode==='attack'){assert.ok(b.time>=prior);prior=b.time;sawPinBite||=b.time===1.85;}
   for(const event of r.events){events++;assert.equal(b.time,a.impact);assert.equal(event.capture,a.capture);b.noteAttackResult({hit:true});}
   b.configureAttacks({speed:speed===2?.5:2});assert.equal(b.castSpeed,speed);
  }
  const expectedDuration=id==='lunge'?ramPrefix/speed+a.clipEnd-a.impact:actionDuration(a)/speed;
  assert.equal(events,1);assert.ok(elapsed<=expectedDuration+4/fps+1e-7);if(id==='lunge')assert.ok(elapsed>=expectedDuration-1/fps,'cast speed cannot shorten the real fall/maul tail');if(id==='pin')assert.ok(sawPinBite,'accelerated capture must retain the exact authored throat-bite threshold');
  let source=0;for(let i=0;i<=1000;i++){const next=sampleWhipTime(a,actionDuration(a)*i/1000);assert.ok(next>=source);source=next;}assert.equal(source,a.clipEnd);
 }
 for(const a of WOLF_V02_ACTIONS.filter(a=>[WOLF_V02_SNAP,WOLF_V02_SWIPE].includes(a.sourceClip)))assert.equal(a.authoredAttention,true,'upper-body authored diagonal motion owns the bite pose');
});

test('standing fixtures receive head ram40 or the unchanged mouth pin, and escaped captures cannot receive phantom bites',async t=>{
 const f=await wolfHuntFixture(t);
 for(const id of ['lunge','pin'])for(const fps of [30,60])for(const speed of [.5,1,2])for(const band of ['minDistance','preferredDistance','maxDistance']){
  const a=WOLF_V02_BY_ID[id],e=await beginWolfHunt(f,id,{z:a[band],speed}),onPlayerHit=e.onPlayerHit;let knockdowns=0;
  e.onPlayerHit=(duration,options)=>{if(options?.knockdown)knockdowns++;return onPlayerHit(duration,options);};
  try{
   for(let i=0;i<1800&&(e.brain.mode==='attack'||e.grab.active);i++)stepWolfHunt(f,e,1/fps);
   assert.equal(500-e.playerHp,id==='lunge'?40:a.damage,JSON.stringify({id,fps,speed,band,contact:e.v02LastContact,bite:e.v02PinBiteContact}));assert.equal(knockdowns,1);
   if(id==='lunge'){assert.equal(e.v02LastContact.part,'head');assert.ok(e.v02LastContact.distance<=e.v02LastContact.radius);}
   else{assert.equal(e.v02PinBiteContact.sourceTime,1.85);assert.equal(e.v02PinBiteContact.contact,true);assert.ok(e.v02PinBiteContact.separation<=e.v02PinBiteContact.radius);}
  }finally{e.onPlayerHit=onPlayerHit;}
 }
 for(const escaped of [true,false]){
  const e=await beginWolfHunt(f,'pin');for(let i=0;i<600&&!e.grab.active;i++)stepWolfHunt(f,e,1/240);assert.equal(e.grab.active,true);
  if(escaped)assert.equal(e.grab.escape(),true);else f.player.position.x+=10;
  for(let i=0;i<600&&(e.brain.mode==='attack'||e.grab.active);i++)stepWolfHunt(f,e,1/240);
  assert.equal(e.playerHp,500);assert.equal(e.grab.active,false);
  if(!escaped){assert.equal(e.v02PinBiteContact.contact,false);assert.ok(e.v02PinBiteContact.separation>e.v02PinBiteContact.radius);}
 }
});

test('compact grounded prelaunch aiming stays bounded without a commit snap or post-launch retarget',async t=>{
 const f=await wolfHuntFixture(t);let maximumCommitTurn=0;
 const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 for(const fps of [30,60])for(const speed of [.5,1,2])for(const lateralSpeed of [0,.3,1.2,3.6,-3.6]){
  const e=await beginWolfHunt(f,'lunge',{z:WOLF_V02_BY_ID.lunge.preferredDistance,speed});let locked=null;
  for(let i=0;i<1200&&e.brain.mode==='attack';i++){
   const previous=e.brain.time,yaw=e.motionYaw??0;f.player.position.x+=lateralSpeed/fps;stepWolfHunt(f,e,1/fps);
   if(previous<e.brain.action?.commitTime&&e.brain.time>=e.brain.action.commitTime){maximumCommitTurn=Math.max(maximumCommitTurn,Math.abs(delta(e.motionYaw,yaw)));locked=e.motionYaw;f.player.position.x+=12;break;}
  }
  assert.notEqual(locked,null);
  for(let i=0;i<1200&&e.brain.mode==='attack';i++){stepWolfHunt(f,e,1/fps);if(e.brain.mode==='attack')assert.ok(Math.abs(delta(e.motionYaw,locked))<1e-10,'a committed ram cannot follow the escaped player');}
  assert.equal(e.playerHp,500,'moving out of the committed mouth path remains a true miss');
 }
 assert.ok(maximumCommitTurn<3*Math.PI/180,`the bounded correction must stay a small natural prelaunch turn, measured ${maximumCommitTurn*180/Math.PI} degrees`);
});

test('blocked near-range replanning keeps the completed observation and follows a detour instead of stopping its run at the player range',async t=>{
 const f=await wolfHuntFixture(t);await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);f.player.position.set(0,0,3.1);
 e.brain.random=()=>.5;e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.behavior='observe';e.brain.observation=0;
 let sensorWrites=0,blocked=false,queries=0,frames=0;
 Object.defineProperty(e.brain,'sightBlocked',{get(){return blocked;},set(value){sensorWrites++;blocked=value;},configurable:true});
 // A supplied safe detour isolates the approach-stop contract from the
 // navigation engine's geometry search. Shared LOS still rejects all attacks.
 f.world.navigation={segmentClear(){queries++;return false;},constrain(){},steer:from=>({x:from.x-2,z:from.z})};
 const origin=e.actor.position.clone();
 try{
  for(;frames<240&&e.brain.mode!=='move';frames++)stepWolfHunt(f,e,1/60);
  assert.equal(e.brain.mode,'move');assert.ok(e.brain.circleElapsed>=2.5-1e-8);assert.equal(e.brain.circleTarget,2.5);
  stepWolfHunt(f,e,1/60);frames++;
  assert.ok(e.actor.position.x<origin.x-.05,'the close blocked path must move toward its navigation waypoint');
  assert.equal(e.brain.boutObserved,true,'replanning cannot discard the observation already completed');assert.equal(e.brain.attackCount,0);
  assert.ok(sensorWrites<=Math.ceil((frames/60)/.15)+1,`cached subclass sight checks stay bounded (${sensorWrites} in ${frames/60}s)`);
  assert.ok(queries>=frames,'the shared per-frame sight check remains active');
 }finally{f.world.navigation=null;}
});
