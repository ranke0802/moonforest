import test from 'node:test';
import assert from 'node:assert/strict';
import {BossBattle} from '../src/boss-battle.js';

test('registered development actors share production reaction gates, style and hide lifecycle without entering indexed pools',()=>{
 let resets=0,hides=0,settings=0,clears=0;
 const battle=new BossBattle({scene:{}},()=>{},()=>{},()=>{});
 const encounter={kind:'goblin',gate:{reset(){resets++;}},hide(){hides++;},brain:{configureAttacks(){settings++;}}};
 battle.developmentPool=[encounter];battle.developmentLifecycle=()=>clears++;
 assert.equal(battle.allPooled.filter(value=>value===encounter).length,1);
 assert.equal(battle.goblinPool.length,0);assert.equal(battle.pool.length,0);
 battle.playerHit(.2,{});assert.equal(resets,1);
 battle.setAttackSettings({goblin:{}});assert.equal(settings,1);
 battle.hide();assert.equal(hides,1);assert.equal(clears,1);assert.equal(battle.encounters.length,0);
 battle.developmentPool=[];assert.equal(battle.allPooled.length,0);
});
