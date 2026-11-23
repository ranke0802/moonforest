import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,TransformNode,Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {BossBattle} from '../src/boss-battle.js';
import {createActorEncounterFactory} from '../src/actor-encounter-adapter.js';
import {ACTOR_DEFINITIONS} from '../src/actor-definitions.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {TITLE_FOE,AMBUSH} from '../src/v03/boot.js';

const assetBase=new URL('../public/assets/',import.meta.url);
// The real library contract (one shared request per library) with the model
// bytes read from disk; every source container the game would open is logged.
const opened=[];
BossModelLibrary.prototype.load=async function(){
 if(this.disposed)throw new Error('library disposed');
 this.pending??=(async()=>{
  const config=JSON.parse(readFileSync(new URL(this.manifest+'.json',assetBase))),decoded=await readRuntimeGltf(new URL(config.model,assetBase)),gltf=structuredClone(decoded.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression'&&x!=='KHR_texture_basisu');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(this.scene,{json:gltf},'');
  const paint=new StandardMaterial('shared-test-'+this.manifest,this.scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;container.materials.push(paint);
  for(const group of container.animationGroups)group.stop();
  const record={manifest:this.manifest,owner:this.options?.scoped?'placement':'battle',disposed:false};opened.push(record);
  const dispose=container.dispose.bind(container);container.dispose=()=>{record.disposed=true;dispose();};
  this.config=config;this.container=container;this.loads++;
 })();
 await this.pending;
};

async function titleAmbushRoaming(t,{share}){
 opened.length=0;
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;Object.assign(engine.getCaps(),{maxVertexUniformVectors:256,maxVertexTextureImageUnits:16,textureFloat:true});new FreeCamera('camera',new Vector3(0,5,-10),scene);
 const world={scene,mapId:'great-plains',release:'moonforest-0.2',navigation:null,terrain:{heightAt(){return 0;},place(v){v.y=0;}},shadows:{addShadowCaster(){},removeShadowCaster(){}}};
 const battle=new BossBattle(world,()=>{},()=>{},()=>{}),player=new TransformNode('player',scene);player.metadata={playerDimensions:WARRIOR_DIMENSIONS};player.position.z=6;battle.currentPlayer=player;battle.preparationOptions={frame:async()=>{}};
 if(share)battle.shareModelKinds(TITLE_FOE.kind,AMBUSH.kind);
 const factory=createActorEncounterFactory({world,battle,getPlayer:()=>player,rewardsEnabled:true});
 t.after(()=>{battle.hide();scene.dispose();engine.dispose();});
 // Title: the attract fight, then the title's species preparation.
 assert.equal(await battle.summon(player,TITLE_FOE.count,TITLE_FOE.kind),true);
 const handles=['alpha-wolf.r8','gray-wolf.r1'].map(id=>factory.retain(ACTOR_DEFINITIONS[id]));await Promise.all(handles.map(h=>h.ready));
 // First ambush, then roaming placement actors of both species.
 assert.equal(await battle.summon(player,AMBUSH.count,AMBUSH.kind),true);
 const roaming=[];for(const id of ['alpha-wolf.r8','gray-wolf.r1']){const actor=factory(ACTOR_DEFINITIONS[id],{});await actor.prepareVisible({preparation:createBossPreparation({frame:async()=>{},incremental:true}),isCurrent:()=>true});roaming.push(actor);}
 return {battle,factory,handles,roaming,scene};
}
const count=manifest=>opened.filter(r=>r.manifest===manifest).length;

test('0.3 title wolf and ambush wolf share one source model with roaming placement actors',async t=>{
 const {battle,handles,roaming}=await titleAmbushRoaming(t,{share:true});
 assert.equal(count('alpha-wolf'),1);assert.equal(count('gray-wolf-r2'),1);
 assert.ok(opened.every(r=>r.owner==='battle'),'the battle owns the one source of each');
 // A roaming wolf is a clone of the battle's source geometry, not of a second copy.
 const sources=new Set([...battle.wolfModels.container.meshes,...battle.regularWolves['gray-wolf'].models.container.meshes].map(m=>m.geometry).filter(Boolean));
 for(const actor of roaming)assert.ok(actor.encounter.asset.meshes.some(m=>sources.has(m.geometry)),actor.definition.id);
 // Releasing the placement side never disposes the battle's page-long model.
 for(const actor of roaming)await actor.dispose();for(const handle of handles)handle.release();await new Promise(r=>setTimeout(r,20));
 assert.ok(opened.every(r=>!r.disposed));assert.ok(battle.wolfModels.container&&battle.regularWolves['gray-wolf'].models.container);
 battle.resetBattle();assert.equal(await battle.summon(battle.currentPlayer,1,'gray-wolf'),true,'the battle still summons from its source');
});

test('without shared kinds (0.2) each system keeps its own source as before',async t=>{
 const {handles,roaming}=await titleAmbushRoaming(t,{share:false});
 assert.equal(count('alpha-wolf'),2);assert.equal(count('gray-wolf-r2'),2);
 for(const actor of roaming)await actor.dispose();for(const handle of handles)handle.release();await new Promise(r=>setTimeout(r,20));
 assert.deepEqual(opened.filter(r=>r.disposed).map(r=>r.owner+':'+r.manifest).sort(),['placement:alpha-wolf','placement:gray-wolf-r2']);
});

test('only wolf kinds the battle summons can be shared, and only by their own manifest',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),battle=new BossBattle({scene,release:'moonforest-0.2'},()=>{});
 assert.equal(battle.sharedModelLibrary('alpha-wolf'),null);
 battle.shareModelKinds('wolf','gray-wolf','goblin','bear');
 assert.equal(battle.sharedModelLibrary('alpha-wolf'),battle.wolfModels);
 assert.equal(battle.sharedModelLibrary('gray-wolf-r2'),battle.regularWolves['gray-wolf'].models);
 for(const manifest of ['fox-r2','stylized-wolf-r2','hooded-goblin','guardian-bear'])assert.equal(battle.sharedModelLibrary(manifest),null,manifest);
 assert.match(readFileSync(new URL('../src/v03/boot.js',import.meta.url),'utf8'),/battle\?\.shareModelKinds\?\.\(TITLE_FOE\.kind,AMBUSH\.kind\)/);
 scene.dispose();engine.dispose();
});
