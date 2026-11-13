import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from '@babylonjs/core';
import {wolfHuntFixture,stepWolfHunt} from '../../tests/helpers/wolf-hunt-fixture.js';
import {WOLF_CLIPS} from '../../src/wolf-spec.js';
import {WOLF_V02_BY_ID} from '../../src/wolf-v02-spec.js';
const f=await wolfHuntFixture(),rows=[];
const yaw=node=>{const v=Vector3.TransformNormal(Vector3.Up(),node.getWorldMatrix());return Math.atan2(v.x,v.z);};
const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
try{
 for(const hp of [900,400])for(const initialRange of [3,15,35]){
  await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;f.player.position.set(0,0,initialRange);e.brain.hp=hp;e.brain.configureAttacks({custom:false});
  const transitions=[],circles=[],attacks=[];let old=null,circle=null,lastSerial=null;
  for(let frame=0;frame<60*22;frame++){
   e.playerHp=500;stepWolfHunt(f,e,1/60);const time=frame/60,key=e.brain.mode+':'+e.brain.behavior+':'+e.brain.state;
   if(key!==old){transitions.push({time,mode:e.brain.mode,behavior:e.brain.behavior,clip:e.brain.state,range:Vector3.Distance(e.actor.position,f.player.position)});old=key;}
   if(e.brain.behavior==='flank'){circle??={start:time,frames:0,sourceLoops:0,previous:e.brain.time};circle.frames++;if(e.brain.time<circle.previous)circle.sourceLoops++;circle.previous=e.brain.time;}
   else if(circle){circles.push({start:circle.start,seconds:circle.frames/60,sourceLoops:circle.sourceLoops});circle=null;}
   if(e.brain.mode==='attack'&&e.brain.serial!==lastSerial){lastSerial=e.brain.serial;attacks.push({time,id:e.brain.actionId,range:Vector3.Distance(e.actor.position,f.player.position)});}
   if(e.grab.active)f.battle.escapeGrab();
   if(attacks.length>=4)break;
  }
  rows.push({case:'autonomous-r10',hp,initialRange,circles,attacks,transitions});
 }
 await f.battle.summon(f.player,1,'wolf');let e=f.battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;f.player.position.set(0,0,3);e.player=f.player;e.dt=1/60;e.brain.start(WOLF_CLIPS.watch,'idle');
 e.gate.collect=()=>({hits:[{id:'judgment',damage:20,heavy:true}],hitStop:.03});e.poseAndContacts(f.player,{state:'idle'},{actionId:90},null);delete e.gate.collect;
 rows.push({case:'nonlethal-heavy-r10',hp:e.brain.hp,clip:e.brain.state,mode:e.brain.mode,behavior:e.brain.behavior,impulse:e.knockVelocity.asArray()});
 for(const id of ['quick-bite','paw-swipe']){
  await f.battle.summon(f.player,1,'wolf');e=f.battle.encounters[0];const action=WOLF_V02_BY_ID[id];e.actor.position.setAll(0);e.actor.rotation.y=0;f.player.position.set(0,0,action.preferredDistance);e.brain.configureAttacks({custom:true,sequence:[id]});e.brain.startAction(id);const serial=e.brain.serial,samples=[];
  for(let i=0;i<300&&e.brain.serial===serial&&e.brain.mode==='attack';i++){
   stepWolfHunt(f,e,1/240);if(e.brain.serial!==serial||e.brain.mode!=='attack')break;
   const liveHead=yaw(e.nodes.head),liveChest=yaw(e.nodes.chest),liveJaw=e.nodes.jaw.getAbsolutePosition().asArray();
   e.v02Pose?.restore();e.animator.ensurePoseCurrent();const authoredHead=yaw(e.nodes.head),authoredChest=yaw(e.nodes.chest);e.alignPose();
   samples.push({time:e.brain.time,liveHead,liveChest,authoredHead,authoredChest,jaw:liveJaw});
  }
  const span=key=>{const origin=samples[0][key],v=samples.map(r=>delta(r[key],origin)*180/Math.PI);return Math.max(...v)-Math.min(...v);};
  rows.push({case:'diagonal-r10',id,headLiveYawSpan:span('liveHead'),headAuthoredYawSpan:span('authoredHead'),chestLiveYawSpan:span('liveChest'),chestAuthoredYawSpan:span('authoredChest'),samples:samples.filter((_,i)=>i%6===0)});
 }
 await f.battle.summon(f.player,1,'wolf');e=f.battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;f.player.position.set(0,0,3);e.brain.configureAttacks({custom:true,sequence:['quick-bite']});e.brain.startAction('quick-bite');
 let blocked=null;for(let i=0;i<300&&!blocked;i++){stepWolfHunt(f,e,1/60,{state:'shieldPush',actionId:91});if(e.brain.stagger>0)blocked={time:i/60,clip:e.brain.state,sourceTime:e.brain.time,mode:e.brain.mode,stagger:e.brain.stagger,flash:e.brain.flash};}
 const start=e.nodes.chest.rotationQuaternion.clone(),before=e.brain.time;for(let i=0;i<30;i++)stepWolfHunt(f,e,1/60);
 rows.push({case:'block-r10',blocked,halfSecondLater:{clip:e.brain.state,sourceTime:e.brain.time,sourceTimeAdvance:e.brain.time-before,mode:e.brain.mode,chestQuaternionDistance:1-Math.abs(start.dot(e.nodes.chest.rotationQuaternion)),actor:e.actor.position.asArray(),hp:e.brain.hp}});
 const hashes=Object.fromEntries(['src/wolf-v02-spec.js','src/wolf-v02-encounter.js','src/wolf-v02-locomotion.js','src/wolf-v02-authored-clips.js'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
 fs.writeFileSync(new URL('baseline-r10.json',import.meta.url),JSON.stringify({scope:'Actual packed R8 rig and R10 live CPU NullEngine pipeline before R11 edits. Flat ground, replacement material; no visual or performance approval. Heavy-hit test injects a terminal sword-contact event into the real reaction path.',hashes,rows},null,2)+'\n');
 console.log(JSON.stringify(rows.map(({samples,transitions,...r})=>r),null,2));
}finally{await f.dispose();}
