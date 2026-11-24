import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FreeCamera,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readMapContainer} from '../src/map-container.js';
import {createRidingHorse} from '../src/v03/riding-horse.js';
import {configurePlayerSize} from '../src/player-dimensions.js';
import {CharacterAnimator} from '../src/animation.js';

function skipPaint(g){
 delete g.extensionsRequired;delete g.extensionsUsed;delete g.images;delete g.materials;delete g.textures;
 for(const m of g.meshes)for(const p of m.primitives)delete p.material;
}
function horseForNullEngine(){
 const input=readFileSync(new URL('../src/v03/models/wagon-horse-rig.glb',import.meta.url)),n=input.readUInt32LE(12);
 const g=JSON.parse(input.subarray(20,n+20)),raw=input.subarray(20+n);
 skipPaint(g);
 const json=Buffer.from(JSON.stringify(g)),pad=Buffer.alloc((4-json.length%4)%4,32),head=Buffer.from(input.subarray(0,20));
 head.writeUInt32LE(20+json.length+pad.length+raw.length,8);head.writeUInt32LE(json.length+pad.length,12);
 return Buffer.concat([head,json,pad,raw]);
}
test('shipped iOS warrior and horse keep saddle contact after the weighted run blend; mobile cancellation aborts the GLB and releases the mesh',async t=>{
 const confUrl=new URL('../public/assets/warrior-v3-ios.json',import.meta.url);
 const cfg=JSON.parse(readFileSync(confUrl)),rt=await readRuntimeGltf(new URL(cfg.model,confUrl)),g=rt.gltf;
 skipPaint(g);
 for(const b of g.buffers)b.uri='data:application/octet-stream;base64,'+rt.files.get(b.uri).data.toString('base64');
 const engine=new NullEngine(),scene=new Scene(engine);
 scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
 new FreeCamera('camera',new Vector3(0,2,-4),scene);
 const asset=await readMapContainer(scene,g,'file:///',{skipMaterials:true});asset.addAllToScene();
 const root=new TransformNode('player-world-transform',scene),lift=new TransformNode('rider-saddle-offset',scene);
 lift.parent=root;root.metadata={saddleOffset:lift};
 for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=lift;
 configurePlayerSize(root,cfg,{warrior:true});
 const animator=new CharacterAnimator(asset.animationGroups,cfg.animations,{bindingCacheSize:9,prewarmBindings:true});
 const hip=scene.getTransformNodeByName('mixamorig:Hips'),leg=scene.getTransformNodeByName('mixamorig:LeftUpLeg'),knee=scene.getTransformNodeByName('mixamorig:LeftLeg');
 const originalFetch=globalThis.fetch,horse=horseForNullEngine(),baseMeshes=scene.meshes.length;
 let abort=false,hold=true,click;
 globalThis.fetch=(_url,{signal})=>{
  if(!hold)return Promise.resolve(new Response(horse));
  return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{abort=true;reject(signal.reason);},{once:true}));
 };
 const doc={addEventListener(){},removeEventListener(){},querySelector(){return null;},createElement:()=>button};
 const button={dataset:{},setAttribute(){},addEventListener(name,fn){click=fn;},remove(){}};
 const stable=createRidingHorse({world:{mapId:'village',scene,terrain:{heightAt:()=>0}},
  root:{ownerDocument:doc,querySelector:()=>({append(){}})},storage:{getItem:()=> '1',setItem(){}},player:()=>root,
  ridingAllowed:()=>true,tell(){},forwardYaw:()=>cfg.forwardYaw});
 try{
  stable.updateAvailability();
  const loading=click();assert.equal(button.textContent,'Cancel');assert.ok(!button.hidden&&!button.disabled);
  await click();await loading;assert.ok(abort);assert.equal(scene.meshes.length,baseMeshes);assert.equal(lift.position.y,0);
  hold=false;await click();assert.ok(stable.active);assert.equal(button.textContent,'Dismount');
  const skin=scene.meshes.find(m=>m.name==='wagon_horse');assert.ok(skin?.skeleton);
  for(let i=0;i<12;i++){
   root.rotation.y=i*.18;root.position.set(.16*i,.2,-.18*i);
   animator.transition('run',{clipTime:.083*i,loop:true});animator.update(1/60);
   stable.afterMove({state:'run'},5);
   scene.render();
   for(const node of [leg,knee,hip])node.computeWorldMatrix(true);
   const dir=knee.absolutePosition.subtract(leg.absolutePosition).normalize();
   const expected=Vector3.TransformNormal(new Vector3(.5,-.54,.64).normalize(),root.getWorldMatrix()).normalize();
   assert.ok(Vector3.Dot(dir,expected)>.9999,'run animation overrode seated leg at frame '+i);
   // Sample the actual CPU-skinned source triangle under the rider. The game
   // uses four precomputed bind-local weights and never reads a mesh on a frame.
   const points=skin.getPositionData(true);
   const weights=[.41430354,.54627857,.03941788];
   const at=[4456,4457,4458].reduce((y,id,k)=>y+weights[k]*Vector3.TransformCoordinates(Vector3.FromArray(points,id*3),skin.getWorldMatrix()).y,0);
   assert.ok(Math.abs(hip.absolutePosition.y-at-.13)<.004,'hips '+hip.absolutePosition.y+' vs back '+at);
  }
  await click();assert.equal(scene.meshes.length,baseMeshes);assert.equal(lift.position.y,0);assert.equal(scene.animationGroups.length,asset.animationGroups.length);
 }finally{stable.dispose();animator.dispose();asset.dispose();scene.dispose();engine.dispose();globalThis.fetch=originalFetch;}
});
