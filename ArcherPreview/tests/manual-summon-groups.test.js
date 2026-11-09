import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {BossBattle,bossSpawnPositions,MAX_BOSSES} from '../src/boss-battle.js';
import {MAX_SUMMON_PER_KIND} from '../src/summon-limits.js';

function fixture(t,mapId='great-plains'){
 const engine=new NullEngine(),scene=new Scene(engine),world={scene,mapId,cave:mapId==='witch-cave'},player=new TransformNode('player',scene);
 const libraries=Array.from({length:4},()=>({loads:0,async load(){this.loads++;}}));
 const battle=new BossBattle(world,()=>{},{},{},{models:libraries[0],goblinModels:libraries[1],elenaModels:libraries[2],mourningModels:libraries[3]});
 battle.preparationOptions={frame:async()=>{},maxBlocks:4};
 const made=[];battle.manualEncounter=function(kind,index){
  const phase=kind==='elena'?1:kind==='mourning-elena'?2:null,pool=phase===1?this.elenaPool:phase===2?this.mourningPool:kind==='goblin'?this.goblinPool:this.pool;
  if(!pool[index]){
   const actor=new TransformNode(kind+'-'+index,scene);actor.setEnabled(false);
   const enemy={kind:phase?'elena':kind,phase,radius:phase===2?1.5:.7,actor,number:index+1,active:false,preparations:0,resets:0,ring:{setEnabled(value){this.enabled=value;}},
    hide(){this.active=false;this.actor.setEnabled(false);this.ring.setEnabled(false);},
    async prepareHidden({preparation}){if(!this.assetPrepared){await preparation.step('fixture-prepare',()=>{this.preparations++;this.assetPrepared=true;this.animator={resetForReuse:()=>this.resets++};});}},
    async summon(player,options){this.options=options;options.preparation.check();if(options.reuseAnimator)this.animator.resetForReuse();this.actor.position.copyFrom(options.position);this.home={x:this.actor.position.x,z:this.actor.position.z};this.actor.rotation.y=options.rotationY;this.brain={hp:100,wait:0};this.active=options.activate!==false;this.actor.setEnabled(this.active);},
    inspect(){return {kind:this.kind,phase:this.phase,active:this.active};},
   };pool.push(enemy);made.push(enemy);
  }return pool[index];
 };
 t.after(()=>{battle.hide();scene.dispose();engine.dispose();});return {battle,world,player,libraries,made};
}

test('manual cap is20 per kind; both Elena phases coexist with20 bears and20 goblins on every map',async t=>{
 assert.equal(MAX_BOSSES,20);assert.equal(MAX_SUMMON_PER_KIND,20);
 for(const mapId of ['village','great-plains','monster-forest','witch-cave']){
  const f=fixture(t,mapId);
  for(const kind of ['bear','goblin','elena','mourning-elena'])assert.equal(await f.battle.summon(f.player,99,kind),true);
  assert.equal(f.battle.encounters.length,80,mapId);for(const pool of [f.battle.pool,f.battle.goblinPool,f.battle.elenaPool,f.battle.mourningPool])assert.equal(pool.length,20);
  assert.equal(new Set(f.made.map(enemy=>enemy.actor)).size,80);
  const state=f.battle.inspect();assert.deepEqual([state.bearCount,state.goblinCount,state.elenaCount,state.mourningCount],[20,20,20,20]);
 }
});

test('warm groups reuse prepared actors/animators; all remain hidden until atomic publication',async t=>{
 const {battle,player}=fixture(t);await battle.summon(player,20,'elena');const old=[...battle.elenaPool];
 await battle.summon(player,3,'bear');const bears=[...battle.pool];let frames=0;
 battle.preparationOptions={frame:async()=>{frames++;assert.ok(battle.elenaPool.every(e=>!e.active&&!e.actor.isEnabled()));assert.ok(bears.every(e=>e.active&&e.actor.isEnabled()));}};
 assert.equal(await battle.summon(player,20,'elena'),true);assert.ok(frames>0);
 assert.deepEqual(battle.elenaPool,old);assert.ok(old.every(e=>e.preparations===1&&e.resets===2&&e.options.activate===false&&e.active&&e.actor.isEnabled()));assert.equal(battle.encounters.length,23);
});

