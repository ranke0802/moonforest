import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {wolfCombatR13Fixture} from '../../tests/helpers/wolf-combat-r13-fixture.js';
import {skinSweepGap} from '../../tests/helpers/skin-sweep.js';
import {bladeTouchesCapsule} from '../../src/melee-collision.js';
import {WolfEncounter} from '../../src/wolf-encounter.js';
import {WolfCombatSurfaceProbe} from '../../tests/helpers/wolf-combat-r13-surface.js';

const api=await wolfCombatR13Fixture(),cases=[],probe=new WolfCombatSurfaceProbe(api),pose=process.env.R13_POSE??'watch';
const positions=process.env.R13_BAND==='close'?[['front',0,2.3],['front-edge',0,2.8],['flank',2.3,0],['flank-edge',2.8,0],['rear',0,-2.3],['rear-edge',0,-2.8]]:[['front',0,3],['front-edge',0,3.8],['flank',2.5,0],['flank-edge',3.3,0],['rear',0,-2.5],['rear-edge',0,-3.3]];
const paths=['src/wolf-v02-spec.js','src/wolf-v02-encounter.js','src/wolf-v02-hurt.js','src/boss-encounter.js','src/player-strikes.js','src/warrior-v2.js','tests/helpers/wolf-combat-r13-fixture.js','tests/helpers/wolf-combat-r13-surface.js'];
const hashes=()=>Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));const sourceHashes=hashes();
for(const attack of ['shieldPush','judgment'])for(const [region,x,z]of positions){
 const e=await api.summon({distance:Math.hypot(x,z)});api.f.player.position.set(x,0,z);api.f.player.rotation.y=Math.atan2(-x,-z);api.watch(e);for(let i=0;i<24;i++)api.step(1/60);
 if(pose!=='watch')api.poseTarget(e,pose);probe.reset();
 const before=e.brain.hp,entry=attack==='shieldPush'?api.controller.shieldPush():api.controller.startAttack('judgment'),samples=[];let firstHit=null;
 for(let frame=0;frame<60*3;frame++){
  const hp=e.brain.hp;api.step(1/60);const sample=api.lastStrike;
  const relative=probe.capture(e,sample,api.result);
  if(sample?.contacts.length){
   const surface=skinSweepGap(e,sample),capsules=WolfEncounter.prototype.hurtCapsules.call(e);
   const oldCapsuleContact=sample.contacts.some(contact=>capsules.some(c=>bladeTouchesCapsule(contact.previous,contact.blade,c.points,c.radius+sample.bladeRadius,contact.lateral)));
   samples.push({time:api.elapsed,playerClipTime:api.result.clipTime,sourceState:api.result.state,bladeRadius:sample.bladeRadius,surface,relative,oldSevenCapsuleContact:oldCapsuleContact,hpBefore:hp,hpAfter:e.brain.hp,player:api.f.player.position.asArray(),wolf:e.actor.position.asArray(),blade:sample.contacts.map(c=>({window:c.window,previous:c.previous,blade:c.blade}))});
  }
  if(e.brain.hp<hp&&firstHit===null)firstHit={time:api.elapsed,mode:e.brain.mode,clip:e.brain.state,hp:e.brain.hp};
  if(!api.controller.action&&frame>10)break;
 }
 cases.push({attack,region,pose,x,z,entry,damage:before-e.brain.hp,firstHit,finalReaction:{mode:e.brain.mode,clip:e.brain.state},samples,visibleSurfaceContacts:samples.filter(s=>s.relative.some(r=>r.lineSurfaceContact)).length,visibleOldCapsuleMisses:samples.filter(s=>s.relative.some(r=>r.lineSurfaceContact)&&!s.oldSevenCapsuleContact).length,wholeWindowLineProvedClear:samples.length>0&&samples.every(s=>s.relative.every(r=>r.lineProvedClear)),shieldFaceOnlyWitnesses:samples.filter(s=>s.relative.some(r=>r.fullShieldSurfaceWitness&&r.lineProvedClear)).length});
}
await api.dispose();const label=process.env.R13_LABEL?.replace(/[^a-z0-9_-]/gi,'-'),name='baseline-incoming'+(label?'-'+label:'');fs.writeFileSync('reports/wolf-v02-combat-r13/'+name+'.json',JSON.stringify({scope:'Real packed native warrior controller/animator and PlayerStrikeSampler. Historical R12 seven-capsule geometry is evaluated READ-ONLY against the same actual bones. Relative blade/skin sweeps interpolate BOTH objects over every valid-window frame; actual shield-mesh intersection witnesses are separate from its old midline. Authored pose calibration holds a genuine wolf pose until first real incoming damage and then resumes the normal reaction. No collision gates/damage are injected. Concurrent source hashes distinguish this from final QA.',sourceHashes,sourceHashesAfter:hashes(),cases},null,2)+'\n');
console.log(JSON.stringify(cases.map(({attack,region,damage,firstHit,visibleSurfaceContacts,visibleOldCapsuleMisses,wholeWindowLineProvedClear,shieldFaceOnlyWitnesses})=>({attack,region,damage,firstHit,visibleSurfaceContacts,visibleOldCapsuleMisses,wholeWindowLineProvedClear,shieldFaceOnlyWitnesses})),null,2));
