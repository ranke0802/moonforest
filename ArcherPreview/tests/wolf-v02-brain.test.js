import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WolfBrain,WOLF_CLIPS,WOLF_BALANCE,WOLF_SCALE} from '../src/wolf-spec.js';
import {WolfV02Brain,WOLF_V02_ACTIONS,WOLF_V02_BY_ID,WOLF_V02_BRACE,WOLF_V02_DEATH,WOLF_V02_CLOSE_RAM,sampleWhipTime,whipElapsedAt,actionDuration} from '../src/wolf-v02-spec.js';
import {WOLF_V02_AUTHORED_CLIPS} from '../src/wolf-v02-authored-clips.js';

const config=JSON.parse(fs.readFileSync(new URL('../public/assets/alpha-wolf.json',import.meta.url)));
const durations=Object.fromEntries([...config.catalog,...WOLF_V02_AUTHORED_CLIPS].map(c=>[c.name,c.duration]));
const rows=[];
const start=(brain,id,speed=1)=>{brain.configureAttacks({custom:true,sequence:[id],speed});brain.startAction(id);return brain;};
function advanceAttack(brain,dt=1/60,visit=()=>{}){
 let elapsed=0,events=[];
 for(let i=0;i<4000&&brain.mode==='attack';i++){
  const before=brain.time,result=brain.update(dt,100);
  elapsed+=dt;events.push(...result.events);visit({before,result,elapsed});
 }
 assert.notEqual(brain.mode,'attack','attack must finish within a bounded number of updates');
 return {elapsed,events};
}
test.after(()=>{fs.mkdirSync('reports/wolf-v02-validation',{recursive:true});fs.writeFileSync('reports/wolf-v02-validation/brain.json',JSON.stringify({scope:'Deterministic source-time combat state tests; no renderer or physical-device measurement.',cases:rows},null,2)+'\n');});

test('0.1 keeps its R8 source, texture, size, two authored attacks and legacy impact contracts',()=>{
 assert.equal(WOLF_SCALE,2.5);assert.equal(config.scale,2.5);assert.equal(config.height,3.75);
 assert.equal(config.sourceSha256,'38057d9820c296c883a5545fc7528bffdda88e78387b9b5b1fe117b89cb09bce');
 assert.equal(config.texture.runtimeSha256,'445fbd01f773332c1b5a01bf2381ddd417b3c49fd3358c093d6807b2a50f819a');
 assert.equal(config.model,'./content/e3e18718e561fb963b7c18d54a515f69e22da58bf271e0ebfe3c5c97decc6a63.gltf');
 assert.equal(WOLF_BALANCE.walkSpeed,.9);assert.equal(WOLF_BALANCE.runSpeed,4.2);
 for(const [clip,time,capture]of [[WOLF_CLIPS.pin,.56,true],[WOLF_CLIPS.lunge,2.25,false]]){
  const b=new WolfBrain(durations);b.start(clip,'attack');const event=b.update(100,2).events;
  assert.equal(event.length,1);assert.equal(b.time,time);assert.equal(event[0].capture,capture);
  assert.equal(b.update(.01,2).events.length,0);
 }
 const b=new WolfBrain(durations);assert.equal(b.plannedAttack(WOLF_BALANCE.pinDistance),WOLF_CLIPS.pin);assert.equal(b.plannedAttack(WOLF_BALANCE.lungeDistance),WOLF_CLIPS.lunge);
});

test('0.2 retains predator bites and R8 pin while its separate R13 compact ram carries a bounded two-bite damage budget',()=>{
 assert.deepEqual(WOLF_V02_ACTIONS.map(a=>a.id),['quick-bite','chain-bite','paw-swipe','lunge','pin']);
 for(const action of WOLF_V02_ACTIONS){
  assert.strictEqual(WOLF_V02_BY_ID[action.id],action);assert.ok([...Object.values(WOLF_CLIPS),...WOLF_V02_AUTHORED_CLIPS.map(c=>c.name)].includes(action.sourceClip));
  assert.ok(action.clipStart>=0&&action.clipStart<action.impact&&action.impact<action.clipEnd);
  assert.ok(action.clipEnd<=durations[action.sourceClip]+1e-5);
  assert.ok(action.range>0&&action.damage>0);assert.ok(action.label);
 }
 assert.equal(WOLF_V02_BY_ID['quick-bite'].sourceClip,'Wolf_Predator_Diagonal_Bite_V02');assert.equal(WOLF_V02_BY_ID['quick-bite'].capture,false);
 assert.equal(WOLF_V02_BY_ID['chain-bite'].sourceClip,'Wolf_Predator_Diagonal_Bite_V02');assert.equal(WOLF_V02_BY_ID['chain-bite'].capture,false);
 assert.equal(WOLF_V02_BY_ID['paw-swipe'].sourceClip,'Wolf_Predator_Reverse_Bite_V02');assert.deepEqual(WOLF_V02_BY_ID['paw-swipe'].contactParts,['jaw','head']);
 assert.equal(WOLF_V02_BY_ID.pin.capture,true);assert.equal(WOLF_V02_BY_ID.lunge.sourceClip,WOLF_V02_CLOSE_RAM);
 assert.equal(WOLF_V02_BY_ID.lunge.clipStart,0);assert.equal(WOLF_V02_BY_ID.lunge.clipEnd,200/60);assert.equal(durations[WOLF_CLIPS.lunge],3.1);
 assert.deepEqual(WOLF_V02_BY_ID.lunge.ramPhases.map(phase=>[phase.id,phase.damage,phase.contactParts]),[['ram',40,['head']],['maul-1',30,['jaw']],['maul-2',30,['jaw']]]);
});

