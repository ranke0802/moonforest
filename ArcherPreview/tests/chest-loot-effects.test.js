import test from 'node:test';
import assert from 'node:assert/strict';
import {AssetContainer,Color3,FreeCamera,HemisphericLight,MeshBuilder,NullEngine,PBRMaterial,Scene,Vector3,VertexBuffer} from '@babylonjs/core';
import {createChestLootFx} from '../src/chest-loot-fx.js';
import {chestEffectProfile,dropItemTier,lootSeed,sampleChestFlight,scatterChestLoot} from '../src/chest-loot-motion.js';
import {CHEST_DROP_LIMIT,CHEST_REWARD_CHOICES,chestRewardDrops} from '../src/chest-reward-data.js';
import {createItemDropView} from '../src/item-drop-view.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {lootRarity} from '../src/loot-rarity.js';

function sceneFixture(t){const engine=new NullEngine();engine.getCaps().instancedArrays=true;const scene=new Scene(engine),camera=new FreeCamera('camera',new Vector3(0,3,-8),scene);camera.setTarget(new Vector3(0,1,0));caveFogFallback(scene).getInternalTexture().isReady=true;new HemisphericLight('light',Vector3.Up(),scene);t.after(()=>{scene.dispose();engine.dispose();});return {scene,camera};}
const idle=()=>new Promise(r=>setTimeout(r,1));

test('chest grade controls opening palette and density; item rarity is independent of the chest',()=>{
 for(let tier=1;tier<=5;tier++){const profile=chestEffectProfile(tier);assert.equal(profile.color,lootRarity(tier).color);assert.equal(profile.sparks,8+tier*4);}
 assert.equal(dropItemTier({model:'contaminated-vial',rewards:{'refined-tonic':1,gold:140}}),3);
 assert.equal(dropItemTier({model:'apple',rewards:{apple:1,'church-seal':1}}),1,'bonus quest items do not recolor a visible apple');
 assert.equal(dropItemTier({model:'clue-satchel',rewards:{'church-seal':1}}),5);
});

test('high arc scatters a rich batch onto clear ground, never a wall or cliff, and settles upright',()=>{
 const world={terrain:{heightAt:(x,z)=>x>2?5:0},navigation:{free:p=>p.z>=-1.8,segmentClear:(_a,b)=>b.z>=-1.8}},origin={x:0,z:0},poses=scatterChestLoot(world,origin,24,.31);
 assert.equal(poses.length,24);assert.ok(new Set(poses.map(p=>p.position.x.toFixed(3)+','+p.position.z.toFixed(3))).size>20);
 assert.ok(Math.max(...poses.map(p=>p.position.x))-Math.min(...poses.map(p=>p.position.x))>3.5);
 for(const [i,p] of poses.entries()){assert.equal(p.position.y,.04);assert.ok(p.position.x<=2&&p.position.z>=-1.8);const drop={...p,id:'chest:'+i},seed=lootSeed(drop.id),middle=sampleChestFlight(drop,.7,seed),end=sampleChestFlight(drop,2,seed);assert.ok(middle.y>1.8);assert.equal(end.x,p.position.x);assert.ok(Math.abs(end.y-p.position.y)<1e-10);assert.equal(end.z,p.position.z);assert.equal(end.tilt,0);assert.equal(end.turn,0);assert.equal(end.settled,true);assert.equal(sampleChestFlight(drop,.5,seed).settled,false);}
 const blocked=scatterChestLoot({terrain:{heightAt:()=>0},navigation:{free:()=>false}},origin,2);assert.deepEqual(blocked.map(p=>p.position),[{x:0,y:.04,z:0},{x:0,y:.04,z:0}]);
});

test('large reward quantities produce at most 24 physical stacks and retain the exact inventory totals',()=>{
 const chestItems=CHEST_REWARD_CHOICES.slice(0,16).map(({id})=>({id,count:9999})),parts=chestRewardDrops({tier:5,chestItems});assert.ok(parts.length<=CHEST_DROP_LIMIT);assert.ok(parts.length>16);
 for(const {id,count} of chestItems)assert.equal(parts.reduce((sum,p)=>sum+(p.rewards[id]??0),0),count);
});

