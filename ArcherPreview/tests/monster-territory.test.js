import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,TransformNode,Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {createActorEncounterFactory} from '../src/actor-encounter-adapter.js';
import {BossBattle} from '../src/boss-battle.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {regularWolfManifest,isRegularWolf} from '../src/regular-wolf-spec.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {setWorldCharacter} from '../src/world-limits.js';

const prepare=()=>createBossPreparation({incremental:false});
async function fixture(t){
 setWorldCharacter('warrior');const engine=new NullEngine(),scene=new Scene(engine);Object.assign(engine.getCaps(),{maxVertexUniformVectors:256,maxVertexTextureImageUnits:16,textureFloat:true});scene.useRightHandedSystem=true;new FreeCamera('camera',new Vector3(0,6,-16),scene);
 const player=new TransformNode('player',scene);player.position.set(0,0,6);const foot=new TransformNode('test-player-foot',scene),head=new TransformNode('test-player-head',scene);foot.parent=head.parent=player;head.position.y=1.6;const playerNodes={'mixamorig:RightFoot':foot,'mixamorig:Head':head};
 const height=(x,z)=>.01*x-.01*z,world={scene,release:'moonforest-0.2',mapId:'great-plains',terrain:{heightAt:height,place:p=>{p.y=height(p.x,p.z);}},navigation:new VillageNavigation([]),shadows:{addShadowCaster(){},removeShadowCaster(){}}};world.terrain.place(player.position);
 const battle=new BossBattle(world,()=>{},()=>{},()=>true),loaders=[],libraries=[];
 const factory=createActorEncounterFactory({world,battle,getPlayer:()=>player,libraryFactory(_scene,id){
  const library={loads:0,async load(){if(this.loads)return;this.loads++;const base=new URL('../public/assets/',import.meta.url),manifest=isRegularWolf(id)?regularWolfManifest(id):id;this.config=JSON.parse(readFileSync(new URL(manifest+'.json',base)));const {gltf,files}=await readRuntimeGltf(new URL(this.config.model,base));
   for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression'&&x!=='KHR_texture_basisu');
   for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+files.get(buffer.uri).data.toString('base64');
   const loader=new GLTFFileLoader();loaders.push(loader);loader.skipMaterials=true;this.container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const group of this.container.animationGroups)group.stop();
   const paint=new StandardMaterial(id+'-territory-test',scene);for(const mesh of this.container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
  }};libraries.push(library);return {library,owned:false};
 }});
 t.after(async()=>{await factory.dispose();for(const library of libraries)library.container?.dispose();for(const loader of loaders)loader.dispose();scene.dispose();engine.dispose();setWorldCharacter('warrior');});return {factory,world,battle,player,playerNodes};
}

test('fox, regular wolf, boar, alpha and bear stop outgoing attacks and walk home through their real encounter path',async t=>{
 const f=await fixture(t);
 for(const id of ['fox.r1','gray-wolf.r1','boar.r1','alpha-wolf.r8','guardian-bear.standard']){
  f.player.position.set(0,0,6);f.world.terrain.place(f.player.position);const zone={x:0,z:0,radius:12,returnRadius:.4,reengageRadius:10};
  const adapter=f.factory(id);await adapter.activate({position:new Vector3(),row:{territory:zone}},{preparation:prepare()});const e=adapter.encounter;
  e.actor.position.set(0,0,8);f.world.terrain.place(e.actor.position);e.brain.hp=e.brain.maxHp-17;const hp=e.brain.hp;e.combat.hp=400;
  if(e.brain.startAction)e.brain.startAction('lunge');else e.brain.start('Skill_02','attack');
  assert.equal(e.grab.start(f.player,f.playerNodes,e.brain.serial),true,id+': owns a native capture before exit');
  e.pendingEvents.push({type:'attack',damage:999});f.player.position.z=20;f.world.terrain.place(f.player.position);const playerPosition=f.player.position.clone();
  const before=e.actor.position.clone();e.update(1/30,f.player);assert.equal(adapter.snapshot().territory.returning,true,id);assert.notEqual(e.brain.mode,'attack',id);assert.equal(e.pendingEvents.length,0,id);assert.equal(e.receiveBossHit({damage:999,bodyContact:true}),false,id);
  assert.equal(e.grab.active,false,id+': exit releases its native capture');assert.equal(e.combat.grabOwner,null,id);
  assert.ok(Vector3.Distance(before,e.actor.position)<.1,id+': return uses bounded walking displacement');assert.equal(e.actor.position.y,f.world.terrain.heightAt(e.actor.position.x,e.actor.position.z));
  f.player.position.z=9;f.world.terrain.place(f.player.position);e.update(1/30,f.player);assert.equal(adapter.snapshot().territory.returning,true,id+': early player reentry does not skip returning home');
  f.player.position.copyFrom(playerPosition);
  for(let frame=0;frame<420&&!adapter.snapshot().territory.arrived;frame++){e.update(1/30,f.player);assert.notEqual(e.brain.mode,'attack',id);}
  assert.equal(adapter.snapshot().territory.arrived,true,id+': reaches its own home');assert.equal(adapter.snapshot().territory.returning,true,id+': outside player cannot restart combat');
  assert.equal(e.brain.hp,hp,id+': returning never heals');assert.equal(e.combat.hp,400,id+': returning never resets player health');assert.deepEqual(f.player.position.asArray(),playerPosition.asArray(),id+': returning never relocates player');
  f.player.position.z=11;f.world.terrain.place(f.player.position);e.update(1/30,f.player);assert.equal(adapter.snapshot().territory.returning,true,id+': inner reentry margin prevents boundary chatter');
  f.player.position.z=9;f.world.terrain.place(f.player.position);e.update(1/30,f.player);assert.equal(adapter.snapshot().territory.returning,false,id);await adapter.dispose();
 }
});

