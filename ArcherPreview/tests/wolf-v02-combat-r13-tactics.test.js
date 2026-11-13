import {r13ProofHashes} from "./helpers/wolf-combat-r13-proof.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {WolfV02Brain,WOLF_V02_TACTICS,WOLF_V02_BACK_RUN,WOLF_V02_ORBIT,WOLF_V02_CLOSE_RAM,WOLF_V02_BY_ID} from '../src/wolf-v02-spec.js';
import {WOLF_CLIPS,WOLF_BALANCE} from '../src/wolf-spec.js';
import {WOLF_V02_AUTHORED_CLIPS} from '../src/wolf-v02-authored-clips.js';
import {wolfContactShape} from '../src/wolf-v02-contact-shapes.js';
import {Vector3} from '@babylonjs/core';
import {r13Api,disposeR13,runR13Ram,planar} from './helpers/wolf-combat-r13-run.js';
import {huntResourceCounts} from './helpers/wolf-hunt-fixture.js';
import {wolfCombatR13Fixture} from './helpers/wolf-combat-r13-fixture.js';
const config=JSON.parse(fs.readFileSync('public/assets/alpha-wolf.json')),durations=Object.fromEntries([...config.catalog,...WOLF_V02_AUTHORED_CLIPS].map(c=>[c.name,c.duration])),evidence=[];
const paths=['src/wolf-v02-spec.js','src/wolf-v02-encounter.js','src/wolf-v02-shield.js','src/wolf-v02-telegraph.js','src/wolf-v02-support.js','src/wolf-v02-hurt.js','src/wolf-v02-ram.js','src/wolf-v02-contact-shapes.js','src/wolf-v02-combat-r13-clips.json','tests/wolf-v02-combat-r13-tactics.test.js'];const hashes=r13ProofHashes,initial=hashes();
test.after(async()=>{await disposeR13();const final=hashes();fs.writeFileSync('reports/wolf-v02-combat-r13/tactics-proof.json',JSON.stringify({scope:'Decision-state pulse boundaries are explicit unit cases, separate from real native incoming contacts. Physical backward/side steps use actual rigs/source support and ordinary runtime transforms. NullEngine evidence does not certify visual quality or GPU/device performance.',sourceHashes:final,cases:evidence},null,2)+'\n');assert.deepEqual(final,initial);});
function awake(hp=900){const b=new WolfV02Brain(durations,WOLF_BALANCE,()=>.5);b.hp=hp;b.start(WOLF_CLIPS.watch,'idle');b.behavior='observe';b.observation=0;b.lastDistance=3;return b;}
test('recent damage threshold respects15percent/3seconds, HP50percent inclusive and6second cooldown',()=>{
 const cases=[];for(const [hp,damage,expected]of [[900,134,false],[900,135,true],[585,135,true],[584,135,false]]){const b=awake(hp);b.hit({damage});assert.equal(!!b.tacticalRetreatPending,expected);cases.push({hp,damage,finalHp:b.hp,pending:!!b.tacticalRetreatPending});}
 const expired=awake();expired.hit({damage:100});expired.combatClock=3.01;expired.hit({damage:35});assert.equal(!!expired.tacticalRetreatPending,false);assert.equal(expired.recentDamage,35);
 const cool=awake();cool.hit({damage:135});cool.update(0,3);assert.equal(cool.mode,'backRun');assert.equal(cool.tacticalCooldown,6);cool.hit({damage:135});assert.equal(!!cool.tacticalRetreatPending,false);cool.tacticalCooldown=0;cool.hit({damage:135});assert.equal(!!cool.tacticalRetreatPending,true);evidence.push({gate:'unit-damage-window-hp-cooldown',cases,expired:expired.recentDamage,cooldown:WOLF_V02_TACTICS.retreatCooldown});
});
test('actual backward-run gait faces player, steps back to capped range and then observes2–3seconds',async()=>{
 const api=await r13Api(),e=await api.summon({distance:3});api.watch(e);for(let i=0;i<24;i++)api.step(1/60);e.brain.hit({damage:135});const rows=[],anchors=new Map();let seen=false,finished=false,maxDrift=0,minFacing=1;
 for(let i=0;i<600;i++){api.step(1/60);if(e.brain.mode==='backRun'){seen=true;const row={source:e.brain.time,cycle:e.brain.backRunCycles,root:e.actor.position.asArray(),player:api.f.player.position.asArray(),yaw:e.actor.rotation.y};rows.push(row);const target=Math.atan2(api.f.player.position.x-e.actor.position.x,api.f.player.position.z-e.actor.position.z);minFacing=Math.min(minFacing,Math.cos(target-row.yaw));for(const n of (row.source<.3?['fore.L.paw','hind.R.paw']:['fore.R.paw','hind.L.paw'])){const k=row.cycle+n,p=e.nodes[n].getAbsolutePosition().asArray();if(!anchors.has(k))anchors.set(k,p);maxDrift=Math.max(maxDrift,Math.hypot(...p.map((v,j)=>v-anchors.get(k)[j])));}}else if(seen){finished=true;break;}}
 assert.equal(seen,true);assert.equal(finished,true);assert.ok(planar(rows[0].root,rows.at(-1).root)>4.6);assert.ok(minFacing>.98);assert.ok(maxDrift<.025);assert.equal(e.brain.behavior,'flank');assert.equal(e.brain.circleElapsed,0);assert.ok(e.brain.circleTarget>=2&&e.brain.circleTarget<=3);evidence.push({gate:'physical-backrun-supported-retreat',rows,maxDrift,minFacing,orbitTarget:e.brain.circleTarget});
});
test('a real native equipped heavy damage pulse schedules a supported retreat after collapse/getup',async()=>{
 // Attack bonus20 is an explicit real strike-sampler equipment setting, not
 // an injected HP/collision event. Default bonus5 cases remain in incoming QA.
 const api=await wolfCombatR13Fixture(null,{attackBonus:20}),e=await api.summon({distance:3});
 try{
  api.f.player.position.set(2.3,0,0);api.f.player.rotation.y=-Math.PI/2;api.watch(e);for(let i=0;i<24;i++)api.step(1/60);api.poseTarget(e,'quick-bite');assert.equal(api.controller.startAttack('judgment'),true);
  const rows=[];let pending=false,retreat=null;
  for(let i=0;i<600;i++){api.step(1/60);pending||=!!e.brain.tacticalRetreatPending;rows.push({time:api.elapsed,hp:e.brain.hp,mode:e.brain.mode,clip:e.brain.state,recentDamage:e.brain.recentDamage});if(e.brain.mode==='backRun'){retreat={time:api.elapsed,source:e.brain.time,cooldown:e.brain.tacticalCooldown};break;}}
  const damage=900-e.brain.hp;evidence.push({gate:'native-equipment20-pulse-retreat',damage,pending,retreat,rows,events:structuredClone(api.damageEvents)});assert.ok(damage>=135&&e.brain.hp>=450);assert.equal(pending,true);assert.ok(retreat);assert.ok(rows.some(r=>r.mode==='down')&&rows.some(r=>r.mode==='recover'));assert.equal(e.brain.state,WOLF_V02_BACK_RUN);
 }finally{await api.dispose();}
});
test('native incoming threat provokes physical side steps with no evade invulnerability',async()=>{
 const api=await r13Api(),e=await api.summon({distance:3});api.watch(e);for(let i=0;i<24;i++)api.step(1/60);e.brain.behavior='observe';e.brain.observation=2;api.controller.startAttack('judgment');const rows=[];let origin=null,saw=false;
 for(let i=0;i<180;i++){api.step(1/60);if(e.brain.mode==='ramEvade'){saw=true;origin??=e.actor.position.asArray();assert.notEqual(e.brain.defense,'evade');rows.push({time:api.elapsed,position:e.actor.position.asArray(),source:e.brain.time,clip:e.brain.state,defense:e.brain.defense});}if(saw&&e.brain.mode!=='ramEvade')break;}
 assert.equal(saw,true);assert.ok(rows.length>4);assert.ok(planar(origin,rows.at(-1).position)>.4);assert.ok(rows.every(r=>Object.values(WOLF_V02_ORBIT).includes(r.clip)));evidence.push({gate:'native-threat-real-side-step',rows,hp:e.brain.hp,damageEvents:api.damageEvents});
});
test('native pending or held shield guard alone does not consume an evade-counter action',async()=>{
 const api=await r13Api(),e=await api.summon({distance:3});api.watch(e);for(let i=0;i<24;i++)api.step(1/60);e.brain.behavior='observe';e.brain.observation=30;api.controller.setShieldHeld(true);const rows=[];
 for(let i=0;i<45;i++){api.step(1/60);rows.push({time:api.elapsed,mode:e.brain.mode,state:api.result.state,pending:api.result.shieldPending,guarding:api.result.guarding,threat:e.brain.playerAttackThreat});}
 evidence.push({gate:'native-held-guard-is-not-released-threat',rows});assert.ok(rows.some(r=>r.pending)&&rows.some(r=>r.guarding));assert.ok(rows.every(r=>r.mode!=='ramEvade'),'holding a guard is not a released shield-push threat');assert.equal(e.brain.hp,900);
});
test('contact footprints use the same bounded head/jaw shapes, hide resolved ram while waiting and reuse unchanged buffers',async()=>{
 let markerBefore=null,sameUploads=null,hiddenWait=0;const c=await runR13Ram({afterStep({api,e,hits,row}){
  const m=row.marker;if(e.brain.mode==='attack'&&m.visible){assert.ok(m.partSamples>0&&m.partSamples<=6);assert.ok(m.points.every(p=>p.radius<1.1));if(!hits.length&&e.brain.time>.4){markerBefore??=m;const uploads=e.v02Telegraph.uploads;for(let i=0;i<4;i++)e.v02Telegraph.update();sameUploads=e.v02Telegraph.uploads-uploads;}}
  if(hits.length===1&&e.brain.behavior==='wait-for-fall'&&e.brain.time<=WOLF_V02_BY_ID.lunge.contactEnd){assert.ok(!m.visible||m.phase!=='ram');hiddenWait++;}
 }});assert.equal(c.hits.length,3);assert.ok(markerBefore);assert.equal(sameUploads,0);assert.ok(hiddenWait>0);
 const head=wolfContactShape('head','ram'),jaw=wolfContactShape('jaw','maul');assert.equal(head.radius,.45);assert.equal(jaw.radius,.265);evidence.push({gate:'shared-part-footprints-and-resolved-hide',markerBefore,unchangedUploads:sameUploads,hiddenWait,headRadius:head.radius,jawRadius:jaw.radius});
});
test('actor-local marker/support/gates remain independent and warm pooled cycles release every external target',async()=>{
 const api=await wolfCombatR13Fixture(),{f}=api;await api.summon({distance:4});await f.battle.summon(f.player,2,'wolf');const enemies=[...f.battle.encounters],before=huntResourceCounts(f.scene),observers=f.scene.onAfterAnimationsObservable.observers.length;
 assert.equal(enemies.length,2);assert.notStrictEqual(enemies[0].v02Telegraph.positions,enemies[1].v02Telegraph.positions);assert.strictEqual(enemies[0].v02Telegraph.profiles,enemies[1].v02Telegraph.profiles);assert.notStrictEqual(enemies[0].v02Ram,enemies[1].v02Ram);assert.notStrictEqual(enemies[0].v02Shield,enemies[1].v02Shield);
 for(let i=0;i<4;i++){f.battle.hide();assert.ok(enemies.every(e=>!e.v02Ram.authorized&&!e.ring.isVisible));await f.battle.summon(f.player,2,'wolf');assert.deepEqual(huntResourceCounts(f.scene),before);assert.equal(f.scene.onAfterAnimationsObservable.observers.length,observers);}
 f.battle.hide();await api.dispose();evidence.push({gate:'two-actor-four-warm-cycles',resources:before,observers});
});
