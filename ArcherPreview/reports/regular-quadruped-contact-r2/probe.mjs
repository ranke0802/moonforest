import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {wolfCombatR13Fixture} from '../../tests/helpers/wolf-combat-r13-fixture.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {segmentDistanceSquared} from '../../src/melee-collision.js';
import {playerDimensions} from '../../src/player-dimensions.js';
import {regularWolfManifest} from '../../src/regular-wolf-spec.js';

const assets=new URL('../../public/assets/',import.meta.url),out=import.meta.dirname;
const sourceNames=['player-melee-aim.js','player-strikes.js','melee-collision.js','wolf-v02-hurt.js','wolf-v02-shield.js'];
const sourceHashes=()=>Object.fromEntries(sourceNames.map(name=>[name,createHash('sha256').update(fs.readFileSync(new URL('../../src/'+name,import.meta.url))).digest('hex')]));
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t),distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
function measure(input){
 let gap=Infinity,heightGap=Infinity,closest=null;
 for(const contact of input.contacts??[])for(const capsule of input.capsules??[]){
  const previous=contact.previous??contact.blade,current=contact.blade,radius=capsule.radius+input.bladeRadius;
  const travel=Math.max(distance(previous[0],current[0]),distance(previous[1],current[1]));
  const steps=Math.max(1,Math.ceil(travel/Math.max(.005,radius*.5)));
  const width=contact.lateral?.halfWidth??0,lateralSteps=width?Math.max(2,Math.ceil(width*2/Math.max(.025,radius))):0;
  const weaponLow=Math.min(...[...previous,...current].map(p=>p[1])),weaponHigh=Math.max(...[...previous,...current].map(p=>p[1]));
  const hurtLow=Math.min(...capsule.points.map(p=>p[1]))-capsule.radius,hurtHigh=Math.max(...capsule.points.map(p=>p[1]))+capsule.radius;
  heightGap=Math.min(heightGap,Math.max(0,weaponLow-hurtHigh,hurtLow-weaponHigh)-input.bladeRadius);
  for(let s=0;s<=steps;s++)for(let lateral=0;lateral<=lateralSteps;lateral++){
   const offset=lateralSteps?-width+width*2*lateral/lateralSteps:0,axis=contact.lateral?.axis??[0,0,0];
   const points=capsule.points.map(p=>p.map((v,k)=>v-axis[k]*offset));
   const d=Math.sqrt(segmentDistanceSquared(mix(previous[0],current[0],s/steps),mix(previous[1],current[1],s/steps),...points))-radius;
   if(d<gap){gap=d;closest={window:contact.window.id,capsule:capsule.name,weaponLow,weaponHigh,hurtLow,hurtHigh,bladeRadius:input.bladeRadius,capsuleRadius:capsule.radius,lateralOffset:offset,blade:[mix(previous[0],current[0],s/steps),mix(previous[1],current[1],s/steps)],capsulePoints:structuredClone(capsule.points)};}
  }
 }
 return {gap,heightGap,closest};
}
export async function runContactProbe({ids=['fox','boar','gray-wolf'],actions=['normal','heavy','shield'],manifestPaths={},createAim=null,label='baseline',write=true}={}){
 if(ids.length>1){
  const reports=[];for(const id of ids)reports.push(await runContactProbe({ids:[id],actions,manifestPaths,createAim,label,write:false}));
  const report={...reports[0],runtimeSourcesUnchanged:reports.every(r=>r.runtimeSourcesUnchanged)&&reports.every(r=>JSON.stringify(r.runtimeSourceHashes)===JSON.stringify(reports[0].runtimeSourceHashes)),cases:reports.flatMap(r=>r.cases)};
  if(write)fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2)+'\n');return report;
 }
 const api=await wolfCombatR13Fixture(null,{autoAim:true}),{f}=api,owned=[],cases=[];let currentEnemy=null,aim=null;
 const startingSources=sourceHashes();
 f.battle.preparationOptions={...f.battle.preparationOptions,frame:async()=>{f.scene.render();}};
 const nativePose=f.battle.poseAndContacts.bind(f.battle);
 // Hook points match production ordering: restore additive pose before native
 // animation, apply after native matrices and before the unmodified sampler.
 const nativeAnimate=api.animator.update.bind(api.animator);let wrappedAnimator=api.animator;
 function installAnimationHook(){
  if(wrappedAnimator===api.animator&&api.animator.__contactProbeWrapped)return;
  wrappedAnimator=api.animator;const update=wrappedAnimator.update.bind(wrappedAnimator);
  wrappedAnimator.update=function(dt){aim?.beforeNativeAnimation?.({api,enemy:currentEnemy,dt});return update(dt);};wrappedAnimator.__contactProbeWrapped=true;
 }
 f.battle.poseAndContacts=(player,result)=>{aim?.afterNativeAnimation?.({api,enemy:currentEnemy,result,dt:1/60});return nativePose(player,result);};
 try{
  for(const id of ids){
   const manifestURL=manifestPaths[id]?new URL('file:///'+path.resolve(manifestPaths[id]).replaceAll('\\','/')):new URL(regularWolfManifest(id)+'.json',assets);
   const config=JSON.parse(fs.readFileSync(manifestURL)),decoded=await readRuntimeGltf(new URL(config.model,manifestURL)),gltf=structuredClone(decoded.gltf);
   for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>!['EXT_meshopt_compression','KHR_texture_basisu'].includes(x));
   for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
   const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(f.scene,{json:gltf},'');container.animationGroups.forEach(g=>g.stop());
   const paint=new StandardMaterial('contact-probe-'+id,f.scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
   const models=f.battle.regularWolves[id].models;models.config=config;models.container=container;models.load=async()=>{};owned.push({container,loader});
   for(const action of actions)for(const outside of [false,...(action==='normal'?[true]:[])]){
    api.resetCombat();installAnimationHook();currentEnemy=null;aim?.dispose?.();aim=createAim?.({api})??null;
    f.player.position.set(0,0,3);f.player.rotation.y=Math.PI;await f.battle.summon(f.player,1,id);const enemy=f.battle.encounters[0];currentEnemy=enemy;enemy.actor.position.setAll(0);enemy.actor.rotation.y=0;api.watch(enemy);
    // Side-on receiving stance puts the genuine ribcage, rather than a long
    // actor origin or muzzle, in front of the player's real weapon.
    const halfWidth=(config.bounds?.[0]??.4)*config.scale*.5;
    // A shield push has shorter physical reach than a sword. The actor has
    // naturally walked to a pre-input stance; neither victim nor player moves
    // to manufacture a hit during the action.
    const near=action==='shield'?Math.max(enemy.radius+playerDimensions(f.player).moveRadius+.06,halfWidth+.60):Math.max(enemy.radius+playerDimensions(f.player).standingClearance+.06,halfWidth+.78);
    f.player.position.set(outside?near+2.8:near,0,0);f.player.rotation.y=-Math.PI/2;
    for(let i=0;i<18;i++)api.step(1/60);
    const hp=enemy.brain.hp,nativeCollect=enemy.gate.collect,records=[];let closest=null;
    enemy.gate.collect=function(input){const measured=measure(input);if(Number.isFinite(measured.gap)){const row={time:api.elapsed,playerState:api.result.state,sourceTime:api.result.clipTime,shieldCenter:api.shieldNode.getAbsolutePosition().asArray(),leftArmPivot:api.playerNodes['mixamorig:LeftArm'].getAbsolutePosition().asArray(),...measured};records.push(row);if(!closest||row.gap<closest.gap)closest=row;}return nativeCollect.call(this,input);};
    const controller=api.controller;let accepted;
    if(action==='shield'){accepted=controller.setShieldHeld(true);for(let i=0;i<3;i++)api.step(1/60);controller.setShieldHeld(false);}
    else {accepted=controller.setAttackHeld(true);for(let i=0;i<(action==='heavy'?30:3);i++)api.step(1/60);controller.setAttackHeld(false);}
    for(let i=0;i<180;i++){api.step(1/60);if(enemy.brain.hp<hp||(!controller.action&&!controller.held&&i>90))break;}
    delete enemy.gate.collect;
    const result={id,action,outside,accepted,height:config.height,scale:config.scale,stanceDistance:near,actualDistance:Vector3.Distance(enemy.actor.position,f.player.position),damage:hp-enemy.brain.hp,contactFrames:records.length,minimumWeaponHurtGapMeters:closest?.gap??null,minimumVerticalSeparationMeters:records.length?Math.min(...records.map(r=>r.heightGap)):null,closest,aim:aim?.inspect?.()??null,weaponStates:[...new Set(records.map(r=>r.playerState))],manifest:manifestURL.pathname,manifestSha256:createHash('sha256').update(fs.readFileSync(manifestURL)).digest('hex'),hurtProfileSha256:createHash('sha256').update(JSON.stringify(config.canineProfile.hurtVolumes)).digest('hex')};cases.push(result);console.log(JSON.stringify(result));
   }
  }
  const endingSources=sourceHashes(),report={label,runtimeSourcesUnchanged:JSON.stringify(startingSources)===JSON.stringify(endingSources),runtimeSourceHashes:endingSources,scope:'Actual packed native1.6mwarrior, controller press/hold/release, full visible shield-face and unmodified strike windows/anatomy gate on three genuine standing receiving clips. Observational gap instrumentation does not inject hits. NullEngine/CPU evidence only.',cases};
  if(write)fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2)+'\n');return report;
 }finally{aim?.dispose?.();await api.dispose();for(const item of owned){item.container.dispose();item.loader.dispose();}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))await runContactProbe({ids:process.env.CONTACT_PROBE_IDS?.split(',')??undefined,actions:process.env.CONTACT_PROBE_ACTIONS?.split(',')??undefined,label:process.env.CONTACT_PROBE_LABEL??'baseline'});
