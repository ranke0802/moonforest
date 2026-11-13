import {r13ProofHashes} from "./helpers/wolf-combat-r13-proof.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from '@babylonjs/core';
import {runR13Ram,disposeR13,planar} from './helpers/wolf-combat-r13-run.js';
import {WOLF_V02_CLOSE_RAM,WOLF_V02_BY_ID,WOLF_V02_RAM_CHASE} from '../src/wolf-v02-spec.js';
import {WOLF_V02_COMBAT_R13_CLIPS} from '../src/wolf-v02-authored-clips.js';
const evidence=[];
const paths=['src/wolf-v02-spec.js','src/wolf-v02-encounter.js','src/wolf-v02-ram.js','src/wolf-v02-locomotion.js','src/wolf-v02-hurt.js','src/wolf-v02-shield.js','src/wolf-v02-support.js','src/wolf-v02-telegraph.js','src/wolf-v02-contact-shapes.js','src/wolf-v02-authored-clips.js','src/wolf-v02-combat-r13-clips.json','src/warrior-v2.js','src/player-strikes.js','src/boss-encounter.js','tests/helpers/wolf-combat-r13-fixture.js','tests/helpers/wolf-combat-r13-run.js','tests/wolf-v02-combat-r13-ram.test.js'];
const hashes=r13ProofHashes,initial=hashes();
test.after(async()=>{await disposeR13();const final=hashes();fs.writeFileSync('reports/wolf-v02-combat-r13/ram-proof.json',JSON.stringify({scope:'Untouched autonomous summon/rise/orbit/approach coupled to the packed native warrior, real shield mesh, input, damage/recoil and falling/getup clock. CPU surface overlap is evaluated at scored HP frames, not injected prone state. Numeric evidence does not establish visual quality or device performance.',sourceHashes:final,cases:evidence},null,2)+'\n');assert.deepEqual(final,initial,'frozen inputs changed during independent QA');});
function success(c,{surface=false}={}){
 const context=JSON.stringify({fps:c.fps,speed:c.speed,distance:c.distance,custom:c.custom,moving:c.moving,actions:c.actions,hits:c.hits.map(h=>({phase:h.phase,damage:h.damage,source:h.source,body:h.body.Spine2,skin:h.skin}))});
 assert.ok(c.end!==null,context);assert.equal(c.hits.length,3,context);assert.ok(c.actions.some(a=>a.id==='lunge'&&a.clip===WOLF_V02_CLOSE_RAM),context);assert.ok(!c.actions.some(a=>a.id==='pin'),context);
 const rear=c.hits[0].ram.critical;assert.deepEqual(c.hits.map(h=>h.damage),rear?[50,37,37]:[38,28,28],context);
 for(const h of c.hits.slice(1)){assert.equal(h.playerState,'knockdown',context);assert.equal(h.knockedDown,true,context);assert.ok(h.body.Spine2[1]<.45,context);assert.equal(h.ram.critical,rear,context);assert.equal(h.captured,false);}
 // Parent-approved tactile tolerance is .075 world m. A closest-vertex
 // upper bound <= that tolerance proves the actual surfaces are no farther
 // apart, while keeping literal triangle intersections separately reported.
 if(surface)for(const h of c.hits)assert.ok(h.skin.surfacesIntersect||h.skin.nearestVertexDistance<=.075,context);
 const chase=c.rows.filter(r=>r.behavior==='chase-prone');assert.ok(chase.length>0,context);assert.ok(chase.every(r=>r.knockedDown&&r.body.Spine2[1]<.45),context);assert.ok(chase[0].time-c.hits[0].time>=.80,context);
 assert.ok(planar(chase[0].wolf,chase.at(-1).wolf)>.30,context);
 const delays=c.hits.slice(1).map(h=>h.time-c.hits[0].time);assert.ok(delays[0]>=1.22&&delays[0]<=1.48,context);assert.ok(delays[1]>=1.77&&delays[1]<=2.04,context);
 assert.equal(c.reactions.filter(r=>r.options.knockdown&&r.accepted===true).length,1,context);assert.equal(c.final.captured,false);assert.ok(c.limbError<1e-5,context);assert.ok(c.scaleError<1e-6,context);assert.ok(c.maxStep<.50,context);
}
test('default and saved ordinary starts3–35m select the compact ram with real fall/chase/mauls',async()=>{
 const cases=[];for(const custom of [false,true])for(const distance of [3,6,10,15,25,35])cases.push(await runR13Ram({custom,distance,surface:true}));evidence.push({gate:'default-and-saved-autonomous-range12',cases});for(const c of cases)success(c,{surface:true});
});
test('native walking and stationary ram timelines retain real prone chase at30/60Hz and speed .5/1/2',async()=>{
 const cases=[];for(const fps of [30,60])for(const speed of [.5,1,2])for(const moving of [false,true])for(const distance of [3,15])cases.push(await runR13Ram({fps,speed,moving,distance,surface:true}));evidence.push({gate:'coupled24-clock-movement-cases',cases});for(const c of cases)success(c,{surface:true});
});
test('real dodge/shield cast and escaped target prevent accepted ram and both ground bites',async()=>{
 const cases=[];for(const defense of ['dodge','block','escape'])for(const fps of [30,60]){let applied=false;const c=await runR13Ram({fps,beforeStep({api,e}){if(applied||e.brain.mode!=='attack'||e.brain.actionId!=='lunge'||e.brain.time<WOLF_V02_BY_ID.lunge.commitTime)return;applied=true;if(defense==='dodge')api.dodge(Vector3.Right());if(defense==='block')api.controller.shieldPush();if(defense==='escape')api.f.player.position.x+=12;}});cases.push({defense,applied,...c});assert.equal(applied,true);assert.equal(c.hits.length,0,JSON.stringify({defense,fps,hits:c.hits}));assert.equal(c.reactions.some(r=>r.options.knockdown&&r.accepted===true),false);}evidence.push({gate:'six-real-defenses',cases});
});
test('standing/getup/escape/missing real nodes/invulnerability invalidate remaining ground bites',async()=>{
 const cases=[];for(const invalidation of ['get-up','escape','missing-nodes','invulnerable']){let applied=false;const c=await runR13Ram({beforeStep({api,e,hits}){if(applied||hits.length!==1||invalidation!=='get-up'&&api.elapsed-hits[0].time<.5)return;applied=true;if(invalidation==='get-up')api.controller.setMotionSpeed('knockdown',2);if(invalidation==='escape')api.f.player.position.x+=12;if(invalidation==='missing-nodes')api.f.battle.playerNodes=null;if(invalidation==='invulnerable')e.playerInvulnerable=10;}});cases.push({invalidation,...c});assert.equal(applied,true);assert.equal(c.hits.length,1,invalidation);assert.equal(c.final.captured,false);}evidence.push({gate:'four-postram-invalidations',cases});
});
test('bounded100ms hitches cross each narrow jaw envelope without lost phases or repeated-pose duplicate damage',async()=>{
 const cases=[];for(const trigger of [1.45,1.65,1.70,1.74,2.25,2.29,2.31]){let applied=false;const c=await runR13Ram({dtForFrame({e}){if(!applied&&e.brain.mode==='attack'&&e.brain.time>=trigger){applied=true;return .1;}return 1/60;},afterStep({api,e}){if(e.brain.mode==='attack')for(let i=0;i<3;i++)api.f.battle.poseAndContacts(api.f.player,api.result,api.lastStrike,api.shieldNode);}});cases.push({trigger,...c});success(c);}evidence.push({gate:'seven-hitches-repeated-pose',cases});
});
test('compact support phases remain planted after navigation and chase correction; fixed limbs retain length',async()=>{
 const clip=WOLF_V02_COMBAT_R13_CLIPS.find(c=>c.name===WOLF_V02_CLOSE_RAM),c=await runR13Ram({moving:true,distance:15});success(c);const anchors=new Map();let max=0,count=0;
 for(const r of c.rows){if(r.clip!==WOLF_V02_CLOSE_RAM||r.mode!=='attack')continue;for(let i=0;i<clip.supportPhases.length;i++){const p=clip.supportPhases[i];if(r.source<p.start+1/60||r.source>p.end-1/60)continue;for(const foot of p.feet){const key=i+foot;if(!anchors.has(key))anchors.set(key,r.paws[foot]);max=Math.max(max,Math.hypot(...r.paws[foot].map((v,k)=>v-anchors.get(key)[k])));count++;}}}
 evidence.push({gate:'named-compact-support',maxWorldDrift:max,samples:count,limbError:c.limbError,scaleError:c.scaleError});assert.ok(count>100);assert.ok(max<.025,`named support drift ${max}`);
});
