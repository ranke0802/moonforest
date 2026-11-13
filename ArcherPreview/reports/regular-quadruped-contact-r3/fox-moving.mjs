import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {wolfCombatR13Fixture} from '../../tests/helpers/wolf-combat-r13-fixture.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {PlayerMeleeAim as CurrentAim,meleeNeckPoint} from '../../src/player-melee-aim.js';
import {PLAYER_STRIKE_AIM_YAW} from '../../src/player-strikes.js';
import {segmentDistanceSquared} from '../../src/melee-collision.js';
import {regularWolfManifest} from '../../src/regular-wolf-spec.js';
const project=path.resolve(import.meta.dirname,'../../..'),out=import.meta.dirname;
const originalSnapshot=path.join(out,'aim-r2-original.txt');
const raw=fs.existsSync(originalSnapshot)?fs.readFileSync(originalSnapshot):execFileSync('git',['show','HEAD:ArcherPreview/src/player-melee-aim.js'],{cwd:project});
fs.writeFileSync(path.join(out,'aim-r2-original.txt'),raw);fs.writeFileSync(path.join(out,'aim-r2-module.js'),raw.toString().replaceAll("from './","from '../../src/"));
const {PlayerMeleeAim:BaselineAim}=await import('./aim-r2-module.js');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex'),currentStart=hash(fs.readFileSync(new URL('../../src/player-melee-aim.js',import.meta.url)));
const definitions=[{id:'standing-front',position:[0,0,1.15],motion:'watch'},{id:'moving-front',position:[0,0,1.15],motion:'orbit'},{id:'moving-side',position:[1.15,0,0],motion:'orbit'},{id:'outside',position:[0,0,4],motion:'watch'},{id:'moving-side-cooldown',position:[1.15,0,0],motion:'orbit',nativeEvadeCooldown:2}];
const cases=process.env.FOX_CASE?definitions.filter(item=>item.id===process.env.FOX_CASE):definitions.slice(0,4);
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x)),mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const neckOf=capsules=>capsules.find(c=>/^(neck|mane)(\.|$)/.test(c.name??''));
const cloneCaps=capsules=>capsules.map(c=>({name:c.name,points:c.points.map(p=>p.slice()),radius:c.radius}));
function gap(input){
 let best=Infinity,part=null,neck=Infinity;
 const current=input.blade,previous=input.previous??current;
 if(!current||!input.window)return null;
 for(const capsule of input.capsules??[]){
  let d=Infinity;const width=input.lateral?.halfWidth??0,lateral=width?[-width,0,width]:[0];
  for(const offset of lateral){const points=capsule.points.map(p=>p.map((v,k)=>v-(input.lateral?.axis[k]??0)*offset));
   for(let step=0;step<=4;step++)d=Math.min(d,Math.sqrt(segmentDistanceSquared(mix(previous[0],current[0],step/4),mix(previous[1],current[1],step/4),...points))-capsule.radius-input.bladeRadius);
  }
  if(d<best){best=d;part=capsule.name;}if(/^(neck|mane)(\.|$)/.test(capsule.name??''))neck=Math.min(neck,d);
 }
 return {gap:best,part,neckGap:neck};
}
const results=[];
for(const [version,Aim] of [['R2-root-pitch',BaselineAim],['R3-neck-yaw',CurrentAim]]){
 const api=await wolfCombatR13Fixture(null,{autoAim:false}),{f}=api;
 f.battle.preparationOptions={...f.battle.preparationOptions,frame:async()=>f.scene.render()};
 const base=new URL('../../public/assets/',import.meta.url),manifest=new URL(regularWolfManifest('fox')+'.json',base),config=JSON.parse(fs.readFileSync(manifest));
 const decoded=await readRuntimeGltf(new URL(config.model,manifest)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>!['EXT_meshopt_compression','KHR_texture_basisu'].includes(x));
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(f.scene,{json:gltf},'');container.animationGroups.forEach(g=>g.stop());
 const paint=new StandardMaterial('moving-fox-cpu-only',f.scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
 const models=f.battle.regularWolves.fox.models;models.config=config;models.container=container;models.load=async()=>{};
 const jointNodes=api.playerAsset.transformNodes.filter(node=>/^mixamorig:(Left|Right)(Arm|ForeArm|Hand)$/.test(node.name));
 const nativeUpdate=f.battle.update.bind(f.battle),nativePose=f.battle.poseAndContacts.bind(f.battle);let aim=null,enemy=null,lastAction=null,phase=null,rawPose=null,gatePose=null,actions=new Map(),rows=[],jointStats={position:0,scale:0,restore:0};
 f.battle.update=(dt,player)=>{
  const result=api.result,attacking=!result.captured&&!result.staggered&&['slash','attack','judgment','shieldPush'].includes(result.state);
  if(attacking&&lastAction!==result.actionId){
   lastAction=result.actionId;const target=f.battle.nearestTarget(player.position);phase='select';
   const point=version==='R3-neck-yaw'?meleeNeckPoint(target,new Vector3())??target.actor.position:target.actor.position;
   if(target&&Vector3.Distance(player.position,target.actor.position)<4)player.rotation.y=Math.atan2(point.x-player.position.x,point.z-player.position.z)+(PLAYER_STRIKE_AIM_YAW[result.state]??0);
   aim.begin(result,player,target);const neck=neckOf(cloneCaps(target.hurtCapsules())),p=neck?.points[0]??target.actor.position.asArray();
   actions.set(result.actionId,{actionId:result.actionId,state:result.state,startDistance:Vector3.Distance(player.position,target.actor.position),startNeckBearingErrorRadians:angle(Math.atan2(p[0]-player.position.x,p[2]-player.position.z)-player.rotation.y),targetLatched:!!aim.target,damage:0,windows:{},enemyBehaviorAtStart:target.brain.behavior});
  }
  phase='update';return nativeUpdate(dt,player);
 };
 f.battle.poseAndContacts=(player,result)=>{
  rawPose=gatePose=null;phase='aim';const before=jointNodes.map(node=>({node,position:node.position.clone(),scale:node.scaling.clone()}));aim?.apply(result,player,1/60);
  for(const row of before){jointStats.position=Math.max(jointStats.position,row.node.position.subtract(row.position).length());jointStats.scale=Math.max(jointStats.scale,row.node.scaling.subtract(row.scale).length());}
  phase='contacts';return nativePose(player,result);
 };
 try{
  for(const item of cases){
   api.resetCombat();aim?.restore();aim=new Aim(api.playerAsset);lastAction=null;actions=new Map();rows=[];jointStats={position:0,scale:0,restore:0};
   const update=api.animator.update.bind(api.animator);api.animator.update=dt=>{aim.restore();return update(dt);};
   f.player.position.set(0,0,3);await f.battle.summon(f.player,1,'fox');enemy=f.battle.encounters[0];enemy.actor.position.setAll(0);enemy.actor.rotation.y=0;enemy.brain.random=()=>.5;api.watch(enemy);
   f.player.position.set(...item.position);f.player.rotation.y=Math.atan2(-item.position[0],-item.position[2]);for(let i=0;i<12;i++)api.step(1/60);
   if(item.motion==='orbit'){enemy.brain.lastDistance=Vector3.Distance(enemy.actor.position,f.player.position);enemy.brain.beginStalk();if(item.nativeEvadeCooldown)enemy.brain.evadeCooldown=item.nativeEvadeCooldown;}
   const nativeHurt=enemy.hurtCapsules.bind(enemy);enemy.hurtCapsules=()=>{const caps=nativeHurt();if(phase==='aim')rawPose=cloneCaps(caps);else if(phase==='contacts')gatePose=cloneCaps(caps);return caps;};
   const nativeCheck=enemy.gate.check;enemy.gate.check=function(input){
    const measured=gap(input),accepted=nativeCheck.call(this,input);if(measured){
     const a=actions.get(api.result.actionId),rawNeck=rawPose&&neckOf(rawPose),actualNeck=gatePose&&neckOf(gatePose);let poseDrift=0;
     if(rawNeck&&actualNeck)for(let i=0;i<2;i++)poseDrift=Math.max(poseDrift,Math.hypot(...rawNeck.points[i].map((v,k)=>v-actualNeck.points[i][k])));
     const n=actualNeck?.points[0]??[0,0,0],bearing=angle(Math.atan2(n[0]-f.player.position.x,n[2]-f.player.position.z)-f.player.rotation.y);
     const row={actionId:api.result.actionId,state:api.result.state,window:input.window.id,source:api.result.clipTime,...measured,accepted,enemyDefense:enemy.brain.defense??null,enemyBehavior:enemy.brain.behavior,enemyMode:enemy.brain.mode,neckPoseDriftMeters:poseDrift,currentNeckBearingErrorRadians:bearing,aimError:aim.lastError,aimNeckError:aim.lastNeckError??null,aimYaw:aim.lastYaw??aim.yaw??0,aimPitch:aim.lastPitch,rootDistance:Vector3.Distance(f.player.position,enemy.actor.position)};rows.push(row);
     if(a){let w=a.windows[input.window.id];if(!w)a.windows[input.window.id]=w={minimumGap:Infinity,minimumNeckGap:Infinity,physicalAccepts:0,defendedAccepts:0,maxNeckPoseDrift:0,maxNeckBearingError:0,enemyModes:[]};w.minimumGap=Math.min(w.minimumGap,row.gap);w.minimumNeckGap=Math.min(w.minimumNeckGap,row.neckGap);w.physicalAccepts+=accepted?1:0;w.defendedAccepts+=accepted&&row.enemyDefense?1:0;w.maxNeckPoseDrift=Math.max(w.maxNeckPoseDrift,poseDrift);w.maxNeckBearingError=Math.max(w.maxNeckBearingError,Math.abs(bearing));if(!w.enemyModes.includes(enemy.brain.mode))w.enemyModes.push(enemy.brain.mode);}
    }return accepted;
   };
   let taps=1,heldFrames=3,secondQueued=false,previousHp=enemy.brain.hp,idleFrames=0,staggerFrames=0;api.controller.setAttackHeld(true);
   for(let frame=0;frame<300;frame++){
    api.step(1/60);const a=actions.get(api.result.actionId);if(a)a.damage+=previousHp-enemy.brain.hp;previousHp=enemy.brain.hp;if(api.result.staggered||api.result.captured)staggerFrames++;
    if(heldFrames&&!--heldFrames)api.controller.setAttackHeld(false);
    if(taps===1&&api.controller.action?.state==='slash'&&api.controller.action.time>=.22&&!heldFrames){api.controller.setAttackHeld(true);heldFrames=3;taps++;secondQueued=true;}
    idleFrames=!api.controller.action&&!api.controller.held&&!api.controller.queuedAttack?idleFrames+1:0;if(secondQueued&&idleFrames>12)break;
   }
   delete enemy.gate.check;delete enemy.hurtCapsules;
   const expected=Object.values(aim.arms).flatMap(arm=>!arm?[]:[...(arm.changed?[{node:arm.node,q:arm.original.clone()}]:[]),...(arm.elbow?.changed?[{node:arm.elbow.node,q:arm.elbow.original.clone()}]:[])]);aim.restore();
   for(const row of expected)jointStats.restore=Math.max(jointStats.restore,...row.q.asArray().map((v,k)=>Math.abs(v-row.node.rotationQuaternion.asArray()[k])));
   const result={version,case:item,actions:[...actions.values()],staggerFrames,finalEnemyHp:enemy.brain.hp,jointInvariants:{checked:jointNodes.map(node=>node.name),...jointStats},rows};results.push(result);console.log(JSON.stringify({...result,rows:undefined}));
  }
 }finally{aim?.restore();await api.dispose();container.dispose();loader.dispose();}
}
const currentEnd=hash(fs.readFileSync(new URL('../../src/player-melee-aim.js',import.meta.url)));
const reportName=process.env.FOX_CASE?'fox-'+process.env.FOX_CASE+'-proof.json':'fox-moving-proof.json';
fs.writeFileSync(path.join(out,reportName),JSON.stringify({scope:'Read-only diagnosis using actual native sword/controller/normal combo and receiving anatomy. Explicit front/side/watch/native-orbit/outside scenarios, two real queued normal inputs each. Native evasions and incoming interruptions retained; the named cooldown receiving case starts during the genuine2s evade cooldown. No synthetic contacts or physical relocation during strikes.',baselineSourceSha256:hash(raw),candidateSourceSha256AtStart:currentStart,candidateSourceSha256AtEnd:currentEnd,candidateFileUnchangedDuringRun:currentStart===currentEnd,results},null,2)+'\n');
