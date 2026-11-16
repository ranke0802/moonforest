import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from '@babylonjs/core';
import {BossEncounter} from '../src/boss-encounter.js';
import {BossBrain} from '../src/boss-spec.js';
import {BEAR_V02_SIZE} from '../src/bear-size.js';
import {regularWolfManifest,regularWolfRuntimeProfile,REGULAR_QUADRUPED_HIT_DISTANCE} from '../src/regular-wolf-spec.js';
import {WolfV02AirReaction,WOLF_V02_AIR_IMPULSE} from '../src/wolf-v02-air-reaction.js';
import {WOLF_V02_AIR_REACTION,WOLF_V02_GET_UP} from '../src/wolf-v02-spec.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {plainsCliffObstacles} from '../src/plains-cliff-collision.js';
import {PLAINS_LOOKOUT,PLAINS_RADIUS} from '../src/great-plains-layout.js';
import {setWorldCharacter} from '../src/world-limits.js';

const read=id=>JSON.parse(readFileSync(new URL('../public/assets/'+id+'.json',import.meta.url))),profiles=new Map(Object.keys(REGULAR_QUADRUPED_HIT_DISTANCE).map(id=>[id,regularWolfRuntimeProfile(id,read(regularWolfManifest(id)))]));
setWorldCharacter('warrior-plains');
function measureBear(fps){
 const config=read('guardian-bear'),world={mapId:'great-plains',navigation:new VillageNavigation([]),terrain:{place(position){position.y=0;}}},e=new BossEncounter(world,()=>{}),player={position:new Vector3(0,0,-2)};
 e.config={...config,scale:BEAR_V02_SIZE.scale};e.bearSize=BEAR_V02_SIZE;e.brain=new BossBrain(Object.fromEntries(config.catalog.map(clip=>[clip.name,clip.duration])));e.brain.hit({heavy:true,damage:64,ignoreDefense:true});
 e.active=true;e.actor={position:Vector3.Zero(),rotation:{y:0}};e.radius=BEAR_V02_SIZE.radius;e.animator={transition(){},update(){}};e.asset={meshes:[]};e.ring={};e.warningRing={update(){}};
 // Both confirmed heavy and released shield paths set this same existing
 // world impulse. Exercise its real encounter integration, with no fake root.
 e.knockVelocity.set(0,0,8);for(let frame=0;frame<fps*2;frame++)e.update(1/fps,player);
 return e.actor.position.z;
}
function fixture(profile,position=Vector3.Zero()){
 const e={actor:{position:position.clone(),rotation:{y:.4}},radius:profile?.radius??1.625,brain:{state:WOLF_V02_AIR_REACTION,time:0},world:{scene:{},mapId:'great-plains'},config:{catalog:[{name:WOLF_V02_AIR_REACTION,endpointModelGlTF:{headMinusPelvis:[0,0,1]}}]},runtimeProfile:profile};
 const reaction=new WolfV02AirReaction(e);reaction.begin(position.add(new Vector3(0,0,-2)),null,0);return {e,reaction};
}

test('existing bear heavy/shield impulse measures about 1.4 metres, independently of skeletal fall keys',t=>{
 const measured={};for(const fps of [30,60]){const distance=measureBear(fps),expected=8/fps*(1-Math.exp(-12))/(1-Math.exp(-6/fps));assert.ok(Math.abs(distance-expected)<.0003,JSON.stringify({fps,distance,expected}));assert.ok(distance>1.39&&distance<1.48);measured[fps]=distance;}
 t.diagnostic(JSON.stringify({scope:'Actual BossEncounter.update integration of existing accepted-hit impulse on open flat navigation; no render/GPU claim',bearWorldMetres:measured,regularWorldMetres:1.4}));
});

test('each regular wolf, fox and boar travels 1.4 world metres with unchanged curve/arc and locked attack direction',t=>{
 const rows=[];
 for(const [id,profile]of profiles)for(const fps of [30,60]){
  const {e,reaction}=fixture(profile),arcScale=profile.spatialScale;let elapsed=0;
  while(elapsed<.45){elapsed=Math.min(.45,elapsed+1/fps);e.brain.time=elapsed;reaction.applyMotion();reaction.afterMotion();const t=elapsed/.45,curve=t*(2-t);assert.ok(Math.abs(e.actor.position.z-1.4*curve)<1e-9);assert.equal(e.actor.position.x,0);assert.ok(Math.abs(reaction.height-4*WOLF_V02_AIR_IMPULSE.arc*arcScale*t*(1-t))<1e-9);}
  assert.ok(Math.abs(reaction.travelled-1.4)<1e-9);assert.ok(Math.abs(e.actor.rotation.y-.4)<.66);const end=e.actor.position.clone();e.brain.state=WOLF_V02_GET_UP;reaction.applyMotion();assert.ok(Vector3.Distance(end,e.actor.position)<1e-9,'get-up adds no second impulse');
  rows.push({id,fps,beforeMetres:WOLF_V02_AIR_IMPULSE.distance*arcScale,afterMetres:reaction.travelled,arcUnchanged:true});
 }
 const alpha=fixture();alpha.e.brain.time=.45;alpha.reaction.applyMotion();assert.equal(alpha.e.actor.position.z,1.65,'approved alpha wolf keeps its original world travel');
 t.diagnostic(JSON.stringify({scope:'Single airborne world-motion owner; original source pose/arc/duration retained',rows}));
});

test('expanded impulse still uses existing swept navigation at walls and plains cliffs',()=>{
 for(const [id,profile]of profiles){
  const wall=new VillageNavigation([{id:'wall',shape:'box',x:0,z:1.2,halfWidth:5,halfDepth:.1,radius:5.1,yaw:0,height:4}]),wallCase=fixture(profile);
  for(let frame=1;frame<=30;frame++){const from=wallCase.e.actor.position.clone();wallCase.e.brain.time=frame*.1;wallCase.reaction.applyMotion();wall.constrain(wallCase.e.actor.position,from,profile.radius,PLAINS_RADIUS);wallCase.reaction.afterMotion();}
  assert.ok(wall.free(wallCase.e.actor.position,profile.radius,PLAINS_RADIUS),id+' wall clearance');assert.ok(wallCase.e.actor.position.z<1.2-profile.radius,id+' cannot pass through wall');
  const cliff=new VillageNavigation(plainsCliffObstacles()),start=new Vector3(PLAINS_LOOKOUT.x,0,PLAINS_LOOKOUT.z+7),cliffCase=fixture(profile,start);
  for(let frame=1;frame<=30;frame++){const from=cliffCase.e.actor.position.clone();cliffCase.e.brain.time=frame*.1;cliffCase.reaction.applyMotion();cliff.constrain(cliffCase.e.actor.position,from,profile.radius,PLAINS_RADIUS);cliffCase.reaction.afterMotion();}
  assert.ok(cliff.free(cliffCase.e.actor.position,profile.radius,PLAINS_RADIUS),id+' cliff clearance');assert.ok(cliffCase.e.actor.position.z<PLAINS_LOOKOUT.z+9-profile.radius,id+' cannot enter steep cliff band');
 }
});

test('map/brain replacement cancels the expanded reaction without a late impulse',()=>{
 const {e,reaction}=fixture(profiles.get('boar'));e.brain.time=.1;reaction.applyMotion();const position=e.actor.position.clone();e.world.mapId='village';e.brain.time=.45;assert.equal(reaction.applyMotion(),false);assert.ok(Vector3.Distance(position,e.actor.position)<1e-9);assert.equal(reaction.valid(),false);
});
