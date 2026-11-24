import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {FreeCamera,LoadAssetContainerAsync,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {PlayerCombat} from '../src/player-combat.js';
import {acquireFoeWeapon,mountEnemyWeapon} from '../src/v03/foe-weapons.js';
import {CHAPTER_MONSTER_MODELS} from '../src/v03/chapter-monster-models.js';
import {CHAPTER_COMBAT,ChapterEnemyBrain} from '../src/v03/chapter-enemy-brain.js';
import {createChapterEnemyFactory} from '../src/v03/chapter-enemy-encounter.js';

const clips={idle:1,walk:1,hit:1,death:3.5,attack:2};
test('all six chapter rigs telegraph before one contact and can be interrupted',()=>{
  assert.deepEqual(Object.keys(CHAPTER_COMBAT).sort(),Object.keys(CHAPTER_MONSTER_MODELS).sort());
  for(const profile of Object.values(CHAPTER_COMBAT)){
    const brain=new ChapterEnemyBrain(profile,clips);brain.engaged=true;brain.hasSight=true;
    brain.update(.36,1);assert.equal(brain.mode,'attack');
    assert.deepEqual(brain.update(profile.windup-.02,1).events,[]);
    assert.equal(brain.update(.03,1).events.length,1);
    assert.deepEqual(brain.update(.03,1).events,[]);
    brain.hit({damage:1,heavy:true});assert.equal(brain.mode,'hit');
    brain.hit({damage:1000});assert.equal(brain.mode,'dead');
    assert.equal(brain.hit({damage:1}),false);
  }
});

async function readRig(scene,url){
  // NullEngine has no browser image codec. Retain real skinned meshes, clips,
  // skeletons and binary accessors; strip texture references in memory only.
  const raw=await fs.readFile(url), jsonLength=raw.readUInt32LE(12), doc=JSON.parse(raw.subarray(20,20+jsonLength));
  delete doc.textures;delete doc.images;delete doc.extensionsUsed;delete doc.extensionsRequired;
  for(const mat of doc.materials??[])if(mat.pbrMetallicRoughness)delete mat.pbrMetallicRoughness.baseColorTexture;
  const json=Buffer.from(JSON.stringify(doc)), padded=Math.ceil(json.length/4)*4;
  const bytes=Buffer.alloc(20+padded+raw.length-20-jsonLength,32);
  raw.copy(bytes,0,0,20);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded,12);
  json.copy(bytes,20);raw.copy(bytes,20+padded,20+jsonLength);
  return LoadAssetContainerAsync(new Uint8Array(bytes),scene,{pluginExtension:'.glb'});
}
function fixture(extra={}){
  const engine=new NullEngine(),scene=new Scene(engine);
  scene.activeCamera=new FreeCamera('camera',new Vector3(0,2,3),scene);
  const player=new TransformNode('player',scene); player.position.set(0,0,4);
  const world={scene,mapId:'monster-forest',shadows:{addShadowCaster(){},removeShadowCaster(){}}};
  const battle={combat:new PlayerCombat(),encounters:[],bossChanged(){}};battle.combat.reset();
  let loads=0;const kills=[];
  const factory=createChapterEnemyFactory({world,battle,incremental:false,onDefeat:event=>kills.push(event),
    loadModel:(...args)=>{loads++;return readRig(...args);},mountWeapon:(scene,owner,kind)=>mountEnemyWeapon(scene,owner,kind,(scene,id)=>acquireFoeWeapon(scene,id,readRig)),...extra});
  const params=(kind,id,x=0)=>({kind,id,x,z:0,player,home:{x:0,z:0,radius:13,combatRadius:7.2}});
  return {scene,world,battle,player,kills,params,factory,get loads(){return loads;},dispose(){factory.dispose();scene.dispose();engine.dispose();}};
}
test('real chapter GLB clones share a source and release bones, materials and groups with last actor',async()=>{
  const f=fixture();
  try{
    const order=f.params('goblin-warrior','guard-a');
    const [a,b]=await Promise.all([f.factory.create(order),f.factory.create({...order,id:'guard-b',x:2})]);
    assert.equal(f.loads,1);assert.equal(f.battle.encounters.length,2);
    assert.notEqual(a.encounter.asset.skeletons[0],b.encounter.asset.skeletons[0]);
    assert.notEqual(a.encounter.nodes.Head,b.encounter.nodes.Head);
    assert.equal(a.encounter.hurtCapsules().length,4);
    const held=a.encounter.asset.meshes.find(m=>m.name==='goblin-warrior-held-weapon');
    assert.equal(held.parent.parent,a.encounter.nodes['Hand.R']);
    a.encounter.update(.1,f.player);a.encounter.poseAndContacts(f.player,{state:'idle'},null,null);
    assert.equal(a.encounter.engaged,true);
    for(const point of a.encounter.hurtCapsules().flatMap(c=>c.points).flat())assert.ok(Number.isFinite(point));
    f.player.position.z=18;a.encounter.update(.1,f.player);assert.equal(a.encounter.engaged,false);
    a.encounter.brain.hit({damage:999});a.encounter.update(.02,f.player);a.encounter.update(.02,f.player);
    assert.equal(f.kills.length,1);assert.equal(f.kills[0].id,'guard-a');
    a.dispose();assert.equal(f.battle.encounters.length,1);assert.ok(f.scene.skeletons.length>0);
    b.dispose();assert.equal(f.scene.skeletons.length,0);assert.equal(f.scene.animationGroups.length,0);
    assert.equal(f.battle.active,false);assert.equal(f.scene.meshes.length,0);
  }finally{f.dispose();}
});
test('archer arrow misses a moving target and hits a stationary target; caster uses its marked ground point',async()=>{
  const f=fixture();
  try{
    for(const kind of ['goblin-archer','goblin-shaman']){
      f.player.position.set(0,0,4);
      const handle=await f.factory.create(f.params(kind,kind)),enc=handle.encounter;
      const advance=()=>{enc.update(.05,f.player);enc.poseAndContacts(f.player,{state:'idle'},null,null);};
      for(let i=0;i<70&&!enc.flying;i++)advance();
      assert.equal(enc.flying,true);const hp=f.battle.combat.hp;
      f.player.position.x=3;
      for(let i=0;i<24;i++)advance();
      assert.equal(f.battle.combat.hp,hp);
      f.player.position.x=0;
      for(let i=0;i<150&&f.battle.combat.hp===hp;i++)advance();
      assert.ok(f.battle.combat.hp<hp);
      handle.dispose();f.battle.combat.reset();
    }
  }finally{f.dispose();}
});
test('melee contact obeys dodge, block direction and map line of sight',async()=>{
  const f=fixture();
  try{
    const {encounter:enc}=await f.factory.create(f.params('ghoul-warrior','sentry'));
    f.player.position.z=1;
    const advance=(action={state:'idle'})=>{enc.update(.05,f.player);enc.poseAndContacts(f.player,action,null,null);};
    const hp=f.battle.combat.hp;
    for(let i=0;i<60;i++)advance({state:'dodge',actionId:2});
    assert.equal(f.battle.combat.hp,hp);
    for(let i=0;i<60;i++)advance({state:'shieldPush',actionId:3,actionElapsed:.4});
    assert.equal(f.battle.combat.hp,hp);
    f.world.navigation={segmentClear:()=>false,steer:()=>null,constrain(){}};
    for(let i=0;i<70;i++)advance();
    assert.equal(f.battle.combat.hp,hp);
    f.world.navigation=null;
    for(let i=0;i<80&&f.battle.combat.hp===hp;i++)advance();
    assert.ok(f.battle.combat.hp<hp);
  }finally{f.dispose();}
});
test('cancelling a pending region discards a late source before cloning or registering it',async()=>{
  let resolve,started;const ready=new Promise(r=>started=r);let releases=0;
  const f=fixture({loadModel:()=>{started();return new Promise(r=>resolve=r);}});
  try{
    const create=f.factory.create(f.params('zombie','cave-a'));await ready;
    f.factory.dispose();resolve({dispose(){releases++;}});
    await assert.rejects(create,{name:'AbortError'});
    assert.equal(releases,1);assert.equal(f.battle.encounters.length,0);
  }finally{f.dispose();}
});
