import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {wolfRamFixture} from '../../tests/helpers/wolf-ram-fixture.js';
import {WOLF_V02_BY_ID} from '../../src/wolf-v02-spec.js';
const hashes=Object.fromEntries(['src/wolf-v02-spec.js','src/wolf-v02-encounter.js','src/warrior-v2.js'].map(path=>[path,createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
const recorded=JSON.parse(fs.readFileSync('reports/wolf-v02-ram-r12/baseline-r11.json'));
for(const [path,hash]of Object.entries(recorded.hashes))if(hashes[path]!==hash)throw Error('R11 baseline source changed; preserve the recorded rejection evidence: '+path);
const cases=[];
for(const fps of [30,60])for(const speed of [.5,1,2]){
 const api=await wolfRamFixture(),{f}=api;f.player.position.set(0,0,WOLF_V02_BY_ID.lunge.preferredDistance);
 await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;e.brain.random=()=>.5;e.brain.configureAttacks({custom:true,sequence:['lunge'],speed});
 let serial=null,attackStart=null,attackEnd=null,firstDamage=null,lastHp=e.playerHp;const damage=[],rows=[];
 for(let frame=0;frame<fps*18;frame++){
  api.step(1/fps);const time=api.elapsed;
  if(e.brain.mode==='attack'&&!serial){serial=e.brain.serial;attackStart=time;}
  if(serial&&e.brain.serial!==serial&&attackEnd===null)attackEnd=time;
  if(e.playerHp<lastHp){damage.push({time,amount:lastHp-e.playerHp,sourceTime:e.brain.time,contact:structuredClone(e.v02LastContact),controllerState:api.controller.state,body:api.bodyPoints()});firstDamage??=time;}lastHp=e.playerHp;
  if(serial)rows.push({time,sourceTime:e.brain.time,mode:e.brain.mode,wolfState:e.brain.state,wolfSerial:e.brain.serial,playerState:api.result.state,playerClipTime:api.result.clipTime,playerRoot:f.player.position.asArray(),body:api.bodyPoints()});
  if(firstDamage!==null&&time>firstDamage+3.4)break;
 }
 cases.push({fps,speed,attackStart,attackEnd,damage,reactions:api.reactions,rows});await api.dispose();
}
fs.writeFileSync('reports/wolf-v02-ram-r12/baseline-r11.json',JSON.stringify({scope:'Pre-R12 autonomous real warrior controller+animator and wolf pipeline. Current single lunge mouth strike triggers a real fall, but has no later maul phases. Untouched summon/rise and observation retained.',hashes,cases},null,2)+'\n');
console.log(JSON.stringify(cases.map(({rows,...c})=>c),null,2));
