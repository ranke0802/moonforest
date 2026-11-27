// Camp foes (forest goblins, cave ghoul/zombie) compile behind the loading
// cover and keep their programs (2026-11-27). The S23 20-minute record built
// goblin/ghoul/zombie programs 22 times in play, up to 129 ms each.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {FreeCamera,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {PlayerCombat} from '../src/player-combat.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {readBinaryMapContainer} from '../src/map-container.js';
import {acquireFoeWeapon,mountEnemyWeapon} from '../src/v03/foe-weapons.js';
import {CHAPTER_MONSTER_MODELS} from '../src/v03/chapter-monster-models.js';
import {createChapterEnemyFactory} from '../src/v03/chapter-enemy-encounter.js';
import {CHAPTER_CAMPS} from '../src/v03/chapter-wildlife.js';

async function readRig(scene,url){
  const raw=await fs.readFile(url), jsonLength=raw.readUInt32LE(12), doc=JSON.parse(raw.subarray(20,20+jsonLength));
  delete doc.textures;delete doc.images;delete doc.extensionsUsed;delete doc.extensionsRequired;
  for(const mat of doc.materials??[])if(mat.pbrMetallicRoughness)delete mat.pbrMetallicRoughness.baseColorTexture;
  const json=Buffer.from(JSON.stringify(doc)), padded=Math.ceil(json.length/4)*4;
  const bytes=Buffer.alloc(20+padded+raw.length-20-jsonLength,32);
  raw.copy(bytes,0,0,20);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded,12);
  json.copy(bytes,20);raw.copy(bytes,20+padded,20+jsonLength);
  return readBinaryMapContainer(scene,new Uint8Array(bytes),new URL('.',url).href,{fileName:url.pathname.split('/').pop()});
}
function fixture(options={}){
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  caveFogFallback(scene).getInternalTexture().isReady=true;
  scene.activeCamera=new FreeCamera('camera',new Vector3(0,2,3),scene);
  const player=new TransformNode('player',scene);player.position.set(0,0,4);
  const world={scene,mapId:'monster-forest',shadows:{addShadowCaster(){},removeShadowCaster(){}}};
  const battle={combat:new PlayerCombat(),encounters:[],bossChanged(){}};battle.combat.reset();
  let loads=0,builds=0;
  // A build = a program the engine did not have yet (Babylon caches by source + defines).
  const createEffect=engine.createEffect.bind(engine);
  engine.createEffect=(...args)=>{const before=Object.keys(engine._compiledEffects).length,effect=createEffect(...args);if(Object.keys(engine._compiledEffects).length>before)builds++;return effect;};
  const factory=createChapterEnemyFactory({world,battle,incremental:false,...options,
    loadModel:(...args)=>{loads++;return readRig(...args);},mountWeapon:(scene,owner,kind)=>mountEnemyWeapon(scene,owner,kind,(scene,id)=>acquireFoeWeapon(scene,id,readRig))});
  const params=(kind,id,x=0)=>({kind,id,x,z:0,player,home:{x:0,z:0,radius:13,combatRadius:7.2}});
  return {scene,battle,factory,params,get loads(){return loads;},get builds(){return builds;},dispose(){factory.dispose();scene.dispose();engine.dispose();}};
}
const kinds=[...new Set(CHAPTER_CAMPS['monster-forest'].map(row=>row.kind))];

test('before: without a warm the first foe of each kind builds its programs in play',async t=>{
  const f=fixture();t.after(()=>f.dispose());
  const first=await f.factory.create(f.params(kinds[0],'first'));assert.ok(f.builds>0,kinds[0]+' compiled at its first spawn');first.dispose();
  for(const kind of kinds.slice(1))(await f.factory.create(f.params(kind,kind))).dispose();
  t.diagnostic(`programs built at first spawns in play: ${f.builds}`);
});

for(const keepPrograms of [true,false])test(`after warm (keepPrograms ${keepPrograms}): forest foes spawn, leave and return without a load or a program build`,async t=>{
  const f=fixture({keepPrograms});t.after(()=>f.dispose());
  const start=performance.now(),done=await f.factory.warm(kinds);const warmMs=performance.now()-start;
  assert.deepEqual(done,kinds);assert.equal(f.loads,kinds.length);
  assert.equal(f.battle.encounters.length,0,'warm foes never join the battle');
  const warmed=f.builds;assert.ok(warmed>0);
  t.diagnostic(`warm ${kinds.length} kinds: ${Math.round(warmMs)} ms (Node, NullEngine), ${warmed} programs`);
  for(let round=0;round<2;round++){
    const handles=[];for(const kind of kinds)handles.push(await f.factory.create(f.params(kind,kind+round)));
    assert.equal(f.battle.encounters.length,kinds.length);
    for(const handle of handles)handle.dispose();
  }
  assert.equal(f.loads,kinds.length,'sources are held for the visit');
  assert.equal(f.builds,warmed,'no program built in play');
  f.factory.dispose();assert.equal(f.scene.meshes.length,0,'the visit releases its held sources');assert.equal(f.scene.skeletons.length,0);
});

test('a camp visit warms its foe kinds (not the cave beasts) before the first proximity spawn',async()=>{
  const {createChapterWildlife}=await import('../src/v03/chapter-wildlife.js');
  const calls=[];const world={mapId:'witch-cave',scene:{isDisposed:false}};
  const wildlife=createChapterWildlife({world,battle:{},getPlayer:()=>null,makeEnemies:()=>({warm:async(kinds)=>{calls.push(kinds);return [...new Set(kinds)];},create:async()=>null,dispose(){}}),makeBeasts:()=>{throw new Error('beasts are not warmed here');}});
  assert.deepEqual(await wildlife.prepare(),['zombie','ghoul-warrior']);assert.equal(calls.length,1);
  world.mapId='village';assert.deepEqual(await wildlife.prepare(),[],'a stale visit does nothing');
});
