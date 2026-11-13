import fs from 'node:fs';
import {wolfCombatR13Fixture} from '../../tests/helpers/wolf-combat-r13-fixture.js';
import {WolfCombatSurfaceProbe} from '../../tests/helpers/wolf-combat-r13-surface.js';
import {bladeTouchesCapsule} from '../../src/melee-collision.js';
const api=await wolfCombatR13Fixture(),probe=new WolfCombatSurfaceProbe(api),cases=[];
for(const attack of ['judgment','shieldPush'])for(const [region,x,z]of [['front',0,2.3],['flank',2.3,0],['rear',0,-2.3],['front-out',0,4.5]]){
 const e=await api.summon({distance:3});api.f.player.position.set(x,0,z);api.f.player.rotation.y=Math.atan2(-x,-z);api.watch(e);for(let i=0;i<24;i++)api.step(1/60);api.poseTarget(e,'lunge');probe.reset();
 const caps=e.hurtCapsules.bind(e),rows=[];let captured=false;
 e.hurtCapsules=()=>{const c=caps(),sample=api.lastStrike,relative=probe.capture(e,sample,api.result),shapes=e.v02Shield.sample(sample,api.result,api.shieldNode);captured=true;rows.push({time:api.elapsed,source:api.result.clipTime,hp:e.brain.hp,relative,shapes:shapes.contacts?.filter(s=>c.some(v=>bladeTouchesCapsule(s.previous,s.blade,v.points,v.radius+shapes.bladeRadius,s.lateral))).map(s=>({blade:s.blade,previous:s.previous})),names:c.filter(v=>shapes.contacts?.some(s=>bladeTouchesCapsule(s.previous,s.blade,v.points,v.radius+shapes.bladeRadius,s.lateral))).map(v=>v.name)});return c;};
 attack==='shieldPush'?api.controller.shieldPush():api.controller.startAttack('judgment');const hp=e.brain.hp;
 for(let i=0;i<180;i++){captured=false;api.step(1/60);if(!captured)probe.capture(e,api.lastStrike,api.result);if(!api.controller.action&&i>10)break;}
 delete e.hurtCapsules;cases.push({attack,region,damage:hp-e.brain.hp,rows:rows.filter(r=>r.relative.length)});
}
fs.writeFileSync('reports/wolf-v02-combat-r13/incoming-pregate-probe.json',JSON.stringify(cases,null,2)+'\n');console.log(JSON.stringify(cases.map(c=>({attack:c.attack,region:c.region,damage:c.damage,rows:c.rows.map(r=>({source:r.source,names:r.names,relative:r.relative.map(s=>({gap:s.gap.minimumDistance,proved:s.gap.minimumProvedDistance,inside:s.gap.initialContainment,face:s.fullShieldSurfaceWitness}))}))})),null,2));await api.dispose();
