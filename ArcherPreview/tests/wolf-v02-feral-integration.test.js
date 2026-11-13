import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Quaternion,Vector3} from '@babylonjs/core';
import {wolfHuntFixture,stepWolfHunt,resetFeral,poseRow,headAttention,angleDelta,quantile} from './helpers/wolf-feral-fixture.js';
import {WOLF_CLIPS,WOLF_BALANCE} from '../src/wolf-spec.js';
import {WOLF_V02_ACTIONS,WOLF_V02_BY_ID,WOLF_V02_GAIT} from '../src/wolf-v02-spec.js';

const evidence=[];
test.after(()=>{
 fs.mkdirSync('reports/wolf-v02-feral-r10',{recursive:true});
 const label=process.env.WOLF_FERAL_EVIDENCE_LABEL?.replace(/[^a-z0-9_-]/gi,'-'),filename=label?`independent-gameplay-${label}.json`:'independent-gameplay.json';
 fs.writeFileSync('reports/wolf-v02-feral-r10/'+filename,JSON.stringify({scope:'Actual packed approved R8 rig, actual game battle/update/pose/contact pipeline, CPU NullEngine. Attention compares head world local+Y with the player bodyAimHeight in full 3D and horizontal azimuth independently. Autonomous matrix starts the positioning brain, never startAction. Offline numerical evidence is not visual approval, GPU or real-device performance.',sourceHashes:Object.fromEntries(['src/wolf-v02-spec.js','src/wolf-v02-encounter.js','src/wolf-v02-locomotion.js','src/wolf-v02-authored-clips.js','src/wolf-v02-attack-clips.json','src/wolf-v02-feral-clips.json'].filter(p=>fs.existsSync(p)).map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),cases:evidence},null,2)+'\n');
});

function authoredRotation(e,name){
 const row=e.asset.animationGroups.find(g=>g.name===e.brain.state).targetedAnimations.find(r=>r.target.name===name&&r.animation.targetProperty==='rotationQuaternion');
 assert.ok(row,`${e.brain.state} owns ${name} rotation`);const keys=row.animation.getKeys(),frame=e.brain.time*row.animation.framePerSecond;
 let index=0;while(index<keys.length-2&&frame>keys[index+1].frame)index++;
 const a=keys[index],b=keys[Math.min(index+1,keys.length-1)],t=Math.max(0,Math.min(1,(frame-a.frame)/Math.max(1e-9,b.frame-a.frame)));
 return Quaternion.Slerp(a.value,b.value,t);
}

