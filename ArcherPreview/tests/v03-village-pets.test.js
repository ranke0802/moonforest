import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as untilLoaded} from 'node:timers/promises';
import {villageObstacles} from '../src/village-layout.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {createVillagePets,pickPetStep,VILLAGE_PETS} from '../src/v03/village-pets.js';

const nav=new VillageNavigation(villageObstacles());
const dog=VILLAGE_PETS[0],here={x:dog.origin[0],z:dog.origin[1]};
const world={scene:{},navigation:nav,terrain:{heightAt:()=>0}};

test('each town animal starts on open ground and has short swept routes between scenery',()=>{
  for(const pet of VILLAGE_PETS){
    const home=nav.findFree({x:pet.origin[0],z:pet.origin[1]},pet.radius);
    assert.ok(nav.free(home,pet.radius),pet.id);
    let at=home;
    for(let i=0;i<12;i++){
      const next=pickPetStep(nav,home,at,pet,i*.618034%1);
      assert.ok(next,pet.id+' step '+i);assert.ok(nav.segmentClear(at,next,pet.radius));
      at=next;
    }
  }
});

test('browsing other areas does not import models and returning from a late load releases it',async()=>{
  let imports=0,releases=0,finish;
  const pets=createVillagePets(world,{
    models:{[dog.id]:'dog'},view:{prepare(){},hidden:()=>false},
    load:()=>{imports++;return new Promise(r=>{finish=r;});}
  });
  pets.update(.016,{x:90,z:90});await untilLoaded();assert.equal(imports,0);
  pets.update(.016,here);pets.update(.016,here);await untilLoaded();assert.equal(imports,1);
  pets.dispose();finish({dispose(){releases++;}});await untilLoaded();
  assert.equal(releases,1);pets.update(.016,here);assert.equal(imports,1);
});

test('a yard filled by new scenery postpones its pet without blocking other residents',async()=>{
  let checked=0,loads=0;
  const w={...world,navigation:{free(){checked++;return false;}}};
  const pets=createVillagePets(w,{models:{[dog.id]:'model'},view:{prepare(){}},load:()=>{loads++;}});
  pets.update(.016,here);await untilLoaded();
  assert.ok(checked>0&&checked<=25);assert.equal(loads,0);
  const previous=checked;
  for(let f=0;f<120;f++)pets.update(1/60,here);
  assert.equal(checked,previous);pets.dispose();
});

test('an unseen pet across the village consumes no upload until the camera turns toward it',async()=>{
  let hidden=true,loads=0;
  const pets=createVillagePets(world,{models:{[dog.id]:'dog'},view:{prepare(){},hidden:()=>hidden},
    load:async()=>{loads++;return {pose(){},dispose(){}};}});
  const player={x:here.x+9,z:here.z};
  pets.update(.016,player);await untilLoaded();assert.equal(loads,0);
  hidden=false;pets.update(.016,player);await untilLoaded();assert.equal(loads,1);pets.dispose();
});

test('offscreen animals suspend their pose then restore their current location on camera turn',async()=>{
  let hide=false;const poses=[];
  const pets=createVillagePets(world,{
    models:{[dog.id]:'dog'},view:{prepare(){},hidden:()=>hide},
    load:async()=>({pose(...args){poses.push(args);},dispose(){}})
  });
  pets.update(1/60,here);await untilLoaded();
  for(let i=0;i<200;i++)pets.update(1/60,here);
  assert.ok(poses.some(p=>p[4]&&p[6]));
  hide=true;pets.update(1/60,here);const start=poses.length;
  for(let i=0;i<120;i++)pets.update(1/60,here);
  assert.ok(poses.length-start<=2);
  const [x,,z]=poses.at(-1);
  hide=false;pets.update(1/60,here);
  assert.ok(poses.at(-1)[6]);assert.ok(Math.hypot(poses.at(-1)[0]-x,poses.at(-1)[2]-z)<=dog.speed*1.02);
  pets.dispose();
});
