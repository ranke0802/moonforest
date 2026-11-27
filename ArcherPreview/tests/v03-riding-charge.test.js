// Mounted run vs. charge, and the charge's ram (2026-11-27 user review:
// "달리기는 달리기로 놔두고 질주는 … 몬스터가 나가떨어지며 데미지 30~50").
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {FreeCamera, NullEngine, Scene, Vector3} from '@babylonjs/core';
import {createRidingHorse} from '../src/v03/riding-horse.js';
import {createRidingRam, ramDamage, isRamBoss, RAM_DAMAGE} from '../src/v03/riding-charge.js';
import {createRidingChargeFx, PULSE_CAPACITY} from '../src/v03/riding-charge-fx.js';
import {ridingLabels} from '../src/v03/riding-locale.js';
import {RIDING_STATS} from '../src/v03/riding-wardrobe.js';
import {GoblinEncounter} from '../src/goblin-encounter.js';
import {GoblinBrain} from '../src/goblin-spec.js';
import {setupAccessibility, disposeAccessibility} from '../src/v03/accessibility.js';

// A foe with the fields the ram reads, and a brain that records its hits.
function foe({kind='goblin',x=0,z=1.2,hp=200,radius=.4,summonKind,mode='move'}={}){
  const hits=[],damage=[];
  const brain={hp,mode,flash:0,flashDuration:.22,hit(h){if(this.hp<=0)return false;hits.push(h);this.hp=Math.max(0,this.hp-h.damage);if(h.heavy)this.mode='down';return true;}};
  return {kind,summonKind,radius,active:true,brain,hits,damage,
    actor:{position:new Vector3(x,0,z),rotation:{y:0}},knockVelocity:new Vector3(),
    animator:{reacts:0,knocks:0,reactToHit(){this.reacts++;},reactToKnockback(){this.knocks++;}},
    damageNumberPosition(){return this.actor.position;},onDamage(...args){damage.push(args);},onChange(){}};
}
function sequence(values){let i=0;return ()=>values[i++%values.length];}

test('ram damage is a uniform whole number from 30 to 50, with an injectable random source',()=>{
  assert.deepEqual(RAM_DAMAGE,{min:30,max:50});
  assert.equal(ramDamage(()=>0),30);assert.equal(ramDamage(()=>.999999),50);assert.equal(ramDamage(()=>1),50);
  const seen=new Set();
  for(let i=0;i<21;i++)seen.add(ramDamage(()=>(i+.5)/21));
  assert.equal(seen.size,21,'every value 30..50 is reachable');
  for(let i=0;i<500;i++){const d=ramDamage();assert.ok(Number.isInteger(d)&&d>=30&&d<=50);}
});

test('a foe ahead is struck once per gallop; foes behind or beside the horse are not',()=>{
  const ram=createRidingRam({random:sequence([.5])}),out=[{x:0,z:0}];
  const ahead=foe(),behind=foe({z:-1.6}),beside=foe({x:1.6,z:.8});
  const all=[ahead,behind,beside],rider={x:0,z:0};
  ram.begin();
  assert.equal(ram.sweep(all,rider,0,1,out),1);
  assert.equal(ram.sweep(all,rider,0,1,out),0,'the same gallop never hits the same foe twice');
  assert.equal(ahead.hits.length,1);assert.equal(ahead.hits[0].damage,40);
  assert.equal(behind.hits.length+beside.hits.length,0);
  assert.equal(ahead.damage[0][1],40);assert.equal(ahead.damage[0][3],'enemy','the usual damage number and hit sound path');
  ram.begin();
  assert.equal(ram.sweep(all,rider,0,1,out),1,'a new gallop may strike it again');
  // Heading east: the beside foe is now in front.
  ram.begin();
  assert.equal(ram.sweep([beside],rider,1,0,out),1);
});

