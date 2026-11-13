import fs from 'node:fs';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {StandardMaterial} from '@babylonjs/core';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {wolfMomentumR14Fixture} from '../../tests/helpers/wolf-momentum-r14-fixture.js';
import {BossModelLibrary} from '../../src/boss-models.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import * as profiles from '../../src/regular-wolf-spec.js';

const a=await wolfMomentumR14Fixture(),containers=[],loaders=[];
caveFogFallback(a.f.scene).getInternalTexture().isReady=true;a.f.battle.preparationOptions={...a.f.battle.preparationOptions,frame:async()=>a.f.scene.render()};
try{
 for(const id of ['gray-wolf','fox']){
  const base=new URL('../../public/assets/',import.meta.url),manifest=profiles.regularWolfManifest?.(id)??id,config=JSON.parse(fs.readFileSync(new URL(manifest+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(name=>name!=='EXT_meshopt_compression'&&name!=='KHR_texture_basisu');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;loaders.push(loader);const container=await loader.loadAssetContainerAsync(a.f.scene,{json:gltf},'');containers.push(container);
  for(const group of container.animationGroups)group.stop();const paint=new StandardMaterial(id+'-mixed-maul',a.f.scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
  const models=new BossModelLibrary(a.f.scene,id);models.config=config;models.container=container;models.loads=1;models.load=async()=>{};a.f.battle.regularWolves[id].models=models;
 }
 a.resetCombat();a.f.player.position.set(0,0,6);a.f.player.rotation.y=Math.PI;
 await a.f.battle.summon(a.f.player,1,'gray-wolf');await a.f.battle.summon(a.f.player,1,'fox');
 const enemies=a.f.battle.encounters;for(let i=0;i<enemies.length;i++){const e=enemies[i];e.actor.position.set(i?.12:-.12,0,0);e.actor.rotation.y=0;e.brain.random=()=>.5;e.brain.configureAttacks({custom:true,sequence:['lunge'],speed:1});}
 let overlapped=false;let taps=0,firstHold=null,escaped=null,lastTap=-Infinity,maxHits=0,ownerChanges=0,lastOwner=null;
 for(let frame=0;frame<60*20;frame++){
  const settling=enemies.find(e=>e.v02Ram.authorized&&e.brain.ramStage==='settle'&&!e.grab.maulHolding);if(!overlapped&&settling){const other=enemies.find(e=>e!==settling);other.actor.position.copyFrom(settling.actor.position);other.actor.position.x+=.001;overlapped=true;}
  a.step(1/60);const owner=a.f.battle.combat.grabOwner;
  if(owner!==lastOwner){ownerChanges++;lastOwner=owner;}
  if(owner?.grab.maulHolding){firstHold??=a.elapsed;maxHits=Math.max(maxHits,owner.grab.maulHits);if(taps<5&&a.elapsed-lastTap>=.10){lastTap=a.elapsed;taps++;const released=a.f.battle.escapeGrab();if(released)escaped={time:a.elapsed,hits:maxHits};}}
  if(firstHold&&a.elapsed-firstHold>4)break;
 }
 const proof={overlapped,captureEvents:a.reactions.filter(r=>'captured' in r.options).map(r=>({time:r.time,captured:r.options.captured})),firstHold,taps,escaped,maxHits,ownerChanges,captured:a.controller.captured,owner:a.f.battle.combat.grabOwner?.id??null,player:a.f.player.position.asArray(),enemies:enemies.map(e=>({id:e.id,position:e.actor.position.asArray(),mauls:e.grab.maulHits,queued:e.grab.escapeQueued,taps:e.grab.tapCount,holding:e.grab.maulHolding,ram:e.v02Ram.inspect(),contact:e.v02LastContact}))};
 fs.writeFileSync(new URL('./mixed-maul-smoke.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{for(const container of containers)container.dispose();for(const loader of loaders)loader.dispose();await a.dispose();}
