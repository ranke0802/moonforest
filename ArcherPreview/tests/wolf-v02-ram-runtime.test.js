import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {CharacterAnimator} from '../src/animation.js';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {configurePlayerSize} from '../src/player-dimensions.js';
import {wolfHuntFixture,beginWolfHunt} from './helpers/wolf-hunt-fixture.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {WOLF_V02_ACTIONS,WOLF_V02_BY_ID,WOLF_V02_GAIT,WOLF_V02_ORBIT,WOLF_V02_BRACE,WOLF_V02_DEATH,WOLF_V02_KNOCKBACK_SCALE,WOLF_V02_RAM_PHASES,WolfV02Brain,advanceWolfActionElapsed,actionDuration,sampleWhipTime,whipElapsedAt} from '../src/wolf-v02-spec.js';

export async function ramFixture(t){
 const f=await wolfHuntFixture(t),base=new URL('../public/assets/',import.meta.url),config=JSON.parse(fs.readFileSync(new URL('warrior-v3.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(name=>name!=='EXT_meshopt_compression'&&name!=='KHR_texture_basisu');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(f.scene,{json:gltf},'');container.addAllToScene();
 for(const group of container.animationGroups)group.stop();for(const node of new Set([...container.meshes,...container.transformNodes]))if(!node.parent)node.parent=f.player;configurePlayerSize(f.player,config,{warrior:true});
 for(const mesh of container.meshes)if(mesh.skeleton)mesh.skeleton.useTextureToStoreBoneMatrices=true;
 const animator=new CharacterAnimator(container.animationGroups,config.animations),controller=new WarriorV2Controller({durations:animator.durations,speeds:config.speeds,staminaEnabled:false}),nodes=Object.fromEntries(container.transformNodes.map(node=>[node.name,node]));
 f.battle.playerNodes=nodes;f.battle.onPlayerHit=(duration,options={})=>options.knockdown?controller.knockdown(options):controller.hit(duration,options);
 const dispose=f.dispose;f.dispose=async()=>{animator.dispose();container.dispose();loader.dispose();await dispose();};
 return {...f,warrior:{config,container,animator,controller,nodes},step(e,dt,input={}){
  f.battle.playerReaction.update(dt,f.player);const result=controller.update(dt,{alive:e.playerHp>0,...input});animator.transition(result.state,result);animator.update(result.captured||result.staggered||result.hitStopped?0:dt);
  f.battle.update(dt,f.player);f.scene.render();f.battle.poseAndContacts(f.player,result,null,null);return result;
 }};
}

function resetWarrior(f){
 Object.assign(f.warrior.controller,new WarriorV2Controller({durations:f.warrior.animator.durations,speeds:f.warrior.config.speeds,staminaEnabled:false}));
 f.warrior.controller.captured=false;f.warrior.controller.capturePose=null;f.warrior.animator.resetForReuse();
}
function drive(f,e,{fps=60,hitches=false,repeat=false,afterStep=()=>{}}={}){
 const hits=[];let wall=0,hp=e.playerHp,firstHitch=false,secondHitch=false;
 for(let frame=0;frame<fps*14&&['attack','ramRecover'].includes(e.brain.mode);frame++){
  let dt=1/fps;
  if(hitches&&e.brain.mode==='attack'){
   if(!firstHitch&&e.brain.time>=3.60&&e.brain.time<3.64){dt=.1;firstHitch=true;}
   else if(!secondHitch&&e.brain.time>=4.15&&e.brain.time<4.19){dt=.1;secondHitch=true;}
  }
  const result=f.step(e,dt);wall+=dt;
  if(repeat)for(let i=0;i<4;i++)f.battle.poseAndContacts(f.player,result,null,null);
  if(e.playerHp!==hp){hits.push({wall,damage:hp-e.playerHp,phase:e.v02LastContact?.phase??e.inspect().ram.phase,source:e.brain.time,result:{state:result.state,knockedDown:result.knockedDown},chestHeight:f.warrior.nodes['mixamorig:Spine2'].getAbsolutePosition().y-f.player.position.y,contact:e.v02LastContact});hp=e.playerHp;}
  afterStep({result,wall,hits});
 }
 return {hits,wall,firstHitch,secondHitch};
}

test('R12 changes only lunge metadata and leaves approved R11 actions, gait and reaction/observation methods exact',()=>{
 const before=JSON.parse(fs.readFileSync(new URL('../reports/wolf-v02-ram-r12/runtime-preservation-before.json',import.meta.url)));
 assert.deepEqual(WOLF_V02_ACTIONS.filter(action=>action.id!=='lunge'),before.actions);assert.deepEqual(WOLF_V02_GAIT,before.gait);assert.deepEqual(WOLF_V02_ORBIT,before.orbit);
 assert.equal(WOLF_V02_BRACE,before.brace);assert.equal(WOLF_V02_DEATH,before.death);assert.equal(WOLF_V02_KNOCKBACK_SCALE,before.knockbackScale);
 for(const [name,source]of Object.entries(before.methods))assert.equal(WolfV02Brain.prototype[name].toString().replaceAll('\r\n','\n'),source.replaceAll('\r\n','\n'),name+' remains the approved R11 behavior');
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../src/wolf-v02-locomotion.js',import.meta.url))).digest('hex'),before.sourceHashes['src/wolf-v02-locomotion.js']);
 assert.equal(WOLF_V02_RAM_PHASES.reduce((sum,phase)=>sum+phase.damage,0),100);
});

test('prefix speed remains configurable while the two mauls follow the unchanged natural fall clock',()=>{
 const action=WOLF_V02_BY_ID.lunge,boundary=whipElapsedAt(action,2.62);
 for(const fps of [30,60])for(const speed of [.5,1,2]){
  let elapsed=0,wall=0,ram=null,first=null,second=null,previous=0;
  for(let i=0;i<fps*14&&elapsed<actionDuration(action);i++){
   elapsed=Math.min(actionDuration(action),advanceWolfActionElapsed(action,elapsed,1/fps,speed));wall+=1/fps;const source=sampleWhipTime(action,elapsed);assert.ok(source>=previous);previous=source;
   if(ram===null&&elapsed>=boundary)ram=wall;if(first===null&&source>=3.65)first=wall;if(second===null&&source>=4.20)second=wall;
  }
  assert.ok(Math.abs(ram-boundary/speed)<=1/fps+1e-7);assert.ok(Math.abs((first-ram)-1.03)<=2/fps+1e-7);assert.ok(Math.abs((second-ram)-1.58)<=2/fps+1e-7);
 }
});

test('real warrior receives one accepted head ram and two real prone jaw phases, with one recoil and no capture',async t=>{
 const f=await ramFixture(t),react=f.battle.onPlayerHit;let reactions=[];
 f.battle.onPlayerHit=(duration,options={})=>{const accepted=react(duration,options);reactions.push({options,accepted});return accepted;};
 for(const fps of [30,60])for(const speed of [.5,1,2]){
  resetWarrior(f);reactions=[];const e=await beginWolfHunt(f,'lunge',{z:WOLF_V02_BY_ID.lunge.preferredDistance,speed}),start=f.player.position.clone(),run=drive(f,e,{fps,repeat:true});
  assert.deepEqual(run.hits.map(hit=>hit.damage),[40,30,30]);assert.deepEqual(run.hits.map(hit=>hit.phase),['ram','maul-1','maul-2']);assert.equal(run.hits[0].contact.part,'head');
  for(const hit of run.hits.slice(1)){assert.equal(hit.contact.part,'jaw');assert.equal(hit.contact.prone,true);assert.equal(hit.result.state,'knockdown');assert.equal(hit.result.knockedDown,true);assert.ok(hit.chestHeight<.45);}
  assert.equal(reactions.filter(row=>row.options.knockdown&&row.accepted===true).length,1);assert.equal(reactions.filter(row=>'captured'in row.options).length,0);assert.equal(f.battle.combat.grabOwner,null);
  assert.ok(Math.abs(Vector3.Distance(start,f.player.position)-.28)<1e-5,'mauls cannot add recoil or teleport the player');
  const state=e.inspect().ram;assert.deepEqual(state.phases.map(phase=>phase.acceptedKnockdown),[true,false,false]);assert.equal(new Set(state.phases.map(phase=>phase.serial)).size,3);assert.ok(state.phases.every(phase=>phase.resolved));
 }
});

test('a bounded .1-second hitch crossing each maul window still resolves each actual-prone phase once',async t=>{
 const f=await ramFixture(t),e=await beginWolfHunt(f,'lunge',{z:WOLF_V02_BY_ID.lunge.preferredDistance}),run=drive(f,e,{hitches:true,repeat:true});
 assert.equal(run.firstHitch,true);assert.equal(run.secondHitch,true);assert.deepEqual(run.hits.map(hit=>hit.damage),[40,30,30]);
 for(const hit of run.hits.slice(1)){const phase=WOLF_V02_RAM_PHASES.find(phase=>phase.id===hit.phase);assert.ok(hit.contact.sourceTime>=phase.contactStart-1e-8&&hit.contact.sourceTime<=phase.contactEnd+1e-8,JSON.stringify({phase:phase.id,source:hit.source,contact:hit.contact}));assert.ok(hit.chestHeight<.45);assert.equal(hit.result.state,'knockdown');}
});

test('a refused ram knockdown, missing actual prone bones, or an old life cannot manufacture a maul token',async t=>{
 const f=await ramFixture(t),react=f.battle.onPlayerHit;
 f.battle.onPlayerHit=(duration,options)=>options.knockdown?false:react(duration,options);
 let e=await beginWolfHunt(f,'lunge',{z:WOLF_V02_BY_ID.lunge.preferredDistance}),originalReaction=e.onPlayerHit,run=drive(f,e);
 assert.deepEqual(run.hits.map(hit=>hit.damage),[40]);assert.equal(e.inspect().ram.phases[0].acceptedKnockdown,false);assert.equal(e.inspect().ram.authorized,false);assert.equal(e.onPlayerHit,originalReaction,'the scoped callback is restored');
 f.battle.onPlayerHit=react;resetWarrior(f);e=await beginWolfHunt(f,'lunge',{z:WOLF_V02_BY_ID.lunge.preferredDistance});let removed=false;const nodes=f.battle.playerNodes,chest=nodes['mixamorig:Spine2'];
 try{run=drive(f,e,{afterStep(){if(!removed&&e.inspect().ram.ramHit){delete nodes['mixamorig:Spine2'];removed=true;}}});assert.deepEqual(run.hits.map(hit=>hit.damage),[40]);}
 finally{nodes['mixamorig:Spine2']=chest;}
 f.battle.hide();assert.equal(e.inspect().ram.serial,null);assert.equal(e.inspect().ram.authorized,false);assert.equal(e.inspect().ram.clearanceLease,false);
 resetWarrior(f);e=await beginWolfHunt(f,'lunge',{z:WOLF_V02_BY_ID.lunge.preferredDistance});run=drive(f,e);assert.deepEqual(run.hits.map(hit=>hit.damage),[40,30,30]);
});

test('a victim rising after the first maul cancels damage and takes the planted R12 recovery without a root seek',async t=>{
 const f=await ramFixture(t),e=await beginWolfHunt(f,'lunge',{z:WOLF_V02_BY_ID.lunge.preferredDistance});let forced=false,recovery=null,previous=e.actor.position.clone();
 const run=drive(f,e,{afterStep({hits}){
  if(!forced&&hits.length===2){f.warrior.controller.action.time=f.warrior.animator.durations.knockdown;forced=true;}
  if(!recovery&&e.brain.mode==='ramRecover')recovery={clip:e.brain.state,source:e.brain.time,origin:e.brain.ramRecoveryOrigin,delta:Vector3.Distance(previous,e.actor.position),blend:e.animator.blend};
  previous.copyFrom(e.actor.position);
 }});
 assert.deepEqual(run.hits.map(hit=>hit.damage),[40,30]);assert.ok(recovery);assert.equal(recovery.clip,WOLF_V02_BY_ID.lunge.sourceClip);assert.equal(recovery.source,4.32);assert.equal(recovery.origin,4.32);assert.ok(recovery.delta<1e-6,'seeking the recovery pose cannot move the actor root');assert.ok(recovery.blend<1,'existing pose transition blends the accepted-ram abort');
 assert.equal(e.inspect().ram.authorized,false);
});