test('territory capture release is actor-owned; wall routing, reactions and dormant reuse keep native state',async t=>{
 const f=await fixture(t),adapter=f.factory('gray-wolf.r1'),zone={x:0,z:0,radius:12,returnRadius:.4,reengageRadius:10};
 await adapter.activate({position:new Vector3(),row:{territory:zone}},{preparation:prepare()});const e=adapter.encounter;
 f.world.navigation=new VillageNavigation([{id:'territory-wall',x:0,z:4,radius:.8,height:3}]);e.actor.position.set(0,0,8);e.brain.startAction('pin');
 assert.equal(e.grab.start(f.player,{},e.brain.serial),true);assert.strictEqual(e.combat.grabOwner,e);f.player.position.z=20;f.world.terrain.place(f.player.position);const playerBefore=f.player.position.clone();e.update(1/30,f.player);
 assert.equal(e.grab.active,false);assert.equal(e.combat.grabOwner,null);assert.deepEqual(f.player.position.asArray(),playerBefore.asArray());
 let sideStep=false;for(let frame=0;frame<480&&!adapter.snapshot().territory.arrived;frame++){e.update(1/30,f.player);sideStep||=Math.abs(e.actor.position.x)>.3;assert.ok(f.world.navigation.free(e.actor.position,e.radius));}
 assert.equal(sideStep,true,'return follows the existing route around the real wall');assert.equal(adapter.snapshot().territory.arrived,true);
 e.brain.hit({damage:10,heavy:true});assert.equal(e.brain.mode,'down');e.update(1/30,f.player);assert.equal(e.brain.mode,'down','return does not overwrite a real knockdown');
 const other={id:'another-grabber'};e.combat.grabOwner=other;adapter.hide();assert.strictEqual(e.combat.grabOwner,other,'retiring this actor never resets another capture owner');e.combat.grabOwner=null;
 f.world.navigation=new VillageNavigation([]);f.player.position.set(0,0,6);await adapter.activate({position:new Vector3(5,0,0),row:{territory:{x:5,z:0,radius:4,returnRadius:.3,reengageRadius:3}}},{preparation:prepare()});
 assert.equal(adapter.snapshot().territory.x,5);assert.equal(adapter.snapshot().territory.home.x,5,'a pooled life adopts the new group territory and home');
 e.combat.grabOwner=other;e.update(1/30,f.player);assert.equal(adapter.snapshot().territory.returning,true);assert.strictEqual(e.combat.grabOwner,other,'territory exit never releases another actor grab');e.combat.grabOwner=null;
 adapter.hide();await adapter.activate({position:new Vector3()},{preparation:prepare()});assert.equal(adapter.snapshot().territory.enabled,false,'a row without territory disables the previous group leash');
 await adapter.dispose();const manual=f.factory('gray-wolf.r1');await manual.activate({position:new Vector3()},{preparation:prepare()});assert.equal(manual.snapshot().territory,undefined);assert.strictEqual(manual.encounter.update,Object.getPrototypeOf(manual.encounter).update,'manual summons keep their original encounter update');
 await manual.dispose();f.world.release='moonforest-0.1';const legacy=f.factory('guardian-bear.standard');await legacy.activate({position:new Vector3(),row:{territory:zone}},{preparation:prepare()});assert.equal(legacy.snapshot().territory,undefined,'0.1 never enables authored territory behavior');assert.strictEqual(legacy.encounter.update,Object.getPrototypeOf(legacy.encounter).update);
});
