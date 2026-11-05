import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,TransformNode,Vector3,Quaternion} from '@babylonjs/core';
import {createEmptyPlacementDocument} from '../src/placement-document.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {createWorld} from '../src/world.js';
import {createVillageTransform} from '../src/village-environment.js';
import {AuthoredPlacementRuntime} from '../src/authored-placement-runtime.js';

for(const [mapId,options]of [['village',{village:true}],['great-plains',{plains:true}],['monster-forest',{forest:true}],['witch-cave',{cave:true}]])test('every editable '+mapId+' native object produces a valid exact initial override without model loads',t=>{
 const engine=new NullEngine();engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});const world=createWorld(engine,{...options,touchDevice:true}),runtime=new AuthoredPlacementRuntime(world,{catalog:ASSET_CATALOG,initialize:async()=>{throw Error('metadata audit must not load resources');}}),manifests=new Map();t.after(()=>{runtime.dispose();world.scene.dispose();engine.dispose();});let checked=0;
 const failures=[];
 for(const row of runtime.baseManifest.instances){if(!row.editable)continue;const entry=ASSET_CATALOG.entries.find(entry=>entry.assetId===row.assetId&&entry.version===row.assetVersion);let manifest=manifests.get(entry.runtime.manifest);if(!manifest){manifest=JSON.parse(readFileSync(new URL('../public/'+entry.runtime.manifest,import.meta.url)));manifests.set(entry.runtime.manifest,manifest);}const config=manifest.assets[entry.runtime.assetKey],native=createVillageTransform(world,row.source,config);world.villageRenderRecords=[{...native,placement:row.source,meshes:[]}];
  try{const item=runtime.createBaseOverride(row.instanceId),root=new TransformNode('override',world.scene),facing=new TransformNode('override-front',world.scene);facing.parent=root;root.position=Vector3.FromArray(item.transform.position).add(Vector3.FromArray(item.attachment.normal).scale(item.attachment.offset));root.rotationQuaternion=Quaternion.FromArray(item.transform.rotation);root.scaling=Vector3.FromArray((item.transform.aspect??[1,1,1]).map(value=>value*item.transform.scale));facing.scaling.setAll(entry.units.metersPerSourceUnit);facing.rotation.y=item.transform.frontYaw??entry.forwardYaw??0;const actual=facing.computeWorldMatrix(true),expected=native.facing.computeWorldMatrix(true);for(let i=0;i<16;i++)assert.ok(Math.abs(actual.m[i]-expected.m[i])<2e-5,'native transform component '+i);root.dispose();checked++;}catch(error){failures.push({id:row.instanceId,asset:row.assetId,message:error.message});}finally{native.root.dispose();}
 }
 assert.deepEqual(failures,[]);assert.equal(checked,runtime.baseManifest.instances.filter(row=>row.editable).length);assert.equal(runtime.stats.sourceLoads,0);assert.equal(runtime.assets.size,0);
});


test('the forest entrance object owns its three explicitly authored analytic shell pieces on delete and undo',async t=>{
 const engine=new NullEngine(),world=createWorld(engine,{forest:true,touchDevice:true}),runtime=new AuthoredPlacementRuntime(world,{catalog:ASSET_CATALOG,initialize:async()=>{throw Error('deletion must not load models');}}),original=world.navigation;t.after(()=>{runtime.dispose();world.scene.dispose();engine.dispose();});const shell=original.obstacles.filter(row=>row.id.startsWith('cave-rock-'));assert.equal(shell.length,3);
 await runtime.apply({...createEmptyPlacementDocument(runtime.baseManifest),revision:1,removedBaseIds:['witch-cave']});assert.equal(world.navigation.obstacles.some(row=>row.id.startsWith('cave-rock-')),false);assert.equal(world.navigation.obstacles.length,original.obstacles.length-3);assert.equal(runtime.stats.sourceLoads,0);
 await runtime.apply({...createEmptyPlacementDocument(runtime.baseManifest),revision:2});assert.equal(world.navigation,original);assert.deepEqual(original.obstacles.filter(row=>row.id.startsWith('cave-rock-')),shell);
});
