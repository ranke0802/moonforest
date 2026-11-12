import fs from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,TransformNode,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './read-runtime-gltf.js';
import {BossModelLibrary} from '../../src/boss-models.js';
import {BossBattle} from '../../src/boss-battle.js';
import {WARRIOR_DIMENSIONS} from '../../src/player-dimensions.js';
import {WOLF_V02_BY_ID} from '../../src/wolf-v02-spec.js';
import {setWorldCharacter} from '../../src/world-limits.js';

// Real packed R8 rig and the game's sampler, battle and contact pipeline.
// NullEngine and replacement material do not establish visual/GPU performance.
export async function wolfHuntFixture(t){
 setWorldCharacter('warrior-plains');
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;new FreeCamera('camera',new Vector3(0,5,-10),scene);
 const base=new URL('../../public/assets/',import.meta.url),config=JSON.parse(fs.readFileSync(new URL('alpha-wolf.json',base)));
 const decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression'&&x!=='KHR_texture_basisu');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 container.animationGroups.forEach(g=>g.stop());const paint=new StandardMaterial('hunt-test-paint',scene);for(const m of container.meshes)if(m.getTotalVertices())m.material=paint;
 const models=new BossModelLibrary(scene,'alpha-wolf');models.config=config;models.container=container;models.load=async()=>{};
 const world={scene,mapId:'great-plains',release:'moonforest-0.2',navigation:null,terrain:{place(v){v.y=0;},heightAt(){return 0;}},shadows:{addShadowCaster(){},removeShadowCaster(){}}};
 const battle=new BossBattle(world,()=>{},()=>{},()=>{},{wolfModels:models}),player=new TransformNode('hunt-test-player',scene);player.metadata={playerDimensions:WARRIOR_DIMENSIONS};player.position.set(0,0,6);battle.preparationOptions={frame:async()=>{},maxBlocks:4};
 const f={engine,scene,config,container,models,world,battle,player,async dispose(){battle.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();setWorldCharacter('warrior');}};
 if(t)t.after(()=>f.dispose());return f;
}
export async function beginWolfHunt(f,id,{x=0,z=WOLF_V02_BY_ID[id].preferredDistance,speed=1,hp=900,yaw=0}={}){
 await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=yaw;f.player.position.set(x,0,z);f.player.rotation.y=Math.PI;
 e.brain.configureAttacks({custom:true,sequence:[id],speed});e.brain.hp=hp;e.brain.startAction(id);e.playerHp=500;e.playerInvulnerable=0;return e;
}
export function stepWolfHunt(f,e,dt,{state='idle',actionId=state==='idle'?undefined:17,sample=null,shield=null}={}){
 f.battle.update(dt,f.player);return f.battle.poseAndContacts(f.player,{state,actionId},sample,shield);
}
export const huntResourceCounts=scene=>({meshes:scene.meshes.length,geometry:scene.geometries.length,materials:scene.materials.length,skeletons:scene.skeletons.length,groups:scene.animationGroups.length,morph:scene.morphTargetManagers.length,textures:scene.textures.length,nodes:scene.transformNodes.length,nativeAnimatables:scene._activeAnimatables.length});
