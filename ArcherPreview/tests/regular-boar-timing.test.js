import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RegularBoarBrain,BOAR_CHARGE_TIMING} from '../src/regular-boar-brain.js';
import {regularWolfBalance,regularWolfManifest,regularWolfRuntimeProfile} from '../src/regular-wolf-spec.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
import {WOLF_V02_ORBIT,WOLF_V02_AIR_REACTION,WOLF_V02_GET_UP} from '../src/wolf-v02-spec.js';

const config=JSON.parse(readFileSync(new URL('../public/assets/'+regularWolfManifest('boar')+'.json',import.meta.url))),profile=regularWolfRuntimeProfile('boar',config),durations=Object.fromEntries(config.catalog.map(clip=>[clip.name,clip.duration]));
function brain(){const value=new RegularBoarBrain(durations,regularWolfBalance('boar'),()=>.5,profile);value.ramReach=profile.ramReach;return value;}
function requestCharge(value,distance=1){value.beginRamEvade();for(let i=0;i<120&&!value.boarPreparation;i++)value.update(1/60,distance);assert.ok(value.boarPreparation);return value.boarPreparation;}

for(const fps of [30,60])for(const speed of [.5,1,2])test(`boar preparation lasts .9 game seconds at ${fps}Hz and ${speed}x, with unchanged charge contact profile`,()=>{
 const value=brain();value.configureAttacks({custom:true,sequence:['lunge'],speed});requestCharge(value);const serial=value.serial,clocks=[];
 for(let i=0;i<Math.round(BOAR_CHARGE_TIMING.preparationSeconds*fps);i++){
  const result=value.update(1/fps,1);assert.equal(result.speed,0);assert.deepEqual(result.events,[]);assert.equal(result.flank,undefined);clocks.push(value.time);
  if(i<Math.round(BOAR_CHARGE_TIMING.preparationSeconds*fps)-1){assert.equal(value.mode,'idle');assert.equal(value.state,WOLF_CLIPS.watch);assert.equal(value.action,null);assert.equal(value.serial,serial);assert.equal(value.attackCount,0);}
 }
 assert.ok(clocks[1]>clocks[0],'existing standing watch pose is played, not frozen');assert.equal(value.boarPreparation,null);assert.equal(value.mode,'attack');assert.equal(value.action,profile.actions.lunge);assert.equal(value.castSpeed,speed);assert.equal(value.attackCount,1);
 assert.equal(value.action.contactStart,.28);assert.equal(value.action.contactEnd,.42);assert.deepEqual(value.action.ramPhases,profile.actions.lunge.ramPhases);assert.equal(value.action.damage,profile.actions.lunge.damage);
 const moving=value.update(1/fps,1);assert.equal(moving.momentumRam,true);assert.ok(moving.speed>0);assert.equal(moving.flank,undefined);
});

test('normal autonomous and manually summoned boar brain path both show watch preparation after forward approach',()=>{
 const value=brain();let distance=12,preparing=false,charged=false;const forbidden=[WOLF_CLIPS.rest,WOLF_CLIPS.alert,WOLF_CLIPS.rise,...Object.values(WOLF_V02_ORBIT)];
 for(let frame=0;frame<1200;frame++){
  const result=value.update(1/60,distance);assert.equal(result.flank,undefined);distance=Math.max(0,distance-(result.speed??0)/60);
  if(value.boarPreparation){preparing=true;assert.equal(value.state,WOLF_CLIPS.watch);assert.equal(result.speed,0);}
  if(value.action?.momentumRam){charged=true;break;}
 }
 assert.ok(preparing);assert.ok(charged);for(const clip of forbidden)assert.equal(value.visited.has(clip),false,clip);
});

for(const outcome of ['hit','blocked','miss'])test(`boar ${outcome} charge leaves at least 2.5 seconds of non-attacking counter time and no low-HP chain`,()=>{
 const value=brain();value.hp=value.maxHp*.4;requestCharge(value);for(let i=0;i<54;i++)value.update(1/60,1);assert.equal(value.mode,'attack');value.lastOutcome=outcome;
 value.beginRecovery();const before=value.attackCount;assert.equal(value.followupId,null);assert.equal(value.recoveryRemaining,2.5);
 for(let frame=0;frame<149;frame++){value.playerAttackThreat=true;value.playerThreatActionId=frame;const result=value.update(1/60,1);assert.equal(result.speed,0);assert.equal(value.behavior,'recovery');assert.equal(value.action,null);assert.equal(value.attackCount,before);assert.equal(result.flank,undefined);}
 value.update(1/60,1);assert.equal(value.attackCount,before);assert.equal(value.action,null);
});

test('autonomous repeated missed charges cannot bypass their counter window through player threats',()=>{
 const value=brain();value.hp=value.maxHp*.4;let count=0,recoveryAt=null,checkedGaps=0;
 for(let frame=0;frame<1800&&checkedGaps<3;frame++){
  value.playerAttackThreat=true;value.playerThreatActionId=frame;
  const result=value.update(1/60,1);assert.equal(result.flank,undefined);
  if(value.behavior==='recovery'&&recoveryAt===null)recoveryAt=value.combatClock;
  if(value.attackCount!==count){if(recoveryAt!==null){assert.ok(value.combatClock-recoveryAt>=BOAR_CHARGE_TIMING.counterSeconds-1e-7);checkedGaps++;recoveryAt=null;}count=value.attackCount;}
 }
 assert.equal(checkedGaps,3);
});

test('hit, death, territory return/start and cancellation discard a pending charge; later combat needs a fresh preparation',()=>{
 for(const action of ['light-hit','heavy-hit','death','cancel','return','player-death']){
  const value=brain();requestCharge(value);value.update(.6,1);const count=value.attackCount;
  if(action==='light-hit')value.hit({damage:1});if(action==='heavy-hit')value.hit({damage:10,heavy:true});if(action==='death')value.hit({damage:10000,heavy:true});if(action==='cancel')value.cancelBout();if(action==='return')value.start(WOLF_CLIPS.walk,'move');if(action==='player-death')value.update(1/60,1,false);
  assert.equal(value.boarPreparation,null,action);assert.equal(value.attackCount,count,action);
  if(action==='heavy-hit'){assert.equal(value.mode,'down');assert.equal(value.state,WOLF_V02_AIR_REACTION);let recovered=false;for(let i=0;i<360;i++){value.update(1/60,4);if(value.state===WOLF_V02_GET_UP){recovered=true;break;}}assert.ok(recovered);}
  if(action==='death'){value.update(10,1);assert.equal(value.hp,0);assert.equal(value.mode,'down');continue;}
  if(['cancel','return','light-hit','player-death'].includes(action)){value.beginStalk();requestCharge(value);assert.equal(value.boarPreparation.elapsed,0,action);value.update(.6,1);assert.equal(value.mode,'idle',action);assert.equal(value.attackCount,count,action);}
 }
});