test('twenty fallen saints transform independently through a serial queue without wiping the other actors or player resources',async t=>{
 const {battle,player}=fixture(t);await battle.summon(player,20,'elena');await battle.summon(player,2,'bear');
 const originals=[...battle.elenaPool],bears=[...battle.pool],hp=battle.playerHp,potions=battle.potions.remaining;
 for(const source of originals){source.brain.hp=0;source.onTransform();}
 await battle.manualTransformPending;
 assert.equal(battle.encounters.length,22);assert.ok(originals.every(e=>!e.active));assert.ok(battle.mourningPool.every(e=>e.active));assert.equal(battle.mourningPool.length,20);assert.ok(bears.every(e=>e.active));assert.equal(battle.playerHp,hp);assert.equal(battle.potions.remaining,potions);
});

test('a full20 witch group never becomes21 when another saint dies',async t=>{
 const {battle,player}=fixture(t);await battle.summon(player,20,'mourning-elena');await battle.summon(player,1,'elena');
 const source=battle.elenaPool[0];source.brain.hp=0;assert.equal(await source.onTransform(),false);assert.equal(battle.mourningPool.length,20);assert.equal(battle.blockedManualTransforms.size,1);assert.ok(battle.mourningPool.every(e=>e.active));
 battle.mourningPool[0].corpseGone=true;battle.resumeManualTransforms();assert.equal(await battle.manualTransformPending,true);assert.equal(battle.mourningPool.length,20);assert.equal(battle.blockedManualTransforms.size,0);assert.equal(source.active,false);assert.equal(battle.encounters.length,20);
});

test('leaving a map cancels an unfinished20 actor group and never publishes it in the new map',async t=>{
 const {battle,player,world}=fixture(t);let moved=false;
 battle.preparationOptions={frame:async()=>{if(!moved){moved=true;battle.hide();world.mapId='village';}}};
 assert.equal(await battle.summon(player,20,'mourning-elena'),false);assert.equal(battle.encounters.length,0);assert.ok(battle.mourningPool.every(e=>!e.active));assert.equal(battle.loading,false);
});

test('a navigation failure preserves the other summoned kind and leaves the requested group hidden',async t=>{
 const {battle,player,world}=fixture(t);await battle.summon(player,2,'goblin');const goblins=[...battle.goblinPool];world.navigation={findFree(){throw Error('no-safe-space');}};
 await assert.rejects(battle.summon(player,20,'elena'),/no-safe-space/);assert.deepEqual(battle.encounters,goblins);assert.ok(goblins.every(e=>e.active));assert.ok(battle.elenaPool.every(e=>!e.active));assert.equal(battle.lastSummon.status,'error');
});

test('twenty-boss placement spreads the group across rings rather than compressing a five-boss fan',()=>{
 const positions=bossSpawnPositions({position:Vector3.Zero(),rotation:{y:0}},20);
 assert.equal(positions.length,20);assert.equal(new Set(positions.map(p=>p.x.toFixed(6)+','+p.z.toFixed(6))).size,20);
 for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)assert.ok(Vector3.Distance(positions[i],positions[j])>=1.6-1e-6);
});

test('returning to the cave restores the story home instead of adopting an off-map manual actor position',async t=>{
 const {battle,player,world}=fixture(t);await battle.summon(player,3,'elena');const actor=battle.elenaPool[0];actor.actor.position.set(-90,0,90);
 battle.hide();world.cave=true;world.mapId='witch-cave';const home={...battle.residentHome};
 assert.equal(await battle.activateResident(player),true);assert.equal(battle.encounters.length,1);assert.strictEqual(battle.encounters[0],actor);assert.equal(actor.manualSummon,false);assert.deepEqual({x:actor.actor.position.x,z:actor.actor.position.z},home);assert.deepEqual(actor.home,home);
});
