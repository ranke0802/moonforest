import fs from 'node:fs';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {StandardMaterial} from '@babylonjs/core';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {wolfMomentumR14Fixture} from '../../tests/helpers/wolf-momentum-r14-fixture.js';
import {BossModelLibrary} from '../../src/boss-models.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';

const a=await wolfMomentumR14Fixture(),containers=[],loaders=[],proof={scope:'Native controller/actual prone geometry, unguarded first ram and first two low mauls; at most 14 game seconds per form. CPU evidence, not visual or device GPU approval.',cases:[]};
caveFogFallback(a.f.scene).getInternalTexture().isReady=true;a.f.battle.preparationOptions={...a.f.battle.preparationOptions,frame:async()=>a.f.scene.render()};
try{
 for(const id of ['fox','boar']){
  a.resetCombat();const base=new URL('../../public/assets/',import.meta.url),config=JSON.parse(fs.readFileSync(new URL(id+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(name=>name!=='EXT_meshopt_compression'&&name!=='KHR_texture_basisu');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;loaders.push(loader);const container=await loader.loadAssetContainerAsync(a.f.scene,{json:gltf},'');containers.push(container);
  for(const group of container.animationGroups)group.stop();const paint=new StandardMaterial(id+'-maul-smoke',a.f.scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
  const models=new BossModelLibrary(a.f.scene,id);models.config=config;models.container=container;models.loads=1;models.load=async()=>{};a.f.battle.regularWolves[id].models=models;
  a.f.player.position.set(0,0,6);a.f.player.rotation.y=Math.PI;await a.f.battle.summon(a.f.player,1,id);const e=a.f.battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;e.brain.random=()=>.5;e.brain.configureAttacks({custom:true,sequence:['lunge'],speed:1});
  const hp=e.playerHp;let steps=0,firstRam=null,maxMauls=0,brace=false,prone=false,braceProbe=null;
  for(;steps<60*14;steps++){
   a.step(1/60);brace||=e.brain.ramPawBraced===true;prone||=e.v02Ram.proneValid;maxMauls=Math.max(maxMauls,e.grab.maulHits??0);
   if(!braceProbe&&e.v02Ram.proneValid&&e.brain.ramStage==='maul'&&e.brain.ramStageClock>.2){braceProbe={actor:e.actor.position.asArray(),player:a.f.player.position.asArray(),torso:[e.v02Ram.a.asArray(),e.v02Ram.b.asArray()],time:e.brain.time,pad:e.runtimeProfile.forepawPadHeight,legs:e.v02Pose.legs.slice(0,2).map(l=>({name:l.name,upper:l.upper.getAbsolutePosition().asArray(),lower:l.lower.getAbsolutePosition().asArray(),end:l.end.getAbsolutePosition().asArray(),foot:l.foot.getAbsolutePosition().asArray(),anchor:l.anchor.asArray(),planted:l.planted})),maxReachError:e.v02Pose.maxReachError,releases:e.v02Pose.releasedPlants};}if(e.v02Ram.phases[0].hit&&!firstRam)firstRam={seconds:a.elapsed,damage:e.v02Ram.phases[0].damage,accepted:e.v02Ram.phases[0].acceptedKnockdown};
   if(maxMauls>=2||e.brain.attackCount>0&&e.brain.mode!=='attack')break;
  }
  const record={id,passed:!!firstRam&&maxMauls>=2,seconds:steps/60,firstRam,mauls:maxMauls,brace,prone,braceProbe,damage:hp-e.playerHp,ram:e.v02Ram.inspect(),contact:e.v02LastContact,outcome:e.v02LastOutcome,playerState:a.result.state,playerPosition:a.f.player.position.asArray(),actorPosition:e.actor.position.asArray()};
  proof.cases.push(record);console.log(JSON.stringify(record));a.f.battle.hide();
 }
 proof.passed=proof.cases.every(record=>record.passed);fs.writeFileSync(new URL('./maul-smoke.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');if(!proof.passed)process.exitCode=1;
}finally{for(const container of containers)container.dispose();for(const loader of loaders)loader.dispose();await a.dispose();}