test('real head keeps its muzzle toward stationary and moving players through both centered orbit directions',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const side of [-1,1])for(const radius of [3,5])for(const moving of [false,true]){
  const e=await resetFeral(f,{distance:radius,behavior:'observe'});e.brain.observation=5;
  for(let warm=0;warm<24;warm++)stepWolfHunt(f,e,1/60);
  e.brain.flankSide=-side;e.brain.beginStalk();e.brain.flankRemaining=e.brain.circleTarget=15;e.brain.circleElapsed=0;e.brain.flankPlaybackRate=WOLF_V02_GAIT.orbitPlaybackRate;
  const angles=[],angles3D=[],radii=[],support=[],trace=[];let angleSum=0,lastAngle=null,episode=null,loop=0,previousTime=0,exit=null;
  for(let frame=0;frame<14*60;frame++){
   const wall=frame/60;if(moving){f.player.position.x=wall*.12;f.player.position.z=radius+Math.sin(wall*.15)*.2;}
   const expected=f.player.position.clone();stepWolfHunt(f,e,1/60);assert.ok(f.player.position.equalsWithEpsilon(expected,1e-7),'orbit cannot move the player');
   if(e.brain.behavior!=='flank'){exit={wall,behavior:e.brain.behavior,actor:e.actor.position.asArray(),player:f.player.position.asArray()};break;}
   if(e.brain.time<previousTime)loop++;previousTime=e.brain.time;
   const p=e.actor.position,center=f.player.position,angle=Math.atan2(p.x-center.x,p.z-center.z);
   if(lastAngle!==null)angleSum+=angleDelta(angle,lastAngle);lastAngle=angle;
   const gaze=headAttention(e,f.player);if(wall>=.3){angles.push(gaze.degrees);angles3D.push(gaze.degrees3D);radii.push(Math.hypot(p.x-center.x,p.z-center.z));}
   // New authoring's explicit diagonal stance phases, with mirrored names.
   // Each planted interval is compared to its own first world position.
   const phase=e.brain.time<.45?0:1,key=loop+':'+phase;
   const rightNames=phase===0?['fore.R.paw','hind.L.paw']:['fore.L.paw','hind.R.paw'];
   const names=side>0?rightNames:rightNames.map(n=>n.replace('.R.','.__.').replace('.L.','.R.').replace('.__.','.L.'));
   // A stance anchor sampled during the initial pose blend is not a valid
   // authored planted reference after that blend. Begin the measurement
   // interval only once the pose has settled, then measure every later phase.
   if(wall>.3){
    if(!episode||episode.key!==key)episode={key,start:wall,points:Object.fromEntries(names.map(n=>[n,e.nodes[n].getAbsolutePosition().clone()]))};
    for(const name of names)support.push({name,time:wall,drift:Vector3.Distance(episode.points[name],e.nodes[name].getAbsolutePosition())});
   }
   if(frame%60===0)trace.push({time:wall,actor:p.asArray(),player:center.asArray(),gaze:gaze.degrees,gaze3D:gaze.degrees3D,sourceTime:e.brain.time,clip:e.brain.state});
   if(frame%53===0){const before=e.nodes.head.rotationQuaternion.clone();for(let i=0;i<4;i++)f.battle.poseAndContacts(f.player,{state:'idle'},null,null);assert.ok(Math.abs(Math.abs(before.dot(e.nodes.head.rotationQuaternion))-1)<1e-7,'repeated contact pose passes cannot accumulate head correction');}
  }
  const row={side,radius,moving,exit,angleDegrees:angleSum*180/Math.PI,headP95:quantile(angles,.95),headMax:Math.max(...angles),head3DP95:quantile(angles3D,.95),head3DMax:Math.max(...angles3D),minRadius:Math.min(...radii),maxRadius:Math.max(...radii),supportP95:quantile(support.map(r=>r.drift),.95),supportMax:Math.max(...support.map(r=>r.drift)),supportSamples:support.length,supportWorst:[...support].sort((a,b)=>b.drift-a.drift).slice(0,5),trace};rows.push(row);
 }
 evidence.push({case:'actual-head-centered-orbit-and-named-foot-support',rows});
 const failures=rows.filter(row=>row.exit||!(row.headP95<8&&row.headMax<15&&row.head3DP95<8&&row.head3DMax<15)||!(Math.abs(row.angleDegrees)>290)||!(Math.abs(row.minRadius-row.radius)<.35&&Math.abs(row.maxRadius-row.radius)<.35)||!(row.supportP95<.10&&row.supportMax<.18));
 assert.deepEqual(failures,[],'head gaze, centered circle and explicit planted-foot phases must all pass independently');
});

