import {r13ProofHashes} from "./helpers/wolf-combat-r13-proof.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {r13Api,disposeR13} from './helpers/wolf-combat-r13-run.js';
import {WolfCombatSurfaceProbe,worldSurface,exactSurfaceDistance,movingBladeSkinGap} from './helpers/wolf-combat-r13-surface.js';
import {WOLF_V02_DEATH,WOLF_V02_GET_UP,WOLF_V02_BY_ID} from '../src/wolf-v02-spec.js';
import {WOLF_V02_COMBAT_R13_CLIPS} from '../src/wolf-v02-authored-clips.js';
const evidence=[],paths=['src/wolf-v02-encounter.js','src/wolf-v02-spec.js','src/wolf-v02-hurt.js','src/wolf-v02-shield.js','src/player-strikes.js','src/warrior-v2.js','src/wolf-v02-combat-r13-clips.json','tests/wolf-v02-combat-r13-incoming.test.js'];
const hashes=r13ProofHashes,initial=hashes();
test.after(async()=>{await disposeR13();const final=hashes();fs.writeFileSync('reports/wolf-v02-combat-r13/incoming-proof.json',JSON.stringify({scope:'Packed native warrior weapon/animation/controller and released native strike sampler. Pose-calibration cases hold a real authored target pose, never inject collision/damage. Entire valid blade windows are compared with moving CPU skin; anatomy-envelope hits and literal skin witnesses remain distinct. No visual approval/device-performance claim.',sourceHashes:final,cases:evidence},null,2)+'\n');assert.deepEqual(final,initial);});
async function receive({fps=60,attack='judgment',position=[2.3,0],pose='quick-bite',seconds=7,onStep,probe=false}={}){
 const api=await r13Api(),e=await api.summon({distance:3});api.f.player.position.set(position[0],0,position[1]);api.f.player.rotation.y=Math.atan2(-position[0],-position[1]);api.watch(e);for(let i=0;i<24;i++)api.step(1/60);if(pose!=='watch')api.poseTarget(e,pose);
 const surface=probe?new WolfCombatSurfaceProbe(api):null,hits=[],rows=[],hp=e.brain.hp,limbs=Object.fromEntries(Object.entries(e.nodes).filter(([n])=>/^(fore|hind)\.[LR]\.(upper|lower|metatarsal|paw)$/.test(n)).map(([n,v])=>[n,v.position.length()]));let previousHp=hp,previousSerial=e.brain.serial,limbError=0,scaleError=0;
 const original=e.hurtCapsules.bind(e);let captured=false;
 if(surface)e.hurtCapsules=()=>{captured=true;surface.capture(e,api.lastStrike,api.result);return original();};
 const accepted=attack==='shieldPush'?api.controller.shieldPush():api.controller.startAttack(attack);
 for(let frame=0;frame<fps*seconds;frame++){
  captured=false;api.step(1/fps);if(surface&&!captured)surface.capture(e,api.lastStrike,api.result);
  const row={time:api.elapsed,mode:e.brain.mode,clip:e.brain.state,source:e.brain.time,serial:e.brain.serial,hp:e.brain.hp,playerState:api.result.state,playerSource:api.result.clipTime,knockVelocity:e.knockVelocity.asArray(),wolf:e.actor.position.asArray(),paws:Object.fromEntries(['fore.L.paw','fore.R.paw','hind.L.paw','hind.R.paw'].map(n=>[n,e.nodes[n].getAbsolutePosition().asArray()]))};rows.push(row);
  for(const [n,length]of Object.entries(limbs)){limbError=Math.max(limbError,Math.abs(e.nodes[n].position.length()-length));scaleError=Math.max(scaleError,...e.nodes[n].scaling.asArray().map(v=>Math.abs(v-1)));}
  if(e.brain.hp<previousHp)hits.push({...row,damage:previousHp-e.brain.hp,event:api.damageEvents.filter(v=>v.kind==='enemy').at(-1)});previousHp=e.brain.hp;previousSerial=e.brain.serial;onStep?.({api,e,frame,hits,rows});
 }
 if(surface)delete e.hurtCapsules;
 return {api,e,result:{fps,attack,position,pose,accepted,damage:hp-e.brain.hp,hits,rows,limbError,scaleError,surfaces:surface?.rows??[],events:structuredClone(api.damageEvents),final:{alive:e.brain.hp>0,active:e.active,mode:e.brain.mode,clip:e.brain.state,corpseGone:e.corpseGone,rewarded:e.rewarded}}};
}
test('real released shield and first descending heavy contact select collapse, then floor hold and supported getup',async()=>{
 const cases=[];for(const fps of [30,60])for(const attack of ['judgment','shieldPush']){const {result:c}=await receive({fps,attack});cases.push(c);assert.equal(c.accepted,true);assert.ok(c.hits.length>0,JSON.stringify({fps,attack}));assert.equal(c.hits[0].mode,'down');assert.equal(c.hits[0].clip,WOLF_V02_DEATH);if(attack==='judgment')assert.equal(c.hits[0].event.burstIndex,1,'first real descending hit interrupts immediately');
  const first=c.hits[0],down=c.rows.filter(r=>r.serial===first.serial),getup=c.rows.find(r=>r.clip===WOLF_V02_GET_UP),next=c.rows.find(r=>r.time>(getup?.time??Infinity)&&r.clip!==WOLF_V02_GET_UP);
  assert.ok(down.at(-1).time-first.time>=1.65+.30-2/fps);assert.ok(getup);assert.ok(next.time-getup.time>=2.2-2/fps);assert.equal(c.final.alive,true);assert.equal(c.final.active,true);assert.notEqual(c.final.corpseGone,true);assert.ok(c.hits.filter(h=>h.mode==='down').every(h=>h.serial===first.serial),'later grounded bursts do not restart collapse');assert.ok(c.limbError<1e-5);assert.ok(c.scaleError<1e-6);
  const clip=WOLF_V02_COMBAT_R13_CLIPS.find(c=>c.name===WOLF_V02_GET_UP),drifts=[];
  for(const p of clip.supportPhases){
   const support=c.rows.filter(r=>r.clip===clip.name&&r.source>=p.start+1/fps&&r.source<p.end-1/fps);if(!support.length)continue;
   for(const foot of p.feet){const points=support.map(r=>r.paws[foot]);drifts.push(Math.max(...points.map(point=>Math.hypot(...point.map((v,k)=>v-points[0][k])))));}
  }
  c.getupSupportDrifts=drifts;assert.ok(drifts.length>=4);assert.ok(drifts.every(d=>d<.025),JSON.stringify({fps,attack,drifts}));}
 evidence.push({gate:'four-native-heavy-shield-collapse-getup',cases});
});
test('actual native head/flank/front/rear swings preserve outside misses at30/60Hz',async()=>{
 const cases=[];for(const fps of [30,60])for(const attack of ['judgment','shieldPush'])for(const [region,position]of [['front',[0,2.8]],['flank',[2.3,0]],['rear',[0,-2.3]],['outside',[0,-4.5]]]){const {result:c}=await receive({fps,attack,position,pose:'quick-bite',seconds:2.2,probe:true});cases.push({region,...c});assert.equal(c.accepted,true);if(region==='outside'){assert.equal(c.damage,0);assert.ok(c.surfaces.every(r=>r.lineProvedClear));}if(region==='flank')assert.ok(c.damage>0);}
 evidence.push({gate:'16-native-region-and-outside-cases',cases});
});
test('actual full shield face reaches low anatomy where the old horizontal centreline remains clear',async()=>{
 const cases=[];for(const fps of [30,60]){
  const api=await r13Api(),e=await api.summon({distance:3});api.f.player.position.set(0,0,-2.1);api.f.player.rotation.y=0;api.watch(e);for(let i=0;i<24;i++)api.step(1/60);api.poseTarget(e,'lunge');const original=e.hurtCapsules.bind(e);let measured=null;
  e.hurtCapsules=()=>{if(!measured&&api.lastStrike?.contacts.length){const body=worldSurface(e.asset.meshes.find(m=>m.skeleton&&m.morphTargetManager&&!m.metadata?.moonforestOutline)),face=worldSurface(api.shieldNode);measured={fullFace:exactSurfaceDistance(face,body),oldMidline:api.lastStrike.contacts.map(c=>movingBladeSkinGap(body,body,c,0,1)),radius:api.lastStrike.bladeRadius,rows:e.v02Shield.rows.length,source:api.result.clipTime};}return original();};
  api.controller.shieldPush();for(let i=0;i<fps*2&&e.brain.hp===900;i++)api.step(1/fps);delete e.hurtCapsules;cases.push({fps,damage:900-e.brain.hp,measured});assert.equal(900-e.brain.hp,13);assert.equal(measured.rows,13);assert.ok(measured.fullFace.distance<=measured.radius+.10,'actual visible face remains inside the bounded anatomy/tactile margin');assert.ok(measured.oldMidline.every(r=>r.minimumProvedDistance>measured.radius+.10),'the old midline would genuinely miss this low contact');
 }
 evidence.push({gate:'two-actual-shield-face-versus-old-line',cases,toleranceWorldMeters:.10,interpretation:'Exact actual-mesh proximity; these cases use the bounded tactile/anatomy envelope, not literal mesh intersection.'});
});
test('a real contacting heavy wins the same pose pass over pending head ram',async()=>{
 const api=await r13Api(),e=await api.summon({distance:3});api.watch(e);for(let i=0;i<24;i++)api.step(1/60);api.f.player.position.set(2.3,0,0);api.f.player.rotation.y=-Math.PI/2;api.controller.startAttack('judgment');let armed=false,first=null;
 for(let i=0;i<180;i++){
  // Schedule the real authored incoming swing to coincide with a ram pose.
  // Neither contact gate nor actual blade path is fabricated.
  if(!armed&&api.result.state==='judgment'&&api.result.clipTime>=.90){e.brain.startAction('lunge');e.brain.time=WOLF_V02_BY_ID.lunge.contactStart;armed=true;}
  const hp=e.brain.hp;api.step(1/60);if(e.brain.hp<hp){first={mode:e.brain.mode,clip:e.brain.state,playerHp:e.playerHp,result:api.result.state,phase:e.v02LastContact,event:api.damageEvents.filter(v=>v.kind==='enemy').at(-1)};break;}
 }
 evidence.push({gate:'same-pass-actual-heavy-before-ram',armed,first});assert.equal(armed,true);assert.ok(first);assert.equal(first.event.burstIndex,1);assert.equal(first.mode,'down');assert.equal(first.clip,WOLF_V02_DEATH);assert.equal(first.playerHp,500);assert.notEqual(first.result,'knockdown');
});
test('incoming during collapse remains physical and nonreentrant; no close-range radial damage bypass',async()=>{
 const {api,e,result:c}=await receive({seconds:1.3});assert.equal(e.brain.mode,'down');const serial=e.brain.serial,time=e.brain.time,hp=e.brain.hp;api.controller.cancelAttack();api.f.player.position.set(0,0,-4.5);api.f.player.rotation.y=0;assert.equal(api.controller.startAttack('judgment'),true);
 for(let i=0;i<60;i++)api.step(1/60);assert.equal(e.brain.hp,hp,'outside blade during knockdown remains a real miss');assert.equal(e.brain.serial,serial);assert.ok(e.brain.time>=time);evidence.push({gate:'grounded-outside-no-radial-bypass',initial:c.hits,finalHp:e.brain.hp,serial});
});
test('low stamina and unreleased guard yield no damage or collapse before a valid native strike',async()=>{
 const api=await r13Api(),e=await api.summon({distance:3});api.watch(e);api.controller.stamina=0;assert.equal(api.controller.shieldPush(),false);assert.equal(api.controller.startAttack('judgment'),false);for(let i=0;i<20;i++)api.step(1/60);assert.equal(e.brain.hp,900);assert.notEqual(e.brain.mode,'down');assert.equal(api.strikeSamples.length,0);evidence.push({gate:'input-stamina-rejections-separated',hp:e.brain.hp,rejects:api.controller.staminaRejectSerial});
});
