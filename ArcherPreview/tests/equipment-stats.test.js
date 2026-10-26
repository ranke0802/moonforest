import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix} from '@babylonjs/core';
import {EQUIPMENT_STYLES,equipmentStats,equipmentLabel,armoredDamage} from '../src/equipment-stats.js';
import {PlayerStrikeSampler,PLAYER_STRIKES} from '../src/player-strikes.js';
import {MeleeContactGate} from '../src/melee-collision.js';

const weapon={computeWorldMatrix(){},getWorldMatrix:()=>Matrix.Translation(0,1,1)};
test('independently selected sword and shield supply +5/7/9 and +2/3/4 stats and labels',()=>{
  for(const sword of EQUIPMENT_STYLES)for(const shield of EQUIPMENT_STYLES){
    assert.deepEqual(equipmentStats({sword:sword.id,shield:shield.id}),{attackBonus:sword.attackBonus,defense:shield.defense});
    assert.ok(equipmentLabel('sword',sword).endsWith(`+${sword.attackBonus}`));assert.ok(equipmentLabel('shield',shield).endsWith(`+${shield.defense}`));
  }
  assert.deepEqual(equipmentStats({sword:'unknown'}),{attackBonus:5,defense:2});
});
test('each sword impact carries the bonus; shield push and canonical clips stay unchanged',()=>{
  const before=JSON.stringify(PLAYER_STRIKES);
  for(const bonus of [5,7,9]){
    for(const [state,time,base] of [['slash',.5,20],['attack',.7,18],['attack',1.3,20],['shieldPush',1.12,10]]){
      const sample=new PlayerStrikeSampler().sample({state,actionId:1,clipTime:time},weapon,weapon,true,0,bonus);
      const gate=new MeleeContactGate(),input={...sample,capsule:[[0,0,1],[0,2,1]],radius:2};
      assert.equal(gate.collect(input).hits[0].damage,base+(state==='shieldPush'?0:bonus));assert.equal(gate.collect(input).hits.length,0);
    }
    const sample=new PlayerStrikeSampler().sample({state:'judgment',actionId:2,clipTime:1,actionElapsed:1},weapon,null,true,0,bonus);
    const gate=new MeleeContactGate(),input={...sample,capsule:[[0,0,1],[0,2,1]],radius:2};
    const hits=[...gate.collect(input).hits,...gate.collect({...input,elapsed:1.12}).hits];
    assert.deepEqual(hits.map(h=>h.damage),[20+bonus,20+bonus,24+bonus]);
  }
  assert.equal(JSON.stringify(PLAYER_STRIKES),before);
});
test('armor is a flat per-hit reduction after critical scaling, never negative healing',()=>{
  assert.deepEqual([2,3,4].map(defense=>armoredDamage(80,defense)),[78,77,76]);
  assert.equal(armoredDamage(80*1.3,4),100);assert.equal(armoredDamage(1,4),1);assert.equal(armoredDamage(0,4),0);
});
