import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {MOURNING_SIZE,MOURNING_SIZE_SCALE,MOURNING_SPELLS,MOURNING_MOVEMENT,MOURNING_CAST_RATE,ELENA_HOME,spellImpact} from '../src/elena-spec.js';
import {makeSpellPlan,buildGroundSpellGeometry,spellContains,ELENA_GROUND_MAX_RANGE} from '../src/elena-ground-magic.js';
import {chooseElenaReposition,chooseElenaCharge} from '../src/elena-reposition.js';
import {chargeTouchesPlayer} from '../src/elena-charge.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter} from '../src/world-limits.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('larger spells enlarge their actual floor shapes within the existing room limit',()=>{
  const origin={x:29,y:6,z:-27},target={x:29,z:-23};let vertices=0;
  for(const spell of MOURNING_SPELLS){
    const plan=makeSpellPlan(spell.pattern,origin,target,{range:spell.range,bossRadius:MOURNING_SIZE.radius+.3,scale:MOURNING_SIZE_SCALE});
    near(plan.range,ELENA_GROUND_MAX_RANGE);near(plan.bossRadius,2.2);
    const {fill}=buildGroundSpellGeometry(plan,{heightAt:()=>6});vertices+=fill.positions.length/3;
    for(let i=0;i<fill.positions.length;i+=3){const p={x:fill.positions[i],z:fill.positions[i+2]};assert.ok(spellContains(plan,p,{radius:1e-6}),spell.pattern);assert.ok(Math.hypot(p.x-origin.x,p.z-origin.z)<=14+1e-6);}
    assert.ok(spellImpact(spell,3)/MOURNING_CAST_RATE>=1);
    if(spell.pattern==='corridor')near(plan.shapes[0].halfWidth,1.35*MOURNING_SIZE_SCALE);
    if(spell.pattern==='ring'){near(plan.shapes[0].innerRadius,2.8*MOURNING_SIZE_SCALE);assert.equal(spellContains(plan,{x:29,z:-27}),false);}
    if(spell.pattern==='cluster')assert.ok(plan.shapes[0].radius>3);
  }
  assert.ok(vertices<7000,'larger floor warnings stay bounded');
  near(MOURNING_MOVEMENT.walkSpeed,1.05);near(MOURNING_MOVEMENT.chargeSpeed,5.4);near(MOURNING_CAST_RATE,1.6);
});

test('enlarged charge width, visible endpoints and swept damage agree with an unchanged player radius',()=>{
  for(const yaw of [0,.8,2.7])for(const length of [3.1,6.3]){
    const origin={x:29,y:6,z:-27},at=(along,side=0)=>({x:origin.x+Math.sin(yaw)*along+Math.cos(yaw)*side,z:origin.z+Math.cos(yaw)*along-Math.sin(yaw)*side}),radius=MOURNING_SIZE.radius;
    const plan=makeSpellPlan('corridor',origin,at(length),{range:Math.hypot(length+radius,radius),halfWidth:radius,bossRadius:.1,scale:MOURNING_SIZE_SCALE}),shape=plan.shapes[0];
    near(shape.halfWidth,1.9);near((shape.center.x-origin.x)*Math.sin(yaw)+(shape.center.z-origin.z)*Math.cos(yaw)+shape.halfLength,length+radius);
    for(const [side,inside] of [[radius+.299,true],[radius+.301,false]]){assert.equal(spellContains(plan,at(2,side)),inside);assert.equal(chargeTouchesPlayer(plan,origin,at(length),at(2,side),{reach:radius}),inside);}
    assert.equal(chargeTouchesPlayer(plan,origin,at(.1),at(3),{reach:radius}),false);
    assert.equal(chargeTouchesPlayer(plan,at(length),at(length+3),at(length+radius+.301),{reach:radius}),false);
  }
});

test('the enlarged collision body uses cave-safe movement and charge paths within its original home',t=>{
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const terrain=createWitchCaveTerrain(),navigation=new CaveNavigation(caveObstacles()),origin={...ELENA_HOME,y:6},radius=MOURNING_SIZE.radius;let accepted=0,charges=0;
  assert.ok(navigation.free(origin,radius));
  for(let i=0;i<32;i++)for(const distance of [4,6,8]){
    const angle=i*Math.PI/16,player={x:origin.x+Math.sin(angle)*distance,z:origin.z+Math.cos(angle)*distance};
    for(const target of [chooseElenaReposition(origin,player,{phase:2,radius,navigation,terrain}),chooseElenaCharge(origin,player,{radius,navigation,terrain})]){
      if(!target)continue;accepted++;if(Math.hypot(target.x-origin.x,target.z-origin.z)>4)charges++;
      assert.ok(Math.hypot(target.x-ELENA_HOME.x,target.z-ELENA_HOME.z)<=MOURNING_SIZE.homeRadius);assert.ok(navigation.segmentClear(origin,target,radius));
      const position=new Vector3(origin.x,6,origin.z);
      for(let frame=1;frame<=32;frame++){const previous=position.clone();position.x=origin.x+(target.x-origin.x)*frame/32;position.z=origin.z+(target.z-origin.z)*frame/32;navigation.constrain(position,previous,radius);assert.ok(navigation.free(position,radius));}
    }
  }
  assert.ok(accepted>40);assert.ok(charges>10);
  const desired=new Vector3(40,6,-27),before=new Vector3(origin.x,6,origin.z);navigation.constrain(desired,before,radius);assert.ok(navigation.free(desired,radius));
});