test('regular foes are thrown along the path; boss-class foes only flinch and keep their pattern',()=>{
  const ram=createRidingRam({random:()=>0}),rider={x:0,z:0};
  const goblin=foe(),bear=foe({kind:'bear',x:.2,z:1.4,radius:.7}),alpha=foe({kind:'wolf',x:-.2,z:1.0}),pack=foe({kind:'wolf',summonKind:'regular-wolf',z:1.5});
  const elena=foe({kind:'elena',z:1.1,mode:'attack'});
  assert.deepEqual([goblin,bear,alpha,pack,elena].map(isRamBoss),[false,true,true,false,true]);
  ram.begin();
  assert.equal(ram.sweep([goblin,bear,alpha,pack,elena],rider,0,1,null),5);
  for(const regular of [goblin,pack]){
    const [hit]=regular.hits;
    assert.equal(hit.heavy,true);assert.equal(hit.ignoreDefense,true);
    assert.ok(regular.knockVelocity.length()>10,'thrown');
    assert.ok(regular.knockVelocity.z>0,'along the horse path');
    assert.equal(regular.animator.knocks,1);
  }
  for(const boss of [bear,alpha,elena]){
    const [hit]=boss.hits;
    assert.equal(hit.damage,30);assert.equal(hit.heavy,false);assert.equal(hit.interruptsBoss,false);assert.equal(hit.stun,0);
    assert.ok(boss.knockVelocity.length()<=1.6+1e-9,'at most a short slide');
    assert.equal(boss.brain.mode,boss===elena?'attack':'move','brain state untouched');
    assert.equal(boss.animator.knocks,0);
  }
  assert.equal(elena.knockVelocity.length(),0,'no slide during a boss attack');
});

test('a lethal ram defeats a real goblin through its own death path: the same defeat event as a sword kill',()=>{
  const defeats=[],damage=[];
  const make=()=>{
    const e=new GoblinEncounter({},()=>{},(...args)=>damage.push(args),()=>{},{onDefeat:event=>defeats.push(event)});
    e.brain=new GoblinBrain(new Proxy({},{get:()=>1}),()=>.5);e.brain.hp=35;
    e.active=true;e.actor={position:new Vector3(0,0,1.3),rotation:{y:0},setEnabled(){}};e.nodes={'mixamorig:Hips':{getAbsolutePosition:()=>new Vector3(0,.9,1.3)}};e.asset={meshes:[]};e.deathVisibility=new Map();
    return e;
  };
  const rammed=make(),cut=make();
  const ram=createRidingRam({random:()=>.5});ram.begin();
  assert.equal(ram.sweep([rammed],{x:0,z:0},0,1,null),1);
  cut.brain.hit({damage:40,heavy:true});
  for(const e of [rammed,cut]){assert.equal(e.brain.hp,0);assert.equal(e.brain.mode,'dead');e.updateDeath(.016);}
  assert.deepEqual(defeats.map(d=>({kind:d.kind,z:d.position.z})),[{kind:'goblin',z:1.3},{kind:'goblin',z:1.3}]);
  assert.equal(damage[0][1],40);assert.equal(damage[0][3],'enemy');
  assert.equal(rammed.hitCount,1);
});

function rider({encounters=[],canRam=()=>true,random=()=>.5}={}){
  const {document:doc}=parseHTML('<html lang="ko"><body><main id="app"><div class="top-actions"></div><button id="attack-button" title="Attack" aria-label="Attack"></button><button id="guard-button" aria-label="Shield"></button><button id="dodge-button" aria-label="Dodge"></button></main></body></html>');
  const root=doc.getElementById('app'),slot=new Map([['v03:stable:horse','1']]);
  const saddle={position:new Vector3(),rotation:new Vector3(),parent:{computeWorldMatrix:()=>({invertToRef(){}})},isDisposed:()=>false};
  const actor={position:{x:0,y:0,z:0},rotation:{y:0},metadata:{saddleOffset:saddle},getChildMeshes:()=>[]};
  const notices=[];
  const ride=createRidingHorse({root,world:{mapId:'great-plains',terrain:{heightAt:()=>0}},player:()=>actor,storage:{getItem:k=>slot.get(k),setItem:(k,v)=>slot.set(k,v)},
    ridingAllowed:()=>true,forwardYaw:()=>0,tell:t=>notices.push(t),battle:()=>({encounters}),canRam,random,
    pose:()=>({ready:true,hips:{computeWorldMatrix(){},absolutePosition:new Vector3(0,1,0)},apply(){}}),
    makeHorse:()=>({ready:Promise.resolve({}),play(){},saddleContactToRef(v){v.set(0,1.48,0);return true;},speed(){},place(){},dispose(){}})});
  return {ride,doc,root,actor,notices,async mount(){ride.updateAvailability();await root.querySelector('.v03-ride-toggle').onclick();
    for(let i=0;i<250&&ride.inspect().state!=='mounted';i++)ride.afterMove({state:'idle'},0,1/30);}};
}

