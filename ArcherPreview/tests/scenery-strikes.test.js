import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshBuilder,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {createSceneryStrikes,strikeMaterial} from '../src/scenery-strikes.js';
import {createPlayerCombatLock} from '../src/v03/player-combat-lock.js';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {mapNavigation} from '../src/world.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {obstacleClearance} from '../src/village-collision.js';
import {constrainDodge} from '../src/dodge-collision.js';

test('an approach, incoming hit, dummy and block allow travel; real outgoing damage locks until disengagement',()=>{
  const lock=createPlayerCombatLock(),battle={combatCount:2},foe={brain:{hp:10}};
  for(const [kind,target,amount] of [['player',foe,3],['block',foe,1],['enemy',null,10],['enemy',foe,0]]){
    lock.note(kind,target,amount,'village');assert.equal(lock.active('village',battle),false);
  }
  lock.note('enemy',foe,3,'village');assert.ok(lock.active('village',battle));
  battle.combatCount=0;assert.equal(lock.active('village',battle),false);
  battle.combatCount=1;assert.equal(lock.active('village',battle),false);
  lock.note('enemy',foe,4,'village');assert.equal(lock.active('great-plains',battle),false);
});

test('scaled plains boulders stop a walk and dodge at the visual footprint',()=>{
  const flags={village:true,plains:true,placements:PLAINS_PLACEMENTS},base=mapNavigation(flags);
  const fitted=mapNavigation({...flags,gameplayV03:true});
  const model=PLAINS_PLACEMENTS.find(p=>p.id.startsWith('outcrop-stone-'));
  const rock=fitted.obstacles.find(o=>o.id===model.id),old=base.obstacles.find(o=>o.id===model.id);
  assert.ok(rock.radius>old.radius*2);
  const nav=new fitted.constructor([rock]),r=.34;
  for(const angle of [0,.7,2.2]){
    const from={x:rock.x+Math.cos(angle)*(rock.radius+2),z:rock.z+Math.sin(angle)*(rock.radius+2)};
    const end={x:rock.x,z:rock.z};nav.constrain(end,from,r,200);
    assert.ok(obstacleClearance(end,rock)>=r);
    const roll={x:rock.x,z:rock.z};constrainDodge(roll,from,nav,[],200,{moveRadius:r});
    assert.ok(obstacleClearance(roll,rock)>=r);
  }
  const outcrop=fitted.obstacles.find(o=>o.id.startsWith('lookout-rock-'));
  assert.equal(outcrop.shape,'box');assert.ok(outcrop.halfWidth>outcrop.halfDepth);
});

test('a hard deflection draws the blade back with inactive damage frames then releases input',()=>{
  const c=new WarriorV2Controller({durations:{idle:2,run:1,slash:1.2}});
  c.startAttack('slash');const cut=c.update(.28);
  assert.ok(c.deflectSword(cut.actionId));const recoil=c.update(.075);
  assert.equal(recoil.actionId,null);assert.ok(recoil.clipTime<cut.clipTime-.1);
  assert.equal(c.update(.1).state,'idle');assert.ok(c.startAttack('slash'));
});

test('only the contacted instance reacts, once per swing; geometry, pool and matrices survive repeated trips',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),player=new Vector3(0,0,-1.2);
  const root=new TransformNode('placed',scene),facing=new TransformNode('asset',scene);
  facing.parent=root;const trunk=MeshBuilder.CreateBox('test-trunk',{width:.35,depth:.45,height:2},scene);
  trunk.parent=facing;trunk.position.y=1;
  const record={root,facing,meshes:[trunk],placement:{asset:'tree-01-round-oak',kind:'tree',scale:1},
    min:new Vector3(-.5,0,-.5),max:new Vector3(.5,2,.5)};
  for(const node of [root,facing,trunk])node.freezeWorldMatrix();
  const cells=new Map([['0:0',{...record,records:[record]}]]);
  const world={scene,villageVisibility:{cells},touchDevice:true,terrain:{heightAt:()=>0},
    villagePrepared:{assets:new Map([['tree-01-round-oak',{config:{height:6}}]])}};
  const sounds=[],fx=createSceneryStrikes(world,{play:name=>sounds.push(name)});
  function swing(id,x,y=1){
    const blade=[[x,y,-1],[x,y,.28]];
    return {actionId:id,contacts:[{previous:blade,blade}]};
  }
  const count=()=>[scene.meshes.length,scene.materials.length,scene.textures.length,scene.transformNodes.length,scene.geometries.length];
  scene.defaultMaterial;const before=count(),rest=trunk.getWorldMatrix().clone();
  for(let trip=0;trip<4;trip++){
    record.placement.kind='tree';record.placement.asset='tree-01-round-oak';
    assert.equal(fx.hit(swing(1,.4),'slash',player,true),null); // inside broad bounds, misses the actual surface
    assert.equal(fx.hit(swing(1,0),'slash',player,true),'tree');
    assert.equal(fx.hit(swing(1,0),'slash',player,true),null);
    fx.update(.08,player,{combatCount:0});assert.ok(Math.abs(facing.rotation.x)>.001);
    assert.ok(!trunk.computeWorldMatrix(true).equals(rest));
    assert.equal(scene.getMeshByName('plains-drifting-leaves').getTotalVertices(),32);
    fx.update(.5,player,{combatCount:1});assert.ok(trunk.isWorldMatrixFrozen&&trunk.getWorldMatrix().equals(rest));
    assert.equal(scene.getMeshByName('plains-drifting-leaves').isEnabled(),false);
    record.placement.kind='fence';record.placement.asset='rail-fence';
    assert.equal(fx.hit(swing(2,0),'slash',player,true),'wood');
    record.placement.kind='rock';record.placement.asset='rock-01-mossy-boulder';
    assert.equal(fx.hit(swing(3,0,2.5),'slash',player,true),null);
    assert.equal(fx.hit(swing(3,0),'slash',player,true),'stone');
    assert.equal(fx.hit(swing(3,0),'slash',player,true),null);
    assert.equal(scene.getMeshByName('scenery-sword-sparks').getTotalVertices(),18);
    assert.equal(sounds.length,(trip+1)*3);
    fx.leave();assert.deepEqual(count(),before);
  }
  assert.equal(strikeMaterial({asset:'well',kind:'landmark'}),'stone');
  assert.equal(strikeMaterial({asset:'chapel',kind:'building'}),'stone');
  fx.dispose();scene.dispose();engine.dispose();
});
