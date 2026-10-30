import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,TransformNode,Vector3,StandardMaterial,DirectionalLight,ShadowGenerator} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {BossBattle} from '../src/boss-battle.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter} from '../src/world-limits.js';

test('retired Elena phases submit no meshes, skeletons or shadow candidates during two minutes after defeat; warm map return restores living shadows',async t=>{
 setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
 Object.assign(engine.getCaps(),{textureFloat:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
 const camera=new FreeCamera('inspection',new Vector3(29,9,-12),scene);camera.setTarget(new Vector3(29,9,-31));
 const light=new DirectionalLight('key',new Vector3(.65,-1,-.45),scene),shadows=new ShadowGenerator(1024,light),base=new URL('../public/assets/',import.meta.url),loaders=[];
 const load=async name=>{const config=JSON.parse(readFileSync(new URL(name+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+decoded.files.get(b.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');loaders.push(loader);
  for(const group of container.animationGroups)group.stop();for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial(name+'-paint',scene);
  const models=new BossModelLibrary(scene,name);models.config=config;models.container=container;models.load=async()=>{};return models;
 };
 const elenaModels=await load('elena'),mourningModels=await load('mourning-elena'),world={scene,cave:true,terrain:createWitchCaveTerrain(),navigation:new CaveNavigation(caveObstacles()),shadows};
 const battle=new BossBattle(world,()=>{},()=>{},()=>true,{elenaModels,mourningModels}),player=new TransformNode('player',scene);player.position.set(29,6,-23);
 t.after(()=>{battle.hide();for(const loader of loaders)loader.dispose();scene.dispose();engine.dispose();});
 const evaluate=()=>{scene.incrementRenderId();scene.updateTransformMatrix(true);scene._evaluateActiveMeshes();return {meshes:scene.getActiveMeshes().length,skeletons:scene._activeSkeletons.length,shadowCandidates:shadows.getShadowMap().renderList.length};};
 const step=()=>{battle.update(1/30,player);scene._animate(0);battle.poseAndContacts(player,{state:'idle'},null,null);for(const e of battle.encounters)e.updateRenderRange(camera.position);};
 await battle.activateResident(player,{reset:true});const first=battle.elenaPool[0],initialCasters=shadows.getShadowMap().renderList.length;
 assert.ok(initialCasters>0);
 for(let trip=0;trip<4;trip++){battle.hide();assert.equal(shadows.getShadowMap().renderList.length,0);assert.equal(evaluate().skeletons,0);world.cave=false;world.cave=true;await battle.activateResident(player);assert.equal(shadows.getShadowMap().renderList.length,initialCasters);assert.equal(first.actor.isEnabled(),true);}
 first.brain.hit({damage:9999});for(let i=0;i<50;i++)step();await battle.residentPending;
 const second=battle.mourningPool[0];assert.ok(second);assert.equal(first.actor.isEnabled(),false);
 assert.ok(shadows.getShadowMap().renderList.every(m=>!first.asset.meshes.includes(m)),'retired first phase has no stale shadow candidates');
 assert.ok(evaluate().skeletons>0,'living phase prepares its actual skeleton');
 second.brain.hit({damage:9999});for(let i=0;i<Math.ceil(second.death.duration*30)+2;i++)step();
 assert.equal(second.corpseGone,true);assert.deepEqual(evaluate(),{meshes:0,skeletons:0,shadowCandidates:0});
 let animationCalls=0,contactCalls=0;
 for(const e of battle.allPooled){const update=e.animator.update.bind(e.animator);e.animator.update=(...args)=>{animationCalls++;return update(...args);};const contacts=e.poseAndContacts.bind(e);e.poseAndContacts=(...args)=>{contactCalls++;return contacts(...args);};}
 const before={meshes:scene.meshes.length,skeletons:scene.skeletons.length,groups:scene.animationGroups.length,materials:scene.materials.length,textures:scene.textures.length};
 const start=performance.now();for(let i=0;i<3600;i++){step();if(i%30===0)assert.deepEqual(evaluate(),{meshes:0,skeletons:0,shadowCandidates:0});}
 const elapsed=performance.now()-start;
 assert.equal(animationCalls,0);assert.equal(contactCalls,0);assert.equal(battle.frameEncounters.length,0);
 const retiredCalls={animationCalls,contactCalls};
 assert.deepEqual({meshes:scene.meshes.length,skeletons:scene.skeletons.length,groups:scene.animationGroups.length,materials:scene.materials.length,textures:scene.textures.length},before);
 const hp=battle.playerHp,potions=battle.potions.remaining;battle.hide();world.cave=false;world.cave=true;await battle.activateResident(player);step();assert.deepEqual(evaluate(),{meshes:0,skeletons:0,shadowCandidates:0});assert.equal(battle.playerHp,hp);assert.equal(battle.potions.remaining,potions);
 await battle.activateResident(player,{reset:true,phase:2});step();assert.ok(evaluate().meshes>0);assert.ok(shadows.getShadowMap().renderList.length>0,'explicit resummon reattaches shadows');assert.equal(battle.allPooled.length,2);
 if(process.env.ELENA_COMBAT_REPORT==='1'){const dir=new URL('../reports/cave-gpu-followup/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('retired-work.json',dir),JSON.stringify({simulatedSeconds:120,frames:3600,...retiredCalls,activeMeshesAfterDefeat:0,activeSkeletonsAfterDefeat:0,shadowCandidatesAfterDefeat:0,warmTrips:4,resourceCountsUnchanged:true,elapsedDesktopCpuMs:elapsed,limits:'NullEngine lifecycle/submission evaluation; not phone GPU timing or a physical temperature measurement'},null,2)+'\n');}
});
