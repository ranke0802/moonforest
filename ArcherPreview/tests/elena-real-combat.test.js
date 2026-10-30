import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,StandardMaterial,VertexBuffer,Matrix} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {BossBattle} from '../src/boss-battle.js';
import {CharacterAnimator} from '../src/animation.js';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {PlayerStrikeSampler,PLAYER_STRIKE_AIM_YAW} from '../src/player-strikes.js';
import {orderPoseNodes,refreshPoseMatrices} from '../src/pose-matrices.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter,ARENA_RADIUS} from '../src/world-limits.js';
import {dodgeDistanceAt} from '../src/dodge.js';
import {constrainDodge} from '../src/dodge-collision.js';
import {ELENA_HOME,MOURNING_SPELLS,MOURNING_SIZE,spellImpact} from '../src/elena-spec.js';
import {spellContains} from '../src/elena-ground-magic.js';
import {bladeTouchesCapsule,segmentDistanceSquared} from '../src/melee-collision.js';

const base=new URL('../public/assets/',import.meta.url),round=n=>Math.round(n*1e5)/1e5;
let previousReport;try{previousReport=JSON.parse(readFileSync(new URL('../reports/elena-clearance/combat-audit.json',import.meta.url)));}catch{}
const direction=i=>({x:Math.sin(i*Math.PI/4),z:Math.cos(i*Math.PI/4)});
async function load(scene,name){
  const config=JSON.parse(readFileSync(new URL(name+'.json',base))),source=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(source.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  for(const group of container.animationGroups)group.stop();for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial('offline-contact',scene);
  return {config,container,loader};
}
async function fixture(t){
  setWorldCharacter('warrior-v5');const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
  Object.assign(engine.getCaps(),{textureFloat:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
  const witch=await load(scene,'mourning-elena'),warrior=await load(scene,'warrior-v3'),player=new TransformNode('actual-player',scene);
  warrior.container.addAllToScene();for(const node of new Set([...warrior.container.meshes,...warrior.container.transformNodes]))if(!node.parent)node.parent=player;
  player.scaling.setAll(warrior.config.scale);player.position.set(29,6,-21);
  const models=new BossModelLibrary(scene,'mourning-elena');models.config=witch.config;models.container=witch.container;models.load=async()=>{};
  const world={scene,cave:true,terrain:createWitchCaveTerrain(),navigation:new CaveNavigation(caveObstacles()),shadows:{addShadowCaster(){},removeShadowCaster(){}}};
  const f={engine,scene,world,player,witch,warrior,events:[],sampler:new PlayerStrikeSampler()};
  f.battle=new BossBattle(world,()=>{},(...event)=>f.events.push(event),(dt,options)=>{const reacted=f.controller.hit(dt,options);if(reacted)f.sampler.reset();return reacted;},{mourningModels:models});
  f.battle.residentPhase=2;await f.battle.activateResident(player);f.e=f.battle.mourningPool[0];f.e.renderVisible=true;
  f.nodes=orderPoseNodes([player,...warrior.container.meshes,...warrior.container.transformNodes]);
  const all=[...warrior.container.transformNodes,...warrior.container.meshes];f.sword=all.find(n=>n.name==='Golden_Oathblade');f.shield=all.find(n=>n.name==='Bunnyguard_Shield');assert.ok(f.sword&&f.shield);
  f.battle.playerNodes=Object.fromEntries(warrior.container.transformNodes.map(n=>[n.name,n]));
  t.after(()=>{f.animator?.dispose();f.battle.hide();for(const asset of [witch,warrior]){asset.container.dispose();asset.loader.dispose();}scene.dispose();engine.dispose();setWorldCharacter('warrior');});return f;
}
function reset(f,angle,distance=f.e.radius+.25,{review=true,pose='idle',poseTime=0}={}){
  f.animator?.dispose();f.animator=new CharacterAnimator(f.warrior.container.animationGroups,f.warrior.config.animations);f.controller=new WarriorV2Controller({durations:f.animator.durations,speeds:f.warrior.config.speeds});
  f.sampler.reset();f.events.length=0;f.battle.combat.reset();f.e.gate.reset();f.e.brain.hp=1800;f.e.brain.stagger=0;f.e.brain.start('idle','idle');f.e.brain.wait=100;f.e.knockVelocity.setAll(0);f.e.bossReaction.reset();f.e.dodgeContactClearance=false;
  f.e.reviewMode=review;f.e.reviewMovement={x:0,z:0};f.e.actor.position.set(ELENA_HOME.x,0,ELENA_HOME.z);f.world.terrain.place(f.e.actor.position);f.e.actor.rotation.y=0;f.e.home=ELENA_HOME;f.e.spell.reset();f.e.repositionTarget=null;f.e.chargeOrigin=null;f.e.animator.reset();
  const dir=direction(angle);f.player.position.set(ELENA_HOME.x+dir.x*distance,0,ELENA_HOME.z+dir.z*distance);f.world.terrain.place(f.player.position);f.player.rotation.y=Math.atan2(-dir.x,-dir.z);
  f.animator.transition('idle',{clipTime:0,loop:true});f.animator.update(.2);f.scene._animate(0);refreshPoseMatrices(f.nodes);
  if(pose!=='idle'){f.e.animator.transition(pose,{clipTime:poseTime,actionId:f.e.brain.serial});f.e.animator.update(0);}
  f.e.alignPose();refreshPoseMatrices(f.e.poseNodes);f.e.hurtCapsules();return dir;
}
// Same frame order as main.js: controller/root travel, sampled animation,
// boss navigation, scene animation evaluation, real blade/shield contacts.
function step(f,dt,{move=null,roll=null,sample=true}={}){
  const result=f.controller.update(dt,move?{x:move.x,y:move.z,magnitude:1}:{x:0,y:0}),before=f.player.position.clone();
  if(result.rollFrom!=null){const d=dodgeDistanceAt(result.rollTo,f.warrior.config.dodge)-dodgeDistanceAt(result.rollFrom,f.warrior.config.dodge);f.player.position.x+=(roll?.x??0)*d;f.player.position.z+=(roll?.z??0)*d;constrainDodge(f.player.position,before,f.world.navigation,f.battle.encounters,ARENA_RADIUS);}
  else if(result.moving&&move){f.player.position.x+=move.x*result.speed*(result.movementDt??dt);f.player.position.z+=move.z*result.speed*(result.movementDt??dt);f.world.navigation.constrain(f.player.position,before,.32,ARENA_RADIUS);}
  f.world.terrain.place(f.player.position);f.animator.transition(result.state,result);f.animator.update(result.captured||result.staggered||result.hitStopped?0:dt);
  f.battle.update(dt,f.player);f.scene._animate(0);refreshPoseMatrices(f.nodes);
  const strike=sample?f.sampler.sample(result,f.sword,f.shield,true,f.player.rotation.y,5):null;
  const stop=f.battle.poseAndContacts(f.player,result,strike,f.shield);f.controller.pauseOnImpact(stop||0);
  return {result,strike};
}
function save(report){if(process.env.ELENA_CLEARANCE_REPORT==='1'){const dir=new URL('../reports/elena-clearance/',import.meta.url);mkdirSync(dir,{recursive:true});report.baseline=previousReport?.baseline??(previousReport?{generatedAt:previousReport.generatedAt,melee:previousReport.melee,escape:previousReport.escape.map(({closest,best,...row})=>({...row,best:best?{...best,path:undefined}:undefined}))}:undefined);writeFileSync(new URL('combat-audit.json',dir),JSON.stringify(report,null,2)+'\n');}}
function nearestContact(strike,capsules,delta){
  let closest={gap:Infinity},reduction=Infinity;
  for(const contact of strike.contacts){
    for(const c of capsules)for(let i=0;i<=8;i++){
      const blade=contact.blade.map((p,k)=>p.map((v,j)=>contact.previous[k][j]+(v-contact.previous[k][j])*i/8));
      const gap=Math.sqrt(segmentDistanceSquared(...blade,...c.points))-c.radius-strike.bladeRadius;
      if(gap<closest.gap)closest={gap,name:c.name};
    }
    for(let amount=0;amount<=1.001&&amount<reduction;amount+=.05){
      if(capsules.some(c=>bladeTouchesCapsule(contact.previous,contact.blade,c.points.map(p=>[p[0]+delta.x*amount,p[1],p[2]+delta.z*amount]),c.radius+strike.bladeRadius,contact.lateral)))reduction=amount;
    }
  }
  return {...closest,reduction};
}
function nearestSkin(f,strike){
  const body=f.e.asset.meshes.find(m=>m.morphTargetManager&&!m.metadata?.moonforestOutline);body.skeleton.prepare(true);
  const matrices=body.skeleton.getTransformMatrices(body),positions=body.getVerticesData(VertexBuffer.PositionKind),joints=body.getVerticesData(VertexBuffer.MatricesIndicesKind),weights=body.getVerticesData(VertexBuffer.MatricesWeightsKind),targets=body.morphTargetManager,world=body.getWorldMatrix(),matrix=Matrix.Identity(),p=new Vector3(),q=new Vector3();let best={distance:Infinity};
  const names=Object.fromEntries(body.skeleton.bones.map((b,i)=>[b.getIndex()??i,b.name]));
  const coreGaps=strike.contacts.length?[]:Array.from({length:8},(_,angle)=>[2.55,2.35,2.2,2.15].map(distance=>({angle:angle*45,distance,gap:Infinity,bone:null}))).flat();
  const head=f.warrior.container.transformNodes.find(n=>n.name==='mixamorig:Head').getAbsolutePosition(),axisTop=head.y;
  for(let i=0;i<positions.length/3;i++){
    p.copyFromFloats(positions[i*3],positions[i*3+1],positions[i*3+2]);
    for(let k=0;k<targets.numTargets;k++){const m=targets.getTarget(k);if(m.influence){const a=m.getPositions();p.x+=(a[i*3]-positions[i*3])*m.influence;p.y+=(a[i*3+1]-positions[i*3+1])*m.influence;p.z+=(a[i*3+2]-positions[i*3+2])*m.influence;}}
    q.setAll(0);let dominant=0;for(let j=0;j<4;j++){const w=weights[i*4+j];if(w>weights[i*4+dominant])dominant=j;if(w){Matrix.FromArrayToRef(matrices,joints[i*4+j]*16,matrix);q.addInPlace(Vector3.TransformCoordinates(p,matrix).scaleInPlace(w));}}
    const point=Vector3.TransformCoordinates(q,world).asArray();
    for(const trial of coreGaps){const dir=direction(trial.angle/45),x=f.e.actor.position.x+dir.x*trial.distance,z=f.e.actor.position.z+dir.z*trial.distance,feet=f.world.terrain.heightAt(x,z),axis=[[x,feet+.32,z],[x,feet+(axisTop-f.player.position.y),z]],gap=Math.sqrt(segmentDistanceSquared(...axis,point,point))-.32;if(gap<trial.gap){trial.gap=gap;trial.bone=names[joints[i*4+dominant]];trial.point=point;}}
    for(const c of strike.contacts)for(let j=0;j<=8;j++){const blade=c.blade.map((p,k)=>p.map((v,l)=>c.previous[k][l]+(v-c.previous[k][l])*j/8)),distance=Math.sqrt(segmentDistanceSquared(...blade,point,point));if(distance<best.distance)best={distance,bone:names[joints[i*4+dominant]],point};}
  }
  return {...best,distance:round(best.distance),surfaceGap:round(best.distance-strike.bladeRadius),playerCapsule:{radius:.32,axisTopAboveFeet:round(axisTop-f.player.position.y),coreGaps:coreGaps.map(r=>({...r,gap:round(r.gap)}))}};
}
function prepareHazard(f,angle,pattern){
  reset(f,angle,6,{review:false});
  if(pattern==='charge'){f.e.brain.movementTurn=3;f.e.brain.reposition();}
  else {f.e.brain.nextSpell=MOURNING_SPELLS.findIndex(s=>s.pattern===pattern);f.e.brain.cast();}
  step(f,0,{sample:false});return f.e.spell.plan;
}
function prepareHorizontalCharge(f,reverse=false){
  reset(f,0,6,{review:false});f.e.actor.position.set(reverse?31.8:25.5,0,-24.125);f.world.terrain.place(f.e.actor.position);
  f.player.position.set(reverse?25.8:31.5,0,-24.125);f.world.terrain.place(f.player.position);f.player.rotation.y=reverse?Math.PI/2:-Math.PI/2;
  f.e.brain.movementTurn=3;f.e.brain.reposition();step(f,0,{sample:false});assert.equal(f.e.brain.moveKind,'charge','known full-pose-safe horizontal corridor must actually charge');return f.e.spell.plan;
}
function escapeRoute(f,plan,fps,angle,kind,seconds){
  const controller=new WarriorV2Controller({durations:f.animator.durations,speeds:f.warrior.config.speeds}),p=f.player.position.clone(),dir=direction(angle),path=[];let started=false,firstOutside=null,legal=true,escaped=false;
  for(let frame=1;frame<=Math.ceil(seconds*fps);frame++){
    const time=frame/fps,react=time>=.2,previous=p.clone();if(react&&!started){started=true;if(kind==='dodge')controller.dodge();}
    const result=controller.update(1/fps,react&&!escaped?{x:dir.x,y:dir.z}:{});
    if(result.rollFrom!=null){const d=dodgeDistanceAt(result.rollTo,f.warrior.config.dodge)-dodgeDistanceAt(result.rollFrom,f.warrior.config.dodge);p.x+=dir.x*d;p.z+=dir.z*d;constrainDodge(p,previous,f.world.navigation,f.battle.encounters,ARENA_RADIUS);}
    else if(result.moving){p.x+=dir.x*result.speed*(result.movementDt??1/fps);p.z+=dir.z*result.speed*(result.movementDt??1/fps);f.world.navigation.constrain(p,previous,.32,ARENA_RADIUS);}
    f.world.terrain.place(p);legal&&=f.world.navigation.free(p,.32);if(!spellContains(plan,p)&&firstOutside===null)firstOutside=time;if(!spellContains(plan,p,{radius:.35}))escaped=true;
    path.push(p.asArray().map(round));
  }
  return {angle:angle*45,kind,legal,safe:!spellContains(plan,p),firstOutside:firstOutside===null?null:round(firstOutside),end:p.asArray().map(round),path};
}
function replayEscape(f,fps,route,seconds){
  let started=false,fireAt=null,warningDamage=false,outsideAtFire=null,escaped=false,allFramesLegal=true,maxBossTravel=0;const hp=f.battle.playerHp,dir=direction(route.angle/45),origin=f.e.actor.position.clone(),warning=f.e.brain.mode==='attack'?f.e.brain.castWarningDuration:.9;f.player.rotation.y=Math.atan2(dir.x,dir.z);
  for(let frame=1;frame<=Math.ceil(seconds*fps);frame++){
    const time=frame/fps,react=time>=.2;if(react&&!started){started=true;if(route.kind==='dodge')f.controller.dodge();}
    const wasFired=f.e.spell.fired;step(f,1/fps,{move:react&&!escaped?dir:null,roll:dir,sample:false});if(f.e.spell.plan&&!spellContains(f.e.spell.plan,f.player.position,{radius:.35}))escaped=true;
    if(!wasFired&&f.e.spell.fired){fireAt=time;outsideAtFire=!spellContains(f.e.spell.plan,f.player.position);}
    if(time<warning-1/fps&&f.battle.playerHp<hp)warningDamage=true;allFramesLegal&&=f.world.navigation.free(f.player.position,.32);maxBossTravel=Math.max(maxBossTravel,Vector3.Distance(origin,f.e.actor.position));
  }
  return {damage:hp-f.battle.playerHp,fireAt:fireAt===null?null:round(fireAt),outsideAtFire,warningDamage,end:f.player.position.asArray().map(round),legal:allFramesLegal,maxBossTravel:round(maxBossTravel),events:f.events.filter(e=>['block','evade','player'].includes(e[3])).map(e=>e[3])};
}

test('actual packed player attacks and authored dodge paths work around the enlarged r8 witch',async t=>{
  const f=await fixture(t),report={generatedAt:new Date().toISOString(),scope:'Actual warrior-v3 packed rig; original geometry and animation, texture loading skipped. No arbitrary skin-point blade probes.',player:{model:f.warrior.config.model,scale:f.warrior.config.scale,runSpeed:f.controller?.runSpeed??f.warrior.config.speeds.run,dodgeDistance:Math.max(...f.warrior.config.dodge.forward)},witch:{model:f.witch.config.model,scale:f.e.actor.scaling.x,radius:f.e.radius,home:ELENA_HOME},melee:[],outOfReach:[],escape:[],horizontalCharge:[]};
  try{
    reset(f,0);if(process.env.ELENA_CLEARANCE_REPORT==='1')report.uprightPlayerBodyClearance=nearestSkin(f,{contacts:[],bladeRadius:0}).playerCapsule;
    for(const approach of [false,true])for(const fps of [30,60])for(let angle=0;angle<8;angle++)for(const attack of ['attack','slash','judgment','shieldPush']){
      const dir=reset(f,angle,approach?3.6:f.e.radius+.25);const startFree=f.world.navigation.free(f.player.position,.32);
      if(approach)for(let frame=0;frame<Math.ceil(fps*.35);frame++)step(f,1/fps,{move:{x:-dir.x,z:-dir.z}});
      const before=f.e.hitCount,hp=f.e.brain.hp,position=f.player.position.asArray(),free=f.world.navigation.free(f.player.position,.32);let bladeMinY=Infinity,bladeMaxY=-Infinity,closest={gap:Infinity},reduction=Infinity,skin=null;
      f.player.rotation.y+=(PLAYER_STRIKE_AIM_YAW[attack]??0);if(attack==='shieldPush')f.controller.shieldPush();else f.controller.startAttack(attack);
      for(let frame=0;frame<fps*4;frame++){const {strike}=step(f,1/fps);if(strike?.contacts.length){for(const contact of strike.contacts)for(const point of contact.blade){bladeMinY=Math.min(bladeMinY,point[1]-f.player.position.y);bladeMaxY=Math.max(bladeMaxY,point[1]-f.player.position.y);}if(['judgment','shieldPush'].includes(attack)){const near=nearestContact(strike,f.e.hurtCapsules(),dir);if(near.gap<closest.gap){closest=near;if(process.env.ELENA_CLEARANCE_REPORT==='1'&&!approach&&fps===60&&angle===0)skin=nearestSkin(f,strike);}reduction=Math.min(reduction,near.reduction);}}if(!f.controller.action&&frame>fps/4)break;}
      report.melee.push({fps,angle:angle*45,attack,approach,feet:position.map(round),startWalkable:startFree,walkable:free,distance:round(Vector3.Distance(f.player.position,f.e.actor.position)),hits:f.e.hitCount-before,damage:hp-f.e.brain.hp,activeBladeHeight:[bladeMinY,bladeMaxY].map(round),nearest:closest.name?{name:closest.name,gap:round(closest.gap),minimumGapReduction:round(reduction)}:undefined,closestSkinAtNearestCapsuleFrame:skin??undefined});
    }
    t.diagnostic(JSON.stringify({melee:report.melee.length,swordHits:report.melee.filter(x=>x.attack!=='shieldPush'&&x.hits).length,shieldPushHits:report.melee.filter(x=>x.attack==='shieldPush'&&x.hits).length}));
    for(const fps of [30,60])for(let angle=0;angle<8;angle++)for(const attack of ['attack','slash','judgment']){
      reset(f,angle,8);const legal=f.world.navigation.free(f.player.position,.32);if(!legal)continue;const before=f.e.hitCount;
      f.player.rotation.y+=(PLAYER_STRIKE_AIM_YAW[attack]??0);f.controller.startAttack(attack);
      for(let frame=0;frame<fps*4;frame++){step(f,1/fps);if(!f.controller.action&&frame>fps/4)break;}
      const hits=f.e.hitCount-before;report.outOfReach.push({fps,angle:angle*45,attack,distance:8,hits});assert.equal(hits,0,'far real blade cannot hit the enlarged target');
    }
    save(report);
    for(const fps of [30,60])for(let angle=0;angle<8;angle++)for(const pattern of ['charge',...MOURNING_SPELLS.map(s=>s.pattern)]){
      const plan=prepareHazard(f,angle,pattern),walkable=f.world.navigation.free(f.player.position,.32),row={fps,angle:angle*45,pattern,walkable,feet:f.player.position.asArray().map(round)};report.escape.push(row);
      if(!walkable){row.unavailable='starting spoke is not walkable at six metres';continue;}
      if(!plan||pattern==='charge'&&f.e.brain.moveKind!=='charge'){row.unavailable='charge rejected by actual navigation/terrain';continue;}
      row.startsInside=spellContains(plan,f.player.position);row.warningSeconds=pattern==='charge'?.9:f.e.brain.castWarningDuration??spellImpact(f.e.brain.spell,f.e.brain.durations.cast)/f.e.brain.attackPlaybackRate;
      const routes=[];for(const kind of ['run','dodge'])for(let heading=0;heading<16;heading++)routes.push(escapeRoute(f,plan,fps,heading/2,kind,row.warningSeconds));
      // Retain engagement: merely running out of detection and canceling the
      // spell is not evidence that its release collision matches the floor.
      const safe=routes.filter(r=>r.legal&&r.safe&&Math.hypot(r.end[0]-plan.origin.x,r.end[2]-plan.origin.z)<MOURNING_SIZE.engagementRange-.2).sort((a,b)=>a.firstOutside-b.firstOutside);row.legalEscapeRoutes=safe.length;row.runEscapes=safe.filter(r=>r.kind==='run').length;row.dodgeEscapes=safe.filter(r=>r.kind==='dodge').length;
      if(!safe.length){row.preparationCandidates=[];for(const extra of [.15,.25,.35,.45,.55,.65]){const extraRoutes=[];for(const kind of ['run','dodge'])for(let heading=0;heading<16;heading++)extraRoutes.push(escapeRoute(f,plan,fps,heading/2,kind,row.warningSeconds+extra));row.preparationCandidates.push({extra,runEscapes:extraRoutes.filter(r=>r.legal&&r.safe&&r.kind==='run').length,dodgeEscapes:extraRoutes.filter(r=>r.legal&&r.safe&&r.kind==='dodge').length});}}
      if(safe.length){row.best=safe[0];prepareHazard(f,angle,pattern);row.replay=replayEscape(f,fps,row.best,pattern==='charge'?2.18:row.warningSeconds+.1);}
      else row.closest=routes.filter(r=>r.legal).map(({path,...r})=>r);
      // Real shield animation and collider: one button press at the same 200 ms
      // reaction delay. The gameplay route, not a synthetic action flag, blocks.
      prepareHazard(f,angle,pattern);let shieldStarted=false,firstLoss=null;const hp=f.battle.playerHp;
      for(let frame=1;frame<=Math.ceil((pattern==='charge'?2.18:row.warningSeconds+.1)*fps);frame++){if(frame/fps>=.2&&!shieldStarted){f.controller.shieldPush();shieldStarted=true;}step(f,1/fps,{sample:false});if(f.battle.playerHp<hp&&firstLoss===null)firstLoss=frame/fps;}
      row.shield={damage:hp-f.battle.playerHp,firstLoss,blocks:f.events.filter(e=>e[3]==='block').length};
      if(!safe.length){row.timedDodges=[];for(const delay of [.2,.4,.6,.8]){
        prepareHazard(f,angle,pattern);const dir=direction(angle+2);f.player.rotation.y=Math.atan2(dir.x,dir.z);let started=false,stateAtImpact=null;const hp=f.battle.playerHp;
        for(let frame=1;frame<=Math.ceil((row.warningSeconds+.15)*fps);frame++){if(frame/fps>=delay&&!started){started=true;f.controller.dodge();}const fired=f.e.spell.fired,{result}=step(f,1/fps,{roll:dir,sample:false});if(!fired&&f.e.spell.fired)stateAtImpact=result.state;}
        row.timedDodges.push({delay,damage:hp-f.battle.playerHp,stateAtImpact,evades:f.events.filter(e=>e[3]==='evade').length,end:f.player.position.asArray().map(round)});
      }}
    }
    t.diagnostic(JSON.stringify({escapeCases:report.escape.length,unavailable:report.escape.filter(x=>x.unavailable).length,noEscape:report.escape.filter(x=>!x.unavailable&&!x.legalEscapeRoutes).map(({closest,...r})=>r),failedReplays:report.escape.filter(x=>x.replay?.damage)}));
    report.chargeStandingControls=[];
    for(const fps of [30,60])for(const reverse of [false,true]){
      prepareHorizontalCharge(f,reverse);f.player.rotation.y=reverse?-Math.PI/2:Math.PI/2;const hp=f.battle.playerHp;let early=false;
      for(let frame=1;frame<=Math.ceil(2.18*fps);frame++){step(f,1/fps,{sample:false});if(frame/fps<.9&&f.battle.playerHp<hp)early=true;}
      const row={fps,reverse,damage:hp-f.battle.playerHp,hits:f.events.filter(e=>e[3]==='player').length,early};report.chargeStandingControls.push(row);assert.ok(row.damage>0,'a real, unguarded stationary player must be hit by this charge');assert.equal(row.hits,1);assert.equal(row.early,false);
    }
    for(const fps of [30,60])for(const reverse of [false,true])for(let heading=0;heading<8;heading++)for(const kind of ['run','dodge']){
      const plan=prepareHorizontalCharge(f,reverse),origin={...plan.origin},target={...f.e.repositionTarget},replay=replayEscape(f,fps,{angle:heading*45,kind},2.18);
      report.horizontalCharge.push({fps,reverse,heading:heading*45,kind,origin,target,...replay,chargeResolved:f.e.chargeResolved});
      assert.equal(replay.warningDamage,false);assert.equal(replay.legal,true);assert.equal(replay.damage,0,'the original controller must escape or defend this warned charge');assert.ok(replay.events.filter(e=>e==='player').length<=1,'a charge may damage once');
    }
    t.diagnostic(JSON.stringify({horizontalChargeProbes:report.horizontalCharge.length,zeroDamage:report.horizontalCharge.filter(r=>!r.damage).length,dodgeEvades:report.horizontalCharge.filter(r=>r.kind==='dodge'&&r.events.includes('evade')).length}));
    report.summary={swordAttacks:report.melee.filter(r=>r.attack!=='shieldPush').length,swordHits:report.melee.filter(r=>r.attack!=='shieldPush'&&r.hits).length,farAttacks:report.outOfReach.length,farHits:report.outOfReach.reduce((sum,r)=>sum+r.hits,0),spellEscapes:report.escape.filter(r=>r.pattern!=='charge'&&r.replay?.fireAt!==null&&!r.unavailable).length,unsafeChargeRoutesRejected:report.escape.filter(r=>r.pattern==='charge'&&r.unavailable).length,horizontalChargeProbes:report.horizontalCharge.length,chargeClearOfPath:report.horizontalCharge.filter(r=>!r.events.length).length,chargeBlocks:report.horizontalCharge.filter(r=>r.events.includes('block')).length,chargeDodgeFrames:report.horizontalCharge.filter(r=>r.events.includes('evade')).length,stationaryChargeControls:report.chargeStandingControls,warningSeconds:.65+1.65/1.6,notes:['Exact original packed player rig and sword/shield meshes; texture upload and GPU rendering are outside this CPU contact test.','Shield-push attacks retain their actual short reach: 12 of 32 close attempts touch; no inflated hitbox was added.','The conservative upright player cylinder is only a geometric diagnostic, not an additional gameplay hit volume.','All successful spell escape replays stop outside the displayed footprint, retain engagement, and observe the actual release.']};
  }finally{save(report);}
  assert.equal(report.melee.filter(x=>!x.walkable||!x.startWalkable).length,0,'all attack feet start and finish their approach on legal standing surfaces');
  assert.equal(report.melee.filter(x=>x.attack!=='shieldPush'&&!x.hits).length,0,'all eight reachable directions accept all three real sword attacks');
  const possible=report.escape.filter(x=>!x.unavailable);assert.ok(possible.length>=60,'fixture covers most home spokes, both frame rates and all hazards');
  for(const row of possible){
    assert.ok(row.startsInside,JSON.stringify({row,reason:'a valid escape must start in the warning'}));
    assert.ok(row.legalEscapeRoutes>0,`${row.fps}fps ${row.angle}deg ${row.pattern} has no legal escape`);
    assert.equal(row.replay.damage,0);assert.equal(row.replay.warningDamage,false);assert.equal(row.replay.legal,true);assert.equal(row.shield.damage,0);
    if(row.pattern!=='charge'){assert.ok(row.replay.fireAt!==null,'cast must actually release, not disappear after disengagement');assert.equal(row.replay.outsideAtFire,true);assert.ok(Math.abs(row.replay.fireAt-row.warningSeconds)<=1/row.fps+1e-4);}
  }
});
