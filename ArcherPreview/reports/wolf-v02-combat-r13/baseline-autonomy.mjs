import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {wolfCombatR13Fixture} from '../../tests/helpers/wolf-combat-r13-fixture.js';
const watched=['src/wolf-v02-spec.js','src/wolf-v02-encounter.js','src/wolf-v02-ram.js','src/wolf-v02-locomotion.js','src/player-strikes.js','src/boss-encounter.js','src/warrior-v2.js'];
const hashes=()=>Object.fromEntries(watched.map(path=>[path,createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
const initialHashes=hashes(),api=await wolfCombatR13Fixture(),cases=[];
for(const distance of [3,6,10,15,25,35])for(const custom of [false,true])for(const moving of [false,true]){
 const e=await api.summon({distance,sequence:custom?['lunge']:null}),attacks=[],hits=[],snapshots=[];let serial=null,lastHp=e.playerHp;
 for(let frame=0;frame<30*18;frame++){
  const time=frame/30,input=moving?{x:.25*Math.cos(time*1.1),y:.12*Math.sin(time*.7)}:{};api.step(1/30,input);
  if(e.brain.mode==='attack'&&e.brain.serial!==serial){serial=e.brain.serial;attacks.push({time:api.elapsed,id:e.brain.actionId,clip:e.brain.state,sourceStart:e.brain.time,distance:Math.hypot(e.actor.position.x-api.f.player.position.x,e.actor.position.z-api.f.player.position.z)});}
  if(e.playerHp<lastHp)hits.push({time:api.elapsed,damage:lastHp-e.playerHp,action:e.brain.actionId,state:api.result.state,contact:structuredClone(e.v02LastContact)});lastHp=e.playerHp;
  if(frame%30===0)snapshots.push({time:api.elapsed,behavior:e.brain.behavior,mode:e.brain.mode,sourceTime:e.brain.time,clip:e.brain.state,actor:e.actor.position.asArray(),player:api.f.player.position.asArray(),playerState:api.result.state,distance:Math.hypot(e.actor.position.x-api.f.player.position.x,e.actor.position.z-api.f.player.position.z)});
 }
 cases.push({distance,custom,moving,seconds:18,attacks,hits,ramSelected:attacks.some(row=>row.id==='lunge'),playerHp:e.playerHp,snapshots});
}
await api.dispose();const finalHashes=hashes();fs.mkdirSync('reports/wolf-v02-combat-r13',{recursive:true});
fs.writeFileSync('reports/wolf-v02-combat-r13/baseline-autonomy.json',JSON.stringify({baselineCommit:'1bf3892',scope:'R12 baseline, actual default or saved-lunge AI plus native warrior animation and real movement input. Untouched summon/rise; no startAction or artificial encounter-band placement.',sourceHashes:initialHashes,sourceHashesAfter:finalHashes,unchangedDuringProbe:JSON.stringify(initialHashes)===JSON.stringify(finalHashes),cases},null,2)+'\n');
console.log(JSON.stringify(cases.map(({distance,custom,moving,attacks,ramSelected,playerHp})=>({distance,custom,moving,actions:attacks.map(row=>row.id),ramSelected,playerHp})),null,2));
