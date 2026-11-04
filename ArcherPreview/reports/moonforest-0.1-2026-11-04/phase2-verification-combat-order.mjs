import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Vector3} from '@babylonjs/core';
import {ActorPopulation} from '../../src/actor-population.js';
import {ACTOR_DEFINITIONS,validateActorSpawn} from '../../src/actor-definitions.js';
import {createActorEncounterFactory} from '../../src/actor-encounter-adapter.js';
import {WarriorV2Controller} from '../../src/warrior-v2.js';
import {createActualActorFixture,sha,drain} from './phase2-verification-fixtures.mjs';
const baseline='2c4ed67',root=fileURLToPath(new URL('../../',import.meta.url)),src=new URL('../../src/',import.meta.url);
const oldSource=execFileSync('git',['show',baseline+':ArcherPreview/src/boss-battle.js'],{cwd:root,encoding:'utf8'}),bound=oldSource.replace(/from\s+(['"])([^'"]+)\1/g,(_all,_quote,spec)=>'from '+JSON.stringify(spec==='@babylonjs/core'?new URL('../../node_modules/@babylonjs/core/index.js',import.meta.url).href:new URL(spec,src).href)),{BossBattle:BaselineBattle}=await import('data:text/javascript;base64,'+Buffer.from(bound).toString('base64'));
const unchanged=['warrior-v2.js','warrior-controller.js','player-combat.js','melee-collision.js','player-strikes.js'],baselineUnchanged={};for(const name of unchanged){const old=execFileSync('git',['show',baseline+':ArcherPreview/src/'+name],{cwd:root,encoding:'utf8'}),now=readFileSync(new URL(name,src),'utf8');baselineUnchanged[name]=sha(old.replace(/\r\n/g,'\n'))===sha(now.replace(/\r\n/g,'\n'));assert.ok(baselineUnchanged[name],name+' input/contact source unchanged');}
const fixtures=[],cases=[];
try{
 for(const old of [true,false]){
  const f=await createActualActorFixture({ids:['guardian-bear','hooded-goblin']});f.world.mapId='village';f.player.position.set(0,0,-40);if(old)f.battle=new BaselineBattle(f.world,()=>{},()=>{},()=>true);
  const create=createActorEncounterFactory({world:f.world,battle:f.battle,getPlayer:()=>f.player,libraryFactory:f.libraryFactory}),population=new ActorPopulation({definitions:ACTOR_DEFINITIONS,createAdapter:create,preparationFactory:f.preparationFactory,validateSpawn:(definition,context)=>validateActorSpawn(definition,f.world,context),limits:{total:2,active:2}}),records=[];
  for(const [index,id]of ['guardian-bear.standard','hooded-goblin.standard'].entries())records.push(await population.spawn(id,{player:f.player,position:new Vector3(index?5:-5,0,5)}));
  const trace=[];for(const record of records){const encounter=record.adapter.encounter;encounter.brain.random=()=>.5;encounter.brain.evadeCooldown=encounter.brain.tauntCooldown=10000;for(const method of ['update','poseAndContacts']){const original=encounter[method];encounter[method]=function(...args){trace.push(encounter.kind+'.'+method);return original.apply(this,args);};}}
  const controller=new WarriorV2Controller({durations:{idle:2,run:.8,slash:1.5,attack:3,judgment:130/30,shieldPush:71/30,dodge:74/30},staminaEnabled:false});controller.dodge();fixtures.push({f,population,create,records,controller,trace,frames:[]});
 }
 for(let frame=0;frame<180;frame++){
  const pair=[];
  for(const fixture of fixtures){
   const {f,controller,population,records,trace}=fixture;if(frame===1)controller.setAttackHeld(true);if(frame===31)controller.setAttackHeld(false);trace.length=0;trace.push('controller.update');const result=controller.update(1/60,{x:0,y:0});population.update(1/60,{player:f.player});f.battle.update(1/60,f.player);f.scene._animate(0);f.battle.poseAndContacts(f.player,result,null,null);population.observe();
   const row={frame,order:[...trace],controller:{state:result.state,actionId:result.actionId??null,serial:controller.serial,queuedAttack:controller.queuedAttack,charge:controller.chargeProgress,events:result.events??[]},actors:records.map(record=>{const encounter=record.adapter.encounter;return {kind:encounter.kind,state:encounter.brain.state,mode:encounter.brain.mode,time:encounter.brain.time,hp:encounter.brain.hp,position:encounter.actor.position.asArray()};})};fixture.frames.push(row);pair.push(row);
  }
  assert.deepEqual(pair[1],pair[0],'production controller/battle/contact order and queued input match immutable phase1 at frame '+frame);
  assert.deepEqual(pair[1].order,['controller.update','bear.update','goblin.update','bear.poseAndContacts','goblin.poseAndContacts']);
 }
 const candidate=fixtures[1].frames,judgment=candidate.find(row=>row.controller.state==='judgment');assert.ok(judgment,'held attack during dodge becomes one queued judgment');assert.equal(judgment.controller.serial,2);
 cases.push({name:'actual boss1+regularenemy retain production input/update/animation/contact order against phase1',passed:true,frames:180,bosses:1,regularEnemies:1,allFramesEqual:true,order:candidate[0].order,firstFrame:candidate[0],firstQueuedJudgmentFrame:judgment,traceSha256:sha(JSON.stringify(candidate)),inputAndContactSourceUnchanged:baselineUnchanged,scope:'Production WarriorV2Controller input queue + actual imported bear/goblin encounter updates/poses/contacts. Player strike sample is null and enemies start far away; this verifies queue/order preservation rather than sword hit accuracy or input latency.'});
}catch(error){cases.push({passed:false,error:error.stack});console.error(error.stack);}
finally{for(const fixture of fixtures){fixture.population.dispose();await fixture.create.dispose();await drain();fixture.f.dispose();}}
const report={generatedAt:new Date().toISOString(),baseline,baselineBattleSourceSha256:sha(oldSource),candidateBattleSourceSha256:sha(readFileSync(new URL('boss-battle.js',src))),passed:cases.every(row=>row.passed),cases};writeFileSync(new URL('phase2-verification-combat-order.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:cases.length,failed:cases.filter(row=>!row.passed)},null,2));if(!report.passed)process.exitCode=1;
