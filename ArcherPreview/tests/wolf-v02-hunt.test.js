import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WOLF_CLIPS,WOLF_BALANCE} from '../src/wolf-spec.js';
import {WolfV02Brain,WOLF_V02_ACTIONS,WOLF_V02_BY_ID,actionDuration,sampleWhipTime,whipElapsedAt} from '../src/wolf-v02-spec.js';
import {WOLF_V02_AUTHORED_CLIPS} from '../src/wolf-v02-authored-clips.js';

const config=JSON.parse(fs.readFileSync(new URL('../public/assets/alpha-wolf.json',import.meta.url)));
const durations=Object.fromEntries([...config.catalog,...WOLF_V02_AUTHORED_CLIPS].map(c=>[c.name,c.duration]));
const brain=hp=>{const b=new WolfV02Brain(durations);b.hp=hp;b.start(WOLF_CLIPS.watch,'idle');b.behavior='observe';b.observation=0;return b;};

function trace(hp,{seconds=90,outcome='hit',fps=60}={}){
 const b=brain(hp),bouts=[],attacks=[],flanks=[];let distance=2.25,current=[],wasFlank=false;
 for(let frame=0;frame<seconds*fps;frame++){
  const result=b.update(1/fps,distance),isFlank=b.behavior==='flank';
  if(isFlank&&!wasFlank){if(current.length)bouts.push(current);current=[];flanks.push({frame,clip:b.state,mode:b.mode,remaining:b.flankRemaining});}
  wasFlank=isFlank;
  if(result.speed){assert.equal(result.retreat,false,'approach never turns into an escape');distance=Math.max(result.stopDistance,distance-result.speed/fps);}
  for(const e of result.events){attacks.push(e.actionId);current.push(e.actionId);b.noteAttackResult({hit:outcome==='hit',blocked:outcome==='blocked'});}
 }
 if(current.length)bouts.push(current);
 return {b,bouts,attacks,flanks};
}

function finishFirstBout(b,{distance=2.25,outcome='hit',moveAfterImpact=null}={}){
 const strikes=[];let contacted=false;
 for(let frame=0;frame<1800;frame++){
  const r=b.update(1/60,contacted&&moveAfterImpact!==null?moveAfterImpact:distance);
  for(const e of r.events){strikes.push(e.actionId);contacted=true;b.noteAttackResult({hit:outcome==='hit',blocked:outcome==='blocked'});}
  if(b.behavior==='flank')return strikes;
 }
 assert.fail('an attack bout must end with a bounded stalking phase');
}

test('above half health every default bout has one attack followed by authored stalking',()=>{
 for(const fps of [30,60]){
  const t=trace(451,{fps});assert.ok(t.bouts.length>8);assert.ok(t.bouts.every(b=>b.length===1));assert.ok(!t.attacks.includes('chain-bite'));
  assert.ok(t.attacks.includes('quick-bite')&&t.attacks.includes('paw-swipe'));
  assert.ok(t.flanks.every(f=>f.clip===WOLF_CLIPS.watch&&f.mode==='idle'&&f.remaining>=1.35));
  assert.equal(t.b.balance,WOLF_BALANCE);
 }
});

test('half health and below adds bounded successful attack bouts without eliminating final recovery',()=>{
 const cautious=trace(451),fierce=trace(450);assert.equal(cautious.b.phase,1);assert.equal(fierce.b.phase,2);
 assert.ok(fierce.bouts.some(b=>b.length===3));assert.ok(fierce.bouts.every(b=>b.length>=1&&b.length<=3));assert.ok(fierce.attacks.includes('chain-bite'));
 assert.ok(fierce.attacks.length>cautious.attacks.length*1.3,'phase 2 pressure comes from fewer decision pauses and conditional followups');
 assert.ok(fierce.flanks.every(f=>f.remaining<=.55));
 const b=brain(450);b.startAction('quick-bite');let entered=false;
 for(let frame=0;frame<120;frame++){const r=b.update(1/60,2.25);if(r.events.length)b.noteAttackResult({blocked:true});if(b.behavior==='recovery'){entered=true;assert.ok(b.recoveryRemaining>=.85-1/60);break;}}
 assert.ok(entered,'blocked attack exposes a real recovery instead of restarting the attack');
});

