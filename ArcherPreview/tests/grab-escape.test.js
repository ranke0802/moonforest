import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, TransformNode } from '@babylonjs/core';
import { BossBattle } from '../src/boss-battle.js';
import { BossEncounter } from '../src/boss-encounter.js';
import { WarriorV2Controller } from '../src/warrior-v2.js';
import { dodgeDirection } from '../src/dodge.js';

function fixture(t){
 const engine=new NullEngine(),scene=new Scene(engine),player=new TransformNode('player',scene);
 player.position.set(1,0,2);player.rotation.y=.6;
 const controller=new WarriorV2Controller({durations:{idle:2,run:1,dodge:2}});
 const battle=new BossBattle({scene},()=>{});
 const owner=new BossEncounter({scene},()=>{},()=>{},(_,options)=>options.captured?controller.capture():controller.releaseCapture(),{combat:battle.combat});
 const nodes={};
 for(const [name,y] of [['RightFoot',.1],['Head',1.7]]){const n=new TransformNode(name,scene);n.parent=player;n.position.y=y;nodes['mixamorig:'+name]=n;}
 owner.grab.start(player,nodes,7);owner.pendingEvents=[{damage:300}];
 t.after(()=>{owner.grab.reset();scene.dispose();engine.dispose();});
 return {battle,owner,player,controller};
}
test('escape succeeds up to and including 0.3s, restores grounded rotation and starts the selected roll',t=>{
 for(const time of [0,.15,.3]){
  const {battle,owner,player,controller}=fixture(t);
  owner.grab.time=time;player.position.set(3,1,4);player.rotation.y=2;
  assert.equal(controller.captured,true);assert.equal(battle.canEscapeGrab,true);
  assert.equal(battle.escapeGrab(),true);assert.equal(battle.combat.grabOwner,null);
  assert.equal(controller.captured,false);assert.equal(owner.grab.active,false);
  assert.deepEqual(player.position.asArray(),[1,0,2]);assert.equal(player.rotation.y,.6);
  assert.equal(owner.pendingEvents.length,0);assert.equal(battle.actionVersion,1);
  assert.equal(controller.dodge(),true);assert.equal(controller.update(.01).state,'dodge');
  const direction=dodgeDirection({x:1,y:0},0,player.rotation.y);
  assert.deepEqual(direction,{x:0,z:-1});
  assert.equal(battle.escapeGrab(),false);assert.equal(battle.playerHp,500);
 }
});
test('late escape and escape during throw/recovery fail without unlocking or changing pose',t=>{
 for(const [phase,time] of [['holding',.3001],['flight',0],['recover',0]]){
  const {battle,owner,player,controller}=fixture(t);owner.grab.phase=phase;owner.grab.time=time;
  const position=player.position.clone();
  assert.equal(battle.canEscapeGrab,false);assert.equal(battle.escapeGrab(),false);
  assert.equal(controller.captured,true);assert.equal(controller.dodge(),false);
  assert.ok(player.position.equals(position));assert.equal(battle.combat.grabOwner,owner);
 }
});
