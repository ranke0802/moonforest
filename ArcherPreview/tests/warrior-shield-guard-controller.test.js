import test from 'node:test';
import assert from 'node:assert/strict';
import {WarriorV2Controller,V2_SHIELD_HOLD_SECONDS,V2_SHIELD_GUARD_CLIP_TIME,V2_SHIELD_GUARD_COST} from '../src/warrior-v2.js';

const durations={idle:2,run:1,slash:1.5,attack:3,judgment:4.33,shieldPush:71/30,dodge:74/30,knockdown:1,getUp:1};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(options={}){
  let now=0;const c=new WarriorV2Controller({durations,holdNow:()=>now,...options});
  return {c,advance:seconds=>{now+=seconds*1000;},frame:(seconds,input={})=>{now+=seconds*1000;return c.update(seconds,input);}};
}

test('shield press raises immediately and a short release pays once and continues the same push',()=>{
  const {c,frame}=fixture();assert.equal(c.setShieldHeld(true),true);
  const action=c.action,id=action.id;assert.equal(action.state,'shieldPush');assert.equal(c.stamina,100);
  let result=frame(.1,{y:1});assert.equal(result.shieldPending,true);assert.equal(result.guarding,false);assert.equal(result.moving,false);
  assert.equal(result.freezeOnExit,true);
  assert.equal(c.setShieldHeld(true),true);assert.equal(c.action,action);near(c.action.time,.1);
  c.setShieldHeld(false);assert.equal(c.action,action);assert.equal(c.stamina,80);assert.equal(c.shieldHeld,false);
  result=frame(1.02);assert.equal(result.actionId,id);near(result.clipTime,1.12);assert.equal(result.shieldPending,false);assert.equal(result.guarding,false);
  assert.notEqual(result.freezeOnExit,true);
  c.setShieldHeld(false);assert.equal(c.stamina,80);assert.equal(c.serial,1);
});

test('held shield freezes before the push and drains five per second without regeneration at 15/30/60 FPS',()=>{
  for(const fps of [15,30,60])for(const speed of [.5,1,2]){
    const {c,frame}=fixture();c.stamina=70;c.setMotionSpeed('shieldPush',speed);c.setSprintHeld(true);c.setShieldHeld(true);
    let result;
    for(let i=0;i<3.2*fps;i++)result=frame(1/fps,{y:1});
    assert.equal(result.guarding,true);assert.equal(result.shieldPending,false);assert.equal(c.shieldHeld,true);
    near(result.clipTime,V2_SHIELD_GUARD_CLIP_TIME);near(c.stamina,70-3*V2_SHIELD_GUARD_COST);
    assert.equal(result.freezeOnExit,true);assert.equal(result.moving,false);assert.equal(c.sprinting,false);assert.equal(c.pendingSprint,null);assert.equal(c.serial,1);
    result=frame(1);near(result.clipTime,V2_SHIELD_GUARD_CLIP_TIME);near(c.stamina,50);
    c.setShieldHeld(false);assert.equal(c.action,null);result=frame(.1,{y:1});assert.equal(result.state,'run');assert.equal(c.serial,1);
  }
});

test('physical long release never creates a push when there was no intermediate frame',()=>{
  for(const seconds of [V2_SHIELD_HOLD_SECONDS,.6,2]){
    const {c,advance,frame}=fixture();c.stamina=50;c.setShieldHeld(true);advance(seconds);c.setShieldHeld(false);
    assert.equal(c.action,null);assert.equal(c.shieldHeld,false);assert.equal(c.guarding,false);assert.equal(c.serial,1);
    near(c.stamina,50-Math.max(0,seconds-V2_SHIELD_HOLD_SECONDS)*V2_SHIELD_GUARD_COST);
    assert.equal(frame(0).actionId,null);
  }
});

test('guard also works without a wall clock and high motion speed cannot cross the push while pending',()=>{
  const c=new WarriorV2Controller({durations,staminaEnabled:false});c.setMotionSpeed('shieldPush',2);c.setShieldHeld(true);
  let result=c.update(.19);assert.equal(result.shieldPending,true);assert.ok(result.clipTime<V2_SHIELD_GUARD_CLIP_TIME);
  result=c.update(.01);assert.equal(result.guarding,true);assert.ok(result.clipTime<V2_SHIELD_GUARD_CLIP_TIME);
  result=c.update(2);near(result.clipTime,V2_SHIELD_GUARD_CLIP_TIME);
  c.setShieldHeld(false);assert.equal(c.action,null);assert.equal(c.update(3).state,'idle');assert.equal(c.serial,1);
});

