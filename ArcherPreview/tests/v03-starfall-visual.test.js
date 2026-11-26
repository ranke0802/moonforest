import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeCamera, NullEngine, Scene, Vector3} from '@babylonjs/core';
import {createGreatAttackFx} from '../src/v03/great-attack-fx.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {GoldLoot} from '../src/gold-loot.js';

function visualFixture(){
 const engine=new NullEngine(),scene=new Scene(engine);
 new FreeCamera('camera',new Vector3(0,2,-5),scene);
 const elements=[];
 const root={append(node){elements.push(node);},ownerDocument:{createElement(){return {style:{},setAttribute(){},append(node){this.child=node;},remove(){this.removed=true;}};}}};
 let time=100,queries=0;
 const fx=createGreatAttackFx({scene,root,now:()=>time,ground:(x,z)=>{queries++;return 1+(x-4)*.2+(z-3)*.1;},project:()=>({x:22,y:33,visible:true})});
 const light=scene.getMeshByName('v03-starfall'),scars=scene.getMeshByName('v03-starfall-ground');
 return {engine,scene,fx,light,scars,gauge:elements[0],advance(ms){time+=ms;fx.tick();},get queries(){return queries;}};
}
test('Starfall gathers on the blade throughout a full hold and preserves two independently timed impacts',async()=>{
 const fixture=visualFixture(),{engine,scene,fx,light,scars,gauge,advance}=fixture;
 assert.equal(light.isEnabled(),false);assert.equal(scars.isEnabled(),false);
 const actor=new Vector3(4,1,3),blade=[[4,2,3],[4,3,3]],cast={actionId:1,center:actor,radius:2,level:2,phase:'windup',charging:true,progress:.5};
 fx.update(cast,blade,actor);
 assert.equal(gauge.hidden,false);assert.equal(gauge.child.style.transform,'scaleX(0.5)');
 assert.equal(light.material._vectors3.tip.y,3);assert.equal(scars.isEnabled(),false);assert.equal(fixture.queries,0);
 cast.progress=1;fx.update(cast,blade,actor);const fullAt=light.material._floats.clock;
 advance(3000);fx.update(cast,blade,actor);
 assert.equal(light.material._floats.charge,1);assert.equal(light.material._floats.clock,fullAt+3);
 cast.charging=false;cast.phase='release';cast.progress=.4;fx.update(cast,blade,actor);
 assert.equal(gauge.hidden,true);assert.equal(light.isEnabled(),true);assert.equal(fixture.queries,0);
 cast.phase='impact';fx.update(cast,blade,actor);fx.update(cast,blade,actor);
 const one=scars.subMeshes[0].indexCount,anchors=scars.material._vectors4Arrays.anchors,heights=scars.material._vectors4Arrays.heights;
 assert.equal(light.isEnabled(),false);assert.equal(scars.isEnabled(),true);assert.equal(fixture.queries,16);
 assert.deepEqual([...anchors.subarray(0,4)],[4,1,3,2]);assert.ok(Math.abs(heights[0]+.6)<1e-6);
 actor.x=12;fx.update(null,null,actor);advance(1300);
 assert.deepEqual([...anchors.subarray(0,4)],[4,1,3,2]);assert.equal(scars.isEnabled(),true);
 const next={...cast,phase:'windup',charging:true,actionId:2};
 fx.update(next,blade,actor);assert.equal(light.isEnabled(),true);assert.equal(scars.subMeshes[0].indexCount,one);
 fx.update({...next,phase:'impact',charging:false},blade,actor);assert.equal(scars.subMeshes[0].indexCount,one*2);
 fx.update({...next,phase:'windup',actionId:3},blade,actor);fx.update(null,null,actor);
 advance(3699);assert.equal(scars.subMeshes[0].indexCount,one*2);assert.equal(fixture.queries,32);
 advance(1);assert.equal(scars.subMeshes[0].indexCount,one);assert.deepEqual([...anchors.subarray(0,4)],[12,1,3,2]);
 advance(1301);assert.equal(scars.isEnabled(),false);assert.equal(fx.active,false);
 await scene.whenReadyAsync();
 fx.dispose();assert.equal(scene.meshes.length,0);assert.equal(scene.geometries.length,0);assert.equal(gauge.removed,true);scene.dispose();engine.dispose();
});
test('Starfall reuses two mesh buffers through a burst, resets all slots at map and stage boundaries, and disposes with the scene',()=>{
 const {engine,scene,fx,light,scars,gauge}=visualFixture(),actor=new Vector3(4,1,3);
 const geometry=scars.geometry,limit=scars.getTotalIndices();
 const cast={actionId:1,center:actor,radius:2,level:2,phase:'impact',charging:false,progress:1};
 for(let i=0;i<20;i++){cast.actionId=i;actor.x=i;fx.update(cast,null,actor);}
 assert.equal(scene.meshes.length,2);assert.equal(scene.geometries.length,2);assert.equal(scars.geometry,geometry);
 assert.equal(scars.subMeshes[0].indexCount,limit);assert.equal(scars.material._vectors4Arrays.anchors[0],8);
 fx.reset();assert.equal(fx.active,false);assert.equal(scars.subMeshes[0].indexCount,0);
 fx.update(cast,null,actor);assert.equal(scars.isEnabled(),true);
 scene.dispose();assert.equal(light.isDisposed(),true);assert.equal(scars.isDisposed(),true);assert.equal(gauge.removed,true);
 fx.dispose();engine.dispose();
});
test('Starfall is optional in old saves, capped at five, and resets with existing skills',()=>{
 const values=new Map(), storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const wallet=new GoldLoot({storage});wallet.creditCumulative('seed',100);
 const game=createTownEconomy(wallet);
 assert.equal(game.progression.skills.greatAttack,0);game.gainExperience(100000);
 for(let i=1;i<=5;i++){assert.equal(game.learnSkill('greatAttack'),true);assert.equal(game.progression.skills.greatAttack,i);}
 assert.equal(game.learnSkill('greatAttack'),false);
 const restored=createTownEconomy(new GoldLoot({storage}));
 assert.equal(restored.progression.skills.greatAttack,5);assert.equal(restored.refundSkills(),true);
 assert.equal(restored.progression.skills.greatAttack,0);assert.equal(restored.progression.points,20);
});