test('mounted: the held run input never starts the charge; the attack input does; charge > 1.4 x run',async()=>{
  const h=rider(),ride=h.ride;await h.mount();
  assert.equal(ride.active,true);
  const base=4.4371,walk=ride.travelSpeed(base);
  assert.ok(Math.abs(walk-base*RIDING_STATS.speedMultiplier)<1e-9);
  // (a) The run: a held input, eased in, no charge.
  assert.equal(ride.setRunHeld(true),true);
  for(let i=0;i<20;i++)ride.afterMove({state:'run'},walk,1/30);
  const run=ride.travelSpeed(base);
  assert.equal(ride.inspect().galloping,undefined);assert.equal(ride.inspect().running,true);
  assert.ok(Math.abs(run-walk*RIDING_STATS.runMultiplier)<1e-9,'full run');
  ride.setRunHeld(false);
  for(let i=0;i<20;i++)ride.afterMove({state:'run'},run,1/30);
  assert.ok(Math.abs(ride.travelSpeed(base)-walk)<1e-9,'eases back to the riding pace');
  // (b) The charge: the attack input.
  ride.setRunHeld(true);for(let i=0;i<20;i++)ride.afterMove({state:'run'},walk,1/30);
  assert.equal(ride.startGallop(),true);assert.equal(ride.inspect().galloping,true);
  ride.steerGallop({x:0,y:0},0,.5);
  const charge=ride.travelSpeed(base);
  // (c) Charge > run, by at least 1.4x, also at the fastest movement-speed setting.
  assert.equal(charge,RIDING_STATS.gallopSpeed);assert.ok(charge/run>=1.4,`charge ${charge} / run ${run}`);
  const fast=base*2;ride.setRunHeld(true);
  assert.ok(ride.travelSpeed(fast)/(fast*RIDING_STATS.speedMultiplier*RIDING_STATS.runMultiplier)>=1.4);
  ride.dispose();
});