test('30/60 Hz and 0.5/1/2 speed play every action once, retain source impact pose and snapshot speed',()=>{
 for(const fps of [30,60])for(const speed of [.5,1,2])for(const action of WOLF_V02_ACTIONS){
  const b=start(new WolfV02Brain(durations),action.id,speed);assert.strictEqual(b.action,action);assert.equal(b.actionId,action.id);assert.equal(b.state,action.sourceClip);assert.equal(b.time,action.clipStart);
  let impacts=0,impactAt=null,lastTime=b.time;
  const result=advanceAttack(b,1/fps,({result,elapsed})=>{
   if(b.mode==='attack'){assert.ok(b.time>=lastTime-1e-9,'source time cannot reverse inside one action');lastTime=b.time;}
   for(const event of result.events){impacts++;impactAt=elapsed;assert.equal(event.type,'attack');assert.equal(event.actionId,action.id);assert.equal(event.capture,action.capture);assert.equal(b.time,action.impact);}
   if(elapsed>.1)b.configureAttacks({custom:true,sequence:[action.id],speed:speed===2?.5:2});
   assert.equal(b.castSpeed,speed,'settings edits apply only to the next action');
  });
  assert.equal(impacts,1);assert.equal(result.events.length,1);assert.ok(impactAt>0);
  const nextSpeed=speed===2?.5:2;b.startAction(action.id);assert.equal(b.castSpeed,nextSpeed);
  rows.push({action:action.id,fps,speed,wallDuration:result.elapsed,impactAt,impacts});
 }
 for(const action of WOLF_V02_ACTIONS){
  const samples=rows.filter(r=>r.action===action.id&&r.fps===60),one=samples.find(r=>r.speed===1);
  for(const sample of samples)assert.ok(Math.abs(sample.impactAt*sample.speed-one.impactAt)<=.06,JSON.stringify({action:action.id,sample,one}));
  if(action.id==='lunge')for(const sample of samples)assert.ok(Math.abs(sample.wallDuration-(whipElapsedAt(action,action.impact)/sample.speed+action.clipEnd-action.impact))<.08,'only the ram prefix follows cast speed; the native-fall/maul tail remains real time');
 }
});

test('long frames cross the authored impact once and cannot emit damage during recovery or after interruption',()=>{
 for(const action of WOLF_V02_ACTIONS){
  const b=start(new WolfV02Brain(durations),action.id),first=b.update(100,10);
  assert.equal(first.events.length,1);assert.equal(b.time,action.impact);assert.equal(b.update(100,10).events.length,0);
  let recoverySeen=b.behavior==='recovery';
  for(let i=0;i<10&&b.mode==='attack';i++){const r=b.update(100,10);assert.equal(r.events.length,0);recoverySeen||=b.behavior==='recovery';}
  assert.notEqual(b.mode,'attack');assert.ok(recoverySeen||b.behavior==='recovery','action must expose a punishable recovery');
  const interrupted=start(new WolfV02Brain(durations),action.id);assert.equal(interrupted.hit({damage:1,heavy:true}),true);
  for(let i=0;i<20;i++)assert.equal(interrupted.update(.1,10).events.length,0);assert.ok(interrupted.visited.has(WOLF_V02_DEATH));assert.ok(!interrupted.visited.has(WOLF_CLIPS.down)&&!interrupted.visited.has(WOLF_CLIPS.recover),'nonlethal interruption uses the approved improved collapse');
 }
});

