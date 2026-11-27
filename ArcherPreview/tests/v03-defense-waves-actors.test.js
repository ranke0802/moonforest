// Jeffrey's defense errand with the real chapter foes (GLB rigs, NullEngine):
// shared sources, the march on the palisade, tuned hits, release with the visit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {FreeCamera,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {PlayerCombat} from '../src/player-combat.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {readBinaryMapContainer} from '../src/map-container.js';
import {acquireFoeWeapon,mountEnemyWeapon} from '../src/v03/foe-weapons.js';
import {createChapterEnemyFactory} from '../src/v03/chapter-enemy-encounter.js';
import {createWaveRaid,wavePlan} from '../src/v03/defense-waves.js';
import {ERRANDS} from '../src/v03/data/chapter1.js';
import {setWorldCharacter} from '../src/world-limits.js';

const STEP=ERRANDS.find(errand=>errand.id==='W01').steps[0];
async function readRig(scene,url){
 // As in v03-chapter-enemy-encounter.test.js: real skinned meshes, no texture codec.
 const raw=await fs.readFile(url),jsonLength=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+jsonLength));
 delete doc.textures;delete doc.images;delete doc.extensionsUsed;delete doc.extensionsRequired;
 for(const mat of doc.materials??[])if(mat.pbrMetallicRoughness)delete mat.pbrMetallicRoughness.baseColorTexture;
 const json=Buffer.from(JSON.stringify(doc)),padded=Math.ceil(json.length/4)*4;
 const bytes=Buffer.alloc(20+padded+raw.length-20-jsonLength,32);
 raw.copy(bytes,0,0,20);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded,12);
 json.copy(bytes,20);raw.copy(bytes,20+padded,20+jsonLength);
 return readBinaryMapContainer(scene,new Uint8Array(bytes),new URL('.',url).href,{fileName:url.pathname.split('/').pop()});
}
const until=async(ok,label,ms=60000)=>{const end=Date.now()+ms;while(!ok()){if(Date.now()>end)throw new Error('timed out: '+label);await new Promise(r=>setTimeout(r,5));}};

test('a stage brings real foes in, marches them on the palisade, tunes their hits and releases them with the visit',async()=>{
 setWorldCharacter('warrior-v3');// the village's 48 m circle
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 caveFogFallback(scene).getInternalTexture().isReady=true;
 scene.activeCamera=new FreeCamera('camera',new Vector3(0,2,3),scene);
 const player=new TransformNode('player',scene);player.position.set(0,0,27);
 const world={scene,mapId:'village',shadows:{addShadowCaster(){},removeShadowCaster(){}}};
 const battle={combat:new PlayerCombat(),encounters:[],bossChanged(){}};battle.combat.reset();
 const loads=new Map(),defeats=[];
 const loadEnemies=async()=>({createChapterEnemyFactory:options=>createChapterEnemyFactory({...options,incremental:false,
  loadModel:(scene,url,signal)=>{const name=url.pathname.split('/').pop();loads.set(name,(loads.get(name)??0)+1);return readRig(scene,url,signal);},
  mountWeapon:(scene,owner,kind)=>mountEnemyWeapon(scene,owner,kind,(scene,id)=>acquireFoeWeapon(scene,id,readRig))})});
 const raid=createWaveRaid({world,battle,getPlayer:()=>player,onDefeat:event=>defeats.push(event),loadEnemies,onError:(label,error)=>{throw error;}});
 try{
  const plan=wavePlan(STEP,5);// 4 goblins, 2 archers, 1 hobgoblin
  assert.ok(raid.begin(plan));
  await until(()=>raid.alive===6&&!raid.pending,'six foes');
  assert.equal(battle.encounters.length,6);
  assert.equal(loads.get('goblin-warrior.glb'),1,'one source for every goblin');assert.equal(loads.get('goblin-archer.glb'),1);
  const foes=[...battle.encounters];
  for(const foe of foes)assert.ok(foe.actor.position.z>44,'they come from the village’s north edge, beyond the palisade');
  const goblin=foes.find(foe=>foe.kind==='goblin-warrior');
  assert.equal(goblin.brain.maxHp,Math.round(115*1.2));assert.equal(goblin.profile.damage,Math.round(18*1.1));
  assert.equal(goblin.attackDamage({damage:18}),Math.round(18*1.1));
  // Nothing moves before the talk ends.
  const before=goblin.actor.position.z;
  for(let i=0;i<20;i++){for(const foe of foes)foe.update(.05,player);raid.update(.05);}
  assert.ok(Math.abs(goblin.actor.position.z-before)<.05,'they wait outside');
  raid.go();
  for(let i=0;i<400;i++){for(const foe of foes)foe.update(.05,player);raid.update(.05);}
  assert.ok(goblin.actor.position.z<before-8,`the goblin marched in (z ${before.toFixed(1)} → ${goblin.actor.position.z.toFixed(1)})`);
  // One falls: the next (the hobgoblin, last in the queue) comes in.
  goblin.brain.hit({damage:9999});goblin.update(.02,player);goblin.update(.02,player);
  assert.equal(defeats.length,1);assert.equal(defeats[0].wave,5);assert.equal(defeats[0].family,'goblin');assert.equal(defeats[0].kind,'goblin-warrior');
  raid.update(.3);
  await until(()=>raid.alive===6&&!raid.pending,'the next one');
  assert.ok(battle.encounters.some(foe=>foe.kind==='hobgoblin-boss'));
  const elite=battle.encounters.find(foe=>foe.kind==='hobgoblin-boss');
  assert.equal(elite.brain.maxHp,Math.round(780*1.2*.6));assert.ok(elite.waveElite);
  assert.equal(raid.left,6);
 }finally{
  raid.dispose();
  assert.equal(battle.encounters.length,0,'the visit releases every foe');
  assert.equal(scene.skeletons.length,0);assert.equal(scene.animationGroups.length,0);
  scene.dispose();engine.dispose();
 }
});