test('autonomous pursuit uses the approved gallop at the requested faster speed with matching enlarged cadence',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 // Authored R8 gallop contact windows, from the canonical R8 actions.json.
 const runStances={'fore.L.paw':[.58-17/30,.72-17/30],'fore.R.paw':[.1216666667,.2616666667],'hind.L.paw':[.2916666667,.3916666667],'hind.R.paw':[.3583333333,.4583333333]};
 for(const initialRange of [6,15,35]){
  const e=await resetFeral(f,{distance:initialRange,sequence:['quick-bite']}),moves=[],stanceDrift=[],wrappedPeriods=[],wrapWalls=[];let previous=e.actor.position.clone(),lastTime=0,lastClip=null,cycle=0,runStart=0;const anchors={};
  for(let i=0;i<60*20&&e.brain.mode!=='attack';i++){
   stepWolfHunt(f,e,1/60);if(e.brain.mode==='move'){
    if(lastClip!==e.brain.state)runStart=i/60;
    const distance=Vector3.Distance(previous,e.actor.position);moves.push({clip:e.brain.state,speed:distance*60,requestedSpeed:e.brain.approachSpeed,playback:e.brain.approachPlaybackRate,sourceDelta:lastClip===e.brain.state&&e.brain.time>=lastTime?e.brain.time-lastTime:null});
    if(lastClip===e.brain.state&&e.brain.time<lastTime){cycle++;wrappedPeriods.push(lastTime+e.brain.approachPlaybackRate/60-e.brain.time);wrapWalls.push(i/60);}
    for(const [name,[start,end]]of Object.entries(runStances)){
     // Ignore only the explicit .16s transition and 1/60 source-time edge
     // interpolation into/out of a contact window. Flight is not support.
     const phase=e.brain.time-1/30,supported=i/60-runStart>.3&&phase>start+1/60&&phase<end-1/60&&distance*60>WOLF_V02_GAIT.runSpeed-.05;
     if(!supported){delete anchors[name];continue;}
     const point=e.nodes[name].getAbsolutePosition();anchors[name]??=point.clone();stanceDrift.push({name,wall:i/60,sourceTime:e.brain.time,drift:Vector3.Distance(point,anchors[name])});
    }
   }previous.copyFrom(e.actor.position);lastTime=e.brain.time;lastClip=e.brain.state;
  }
  assert.equal(e.brain.mode,'attack');assert.equal(e.brain.actionId,'quick-bite');assert.ok(moves.length>10);
  assert.ok(moves.every(r=>r.clip===WOLF_CLIPS.run),'requested aggressive pursuit cannot spend its final two metres in the slow walking clip');
  const normal=moves.filter(r=>r.speed>WOLF_V02_GAIT.runSpeed-.05&&r.sourceDelta!==null&&Math.abs(r.speed-r.requestedSpeed)<1e-6),medianSpeed=quantile(normal.map(r=>r.speed),.5),medianCadence=quantile(normal.map(r=>r.sourceDelta*60),.5);
  assert.ok(medianSpeed>=WOLF_V02_GAIT.runSpeed-1e-6&&medianSpeed<=WOLF_V02_GAIT.farRunSpeed+1e-6);assert.ok(normal.every(r=>Math.abs(r.sourceDelta*60-r.playback)<1e-6));
  assert.ok(Math.abs(medianCadence*WOLF_V02_GAIT.runSourceSpeed*e.config.scale-medianSpeed)<1e-6,'gait travel per source second must match game travel per wall second');
  const maxStanceDrift=Math.max(0,...stanceDrift.map(r=>r.drift)),observedSourcePeriod=quantile(wrappedPeriods,.5),sampledWallPeriods=wrapWalls.slice(1).map((v,i)=>v-wrapWalls[i]);
  if(initialRange===35)assert.ok(Math.abs(observedSourcePeriod-17/30)<1e-7,'actual loop wraps the original 17/30 second gallop and skips only the export hold');
  rows.push({initialRange,moveFrames:moves.length,medianSpeed,medianSourceSecondsPerWallSecond:medianCadence,nativeImportedSourceDuration:e.animator.durations[WOLF_CLIPS.run],observedSourcePeriod,runPeriod:observedSourcePeriod===undefined?null:observedSourcePeriod/medianCadence,sampledWallPeriods,runCycles:cycle,stanceSamples:stanceDrift.length,maxStanceDrift,stanceWorst:[...stanceDrift].sort((a,b)=>b.drift-a.drift).slice(0,5)});
 }
 evidence.push({case:'autonomous-run-approach',rows});
 assert.ok(rows.at(-1).stanceSamples>50);assert.ok(rows.at(-1).maxStanceDrift<.06,JSON.stringify(rows));
});

test('real autonomous positioning reaches every attack at minimum/preferred/maximum and farther starts at 30/60Hz and 0.5/1/2x',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const fps of [30,60])for(const speed of [.5,1,2])for(const action of WOLF_V02_ACTIONS)for(const band of ['minDistance','preferredDistance','maxDistance','approachOutside']){
  const distance=band==='approachOutside'?action.maxDistance+.8:action[band],e=await resetFeral(f,{distance,speed,sequence:[action.id]});
  let serial=null,startId=null,startDistance=null,gotCapture=false,damage=0,frames=0;const original=e.hitPlayer.bind(e);
  e.hitPlayer=(...args)=>{const before=e.playerHp;original(...args);if(e.playerHp<before)damage++;};
  try{
   for(;frames<fps*20;frames++){
    const expected=f.player.position.clone();stepWolfHunt(f,e,1/fps);assert.ok(f.player.position.equalsWithEpsilon(expected,1e-7),'autonomous attack cannot move the player');
    if(serial===null&&e.brain.mode==='attack'){serial=e.brain.serial;startId=e.brain.actionId;startDistance=Vector3.Distance(f.player.position,e.actor.position);}
    gotCapture||=e.grab.active;
    if(serial!==null&&(e.brain.serial!==serial||e.brain.behavior==='recovery')&&!e.grab.active)break;
   }
  }finally{e.hitPlayer=original;}
  rows.push({id:action.id,fps,speed,band,initialDistance:distance,startId,startDistance,damage,captured:gotCapture,frames,contact:structuredClone(e.v02LastContact)});
 }
 evidence.push({case:'autonomous-contact-matrix',rows});
 assert.equal(rows.length,120);const failures=rows.filter(r=>r.startId!==r.id||r.damage!==1||r.captured!==WOLF_V02_BY_ID[r.id].capture||r.frames>=r.fps*20);
 assert.deepEqual(failures,[],'every reachable start must produce one real contact; expand approach bands rather than contact radii');
});

