import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {MourningCaveNavigation} from '../src/mourning-cave-navigation.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {mourningCaveClearance} from '../src/mourning-cave-clearance.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {chooseElenaReposition,chooseElenaCharge} from '../src/elena-reposition.js';
import {ELENA_HOME,MOURNING_SIZE} from '../src/elena-spec.js';
import {setWorldCharacter} from '../src/world-limits.js';

test('full-pose navigation preserves player paths and finds safe oversized summons from narrow passages',t=>{
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const obstacles=caveObstacles(),player=new CaveNavigation(obstacles),boss=new MourningCaveNavigation(obstacles),radius=MOURNING_SIZE.radius;
  assert.equal(player.free({x:29,z:-20},.32),true);
  assert.equal(boss.free({x:29,z:-20},radius),false,'upper wall overlaps must reject the boss only');
  for(const p of [{x:0,z:53},{x:29,z:-40},ELENA_HOME]){
    const safe=boss.findFree(p,radius,80,[{...ELENA_HOME,radius:.8}]);
    assert.ok(boss.free(safe,radius));assert.ok(mourningCaveClearance(safe.x,safe.z)>=.08);
    assert.ok(Math.hypot(safe.x-ELENA_HOME.x,safe.z-ELENA_HOME.z)>=radius+.92);
  }
});

test('repeated high-speed movement and pushes slide along the full-body boundary without jumping',t=>{
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const nav=new MourningCaveNavigation(caveObstacles()),radius=MOURNING_SIZE.radius;
  for(const fps of [30,60]){
    const position=new Vector3(ELENA_HOME.x,6,ELENA_HOME.z);
    for(let frame=0;frame<fps*35;frame++){
      const before=position.clone(),angle=Math.floor(frame/(fps*1.6))*1.23,step=5.4/fps;
      position.x+=Math.sin(angle)*step;position.z+=Math.cos(angle)*step;nav.constrain(position,before,radius);
      assert.ok(nav.free(position,radius),`${fps} fps / ${frame}`);
      assert.ok(Vector3.Distance(position,before)<=step+.005,'collision must slide, not snap to a different cell');
    }
  }
});

test('reposition and charge paths validate the entire actor envelope while combat width stays 1.9m',t=>{
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const navigation=new MourningCaveNavigation(caveObstacles()),terrain=createWitchCaveTerrain(),radius=MOURNING_SIZE.radius;
  const origin={x:25.5,z:-24.125},player={x:31.8,z:-24.125};
  const charge=chooseElenaCharge(origin,player,{radius,navigation,terrain,home:ELENA_HOME});
  assert.ok(charge);assert.ok(Math.abs(Math.hypot(charge.x-origin.x,charge.z-origin.z)-6.3)<1e-8);
  assert.ok(navigation.segmentClear(origin,charge,radius));assert.ok(Math.abs(radius-1.9)<1e-8);
  let accepted=0;
  for(let angle=0;angle<16;angle++)for(let turn=0;turn<4;turn++){
    const target={x:ELENA_HOME.x+Math.sin(angle*Math.PI/8)*6,z:ELENA_HOME.z+Math.cos(angle*Math.PI/8)*6};
    const next=chooseElenaReposition(ELENA_HOME,target,{phase:2,turn,radius,navigation,terrain});
    if(!next)continue;accepted++;assert.ok(navigation.segmentClear(ELENA_HOME,next,radius));
  }
  assert.ok(accepted>=32,'the safeguard must preserve active movement, not freeze the boss');
});