test('whipping remaps only source time with slow anticipation, rapid contact and slower followthrough',()=>{
 for(const action of WOLF_V02_ACTIONS){
  assert.equal(sampleWhipTime(action,0),action.clipStart);assert.equal(sampleWhipTime(action,actionDuration(action)),action.clipEnd);
  const source=action.whip.source,seconds=action.whip.seconds;assert.equal(source.length,seconds.length);assert.ok(source.length>=4);
  const rates=source.slice(1).map((value,i)=>(value-source[i])/(seconds[i+1]-seconds[i]));
  const long=['lunge','pin'].includes(action.id);assert.ok(rates.every(r=>r>0));assert.ok(Math.max(...rates)>rates[0]*(long?1.15:1.3),'the attack has a faster physical contact phase');
  assert.ok(Math.max(...rates)>rates.at(-1)*(long?1.1:1.3),'followthrough slows after the fast contact phase');
  if(action.id==='pin')assert.ok(actionDuration(action)<1.6,'pin keeps the faster full takedown');
  if(action.id==='lunge'){assert.ok(whipElapsedAt(action,action.impact)<1);assert.ok(Math.abs(actionDuration(action)-whipElapsedAt(action,action.impact)-(action.clipEnd-action.impact))<1e-9,'the mauls retain a fixed real fall clock');}
  let last=action.clipStart;for(let i=0;i<=100;i++){const time=sampleWhipTime(action,actionDuration(action)*i/100);assert.ok(time>=last-1e-9&&time<=action.clipEnd+1e-9);last=time;}
 }
});

test('phase pressure, flanks and outcome tracking stay deterministic and do not mutate legacy balance',()=>{
 const a=new WolfV02Brain(durations,WOLF_BALANCE,()=>.5),b=new WolfV02Brain(durations,WOLF_BALANCE,()=>.5);
 assert.deepEqual(a.balance,b.balance);assert.equal(WOLF_BALANCE.hp,900);
 const trace=brain=>{const attacks=[],flanks=[];let distance=10;brain.start(WOLF_CLIPS.watch,'idle');brain.wait=0;for(let i=0;i<3000;i++){const r=brain.update(.05,distance);if(r.flank&&flanks.at(-1)!==r.flank.side)flanks.push(r.flank.side);if(r.speed&&!r.flank){const desired=r.retreatDistance??r.stopDistance??distance,step=r.speed*.05;distance+=r.retreat?Math.min(step,Math.max(0,desired-distance)):-Math.min(step,Math.max(0,distance-desired));}for(const e of r.events){attacks.push(e.actionId);brain.noteAttackResult({serial:brain.serial,hit:true});}}return {attacks,flanks};};
 const traced=trace(a);assert.deepEqual(traced,trace(b));assert.ok(traced.attacks.length>=6);assert.ok(traced.flanks.length>=4);for(let i=1;i<traced.flanks.length;i++)assert.equal(traced.flanks[i],-traced.flanks[i-1]);
 for(let i=2;i<traced.attacks.length;i++)assert.ok(traced.attacks[i]!==traced.attacks[i-1]||traced.attacks[i]!==traced.attacks[i-2],'default deck cannot repeat one action three times');
 const pressures=[900,450].map(hp=>{const brain=new WolfV02Brain(durations,WOLF_BALANCE,()=>.5);brain.hp=hp;brain.start(WOLF_CLIPS.watch,'idle');brain.behavior='observe';brain.observation=0;brain.update(.01,3);return {phase:brain.phase,flank:brain.flankRemaining,rate:brain.flankPlaybackRate};});
 assert.deepEqual(pressures.map(p=>p.phase),[1,2]);assert.deepEqual(pressures.map(p=>p.flank),[2.5,2.5]);assert.ok(pressures[1].rate>pressures[0].rate);
 const outcome=start(new WolfV02Brain(durations),'chain-bite');assert.equal(outcome.noteAttackResult({serial:outcome.serial-1,hit:true}),false);assert.equal(outcome.noteAttackResult({serial:outcome.serial,blocked:true}),true);assert.equal(outcome.lastOutcome,'blocked');assert.equal(outcome.chainRemaining,0);assert.equal(outcome.noteAttackResult({serial:outcome.serial,hit:true}),false);assert.equal(outcome.lastOutcome,'blocked');
 rows.push({case:'deterministic-default-deck',attacks:traced.attacks,flanks:traced.flanks,pressures});
 const down=start(new WolfV02Brain(durations),'pin');down.hit({damage:900,heavy:true,ignoreDefense:true});
 for(let i=0;i<1000;i++)assert.equal(down.update(.1,10).events.length,0);assert.equal(down.hp,0);assert.equal(down.state,WOLF_V02_DEATH);assert.equal(down.time,durations[WOLF_V02_DEATH]);
});