test('committed attacks lock body and neck while bounded head attention preserves authored roll as the player escapes',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const id of ['quick-bite','chain-bite','paw-swipe','lunge','pin']){
  const a=WOLF_V02_BY_ID[id],e=await resetFeral(f,{distance:a.preferredDistance,sequence:[id]});
  for(let i=0;i<3000&&!(e.brain.mode==='attack'&&e.brain.time>=a.commitTime);i++)stepWolfHunt(f,e,1/240);
  assert.equal(e.brain.mode,'attack');const serial=e.brain.serial,locked=e.motionYaw,initial=f.player.position.clone();let samples=0,maxError=0,maxHeadYaw=0,maxHeadPitch=0,maxRollResidual=0;
  f.player.position.x=initial.x+12;f.player.position.z=initial.z-4;
  for(let i=0;i<300&&e.brain.serial===serial&&e.brain.mode==='attack';i++){
   stepWolfHunt(f,e,1/240);if(e.brain.serial!==serial||e.brain.mode!=='attack')break;
   assert.ok(Math.abs(angleDelta(e.motionYaw,locked))<1e-10,'commitment cannot retarget its movement');
   const expectedNeck=authoredRotation(e,'neck'),actualNeck=e.nodes.neck.rotationQuaternion,cosine=Math.abs(expectedNeck.dot(actualNeck))/Math.sqrt(expectedNeck.lengthSquared()*actualNeck.lengthSquared()),error=2*Math.acos(Math.min(1,cosine));
   maxError=Math.max(error,maxError);assert.ok(error<.00001,`${id} authored neck strike rotation changed by ${error}`);
   const node=e.nodes.head,actualRotation=node.rotationQuaternion.clone(),axes=[Vector3.Right(),Vector3.Up(),Vector3.Forward()],actualAxes=axes.map(axis=>Vector3.TransformNormal(axis,node.getWorldMatrix()).normalize());
   node.rotationQuaternion.copyFrom(authoredRotation(e,'head'));e.animator.ensurePoseCurrent();const sourceAxes=axes.map(axis=>Vector3.TransformNormal(axis,node.getWorldMatrix()).normalize());
   node.rotationQuaternion.copyFrom(actualRotation);e.animator.ensurePoseCurrent();
   const source=sourceAxes[1],actual=actualAxes[1],yawChange=angleDelta(Math.atan2(actual.x,actual.z),Math.atan2(source.x,source.z)),pitchChange=Math.atan2(actual.y,Math.hypot(actual.x,actual.z))-Math.atan2(source.y,Math.hypot(source.x,source.z));
   maxHeadYaw=Math.max(maxHeadYaw,Math.abs(yawChange));maxHeadPitch=Math.max(maxHeadPitch,Math.abs(pitchChange));
   assert.ok(Math.abs(yawChange)<=.70+1e-6,'committed head attention stays within the .70rad yaw cone');assert.ok(Math.abs(pitchChange)<=.35+1e-6,'committed head attention stays within the .35rad pitch cone');
   const yawRotation=Quaternion.RotationAxis(Vector3.Up(),yawChange),targetYaw=Math.atan2(actual.x,actual.z),pitchRotation=Quaternion.RotationAxis(new Vector3(Math.cos(targetYaw),0,-Math.sin(targetYaw)),-pitchChange);
   for(let axis=0;axis<3;axis++){
    const allowed=sourceAxes[axis].clone();allowed.rotateByQuaternionToRef(yawRotation,allowed);allowed.rotateByQuaternionToRef(pitchRotation,allowed);
    const residual=Vector3.Distance(allowed,actualAxes[axis]);maxRollResidual=Math.max(maxRollResidual,residual);assert.ok(residual<1e-6,'head correction may add bounded yaw/pitch without replacing the authored roll');
   }samples++;
  }
  assert.equal(e.playerHp,500,'escaping after commit remains a genuine miss');rows.push({id,samples,maxAuthoredNeckAngleError:maxError,maxHeadYawDegrees:maxHeadYaw*180/Math.PI,maxHeadPitchDegrees:maxHeadPitch*180/Math.PI,maxHeadRollBasisResidual:maxRollResidual,lockedYaw:locked});
 }
 evidence.push({case:'commit-lock-vs-head-attention',rows});
});

