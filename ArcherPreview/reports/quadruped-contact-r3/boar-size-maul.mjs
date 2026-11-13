import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {StandardMaterial,Vector3} from '@babylonjs/core';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {wolfMomentumR14Fixture} from '../../tests/helpers/wolf-momentum-r14-fixture.js';
import {BossModelLibrary} from '../../src/boss-models.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import {regularWolfManifest} from '../../src/regular-wolf-spec.js';
import {WOLF_MAUL_NO_CONTACT_SECONDS} from '../../src/wolf-v02-grab.js';

const order=['boar'],selection=process.argv.find(arg=>arg.startsWith('--ids='))?.slice(6).split(',')??order,resultPath=new URL('./boar-size-maul.json',import.meta.url);
if(selection?.some(id=>!order.includes(id)))throw new Error('Unknown solo maul form');
const previous=selection&&fs.existsSync(resultPath)?JSON.parse(fs.readFileSync(resultPath)).cases:[];
const a=await wolfMomentumR14Fixture(),containers=[],loaders=[],proof={scope:'One current 0.833333m boar native-controller solo ram/maul using boar-r3, five real dodge inputs, owned prompt/control cleanup and a real subsequent dodge. A second boar run separates only the attacker after one real bite to verify the 1.5-second progress timeout; no victim teleport. CPU evidence, no browser/GPU/device claim.',cases:previous.filter(record=>!selection.includes(record.id))};
caveFogFallback(a.f.scene).getInternalTexture().isReady=true;a.f.battle.preparationOptions={...a.f.battle.preparationOptions,frame:async()=>a.f.scene.render()};
try{
 for(const id of selection??order){
  if(id!=='wolf'){
   const base=new URL('../../public/assets/',import.meta.url),config=JSON.parse(fs.readFileSync(new URL(regularWolfManifest(id)+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
   for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(name=>name!=='EXT_meshopt_compression'&&name!=='KHR_texture_basisu');
   for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
   const loader=new GLTFFileLoader();loader.skipMaterials=true;loaders.push(loader);const container=await loader.loadAssetContainerAsync(a.f.scene,{json:gltf},'');containers.push(container);
   for(const group of container.animationGroups)group.stop();const paint=new StandardMaterial(id+'-solo-maul',a.f.scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
   const models=new BossModelLibrary(a.f.scene,id);models.config=config;models.container=container;models.loads=1;models.load=async()=>{};a.f.battle.regularWolves[id].models=models;
  }
  async function run({loseAfterOne=false}={}){
   a.resetCombat();const battle=a.f.battle,combat=battle.combat,player=a.f.player;player.position.set(0,0,id==='wolf'?15:6);player.rotation.y=Math.PI;await battle.summon(player,1,id);
   const e=battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;e.brain.random=()=>.5;e.brain.configureAttacks({custom:true,sequence:['lunge'],speed:1});
   let heldAt=null,heldClock=null,lastContact=null,release=null,taps=0,lastTap=-Infinity,displacedAt=null,playerAtDisplacement=null,mouthProbe=null;
   for(let frame=0;frame<60*16;frame++){
    a.step(1/60);
    if(!mouthProbe&&e.v02LastContact?.prone){const shape=e.contactShape('jaw','maul');mouthProbe={sourceTime:e.brain.time,actor:e.actor.position.asArray(),player:player.position.asArray(),rootGap:Math.hypot(e.actor.position.x-player.position.x,e.actor.position.z-player.position.z),jaw:Vector3.TransformCoordinates(shape.offset,e.nodes.jaw.getWorldMatrix()).asArray(),body:[e.v02Ram.a.asArray(),e.v02Ram.b.asArray()],radius:shape.radius+e.v02Ram.bodyRadius,contact:e.v02LastContact.contact};}
    if(e.grab.maulHolding){
     heldAt??=a.elapsed;heldClock??=e.brain.combatClock;lastContact=e.grab.lastMaulContactClock;
     assert.equal(combat.grabOwner,e);assert.equal(combat.wolfRamOwner(player),e);assert.ok(e.grab.escapePrompt);
     assert.ok(Math.abs((e.brain.combatClock-heldClock)-(a.elapsed-heldAt))<1e-6,'captured actor clock must continue with simulation time');
     if(taps<5&&a.elapsed-lastTap>=.10){lastTap=a.elapsed;taps++;battle.escapeGrab();if(e.grab.maulHits<2)assert.equal(a.controller.captured,true);}
     if(loseAfterOne&&displacedAt===null&&e.grab.maulHits===1){e.actor.position.x+=3;displacedAt=a.elapsed;playerAtDisplacement=player.position.clone();}
    }
    if(heldAt&&!a.controller.captured){release=a.elapsed;break;}
   }
   assert.ok(heldAt!==null,id+' actual ram must enter its native prone hold');assert.equal(taps,5);assert.ok(release!==null,id+' cannot leave the native controller captured');
   assert.equal(combat.grabOwner,null);assert.equal(combat.wolfRamOwner(player),null);assert.equal(e.grab.maulHolding,false);assert.equal(e.grab.escapePrompt,'');assert.equal(battle.grab.escapePrompt??'','');
   if(e.grab.lastReleaseReason==='maul-escape')assert.equal(e.grab.maulHits,2);
   else{assert.equal(e.grab.lastReleaseReason,'maul-contact-lost');assert.ok(e.grab.maulHits<2);assert.ok(e.brain.combatClock-lastContact<=WOLF_MAUL_NO_CONTACT_SECONDS+1/60+1e-6);}
   if(loseAfterOne){assert.ok(displacedAt!==null);assert.equal(e.grab.maulHits,1);assert.equal(e.grab.lastReleaseReason,'maul-contact-lost');assert.ok(player.position.equalsWithEpsilon(playerAtDisplacement,1e-6));}
   assert.equal(a.dodge(),true,id+' real native dodge must accept the next input');a.step(1/60);assert.equal(a.result.state,'dodge');assert.equal(a.controller.captured,false);
   return {height:e.config.height,scale:e.config.scale,manifest:id==='wolf'?'alpha-wolf':regularWolfManifest(id),heldAt,release,heldSeconds:release-heldAt,taps,realBites:e.grab.maulHits,reason:e.grab.lastReleaseReason,clockAdvanced:true,ownerCleared:true,promptCleared:true,nativeDodgeAccepted:true,...(loseAfterOne?{attackerOnlySeparationAt:displacedAt,noVictimTeleport:true}:{}),mouthProbe,lastMaulContact:e.v02LastContact,phases:e.v02Ram.phases.map(p=>({name:p.config.id,hit:p.hit,damage:p.damage,sourceTime:p.sourceTime}))};
  }
  const record={id,solo:await run()};if(id==='boar')record.afterOneRealBite=record.solo.realBites?await run({loseAfterOne:true}):{skipped:true,reason:'No real first bite occurred in the solo run; no damage was fabricated to create this fault case.'};proof.cases.push(record);console.log(JSON.stringify(record));
 }
 proof.cases.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));proof.passed=true;fs.writeFileSync(resultPath,JSON.stringify(proof,null,2)+'\n');
}finally{for(const container of containers)container.dispose();for(const loader of loaders)loader.dispose();await a.dispose();}
