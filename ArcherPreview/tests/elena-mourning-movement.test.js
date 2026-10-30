import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {BossBattle} from '../src/boss-battle.js';
import {ElenaBrain,ELENA_HOME,MOURNING_MOVEMENT,MOURNING_SPELLS} from '../src/elena-spec.js';
import {chooseElenaCharge} from '../src/elena-reposition.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {chargeTouchesPlayer} from '../src/elena-charge.js';
import {makeSpellPlan,spellContains} from '../src/elena-ground-magic.js';

const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`),base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base)));let packed;
async function fixture(t){
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;Object.assign(engine.getCaps(),{textureFloat:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
  packed??=readRuntimeGltf(new URL(config.model,base));const source=await packed,gltf=structuredClone(source.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const g of container.animationGroups)g.stop();
  for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial('movement-offline',scene);
  const models=new BossModelLibrary(scene,'mourning-elena');models.config=config;models.container=container;models.load=async()=>{models.loads=1;};
  const world={scene,cave:true,terrain:createWitchCaveTerrain(),navigation:new CaveNavigation(caveObstacles()),shadows:{addShadowCaster(){},removeShadowCaster(){}}},battle=new BossBattle(world,()=>{},()=>{},()=>true,{mourningModels:models}),player=new TransformNode('movement-player',scene);player.position.set(29,6,-23);
  battle.residentPhase=2;await battle.activateResident(player);const e=battle.mourningPool[0];e.renderVisible=true;
  t.after(()=>{battle.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();});return {engine,scene,world,battle,player,e};
}
function step(f,dt=1/60,action={state:'dodge',actionId:1}){f.battle.update(dt,f.player);f.scene._animate(0);f.battle.poseAndContacts(f.player,action,null,null);}
function charge(f){f.e.actor.position.set(25.5,6,-24.125);f.world.terrain.place(f.e.actor.position);f.player.position.set(31.5,6,-24.125);f.e.brain.stagger=0;f.e.brain.movementTurn=3;f.e.brain.reposition();step(f,0);assert.equal(f.e.brain.moveKind,'charge');assert.ok(f.e.movementNavigation.segmentClear(f.e.actor.position,f.e.repositionTarget,f.e.radius));}

test('phase-two brain continuously alternates movement and the five authored casts without idle gaps',()=>{
  const b=new ElenaBrain({idle:2.4,walk:2.4,cast:3,dead:2.4},{mourning:true}),kinds=new Set(),patterns=new Set();let idle=0,events=0;
  for(let frame=0;frame<3600;frame++){const result=b.update(1/60,4,true);if(b.mode==='idle')idle++;if(b.repositioning)kinds.add(b.moveKind);if(b.mode==='attack'){patterns.add(b.spell.pattern);assert.equal(result.speed,0);}events+=result.events.length;}
  assert.equal(idle,0);assert.deepEqual([...kinds].sort(),['charge','skitter','walk']);assert.equal(patterns.size,5);assert.ok(events>=10);
  b.update(.1,4,false);assert.equal(b.mode,'idle');assert.equal(b.update(1,4,false).speed,0);
});

test('charge destination crosses the aimed player position, rejects walls and intervening cliffs, and supports moved homes',()=>{
  const origin={x:29,z:-27},player={x:29,z:-21};let testedRadius;
  const target=chooseElenaCharge(origin,player,{radius:.9,navigation:{free:()=>true,segmentClear:(a,b,r)=>{testedRadius=r;return true;}},terrain:{heightAt:()=>6}});assert.ok(target);near(target.z-player.z,.3);assert.equal(testedRadius,.9);
  assert.equal(chooseElenaCharge(origin,{x:29,z:-25}),null);assert.equal(chooseElenaCharge(origin,player,{navigation:{free:()=>true,segmentClear:()=>false}}),null);
  assert.equal(chooseElenaCharge(origin,player,{terrain:{heightAt:(x,z)=>z>-26&&z<-25?-2:6}}),null,'equal endpoint heights cannot conceal an intervening drop');
  const shifted=chooseElenaCharge({x:0,z:0},{x:0,z:6},{home:{x:0,z:0}});near(shifted.z,target.z-origin.z);
});

test('actual rig walks, skitters and charges while every cast remains stationary and navigation-safe',async t=>{
  const f=await fixture(t),kinds=new Set(),patterns=new Set(),speeds={walk:0,skitter:0,charge:0};let idle=0,castFrames=0;
  for(let frame=0;frame<3600;frame++){
    const before=f.e.actor.position.clone(),state=f.e.brain.mode,serial=f.e.brain.serial;step(f);const b=f.e.brain,speed=Math.hypot(f.e.actor.position.x-before.x,f.e.actor.position.z-before.z)*60;
    if(b.mode==='idle')idle++;
    if(b.repositioning){kinds.add(b.moveKind);speeds[b.moveKind]=Math.max(speeds[b.moveKind],speed);}
    if(state==='attack'&&b.mode==='attack'&&serial===b.serial){near(Vector3.Distance(before,f.e.actor.position),0);castFrames++;patterns.add(b.spell.pattern);}
    assert.ok(f.e.animator.gaitRate<=MOURNING_MOVEMENT.gaitCap);assert.ok(f.e.movementNavigation.free(f.e.actor.position,f.e.radius));assert.ok(Math.hypot(f.e.actor.position.x-f.e.home.x,f.e.actor.position.z-f.e.home.z)<=9.5+1e-5);
  }
  assert.equal(idle,0);assert.equal(patterns.size,5);assert.ok(castFrames>1000);assert.deepEqual([...kinds].sort(),['charge','skitter','walk']);
  near(speeds.walk,MOURNING_MOVEMENT.walkSpeed);near(speeds.skitter,MOURNING_MOVEMENT.skitterSpeed);near(speeds.charge,MOURNING_MOVEMENT.chargeSpeed);
  t.diagnostic(JSON.stringify({seconds:60,idleFrames:idle,castFrames,maxSpeeds:speeds,patterns:[...patterns]}));
});

test('charge shows a full locked 0.9 second ground warning and follows the old target after a dodge',async t=>{
  const f=await fixture(t);charge(f);const origin=f.e.actor.position.clone(),target={...f.e.repositionTarget},plan=f.e.spell.plan,hp=f.battle.playerHp;
  assert.equal(plan.pattern,'corridor');assert.equal(f.e.spell.serial,'charge:'+f.e.brain.serial);assert.equal(f.e.spell.mesh.isEnabled(),true);step(f,.3);f.player.position.z+=2;
  step(f,.599);near(Vector3.Distance(origin,f.e.actor.position),0);assert.strictEqual(f.e.spell.plan,plan);assert.deepEqual(f.e.repositionTarget,target);
  step(f,.002);assert.ok(f.e.actor.position.x>origin.x);near(f.e.actor.position.z,origin.z);assert.ok(f.e.spell.mesh.isEnabled());
  for(let i=0;i<120&&f.e.brain.mode!=='attack';i++)step(f);
  assert.equal(f.e.brain.mode,'attack');assert.ok(f.e.brain.time<.02);assert.ok(Math.hypot(f.e.actor.position.x-target.x,f.e.actor.position.z-target.z)<=.16);assert.equal(f.battle.playerHp,hp);assert.equal(f.e.inspect().chargeDamage,42);assert.equal(f.e.spell.serial,f.e.brain.serial);assert.notStrictEqual(f.e.spell.plan,plan);
});

test('charge sweep matches the warned corridor edges, rotation and slow frames without early path-wide damage',()=>{
  for(const yaw of [0,.7,Math.PI/2,2.8]){
    const origin={x:4,z:7},at=(along,side=0)=>({x:4+Math.sin(yaw)*along+Math.cos(yaw)*side,z:7+Math.cos(yaw)*along-Math.sin(yaw)*side});
    const plan=makeSpellPlan('corridor',origin,at(6),{range:Math.hypot(6.9,.9),halfWidth:.9,bossRadius:.1});
    assert.equal(chargeTouchesPlayer(plan,origin,at(.2),at(5)),false,'far end is not hit at launch');
    assert.equal(chargeTouchesPlayer(plan,origin,at(6),at(3)),true,'slow frame sweeps the traveled path');
    for(const [side,inside] of [[1.199,true],[1.201,false]]){assert.equal(chargeTouchesPlayer(plan,at(2),at(4),at(3,side)),inside);assert.equal(spellContains(plan,at(3,side)),inside);}
    assert.equal(chargeTouchesPlayer(plan,at(6),at(9),at(7.21)),false,'cannot hit past the displayed end');
  }
});

test('actual charge applies one contact, supports dodge, blocks and walls, and a new charge may hit again',async t=>{
  const f=await fixture(t);f.player.rotation.y=-Math.PI/2;
  for(const outcome of ['hit','dodge','block','outside','wall'])await t.test(outcome,()=>{
    f.battle.combat.reset();charge(f);const serial=f.e.brain.serial,hp=f.battle.playerHp,segment=f.world.navigation.segmentClear;
    if(outcome==='outside')f.player.position.z+=f.e.radius+.35;
    if(outcome==='wall')f.world.navigation.segmentClear=()=>false;
    let hits=0,lastHp=hp,dodged=false;
    try{
      for(let frame=0;frame<160&&f.e.brain.serial===serial;frame++){
        const action=outcome==='dodge'&&!dodged?{state:'dodge',actionId:12}:outcome==='block'?{state:'shieldPush',actionId:13}:{state:'idle'};
        step(f,1/60,action);if(f.battle.playerHp<lastHp)hits++;lastHp=f.battle.playerHp;
        if(f.e.brain.serial===serial&&f.e.brain.time<MOURNING_MOVEMENT.chargeWarning)assert.equal(lastHp,hp,'warning never damages');
        if(outcome==='dodge'&&f.e.chargeResolved)dodged=true;
        f.battle.combat.invulnerable=0; // dedupe must not rely on the short player cooldown
      }
      assert.equal(hits,outcome==='hit'?1:0);if(outcome==='hit')assert.equal(hp-lastHp,42);
      if(outcome==='dodge')assert.equal(dodged,true,'dodge consumes this charge even after dodge ends');
      if(['hit','dodge','block'].includes(outcome))assert.equal(f.e.chargeResolved,true);
    }finally{f.world.navigation.segmentClear=segment;}
  });
  f.battle.combat.reset();charge(f);const serial=f.e.brain.serial;
  for(let frame=0;frame<150&&f.e.brain.serial===serial;frame++)step(f,1/60,{state:'idle'});
  assert.ok(f.battle.playerHp<500,'a later charge gets its own contact gate');
});

test('a newly blocked charge stops at the collision constraint and cannot leak its warning into the next spell',async t=>{
  const f=await fixture(t);charge(f);const warning=f.e.spell.plan,serial=f.e.brain.serial,wallX=f.e.actor.position.x+1,hp=f.battle.playerHp,navigation=f.e.movementNavigation,constrain=navigation.constrain.bind(navigation);
  // Model a blocker entering the already warned corridor through the same
  // constraint hook used by the live navigation/collision system.
  navigation.constrain=(position,...args)=>{constrain(position,...args);position.x=Math.min(position.x,wallX);};
  for(let frame=0;frame<180&&f.e.brain.mode!=='attack';frame++){
    step(f);assert.ok(f.e.actor.position.x<=wallX+1e-6);
    if(f.e.brain.serial===serial)assert.strictEqual(f.e.spell.plan,warning);
  }
  assert.equal(f.e.brain.mode,'attack');assert.ok(f.e.brain.serial>serial);assert.equal(f.e.spell.serial,f.e.brain.serial);assert.notStrictEqual(f.e.spell.plan,warning);assert.equal(f.e.spell.fired,false);assert.equal(f.battle.playerHp,hp);
});

test('charge cancels on map exit or player death and manual review never starts automatic movement',async t=>{
  const f=await fixture(t);charge(f);step(f,.8);f.battle.hide();f.world.cave=false;assert.equal(f.e.spell.plan,null);assert.equal(f.e.brain.repositioning,false);
  f.world.cave=true;await f.battle.activateResident(f.player);const before=f.e.actor.position.clone();step(f,.05);assert.ok(Vector3.Distance(before,f.e.actor.position)<.06);assert.notEqual(f.e.brain.moveKind,'charge');
  charge(f);f.battle.combat.hp=0;step(f,.95);assert.equal(f.e.brain.mode,'idle');assert.equal(f.e.spell.plan,null);near(f.e.actor.position.x,25.5);near(f.e.actor.position.z,-24.125);
  f.battle.combat.reset();f.e.reviewMode=true;f.e.reviewMovement={x:0,z:0};const fixed=f.e.actor.position.clone();for(let i=0;i<240;i++)step(f);near(Vector3.Distance(f.e.actor.position,fixed),0);assert.equal(f.e.brain.mode,'idle');
  assert.ok(f.e.requestReviewCast());for(let i=0;i<190;i++)step(f);assert.equal(f.e.brain.mode,'idle');near(Vector3.Distance(f.e.actor.position,fixed),0);
});