test('independent actual contacts retain dodge/block/interrupt/height/behind/wall negatives and one resolution per serial',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const id of ['quick-bite','chain-bite','paw-swipe'])for(const defense of ['dodge','shieldPush','behind','height','wall','interrupt']){
  const a=WOLF_V02_BY_ID[id],e=await resetFeral(f,{distance:a.preferredDistance,sequence:[id],hp:400});
  for(let i=0;i<600&&e.brain.mode!=='attack';i++)stepWolfHunt(f,e,1/60);
  assert.equal(e.brain.mode,'attack');const serial=e.brain.serial;
  if(defense==='behind'){f.player.position.z=-a.preferredDistance;e.motionYaw=0;}
  if(defense==='height'){f.player.position.y=8;f.world.terrain.place=v=>{if(v!==f.player.position)v.y=0;};}
  if(defense==='wall')f.world.navigation={segmentClear:()=>false,constrain(){},steer:(from,to)=>to};
  if(defense==='interrupt')e.brain.hit({heavy:true,damage:1});
  try{
   for(let i=0;i<600&&e.brain.serial===serial&&e.brain.mode==='attack';i++){
    const result=['dodge','shieldPush'].includes(defense)?defense:'idle';stepWolfHunt(f,e,1/60,{state:result,actionId:71});
    for(let j=0;j<2;j++)f.battle.poseAndContacts(f.player,{state:result,actionId:71},null,null);
   }
   assert.equal(e.playerHp,500,JSON.stringify({id,defense,contact:e.v02LastContact}));assert.equal(e.grab.active,false);assert.equal(e.brain.followupId,null);
  }finally{f.world.navigation=null;f.world.terrain.place=v=>{v.y=0;};}
  rows.push({id,defense,damage:500-e.playerHp,resolvedSerial:e.v02ResolvedSerial,followup:e.brain.followupId});
 }
 evidence.push({case:'defense-height-behind-wall-interrupt',rows});
});

test('actual default bouts switch at half health without cutting the current strike or creating an unlimited chain',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const hp of [451,450]){
  const e=await resetFeral(f,{distance:3.1,hp}),bouts=[],strikes=[],clips=new Set();let current=[],serial=null,wasFlank=false,hits=0;
  const original=e.hitPlayer.bind(e);e.hitPlayer=(...args)=>{const before=e.playerHp;original(...args);if(e.playerHp<before)hits++;};
  try{
   for(let frame=0;frame<35*60;frame++){
    e.playerHp=500;stepWolfHunt(f,e,1/60);
    if(e.brain.mode==='attack'&&e.brain.serial!==serial){serial=e.brain.serial;const row={id:e.brain.actionId,clip:e.brain.state,serial,time:frame/60,bout:e.brain.boutStrikes};current.push(row);strikes.push(row);clips.add(e.brain.state);}
    const flank=e.brain.behavior==='flank';if(flank&&!wasFlank&&current.length){bouts.push(current);current=[];}wasFlank=flank;
    if(e.grab.active)f.battle.escapeGrab();
   }
  }finally{e.hitPlayer=original;}
  rows.push({hp,completedBouts:bouts.length,boutSizes:bouts.map(b=>b.length),hits,strikes,attackClips:[...clips]});
  assert.ok(bouts.length>=3);assert.ok(hits>=3);assert.ok(bouts.every(b=>b.length>=1&&b.length<=3));
  if(hp>450)assert.ok(bouts.every(b=>b.length===1),'above half HP one completed strike must precede every stalk');
  else assert.ok(bouts.some(b=>b.length===3),'successful close contacts should permit the aggressive three-strike phase');
  assert.ok([...clips].every(clip=>['Wolf_Predator_Diagonal_Bite_V02','Wolf_Predator_Reverse_Bite_V02',WOLF_CLIPS.pin,WOLF_CLIPS.lunge].includes(clip)));
 }
 const e=await resetFeral(f,{distance:3.1,hp:451,sequence:['quick-bite']});
 while(e.brain.mode!=='attack'||e.brain.time<.10)stepWolfHunt(f,e,1/240);
 const serial=e.brain.serial,source=e.brain.time;e.brain.hp=450;stepWolfHunt(f,e,1/240);
 assert.equal(e.brain.serial,serial);assert.equal(e.brain.phase,2);assert.ok(e.brain.time>source);
 evidence.push({case:'actual-half-health-bouts',rows,phaseChangeDuringStrike:{serialUnchanged:true,sourceTimeAdvanced:true}});
});

