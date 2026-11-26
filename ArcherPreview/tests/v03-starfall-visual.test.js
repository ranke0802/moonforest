import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeCamera, NullEngine, Scene, Vector3} from '@babylonjs/core';
import {createGreatAttackFx} from '../src/v03/great-attack-fx.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {GoldLoot} from '../src/gold-loot.js';

test('Starfall occupies one mesh, follows the combat radius, releases its gauge and retires after impact',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 new FreeCamera('camera',new Vector3(0,2,-5),scene);
 const elements=[];
 const root={append(node){elements.push(node);},ownerDocument:{createElement(){return {style:{},setAttribute(){},append(node){this.child=node;},remove(){this.removed=true;}};}}};
 let time=100;
 const fx=createGreatAttackFx({scene,root,now:()=>time,ground:()=>1,project:()=>({x:22,y:33,visible:true})});
 const mesh=scene.getMeshByName('v03-starfall'),gauge=elements[0];
 assert.equal(scene.meshes.length,1);assert.equal(mesh.isEnabled(),false);
 const actor=new Vector3(4,1,3), blade=[[4,2,3],[4,3,3]], cast={actionId:1,center:actor,radius:4,level:2,phase:'windup',progress:.5};
 fx.update(cast,blade,actor);
 assert.equal(gauge.hidden,false);assert.equal(gauge.child.style.transform,'scaleX(0.5)');assert.equal(mesh.material._floats.radius,4);
 assert.equal(mesh.material._vectors3.tip.y,3);
 const buffers=mesh.geometry;
 fx.update({...cast,phase:'impact'},blade,actor);
 assert.equal(gauge.hidden,true);assert.equal(mesh.material._floats.windup,0);
 time+=250;fx.update({...cast,phase:'recovery'},blade,actor);
 assert.ok(mesh.material._floats.age>0);assert.equal(mesh.geometry,buffers);
 time+=310;fx.update({...cast,phase:'recovery'},blade,actor);assert.equal(mesh.isEnabled(),false);
 fx.update({...cast,actionId:2},blade,actor);assert.equal(mesh.isEnabled(),true);
 fx.update(null,null,actor);assert.equal(gauge.hidden,true);assert.equal(mesh.isEnabled(),false);
 await scene.whenReadyAsync();
 fx.dispose();assert.equal(scene.meshes.length,0);assert.equal(gauge.removed,true);scene.dispose();engine.dispose();
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
