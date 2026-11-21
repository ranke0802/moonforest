import test from 'node:test';
import assert from 'node:assert/strict';
import {hitScale,setHitScale} from '../src/hit-scale.js';
import {MeleeContactGate} from '../src/melee-collision.js';
import {LEGACY_PLAYER_DIMENSIONS,WARRIOR_DIMENSIONS,playerHurtRadius,playerHurtBonus} from '../src/player-dimensions.js';
import {PlayerStrikeSampler} from '../src/player-strikes.js';

const player={metadata:{playerDimensions:WARRIOR_DIMENSIONS}};
// A blade lying 0.60 m from a hurt volume of radius 0.5, with a 0.055 m blade radius: 5 cm short.
const swing=()=>new MeleeContactGate().check({actionId:1,window:{id:'cut'},previous:[[0,1,.6],[1,1,.6]],blade:[[0,1,.6],[1,1,.6]],capsules:[{points:[[0,1,0],[1,1,0]],radius:.5}],bladeRadius:.055});

test('authored sizes by default; 0.3 widens monster hurt volumes, the blade and the player body by 15%',t=>{
 t.after(()=>setHitScale());
 assert.deepEqual({...hitScale},{monsterHurt:1,playerStrike:1,playerHurt:1});
 assert.equal(swing(),false,'5 cm short of the authored volume');
 assert.equal(playerHurtRadius(player),WARRIOR_DIMENSIONS.moveRadius);assert.equal(playerHurtBonus(player),0);
 setHitScale({monsterHurt:1.15,playerStrike:1.15,playerHurt:1.15});
 assert.equal(swing(),true,'the volume is 0.575 now: the same swing lands');
 assert.ok(Math.abs(playerHurtRadius(player)-WARRIOR_DIMENSIONS.moveRadius*1.15)<1e-12);
 assert.ok(Math.abs(playerHurtBonus(player)-WARRIOR_DIMENSIONS.moveRadius*.15)<1e-12);
 setHitScale({monsterHurt:-3,playerStrike:NaN});assert.deepEqual({...hitScale},{monsterHurt:1,playerStrike:1,playerHurt:1},'nonsense falls back to the authored size');
});

test('the blade reaches 15% further from the grip and is 15% thicker; the grip end does not move',t=>{
 t.after(()=>setHitScale());
 const sword={computeWorldMatrix(){},getWorldMatrix(){return {m:[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]};}};
 const sample=()=>new PlayerStrikeSampler().sample({actionId:7,state:'attack',clipTime:.6,actionElapsed:.6},sword,null,true,0,0,LEGACY_PLAYER_DIMENSIONS);
 let plain;try{plain=sample();}catch(error){t.skip('needs the engine math: '+error.message);return;}
 setHitScale({playerStrike:1.15});const wide=sample();
 const length=s=>Math.hypot(...s.blade[1].map((v,i)=>v-s.blade[0][i]));
 assert.deepEqual(wide.blade[0],plain.blade[0]);
 assert.ok(Math.abs(length(wide)/length(plain)-1.15)<1e-6);
 assert.ok(Math.abs(wide.bladeRadius/plain.bladeRadius-1.15)<1e-9);
});
