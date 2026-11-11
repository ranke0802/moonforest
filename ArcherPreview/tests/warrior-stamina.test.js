import test from 'node:test';
import assert from 'node:assert/strict';
import {WarriorV2Controller,V2_STAMINA_MAX,V2_STAMINA_REGEN,V2_SPRINT_COST,V2_SPRINT_MULTIPLIER,V2_JUDGMENT_RECOVERY_START} from '../src/warrior-v2.js';
import {PLAYER_STRIKES} from '../src/player-strikes.js';
const durations={idle:2,run:1,slash:1.5,attack:3,judgment:4.33,shieldPush:2.37,dodge:2.46,knockdown:1,getUp:1};
const make=()=>new WarriorV2Controller({durations,speeds:{run:4}});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const frame=(c,dt,input={},portion=1)=>{const result=c.update(dt,input),distance=result.speed*(result.movementDt??dt);c.commitSprintMovement(distance,distance*portion);return result;};

test('only actually started sword, judgment and shield actions spend their own stamina once',()=>{
 const c=make();assert.equal(c.stamina,V2_STAMINA_MAX);assert.equal(c.attack(),true);assert.equal(c.stamina,90);const serial=c.serial;
 assert.equal(c.attack(),true);assert.equal(c.queuedAttack,'normal');assert.equal(c.stamina,90);frame(c,1);assert.equal(c.serial,serial+1);assert.equal(c.stamina,80);
 c.cancelAttack();c.resetStamina();assert.equal(c.shieldPush(),true);assert.equal(c.stamina,80);assert.equal(c.shieldPush(),false);assert.equal(c.stamina,80);
 c.setAttackHeld(true);frame(c,.46);assert.equal(c.queuedAttack,'judgment');assert.equal(c.stamina,80);c.setAttackHeld(false);frame(c,3);assert.equal(c.action?.state,'judgment');near(c.stamina,50+Math.max(0,c.action.time-V2_JUDGMENT_RECOVERY_START)/c.playbackRate('judgment')*V2_STAMINA_REGEN);
});
test('insufficient stamina rejects once without changing the current clip or combat serial',()=>{
 const c=make();c.startAttack('slash');c.stamina=19;const previous=c.action,serial=c.serial;assert.equal(c.shieldPush(),false);assert.strictEqual(c.action,previous);assert.equal(c.stamina,19);assert.equal(c.serial,serial);assert.equal(c.staminaRejectSerial,1);
 c.setAttackHeld(true);frame(c,.46);c.setAttackHeld(false);assert.equal(c.queuedAttack,'judgment');frame(c,2);assert.equal(c.action,null);assert.equal(c.queuedAttack,null);assert.equal(c.serial,serial);assert.equal(c.staminaRejectSerial,2);
 for(let i=0;i<120;i++)frame(c,1/60);assert.equal(c.serial,serial);assert.equal(c.staminaRejectSerial,2,'no automatic repeated retry');
});
test('a roll spends ten only when accepted and insufficient stamina preserves the current action',()=>{
 const c=make();c.startAttack('slash');c.stamina=9;const prior=c.action,serial=c.serial;assert.equal(c.dodge(),false);assert.strictEqual(c.action,prior);assert.equal(c.serial,serial);assert.equal(c.stamina,9);assert.equal(c.staminaRejectSerial,1);
 c.stamina=10;assert.equal(c.dodge(),true);assert.equal(c.action.state,'dodge');assert.equal(c.stamina,0);assert.equal(c.dodge(),false);assert.equal(c.stamina,0);
});
test('normal running recovers at 15/s; moving sprint consumes 5/s with matching 1.8x animation',()=>{
 for(const fps of [15,30,60]){
  const c=make();c.stamina=50;for(let i=0;i<fps;i++)frame(c,1/fps,{y:1});near(c.stamina,50+V2_STAMINA_REGEN);
  c.stamina=50;c.setSprintHeld(true);let distance=0;
  for(let i=0;i<fps;i++){const result=frame(c,1/fps,{y:1});near(result.speed,4*V2_SPRINT_MULTIPLIER);near(result.timeScale,V2_SPRINT_MULTIPLIER);distance+=result.speed*result.movementDt;}
  near(distance,7.2);near(c.stamina,50-V2_SPRINT_COST);
 }
});
test('charging a stationary heavy counts recovery before its threshold consistently at 15/30/60 FPS',()=>{
 for(const fps of [15,30,60]){const c=make();c.stamina=23.5;c.setAttackHeld(true);for(let i=0;i<fps&&c.serial===0;i++)frame(c,1/fps);assert.equal(c.action?.state,'judgment');near(c.stamina,.25);assert.equal(c.staminaRejectSerial,0);}
});
test('standing and fully blocked sprint do not consume; partial blocked movement only consumes its travelled fraction',()=>{
 const c=make();c.stamina=50;c.setSprintHeld(true);frame(c,1,{});near(c.stamina,65);frame(c,1,{y:1},0);near(c.stamina,80);assert.equal(c.sprinting,false);
 c.stamina=50;frame(c,1,{y:1},.4);near(c.stamina,48);
});
test('empty stamina stops sprint until release even as ordinary movement recovers',()=>{
 const c=make();c.stamina=.01;c.setSprintHeld(true);let result=frame(c,1,{y:1});near(c.stamina,0);assert.equal(c.sprintExhausted,true);assert.ok(result.speed>4&&result.speed<7.2);
 result=frame(c,1,{y:1});near(result.speed,4);near(c.stamina,15);assert.equal(c.sprintExhausted,true);
 c.setSprintHeld(false);c.setSprintHeld(true);result=frame(c,1,{y:1});near(result.speed,7.2);near(c.stamina,10);
});
test('stamina remains bounded, does not regenerate before a heavy impact or during death/capture, and reset restores a new life',()=>{
 const c=make();c.stamina=80;c.startAttack('judgment');const remaining=c.stamina;frame(c,.4);near(c.stamina,remaining);
 c.cancelAttack();c.stamina=30;frame(c,1,{alive:false});near(c.stamina,30);c.capture();frame(c,1);near(c.stamina,30);c.releaseCapture();
 for(let i=0;i<20;i++)frame(c,1);near(c.stamina,100);c.stamina=1;c.resetStamina();near(c.stamina,100);assert.equal(c.sprintHeld,false);
});

