// Released actor sources are parked within a budget and revived on the next
// visit instead of being parsed again (2026-11-27, village cast).
import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,FreeCamera,TransformNode,MeshBuilder,Vector3,Matrix,AssetContainer,PBRMaterial,Animation,AnimationGroup,Skeleton,Bone} from '@babylonjs/core';
import {createCinematicVisualFactory} from '../src/cinematic-visual-adapter.js';
import {getCinematicDefinitions} from '../src/cinematic-assets.js';
import {setActorSourceCacheBudget,inspectActorSourceCache,actorSourceCacheProfile,estimateSourceBytes,ACTOR_SOURCE_CACHE_BUDGETS} from '../src/actor-source-cache.js';

const entry=id=>({assetId:id,version:'v1',contentHash:'f'.repeat(64),category:'npc',name:id,referenceHeight:1.85,units:{metersPerSourceUnit:1},pivot:{offset:[0,0,0]},runtime:{manifest:'assets/'+id+'.json',assetKey:id,model:'assets/content/'+id+'.gltf'},geometry:{skinned:true,clips:1,bones:1,morphTargets:0,clipNames:['Idle'],clipDurations:{Idle:1}},bounds:{size:[1,1.85,1]}});
function source(scene,keys=2000){
 const container=new AssetContainer(scene),rig=new TransformNode('rig',scene),mesh=MeshBuilder.CreateBox('npc-body',{height:1.85},scene);mesh.parent=rig;mesh.material=new PBRMaterial('paint',scene);
 const skeleton=new Skeleton('rig','rig',scene),bone=new Bone('root',skeleton,null,Matrix.Identity());bone.linkTransformNode(rig);mesh.skeleton=skeleton;
 container.meshes.push(mesh);container.transformNodes.push(rig);container.materials.push(mesh.material);container.skeletons.push(skeleton);container.rootNodes.push(rig);
 const animation=new Animation('Idle','position',60,Animation.ANIMATIONTYPE_VECTOR3,Animation.ANIMATIONLOOPMODE_CYCLE);animation.setKeys(Array.from({length:keys},(_,i)=>({frame:i,value:new Vector3(i%7,0,0)})));
 const group=new AnimationGroup('Idle',scene);group.addTargetedAnimation(animation,rig);container.animationGroups.push(group);container.removeAllFromScene();return container;
}
function fixture(t,ids=['a','b','c']){
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('camera',new Vector3(0,2,-8),scene);
 const catalog={revision:'t',entries:ids.map(entry)},loads=new Map(),containers=[];
 const factory=createCinematicVisualFactory({world:{scene,mapId:'village',terrain:{heightAt:()=>0}},catalog,resolveCatalog:value=>value,resolveNpcSource:async()=>null,initialize:async()=>{},
  readManifest:async url=>({model:'./content/'+String(url).split('/').at(-1).replace('.json','.gltf'),height:1.85,animations:{idle:'Idle'}}),
  loadContainer:async model=>{const id=String(model).split('/').at(-1).replace('.gltf','');loads.set(id,(loads.get(id)??0)+1);const c=source(scene);containers.push(c);return c;},prepareShaders:async()=>{},prepareInterior:async()=>{}});
 const definitions=getCinematicDefinitions(catalog),definition=id=>Object.values(definitions).find(row=>row.assetId===id);
 const visit=async list=>{const adapters=list.map(id=>factory(definition(id),{isCurrent:()=>true}));await Promise.all(adapters.map(a=>a.warm()));for(const a of adapters)await a.dispose();};
 t.after(async()=>{setActorSourceCacheBudget(null);await factory.dispose();scene.dispose();engine.dispose();});
 return {scene,factory,loads,containers,visit};
}

test('budgets: iPhone parks nothing, Android touch less than desktop',()=>{
 assert.equal(actorSourceCacheProfile({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)',maxTouchPoints:5}),'ios');
 assert.equal(actorSourceCacheProfile({userAgent:'Mozilla/5.0 (Linux; Android 14; SM-S911N) Mobile',maxTouchPoints:5}),'touch');
 assert.equal(actorSourceCacheProfile({userAgent:'Mozilla/5.0 (Windows NT 10.0)',maxTouchPoints:0}),'desktop');
 assert.equal(ACTOR_SOURCE_CACHE_BUDGETS.ios,0);assert.ok(ACTOR_SOURCE_CACHE_BUDGETS.touch<ACTOR_SOURCE_CACHE_BUDGETS.desktop);
});

test('a released source is revived by the next visit: no second load',async t=>{
 setActorSourceCacheBudget(64);const f=fixture(t);
 await f.visit(['a','b']);await f.visit(['a','b']);await f.visit(['a']);
 assert.deepEqual([...f.loads],[['a',1],['b',1]]);
 const info=inspectActorSourceCache(f.scene);assert.equal(info.revived,3);assert.ok(info.sources>=1);
 assert.ok(f.containers.every(c=>c.meshes.every(m=>!m.isDisposed())),'parked sources stay intact');
});

test('over budget the oldest parked source is disposed; budget 0 keeps the old release',async t=>{
 const bytes=estimateSourceBytes(source(new Scene(new NullEngine())));
 setActorSourceCacheBudget(bytes*2.5/1048576);const f=fixture(t);
 await f.visit(['a','b','c']);
 const info=inspectActorSourceCache(f.scene);assert.equal(info.sources,2);assert.equal(info.evicted,1);
 assert.ok(f.containers[0].meshes.every(m=>m.isDisposed()),'the oldest (a) was disposed');
 await f.visit(['a']);assert.equal(f.loads.get('a'),2,'an evicted source loads again');
 setActorSourceCacheBudget(0);await f.visit(['c']);await f.visit(['c']);assert.equal(f.loads.get('c'),2,'c was revived once, then released for good');
});

test('disposing the factory disposes its parked sources',async t=>{
 setActorSourceCacheBudget(64);const f=fixture(t);await f.visit(['a','b']);
 assert.equal(inspectActorSourceCache(f.scene).sources,2);await f.factory.dispose();
 assert.equal(inspectActorSourceCache(f.scene).sources,0);assert.ok(f.containers.every(c=>c.meshes.every(m=>m.isDisposed())));
});