test('miss, block, escape and interrupts cancel aggressive followups; explicit chain stays compatible',()=>{
 for(const outcome of ['miss','blocked']){
  const b=brain(450);b.startAction('chain-bite');assert.deepEqual(finishFirstBout(b,{outcome}),['chain-bite']);
 }
 const escaped=brain(450);escaped.startAction('chain-bite');assert.deepEqual(finishFirstBout(escaped,{moveAfterImpact:5}),['chain-bite']);
 const custom=brain(900);custom.configureAttacks({custom:true,sequence:['chain-bite'],speed:1});custom.startAction('chain-bite');assert.deepEqual(finishFirstBout(custom),['chain-bite','chain-bite']);
 for(const cancel of [b=>b.hit({heavy:true,damage:1}),b=>b.hit({stun:.25,damage:1}),b=>b.parry()]){
  const b=brain(450);b.startAction('chain-bite');cancel(b);assert.equal(b.followupId,null);assert.equal(b.chainRemaining,0);
  for(let frame=0;frame<90;frame++)assert.equal(b.update(1/60,2.25).events.length,0);
 }
});

test('long attacks never make space by fleeing and custom orders substitute only when too close',()=>{
 for(const hp of [900,450])for(const distance of [0,1,2.2,4,6,10,20,25,35]){
  const b=brain(hp);b.phase=hp<=450?2:1;
  for(const wanted of [null,'pin','lunge']){
   b.configureAttacks({custom:!!wanted,sequence:wanted?[wanted]:[],speed:1});b.behavior='position';b.start(WOLF_CLIPS.watch,'idle');
   const r=b.update(1/60,distance);assert.notEqual(r.retreat,true);assert.equal(r.retreatDistance,undefined);
   if(b.action?.id==='lunge')assert.ok(distance>=WOLF_V02_BY_ID.lunge.minDistance);
   if(b.action?.id==='pin')assert.ok(distance>=WOLF_V02_BY_ID.pin.minDistance);
  }
 }
 const custom=brain(900);custom.configureAttacks({custom:true,sequence:['lunge','pin'],speed:1});assert.equal(custom.chooseAction(25),'lunge');assert.notEqual(custom.chooseAction(2.2),'lunge');custom.customAttackIndex=1;assert.equal(custom.chooseAction(9.1),'pin');
});

test('stalking freezes its authored gait when corridor or facing is blocked',()=>{
 const b=brain(900);b.beginStalk();const first=b.update(.1,2.25);assert.equal(first.speed,0);assert.equal(first.flank.authored,true);assert.equal(first.flank.facePlayer,true);assert.equal(b.state,WOLF_CLIPS.watch);
 const poseTime=b.time;b.suppressStalkStep=true;const next=b.update(.1,2.25);assert.equal(b.time,poseTime);assert.equal(next.speed,0);assert.equal(b.behavior,'position');
 assert.equal(b.update(.01,2.25).events.length,0);assert.equal(b.mode,'attack');
});

test('stationary observation and recovery hold the circling pose while only their timers advance',()=>{
 const observing=brain(900);observing.observation=1;observing.time=.4;const remaining=observing.observation;
 for(let frame=0;frame<20;frame++){const result=observing.update(1/60,2.25);assert.equal(observing.time,0);assert.equal(observing.behavior,'observe');assert.equal(result.speed,0);}
 assert.ok(observing.observation<remaining);
 const recovering=brain(900);recovering.startAction('quick-bite');
 for(let frame=0;frame<90&&recovering.behavior!=='recovery';frame++)recovering.update(1/60,2.25);
 assert.equal(recovering.behavior,'recovery');const before=recovering.recoveryRemaining;
 for(let frame=0;frame<20;frame++){recovering.update(1/60,2.25);assert.equal(recovering.time,0);assert.equal(recovering.behavior,'recovery');}
 assert.ok(recovering.recoveryRemaining<before);assert.ok(recovering.recoveryElapsed>0);
 recovering.beginStalk();recovering.update(.1,2.25);assert.ok(recovering.time>0,'only an actual stalking step advances the circling gait');
});