test('pooled opening and trails use one mesh, bounded triangles, cave clipping and zero idle uploads',async t=>{
 const {scene,camera}=sceneFixture(t),baseline={meshes:scene.meshes.length,materials:scene.materials.length,observers:scene.onBeforeRenderObservable.observers.length},fx=createChestLootFx(scene);t.after(()=>fx.dispose());await fx.preparation;assert.equal(fx.inspect().ready,true);assert.equal(scene.meshes.length,baseline.meshes+1);assert.equal(fx.mesh.getTotalIndices()/3,704);
 const p=new Vector3(0,0,0);fx.burst(p,4);fx.update(.01);assert.equal(fx.inspect().active,chestEffectProfile(4).sparks);const color=fx.mesh.getVerticesData(VertexBuffer.ColorKind),expected=Color3.FromHexString(lootRarity(4).color);assert.ok(Math.abs(color[0]-expected.r)<1e-6);assert.ok(Math.abs(color[1]-expected.g)<1e-6);assert.ok(Math.abs(color[2]-expected.b)<1e-6);assert.equal(fx.mesh.material.disableDepthWrite,true);assert.match(fx.mesh.material.shaderPath.fragmentSource,/caveFogHidesInk/);
 for(let n=0;n<1000;n++)fx.trail(p,new Vector3(1,n*.001,0),3);fx.update(.01);assert.ok(fx.inspect().active<=352);assert.equal(scene.meshes.length,baseline.meshes+1);scene.render();
 for(let i=0;i<15;i++)fx.update(.1);assert.equal(fx.inspect().active,0);assert.equal(fx.mesh.isEnabled(),false);const uploads=fx.inspect().uploads;let cameraReads=0;const getDirection=camera.getDirectionToRef.bind(camera);camera.getDirectionToRef=(...args)=>{cameraReads++;return getDirection(...args);};for(let i=0;i<100;i++)fx.update(.016);assert.equal(fx.inspect().uploads,uploads);assert.equal(cameraReads,0,'idle effects skip even the billboard preparation');fx.burst(p,1);fx.update(.016);assert.equal(fx.inspect().active,12,'another chest reactivates the same pool');assert.ok(cameraReads>0);assert.equal(scene.onBeforeRenderObservable.observers.length,baseline.observers);
 fx.dispose();assert.equal(scene.meshes.length,baseline.meshes);assert.equal(scene.materials.length,baseline.materials);
});

test('late effect preparation after map disposal cannot publish queued effects or meshes',async t=>{
 const {scene}=sceneFixture(t);let resolve;const fx=createChestLootFx(scene,{prepare:()=>new Promise(r=>resolve=r)});await idle();for(let i=0;i<10;i++)fx.burst({x:0,y:0,z:0},5);assert.equal(fx.inspect().pending,4);fx.dispose();resolve();await fx.preparation;fx.update(.1);assert.equal(fx.inspect().ready,false);assert.equal(scene.meshes.length,0);
});

test('chest pickups retain item-tier ink at small camera coverage and release all owned resources repeatedly',async t=>{
 const {scene,camera}=sceneFixture(t),world={scene,camera,lighting:{direction:Vector3.Up(),registerMeshes(){},shadowsActive:false}},profile={model:'model.gltf',resources:[]},manifest={assets:{'contaminated-vial':{height:.1,bounds:[1,1,1],lods:[profile,profile]}}},base={meshes:scene.meshes.length,materials:scene.materials.length,geometry:scene.geometries.length,observers:scene.onBeforeRenderObservable.observers.length,stages:scene._afterRenderingMeshStage.length};
 const view=createItemDropView(world,{baseUrl:new URL('https://qa/assets/quest-props.json'),readManifest:async()=>manifest,loadContainer:async()=>{const container=new AssetContainer(scene),mesh=MeshBuilder.CreateBox('bottle',{},scene);mesh.material=new PBRMaterial('bottle',scene);container.meshes.push(mesh);container.materials.push(mesh.material);container.removeAllFromScene();return container;}});t.after(()=>view.dispose());
 for(let cycle=0;cycle<4;cycle++){await view.prepareEffects();assert.equal(view.inspect().models,0,'effect prewarm does not load any item model');assert.equal(view.inspect().visible,0);assert.equal(view.inspect().effects.ready,true);const drop={id:'chest:ink'+cycle,model:'contaminated-vial',origin:{x:0,y:.55,z:0},position:{x:0,y:.04,z:0},rewards:{'refined-tonic':1},effectEnabled:true};view.openChest({x:0,y:0,z:0},5);for(let i=0;i<100&&!view.inspect().models;i++){view.sync([drop],.01);await idle();}for(let i=0;i<22;i++)view.sync([drop],.1);scene.render();const root=scene.getTransformNodeByName('item-drop-'+drop.id),mesh=root.getChildMeshes()[0];assert.equal(mesh.instancedBuffers.villageInkTint.toHexString().toLowerCase(),lootRarity(3).color);assert.equal(mesh.instancedBuffers.villageInk.x,1);assert.equal(view.ready(drop.id),true);assert.ok(root.isWorldMatrixFrozen);assert.equal(view.inspect().effects.active,0);view.sync([],0);assert.equal(view.inspect().outlineInstances,0);view.clear();await idle();assert.deepEqual({meshes:scene.meshes.length,materials:scene.materials.length,geometry:scene.geometries.length,observers:scene.onBeforeRenderObservable.observers.length,stages:scene._afterRenderingMeshStage.length},base);}
});
