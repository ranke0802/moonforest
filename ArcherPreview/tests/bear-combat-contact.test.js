import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {bearContactFixture} from './helpers/bear-contact-fixture.js';
import {BearCombatContact,BEAR_ATTACK_PARTS} from '../src/bear-combat-contact.js';
import {BOSS_ATTACKS,BOSS_BY_NAME} from '../src/boss-spec.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {bearApproachDistances} from '../src/bear-size.js';
import {playerDimensions} from '../src/player-dimensions.js';

test('all enabled bear attacks have physical limb roles; corrected real skin contacts hit and distant/side air swings miss',async t=>{
 const f=await bearContactFixture(t),e=f.bear,c=e.bearCombatContact=new BearCombatContact(e),scales=e.asset.transformNodes.map(n=>n.scaling.clone());
 assert.deepEqual(Object.keys(BEAR_ATTACK_PARTS).sort(),BOSS_ATTACKS.map(s=>s.name).sort());assert.ok(c.points.length<=192,'at most48 existing surface vertices per part; only active parts are skinned; outlines excluded');
 for(const {name} of BOSS_ATTACKS){
  e.actor.position.setAll(0);e.actor.rotation.y=0;f.player.position.set(0,0,bearApproachDistances(e.bearSize,playerDimensions(f.player).moveRadius).normal);const spec=BOSS_BY_NAME[name];f.sample(name,e.animator.durations[name]*spec.impact);const positions=e.asset.transformNodes.map(n=>n.position.clone());c.applyPose(f.player);c.sample();assert.equal(c.contact(spec,f.player),true,name);
  for(let i=0;i<positions.length;i++)assert.ok(e.asset.transformNodes[i].position.equalsWithEpsilon(positions[i],1e-6),name+': aim retains every local bone length/position');
  if(name==='Right_Jab_from_Guard'){let max=0;const skins=new Map();for(const a of c.points){if(!BEAR_ATTACK_PARTS[name].includes(a.part))continue;if(!skins.has(a.mesh))skins.set(a.mesh,a.mesh.getPositionData(true,true));const p=skins.get(a.mesh),actual=Vector3.TransformCoordinates(Vector3.FromArray(p,a.vertex*3),a.mesh.getWorldMatrix());max=Math.max(max,Vector3.Distance(actual,Vector3.FromArray(a.now)));}assert.ok(max<1e-4,'all eight bone weights match Babylon CPU skin; max '+max);}
  f.player.position.set(0,0,20);assert.equal(c.contact(spec,f.player),false,name+' distant air swing');f.player.position.set(12,0,2);assert.equal(c.contact(spec,f.player),false,name+' lateral escape');c.restore();
 }
 for(let i=0;i<scales.length;i++)for(let k=0;k<3;k++)assert.ok(Math.abs(e.asset.transformNodes[i].scaling.asArray()[k]-scales[i].asArray()[k])<1e-5,'source scale channels retain native floating-point precision');
 assert.equal(BossEncounter.prototype.attackBodyContact.call({kind:'goblin'}),true);assert.equal(BossEncounter.prototype.attackBodyContact.call({kind:'bear',world:{release:'moonforest-0.1'}}),true);
});

test('every enabled bear attack can approach and physically reach a stationary player through the native encounter',async t=>{
 const f=await bearContactFixture(t),e=f.bear;
 for(const spec of BOSS_ATTACKS){
  e.grab.reset();e.bearCombatContact.reset();e.actor.position.setAll(0);e.actor.rotation.y=0;e.lastRoot=null;e.lastSerial=null;e.knockVelocity.setAll(0);e.brain.start('Block6','idle');e.brain.wait=0;e.brain.configureAttacks({custom:true,sequence:[spec.name],speed:1});f.player.position.set(0,0,3.5);e.combat.hp=10000;e.combat.invulnerable=0;
  let fired=false,hit=false;for(let frame=0;frame<300&&!fired;frame++){e.update(1/60,f.player);f.scene._animate(0);fired=e.pendingEvents.length>0;e.poseAndContacts(f.player,{state:'idle'},null,null);hit||=e.combat.hp<10000||e.grab.active;}
  assert.equal(fired,true,spec.name+': emits original impact event');assert.equal(hit,true,JSON.stringify({attack:spec.name,distance:Vector3.Distance(e.actor.position,f.player.position),contact:e.bearCombatContact.lastContact}));
 }
});

test('native jab approach resolves once at30/60Hz and2x; dodge and out-of-reach motions cannot damage',async t=>{
 const f=await bearContactFixture(t),e=f.bear;
 const reach=bearApproachDistances(e.bearSize,playerDimensions(f.player).moveRadius),starts=[e.radius+playerDimensions(f.player).moveRadius+.005,reach.normal,reach.normalTrigger];
 for(const hz of [30,60])for(const speed of [1,2])for(const start of starts){
  e.bearCombatContact?.restore();e.actor.position.setAll(0);e.actor.rotation.y=0;e.lastRoot=null;e.lastSerial=null;e.knockVelocity.setAll(0);e.brain.start('Block6','idle');e.brain.wait=0;e.brain.configureAttacks({custom:true,sequence:['Right_Jab_from_Guard'],speed});f.player.position.set(0,0,start);e.combat.hp=10000;e.combat.invulnerable=0;
  let fired=false,hit=false;for(let frame=0;frame<180&&!fired;frame++){e.update(1/hz,f.player);f.scene._animate(0);fired=e.pendingEvents.length>0;e.poseAndContacts(f.player,{state:'idle'},null,null);hit||=e.combat.hp<10000;}
  assert.equal(fired,true,JSON.stringify({hz,speed,start}));assert.equal(hit,true,JSON.stringify({hz,speed,start,contact:e.bearCombatContact?.lastContact}));const hp=e.combat.hp;e.poseAndContacts(f.player,{state:'idle'},null,null);assert.equal(e.combat.hp,hp,'one native event per serial');
 }
 const spec=BOSS_BY_NAME.Right_Jab_from_Guard;f.player.position.set(0,0,2);e.actor.position.setAll(0);f.sample(spec.name,e.animator.durations[spec.name]*spec.impact);e.pendingEvents=[{type:'attack',...spec}];e.combat.hp=10000;e.combat.invulnerable=0;e.poseAndContacts(f.player,{state:'dodge',actionId:1},null,null);assert.equal(e.combat.hp,10000);
});