test('phase threshold does not cut off current attack or bypass hit/down/recovery motions',()=>{
 const b=brain(900);b.startAction('quick-bite');b.update(.1,2.25);const serial=b.serial,time=b.time;b.hp=450;b.update(.01,2.25);assert.equal(b.serial,serial);assert.ok(b.time>time);assert.equal(b.phase,2);
 b.hit({heavy:true,damage:1});assert.equal(b.state,WOLF_CLIPS.down);assert.equal(b.update(.1,2).events.length,0);
 for(let frame=0;frame<120;frame++)b.update(1/60,2);assert.ok(b.visited.has(WOLF_CLIPS.recover));
 const hit=brain(450);hit.hit({interruptsBoss:true,damage:1});assert.equal(hit.state,WOLF_CLIPS.hit);
 const brace=brain(450);brace.hit({stun:.1,damage:1});brace.update(.2,2);assert.equal(brace.state,WOLF_CLIPS.brace);
 const discovery=new WolfV02Brain(durations);for(let frame=0;frame<400;frame++)discovery.update(1/60,14);for(const clip of [WOLF_CLIPS.rest,WOLF_CLIPS.alert,WOLF_CLIPS.rise,WOLF_CLIPS.watch])assert.ok(discovery.visited.has(clip));
});

test('impact window accepts a late contact upgrade once and rejects stale, duplicate and terminal changes',()=>{
 const b=brain(900);b.startAction('quick-bite');assert.equal(b.noteAttackResult({hit:false}),true);assert.equal(b.lastOutcome,'miss');assert.equal(b.noteAttackResult({serial:b.serial-1,hit:true}),false);assert.equal(b.noteAttackResult({hit:false}),false);assert.equal(b.noteAttackResult({hit:true}),true);assert.equal(b.lastOutcome,'hit');assert.equal(b.noteAttackResult({blocked:true}),false);assert.equal(b.noteAttackResult({hit:true}),false);
 b.startAction('quick-bite');assert.equal(b.noteAttackResult({blocked:true}),true);assert.equal(b.noteAttackResult({hit:true}),false);assert.equal(b.lastOutcome,'blocked');
 for(const a of WOLF_V02_ACTIONS){assert.ok(a.contactStart<=a.impact&&a.contactEnd>a.impact&&a.contactEnd<a.clipEnd);if(a.capture)assert.equal(a.contactStart,a.impact);}
});

test('strong whipping accelerates contact while preserving exact authored poses, time monotonicity and speed snapshot',()=>{
 for(const action of WOLF_V02_ACTIONS){
  const {source,seconds}=action.whip,rates=source.slice(1).map((s,i)=>(s-source[i])/(seconds[i+1]-seconds[i]));assert.ok(Math.max(...rates)>=2.2);assert.ok(Math.max(...rates)>rates[0]*2);
  assert.ok(Math.abs(sampleWhipTime(action,whipElapsedAt(action,action.impact))-action.impact)<1e-9);
  let previous=0;for(let i=0;i<=240;i++){const time=sampleWhipTime(action,actionDuration(action)*i/240);assert.ok(time>=previous);previous=time;}assert.equal(previous,action.clipEnd);
  for(const fps of [30,60])for(const speed of [.5,1,2]){
   const b=brain(450);b.configureAttacks({speed});b.startAction(action.id);let impacts=0;
   for(let frame=0;frame<1200&&b.mode==='attack';frame++){const r=b.update(1/fps,2.25);for(const e of r.events){impacts++;assert.equal(e.actionId,action.id);assert.equal(b.time,action.impact);}b.configureAttacks({speed:speed===2?.5:2});assert.equal(b.castSpeed,speed);}
   assert.equal(impacts,1);assert.equal(b.behavior,'recovery');
  }
 }
});
