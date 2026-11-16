import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,StandardMaterial,TransformNode,Skeleton,MorphTargetManager,MorphTarget} from '@babylonjs/core';
import {canReleaseDormantEncounter,releaseDormantEncounter,trimDormantEncounterPools} from '../src/dormant-encounter-pool.js';

const fake=(id,changes={})=>({id,assetPrepared:true,active:false,loading:false,actor:{isEnabled:()=>false},...changes});
test('trimming preserves stable slot0 and caps total dormant clones with no active actor deletion',async()=>{
 const groups=[0,1,2].map(k=>({pool:Array.from({length:20},(_,i)=>fake(k+':'+i)),models:{container:{}}})),released=[];
 const result=await trimDormantEncounterPools(groups,{release:enemy=>{released.push(enemy.id);return true;}});
 assert.equal(result.retained,12);assert.equal(result.released,48);assert.equal(released.length,48);
 groups.forEach((row,i)=>assert.equal(row.pool[0].id,i+':0'));
 const busy=[{pool:[fake(0),fake(1),fake(2,{active:true})]}];await trimDormantEncounterPools(busy,{limit:1,release:()=>{throw Error('must not release active tail');}});assert.equal(busy[0].pool.length,3);
});
test('a map/summon revision change during yield prevents disposal and pool publication',async()=>{
 let current=true,released=0;const groups=[{pool:[fake(0),fake(1)]}];
 await trimDormantEncounterPools(groups,{limit:1,current:()=>current,pause:async()=>{current=false;},release:()=>{released++;return true;}});
 assert.equal(released,0);assert.equal(groups[0].pool.length,2);
 assert.equal(canReleaseDormantEncounter(fake(0,{hiddenPreparationPending:Promise.resolve()})),false);
});
test('disposing a hidden cloned rig preserves library geometry, material, morph and live sibling',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);try{
  const source=MeshBuilder.CreateBox('source',{},scene),material=new StandardMaterial('shared',scene);source.material=material;
  const sourceManager=new MorphTargetManager(scene);sourceManager.addTarget(MorphTarget.FromMesh(source,'source-morph',0));source.morphTargetManager=sourceManager;
  const sibling=source.clone('live-sibling');sibling.material=material;
  const root=new TransformNode('hidden-clone',scene),mesh=source.clone('clone',root);root.setEnabled(false);
  const manager=new MorphTargetManager(scene);manager.addTarget(MorphTarget.FromMesh(source,'clone-morph',0));mesh.morphTargetManager=manager;
  const skeleton=new Skeleton('clone-rig','clone-rig',scene);mesh.skeleton=skeleton;
  const enemy=fake('clone',{actor:root,asset:{meshes:[mesh],transformNodes:[],animationGroups:[],skeletons:[skeleton]},animator:{dispose(){}}});
  assert.equal(releaseDormantEncounter(enemy,{meshes:[source]}),true);assert.equal(mesh.isDisposed(),true);
  assert.equal(source.isDisposed(),false);assert.equal(sibling.isDisposed(),false);assert.equal(source.material,material);assert.equal(sibling.geometry,source.geometry);
  assert.ok(scene.materials.includes(material));assert.ok(scene.morphTargetManagers.includes(sourceManager));assert.ok(!scene.skeletons.includes(skeleton));
 }finally{scene.dispose();engine.dispose();}
});
