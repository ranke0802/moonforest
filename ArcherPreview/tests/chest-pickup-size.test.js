import {caveFogFallback} from '../src/cave-fog-binding.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,HemisphericLight} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {createItemDropView} from '../src/item-drop-view.js';
import {readMapContainer} from '../src/map-container.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

test('shipped chest and chapter 0.3 monster pickups land above ground at model-specific world sizes',async t=>{
 const engine=new NullEngine();engine.getCaps().instancedArrays=true;const scene=new Scene(engine),camera=new FreeCamera('pickup-qa',new Vector3(0,1,-4),scene);camera.setTarget(Vector3.Zero());caveFogFallback(scene).getInternalTexture().isReady=true;new HemisphericLight('qa-light',Vector3.Up(),scene);
 const assets=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('quest-props.json',assets))),world={scene,camera,lighting:{direction:Vector3.Up(),registerMeshes(){},shadowsActive:false},prefetchResources:async()=>{}};let loads=0;
 const view=createItemDropView(world,{baseUrl:new URL('https://qa.test/assets/quest-props.json'),readManifest:async()=>manifest,loadContainer:async url=>{
  loads++;const decoded=await readRuntimeGltf(new URL(url.pathname.replace(/^\/assets\//,''),assets)),gltf=decoded.gltf;
  for(const key of ['extensionsRequired','extensionsUsed'])gltf[key]=(gltf[key]??[]).filter(v=>!['EXT_meshopt_compression','KHR_texture_basisu'].includes(v));
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  return readMapContainer(scene,gltf,'',{skipMaterials:true});
 }});t.after(()=>{view.dispose();scene.dispose();engine.dispose();});
 const cases=[
  ['chest:size-0','contaminated-vial',.34],['chest:locket','memory-locket',.22],['chest:pie','apple-pie',.44],
  ['foe:bile:0','contaminated-vial',.34],['foe:pelt:0','clue-satchel',.46],['foe:weapon:0','goblin-club',.72],
  ['monster-size','contaminated-vial',.081], // 0.2 chapter quest drop
 ];
 const drops=cases.map(([id,model],i)=>({id,model,origin:{x:i,y:.4,z:0},position:{x:i,y:.04,z:0}}));
 for(let i=0;i<600&&view.inspect().visible<drops.length;i++){view.sync(drops,.1);await new Promise(r=>setTimeout(r,1));}
 assert.equal(view.inspect().visible,drops.length);assert.equal(loads,5,'foe and chest bottles reuse one source');for(let i=0;i<24;i++)view.sync(drops,.1);
 for(let i=0;i<drops.length;i++){
  const root=scene.getTransformNodeByName('item-drop-'+drops[i].id),bounds=root.getHierarchyBoundingVectors(),size=bounds.max.subtract(bounds.min),shape=manifest.assets[drops[i].model].bounds,scale=cases[i][2]/Math.max(...shape),c=Math.abs(Math.cos(root.rotation.y)),s=Math.abs(Math.sin(root.rotation.y)),rotated=Math.max(shape[0]*c+shape[2]*s,shape[1],shape[0]*s+shape[2]*c)*scale;assert.ok(Math.abs(Math.max(size.x,size.y,size.z)-rotated)<.002,drops[i].model+' readable world size: '+Math.max(size.x,size.y,size.z)+' expected '+rotated);assert.ok(bounds.min.y>=.035,'pickup bottom must not sink below the landing surface');assert.ok(root.isWorldMatrixFrozen,'settled pickups return to frozen matrices');
 }
 const a=scene.getTransformNodeByName('item-drop-chest:size-0').getChildMeshes()[0],b=scene.getTransformNodeByName('item-drop-foe:bile:0').getChildMeshes()[0];assert.equal(a.geometry,b.geometry);const frozen=scene.getTransformNodeByName('item-drop-chest:size-0').getWorldMatrix().clone();view.sync(drops,.1);assert.ok(frozen.equals(scene.getTransformNodeByName('item-drop-chest:size-0').getWorldMatrix()));view.clear();assert.equal(view.inspect().visible,0);assert.equal(view.inspect().models,0);
});