test('heavy recovery restores stamina only after its actual last hit window at all frame rates and attack speeds',()=>{
 assert.equal(V2_JUDGMENT_RECOVERY_START,Math.max(...PLAYER_STRIKES.judgment.map(window=>window.to)));
 for(const fps of [15,30,60])for(const speed of [.5,1,2]){
  const c=make();c.setAttackSpeed(speed);c.stamina=80;c.startAttack('judgment');const rate=c.playbackRate('judgment');
  while(c.action.time<2){frame(c,1/fps);const expected=50+Math.max(0,c.action.time-V2_JUDGMENT_RECOVERY_START)/rate*V2_STAMINA_REGEN;near(c.stamina,expected);}
 }
});
test('heavy recovery waits through hit stop, never counts a paused or dead character, and does not double count idle time',()=>{
 const c=make();c.stamina=80;c.startAttack('judgment');c.staminaSpent=false;c.action.time=V2_JUDGMENT_RECOVERY_START+.2;c.pauseOnImpact(.2);
 frame(c,.1);near(c.stamina,50);frame(c,.1);near(c.stamina,50);frame(c,.1);near(c.stamina,51.5);
 const before=c.stamina;frame(c,.1,{alive:false});near(c.stamina,before);
 c.stamina=40;c.staminaSpent=false;c.action.time=durations.judgment-.1;frame(c,.2);near(c.stamina,43);
});

test('sprint update/commit reuses one record and never carries a previous movement decision into a later frame',()=>{
 const c=make();c.stamina=50;c.setSprintHeld(true);let record=null;
 for(let i=0;i<120;i++){
  const result=c.update(1/60,{y:1});assert.ok(c.pendingSprint);record??=c.pendingSprint;assert.equal(c.pendingSprint,record);
  const distance=result.speed*result.movementDt;c.commitSprintMovement(distance,distance);assert.equal(c.pendingSprint,null);
 }
 near(c.stamina,40);c.update(1/60,{});assert.equal(c.pendingSprint,null);
 c.setSprintHeld(false);c.setSprintHeld(true);const result=c.update(1/60,{y:1});assert.equal(c.pendingSprint,record);
 c.commitSprintMovement(result.speed*result.movementDt,0);assert.equal(c.pendingSprint,null);assert.equal(c.sprinting,false);
});
