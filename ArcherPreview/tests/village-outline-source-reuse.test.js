import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeCamera,MeshBuilder,NullEngine,PBRMaterial,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {VillageOutlines} from '../src/village-outlines.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {lootRarity} from '../src/loot-rarity.js';

test('one record batch prepares each native source once and a late grade still upgrades existing instances',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);engine.getCaps().instancedArrays=true;
 const camera=new FreeCamera('camera',new Vector3(0,2,-8),scene);camera.setTarget(Vector3.Zero());caveFogFallback(scene).getInternalTexture().isReady=true;
 const source=MeshBuilder.CreateBox('source',{},scene),lod=MeshBuilder.CreateBox('lod',{},scene);source.isVisible=lod.isVisible=false;
 source.material=new PBRMaterial('material',scene);lod.material=source.material;source.addLODLevel(12,lod);
 const records=Array.from({length:120},(_,i)=>{const root=new TransformNode('root-'+i,scene),mesh=source.createInstance('instance-'+i);mesh.parent=root;return {root,meshes:[mesh],placement:{kind:'ground-detail',...(i>=80?{tier:5}:{})}};});
 const ink=new VillageOutlines({scene,camera,touchDevice:true},[],{});t.after(()=>{ink.dispose();scene.dispose();engine.dispose();});
 let preparations=0;const sourceFor=ink.sourceFor;ink.sourceFor=(...args)=>{preparations++;return sourceFor(...args);};
 ink.addRecords(records);
 assert.equal(preparations,4,'one base+LOD setup and one late grade base+LOD upgrade');
 assert.equal(ink.entries.length,120);assert.equal(ink.sources.size,2);
 for(let i=0;i<records.length;i++)assert.equal(records[i].meshes[0].instancedBuffers.villageInkTint.toHexString().toLowerCase(),i>=80?lootRarity(5).color:'#110d0b');
 const late=MeshBuilder.CreateBox('late-lod',{},scene);late.material=source.material;late.isVisible=false;source.addLODLevel(24,late);
 const root=new TransformNode('late-root',scene),mesh=source.createInstance('late-instance');mesh.parent=root;
 ink.addRecords([{root,meshes:[mesh],placement:{kind:'ground-detail'}}]);
 assert.ok(ink.sources.has(late),'reuse ends at the next addRecords call');assert.ok(late.instancedBuffers.villageInkTint);
 const count=preparations;ink.addRecords(records);assert.equal(preparations,count,'duplicate meshes do no preparation');
});