test('the first actual support step holds its entry anchors through the transition and completes a full cycle in both phases',async t=>{
 const f=await wolfHuntFixture(t),rows=[];
 for(const hp of [451,450])for(const side of [-1,1])for(const radius of [3,5]){
  const e=await resetFeral(f,{distance:radius,hp,behavior:'observe'});e.brain.observation=5;
  for(let i=0;i<24;i++)stepWolfHunt(f,e,1/60);
  assert.equal(e.brain.behavior,'observe');assert.equal(e.animator.blend,1);
  const origin=e.actor.position.clone(),names=side>0?['fore.R.paw','hind.L.paw']:['fore.L.paw','hind.R.paw'],anchors=Object.fromEntries(names.map(n=>[n,e.nodes[n].getAbsolutePosition().clone()]));
  e.brain.flankSide=-side;e.brain.beginStalk();const clip=e.brain.state,samples=[];let sourceMax=0,coveredSource=0,previousSource=0,frames=0,firstHalfMax=0,initialSupportDone=false;
  for(;frames<180;frames++){
   stepWolfHunt(f,e,1/60);if(e.brain.state===clip){
    sourceMax=Math.max(sourceMax,e.brain.time);coveredSource+=e.brain.time>=previousSource?e.brain.time-previousSource:.9-previousSource+e.brain.time;previousSource=e.brain.time;
    const row={wall:(frames+1)/60,sourceTime:e.brain.time,blend:e.animator.blend,actorTravel:Vector3.Distance(origin,e.actor.position),feet:Object.fromEntries(names.map(n=>[n,Vector3.Distance(anchors[n],e.nodes[n].getAbsolutePosition())]))};samples.push(row);
    if(e.brain.time>=.45)initialSupportDone=true;
    if(!initialSupportDone)firstHalfMax=Math.max(firstHalfMax,...Object.values(row.feet));
   }
   if(e.brain.behavior!=='flank')break;
  }
  rows.push({hp,side,radius,clip,frames:frames+1,sourceMax,coveredSource,firstHalfMaximumEntryAnchorDrift:firstHalfMax,samples});
 }
 const e=await resetFeral(f,{distance:3,hp:451,behavior:'observe'});e.brain.observation=5;for(let i=0;i<24;i++)stepWolfHunt(f,e,1/60);e.brain.beginStalk();stepWolfHunt(f,e,1/60);
 const before=e.brain.time,rate=e.brain.flankPlaybackRate;e.brain.hp=450;stepWolfHunt(f,e,1/60);
 assert.equal(e.brain.phase,2);assert.equal(e.brain.flankPlaybackRate,rate);assert.ok(Math.abs(e.brain.time-before-rate/60)<1e-7,'crossing half health must not change a step already in progress');
 evidence.push({case:'first-step-transition-and-complete-cycle',rows,phaseChangeDuringStep:{snapshotRate:rate,unchanged:true}});
 const failures=rows.filter(r=>r.frames>=180||r.coveredSource<.9-1e-6||r.firstHalfMaximumEntryAnchorDrift>.06);
 assert.deepEqual(failures,[],'first support anchors must hold from the entry frame, including blend, and both phases must finish the authored step');
});
