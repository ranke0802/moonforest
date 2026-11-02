import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,ArcRotateCamera,Vector3,AssetContainer,MeshBuilder,PBRMaterial} from '@babylonjs/core';
import {createQuestProps} from '../src/chapter-quest-props.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const points=()=>[{id:'evidence',model:'sample',x:2,z:3}];
const profile={model:'./content/fixture.gltf',resources:['./content/fixture.gltf','./content/fixture.bin']};
const manifest={assets:{sample:{height:1,bounds:[1,1,1],lods:[profile,profile,profile]}}};
function fixture(t,options={}){
 const engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('camera',0,1,10,Vector3.Zero(),scene);
 const requested=[],world={scene,camera,lighting:{direction:Vector3.Up(),shadowsActive:false},terrain:{heightAt:()=>0},prefetchResources:async paths=>requested.push(paths),touchDevice:true};
 const container=()=>{const asset=new AssetContainer(scene),mesh=MeshBuilder.CreateBox('source',{},scene),material=new PBRMaterial('sample',scene);mesh.material=material;asset.meshes.push(mesh);asset.materials.push(material);asset.removeAllFromScene();return asset;};
 const props=createQuestProps(world,{baseUrl:new URL('https://example.test/assets/quest-props.json'),readManifest:async()=>manifest,loadContainer:async()=>container(),...options});
 t.after(()=>{props.dispose();scene.dispose();engine.dispose();});return {props,scene,world,requested,container};
}
test('quest props use the map transfer plan, stay hidden until eligible, and release model/ink ownership on 24 trips',async t=>{
 const f=fixture(t),baseline={meshes:f.scene.meshes.length,materials:f.scene.materials.length,observers:f.scene.onBeforeRenderObservable.observers.length};
 for(let trip=0;trip<24;trip++){
  const p=points();assert.equal(await f.props.load(p),true);assert.equal(p[0].visual.isEnabled(),false);assert.equal(p[0].marker.isEnabled(),false);
  f.props.update(p,{x:2,z:3},()=>true);assert.equal(p[0].visual.isEnabled(),true);
  f.props.update(p,{x:2,z:3},()=>false);assert.equal(p[0].visual.isEnabled(),false);
  f.props.release();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.scene.meshes.length,baseline.meshes);assert.equal(f.scene.materials.length,baseline.materials);assert.equal(f.scene.onBeforeRenderObservable.observers.length,baseline.observers);
 }
 assert.equal(f.requested.length,24);assert.ok(f.requested.every(paths=>paths===profile.resources));
});
test('old map decode completion is disposed without changing the next map props',async t=>{
 const old=deferred(),entered=deferred();let calls=0;
 const f=fixture(t,{loadContainer:()=>{if(++calls===1){entered.resolve();return old.promise;}return Promise.resolve(f.container());}});
 const first=f.props.load(points());await entered.promise;f.props.release();assert.equal(await first,false);
 const next=points();assert.equal(await f.props.load(next),true);f.props.update(next,{x:2,z:3},()=>true);
 const late=f.container(),mesh=late.meshes[0];old.resolve(late);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(mesh.isDisposed(),true);assert.equal(next[0].visual.isEnabled(),true);
});
test('late old manifest failure is silent and a stalled current decode times out with a fresh explicit next load',async t=>{
 const old=deferred(),entered=deferred();let reads=0;
 const f=fixture(t,{readManifest:()=>{if(++reads===1){entered.resolve();return old.promise;}return Promise.resolve(manifest);}});
 const first=f.props.load(points());await entered.promise;f.props.release();old.reject(Error('old map request'));assert.equal(await first,false);
 assert.equal(await f.props.load(points()),true);
 const stalled=deferred();let calls=0;
 const g=fixture(t,{timeoutMs:20,loadContainer:()=>++calls===1?stalled.promise:Promise.resolve(g.container())});
 await assert.rejects(g.props.load(points()),error=>error.name==='TimeoutError');assert.equal(await g.props.load(points()),true);
 const late=g.container(),mesh=late.meshes[0];stalled.resolve(late);await new Promise(resolve=>setImmediate(resolve));assert.equal(mesh.isDisposed(),true);
});