test('only tapping requires twenty stamina; exhaustion ends guard until a physical release and repress',()=>{
  const {c,frame}=fixture();c.stamina=2;assert.equal(c.setShieldHeld(true),true);
  frame(.2);assert.equal(c.guarding,true);near(c.stamina,2);
  frame(.4);near(c.stamina,0);assert.equal(c.action,null);assert.equal(c.shieldHeld,true);assert.equal(c.shieldExhausted,true);
  const serial=c.serial,rejections=c.staminaRejectSerial;frame(1);near(c.stamina,15);
  assert.equal(c.setShieldHeld(true),false);frame(1);assert.equal(c.serial,serial);assert.equal(c.staminaRejectSerial,rejections);
  c.setShieldHeld(false);assert.equal(c.setShieldHeld(true),true);assert.equal(c.serial,serial+1);c.cancelShieldInput();
  c.stamina=19;c.setShieldHeld(true);frame(.1);c.setShieldHeld(false);assert.equal(c.action,null);near(c.stamina,19);
  assert.equal(c.staminaRejectSerial,rejections+1);
});

test('a zero-stamina press rejects once and cannot activate as stamina recovers before release',()=>{
  const {c,frame}=fixture();c.stamina=0;assert.equal(c.setShieldHeld(true),true);assert.equal(c.action,null);assert.equal(c.serial,0);
  frame(1);assert.equal(c.setShieldHeld(true),false);assert.equal(c.action,null);assert.equal(c.staminaRejectSerial,1);
  c.setShieldHeld(false);assert.equal(c.setShieldHeld(true),true);assert.equal(c.serial,1);
});

test('exhaustion holds queued attacks until shield release and cannot be converted to a programmatic push',()=>{
  const {c,frame}=fixture();c.stamina=1;c.setShieldHeld(true);c.setAttackHeld(true);frame(.5);
  assert.equal(c.shieldExhausted,true);assert.equal(c.queuedAttack,'judgment');c.setAttackHeld(false);
  assert.equal(c.shieldPush(),false);frame(3);assert.equal(c.action,null);assert.equal(c.serial,1);assert.equal(c.queuedAttack,'judgment');
  assert.equal(c.shieldPush(),false);c.setShieldHeld(false);assert.equal(frame(0).state,'judgment');assert.equal(c.serial,2);
});

test('normal and heavy attacks wait through guarding and fire once after release',()=>{
  for(const heavy of [false,true])for(const fps of [15,30,60]){
    const {c,frame}=fixture({staminaEnabled:false});c.setShieldHeld(true);
    for(let i=0;i<fps;i++)frame(1/fps);
    if(heavy)c.setAttackHeld(true);else c.attack();
    for(let i=0;i<fps;i++)frame(1/fps);
    assert.equal(c.guarding,true);assert.equal(c.serial,1);assert.equal(c.queuedAttack,heavy?'judgment':'normal');
    if(heavy)c.setAttackHeld(false);c.setShieldHeld(false);frame(0);
    assert.equal(c.action.state,heavy?'judgment':'slash');assert.equal(c.serial,2);frame(10);assert.equal(c.serial,2);
  }
});

test('heavy hold started before shield input survives both tap and sustained defense',()=>{
  for(const heldDefense of [false,true]){
    const {c,frame}=fixture({staminaEnabled:false});c.setAttackHeld(true);frame(.15);c.setShieldHeld(true);
    frame(heldDefense?.5:.1);c.setShieldHeld(false);
    if(!heldDefense)frame(.3);
    c.setAttackHeld(false);assert.equal(c.queuedAttack,'judgment');
    frame(heldDefense?0:3);assert.equal(c.action?.state,'judgment');assert.equal(c.serial,2);
  }
});

test('cancel, forced hit, capture, knockdown, death and reset clear shield input without a push',()=>{
  const cancels=[c=>c.cancelShieldInput(),c=>c.cancelAttack(),c=>c.hit(.2,{force:true}),c=>c.capture(),c=>c.knockdown(),c=>{c.dead=true;c.update(0);},c=>c.update(0,{alive:false}),c=>c.resetStamina()];
  for(const cancel of cancels)for(const heldDefense of [false,true]){
    const {c,frame}=fixture({staminaEnabled:false});c.setShieldHeld(true);frame(heldDefense?.3:.1);cancel(c);
    assert.equal(c.shieldHeld,false);assert.equal(c.shieldPending,false);assert.equal(c.guarding,false);
    c.setShieldHeld(false);assert.notEqual(c.action?.state,'shieldPush');assert.equal(c.serial,c.knockedDown?2:1);
  }
});

test('shield cancellation preserves a buffered heavy and programmatic tap remains immediate',()=>{
  const {c,frame}=fixture({staminaEnabled:false});c.setShieldHeld(true);c.setAttackHeld(true);frame(.5);c.setAttackHeld(false);
  assert.equal(c.queuedAttack,'judgment');c.cancelShieldInput();assert.equal(c.queuedAttack,'judgment');assert.equal(frame(0).state,'judgment');
  c.cancelAttack();c.staminaEnabled=true;c.resetStamina();assert.equal(c.shieldPush(),true);assert.equal(c.stamina,80);
  assert.equal(c.shieldPending,false);assert.equal(c.guarding,false);assert.equal(c.shieldPush(),false);
  assert.equal(c.dodge(),true);assert.equal(c.shieldPush(),true);assert.equal(c.stamina,50);
});