test('main.js routes the held dodge input to the run and only attack inputs to the charge',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const dodgeHeld=main.slice(main.indexOf('setDodgeHeld(held,source'),main.indexOf('cancelDodgeInput(source)'));
  assert.match(dodgeHeld,/world\.riding\.setRunHeld\(true\)/);assert.doesNotMatch(dodgeHeld,/startGallop/);
  assert.match(dodgeHeld,/if\(!held\)\{world\?\.riding\?\.setRunHeld\?\.\(false\)/);
  const dodge=main.slice(main.indexOf('  dodge() {'),main.indexOf('  setDodgeHeld('));
  assert.doesNotMatch(dodge,/startGallop/);
  assert.match(main,/attack\(\) \{ if \(world\?\.riding\?\.active\) \{world\.riding\.startGallop\(\);return;\}/);
  assert.match(main,/function setAttackHeld\(source, held, pointerType\) \{\n  if\(held&&world\?\.riding\?\.active\)\{world\.riding\.startGallop\(\);return;\}/);
});

test('mounted controls name the run and the charge apart in every language',async()=>{
  for(const lang of ['ko','en','ja','zh','vi']){
    const h=rider();h.doc.documentElement.lang=lang;await h.mount();
    const words=ridingLabels(h.doc);
    for(const key of ['run','charge','controlsHint'])assert.ok(words[key]&&words[key]!==ridingLabels({documentElement:{lang:'ko'}})[key]||lang==='ko',lang+' '+key);
    assert.notEqual(words.run,words.charge);
    assert.equal(h.root.querySelector('#attack-button').getAttribute('aria-label'),words.charge);
    assert.equal(h.root.querySelector('#attack-button').title,words.charge+' (J)');
    assert.equal(h.root.querySelector('#dodge-button').getAttribute('aria-label'),words.run);
    assert.equal(h.root.querySelector('#dodge-button').title,words.run+' (Space)');
    assert.equal(h.notices.at(-1),words.mounted+' '+words.controlsHint);
    h.ride.dispose();
  }
});

test('the charge strikes foes ahead every simulated frame, once each, and only while charging',async()=>{
  const goblin=foe({z:1.5}),bear=foe({kind:'bear',z:1.5,x:.3,radius:.7});
  let allowed=true;
  const h=rider({encounters:[goblin,bear],canRam:()=>allowed}),ride=h.ride;await h.mount();
  ride.setRunHeld(true);
  for(let i=0;i<30;i++)ride.afterMove({state:'run'},10,1/30);
  assert.equal(goblin.hits.length+bear.hits.length,0,'the run does not ram');
  allowed=false;ride.startGallop();ride.steerGallop({x:0,y:0},0,.3);
  for(let i=0;i<5;i++)ride.afterMove({state:'run'},14,1/30);
  assert.equal(goblin.hits.length,0,'not during story scenes or transitions');
  allowed=true;
  for(let i=0;i<10;i++){ride.steerGallop({x:0,y:0},0,1/30);ride.afterMove({state:'run'},14,1/30);}
  assert.equal(goblin.hits.length,1);assert.equal(bear.hits.length,1);assert.equal(ride.inspect().rams,2);
  assert.equal(goblin.hits[0].damage,40);
  ride.dispose();
});

test('charge effects: a fixed pool, no draws at rest, camera restored, lines off with reduced motion',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('c',new Vector3(0,2,-6),scene);
  camera.setTarget(Vector3.Zero());
  const {document:doc}=parseHTML('<html><body><main id="app"><canvas id="viewport"></canvas><div class="hud"></div></main></body></html>');
  const root=doc.getElementById('app');
  const media=new EventTarget();media.matches=false;
  setupAccessibility({doc:{documentElement:{dataset:{},style:{setProperty(){},removeProperty(){}}}},view:{matchMedia:()=>media}});
  const fx=createRidingChargeFx({scene,camera:()=>camera,root});
  t.after(()=>{fx.dispose();scene.dispose();engine.dispose();disposeAccessibility();});
  const lines=root.querySelector('.v03-gallop-lines');
  assert.equal(lines.previousElementSibling.id,'viewport','under every HUD layer');assert.equal(lines.hidden,true);
  const meshes=scene.meshes.filter(m=>m.name.startsWith('v03-riding-charge-burst'));
  assert.equal(meshes.length,PULSE_CAPACITY);assert.ok(meshes.every(m=>!m.isEnabled()));
  for(let i=0;i<200&&!fx.inspect().ready;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(fx.inspect().ready,true);
  const draws=t.mock.method(engine,'drawElementsType');
  scene.render();assert.equal(draws.mock.callCount(),0,'no draws at rest');
  const fov=camera.fov;
  fx.launch(0,0,0,0,1);for(let i=0;i<8;i++)fx.impact(i,0,2);
  assert.equal(fx.inspect().busy,PULSE_CAPACITY,'capacity is fixed');
  fx.update(.05,1);
  assert.ok(camera.fov>fov,'the camera eases back');assert.equal(lines.hidden,false);assert.equal(lines.style.opacity,'0.7');
  for(let i=0;i<40;i++)fx.update(1/30,0);
  assert.ok(Math.abs(camera.fov-fov)<1e-9,'camera restored');assert.equal(fx.inspect().busy,0);assert.equal(lines.hidden,true);
  // Reduced motion: no speed lines, a quarter of the camera kick.
  media.matches=true;media.dispatchEvent(Object.assign(new Event('change'),{matches:true}));
  fx.launch(0,0,0,0,1);fx.update(.1,1);
  assert.equal(lines.hidden,true);assert.ok(camera.fov-fov<=.09*.25+1e-9&&camera.fov>fov);
  fx.reset();assert.ok(Math.abs(camera.fov-fov)<1e-9);
  fx.launch(0,0,0,0,1);fx.update(.05,1);fx.dispose();
  assert.ok(Math.abs(camera.fov-fov)<1e-9,'dispose restores the camera');
  assert.equal(scene.meshes.some(m=>m.name.startsWith('v03-riding-charge-burst')),false);
  assert.equal(root.querySelector('.v03-gallop-lines'),null);
});
