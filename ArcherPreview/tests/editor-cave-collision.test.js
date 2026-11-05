import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,MeshBuilder,Scene,Vector3,VertexBuffer} from '@babylonjs/core';
import {EDITOR_CAVE_COLLISION_DATA as data} from '../src/editor-cave-collision-data.js';
import {CAVE_COLLISION_DATA} from '../src/witch-cave-collision-data.js';
import {CAVE_SIGHT_DATA} from '../src/witch-cave-sight-data.js';
import {CAVE_CAMERA_DATA} from '../src/witch-cave-camera-data.js';
import {caveSourceFingerprint} from '../scripts/cave-source-fingerprint.mjs';
import {fillCaveRuns,fillCaveCamera,caveDistanceField,sampleCaveDistance,rasterizeCaveGeometry,caveCameraCellsBlocked} from '../src/editor-cave-grid.js';
import {prepareEditedCaveClearance} from '../src/editor-cave-collision.js';
import {createWorld} from '../src/world.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {caveCameraBlocked} from '../src/witch-cave-camera.js';
import {AuthoredPlacementRuntime} from '../src/authored-placement-runtime.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {createEmptyPlacementDocument} from '../src/placement-document.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

const bodyUnion=(omit=new Set())=>{const cells=new Uint8Array(data.size**2);for(const [id,runs]of Object.entries(data.owners))if(!omit.has(id))fillCaveRuns(cells,runs);return cells;};
const typed=(text,Type)=>{const bytes=Buffer.from(text,'base64');return new Type(bytes.buffer,bytes.byteOffset,bytes.length/Type.BYTES_PER_ELEMENT);};

test('complete near-mesh ownership exactly reproduces every approved body, sight and camera cell',()=>{
 assert.equal(data.fingerprint,caveSourceFingerprint());assert.equal(Object.keys(data.owners).length,210);
 assert.deepEqual(bodyUnion(),fillCaveRuns(new Uint8Array(data.size**2),CAVE_COLLISION_DATA.runs));
 const sight=new Uint8Array(data.size**2),camera=new Uint32Array(sight.length*8);for(const id of Object.keys(data.owners)){fillCaveRuns(sight,data.sightOwners[id]);fillCaveCamera(camera,data.cameraOwners[id]);}
 assert.deepEqual(sight,fillCaveRuns(new Uint8Array(sight.length),CAVE_SIGHT_DATA.runs));
 const lookup=typed(CAVE_CAMERA_DATA.lookup,Uint16Array),profiles=typed(CAVE_CAMERA_DATA.profiles,Uint32Array);for(let i=0;i<lookup.length;i++)for(let k=0;k<8;k++)assert.equal(camera[i*8+k],profiles[lookup[i]*8+k]);
});

test('removing one owner preserves all overlapping retained contributors rather than erasing an aggregate cell',()=>{
 const counts=new Uint16Array(data.size**2);for(const runs of Object.values(data.owners))for(let i=0;i<runs.length;i+=2)for(let at=runs[i];at<runs[i]+runs[i+1];at++)counts[at]++;
 const id=Object.keys(data.owners).find(id=>data.owners[id].some((_,index)=>index%2===0&&Array.from({length:data.owners[id][index+1]},(_,n)=>counts[data.owners[id][index]+n]).some(n=>n>1)));assert.ok(id);
 const retained=bodyUnion(new Set([id]));let overlaps=0;for(let i=0;i<data.owners[id].length;i+=2)for(let at=data.owners[id][i];at<data.owners[id][i]+data.owners[id][i+1];at++)if(counts[at]>1){assert.equal(retained[at],1);overlaps++;}assert.ok(overlaps>0);
});

test('actual transformed mesh preparation moves body, eye-height and raised-camera occupancy and caches revision-only commits',t=>{
 const engine=new NullEngine(),scene=new Scene(engine),terrain=createWitchCaveTerrain(),mesh=MeshBuilder.CreateBox('edited-rock',{size:3},scene);t.after(()=>{scene.dispose();engine.dispose();});
 const instance={instanceId:'new-rock',assetId:'fixture-rock',collision:'solid',transform:{position:[0,0,0]},attachment:{}};
 const record={instance,entry:{catalog:{category:'rock',assetId:'fixture-rock'},config:{category:'rock'}},meshes:[mesh],facing:mesh};
 const runtime={world:{terrain},baseManifest:{instances:[]},stats:{},_setTransform(record,row){mesh.position.set(row.transform.position[0],terrain.heightAt(row.transform.position[0],row.transform.position[2])+1.5,row.transform.position[2]);mesh.computeWorldMatrix(true);record.instance=structuredClone(row);}};
 const first=prepareEditedCaveClearance(runtime,{instances:[instance]},new Map([['new-rock',record]]));assert.equal(first.cameraBlocked(1.5,terrain.heightAt(0,0)+2,0,0),true);assert.equal(first.sightBlocked(1.5,0,0),true);assert.ok(first.clearanceAt(1.5,0)<0);
 assert.equal(prepareEditedCaveClearance(runtime,{revision:100,instances:[instance]},new Map([['new-rock',record]])),first);assert.equal(runtime.stats.caveCollisionBakes,1);
 const moved=structuredClone(instance);moved.transform.position=[8,0,0];const second=prepareEditedCaveClearance(runtime,{instances:[moved]},new Map([['new-rock',record]]));assert.equal(second.cameraBlocked(9.5,terrain.heightAt(8,0)+2,0,0),true);assert.equal(runtime.stats.caveCollisionBakes,2);assert.equal(runtime.caveEditorMasks.size,2);assert.deepEqual(record.instance,instance,'preparation restores the committed render pose');
 for(let i=0;i<30;i++){second.clearanceAt(i*.1,0);second.cameraBlocked(i*.1,2,0);second.sightBlocked(i*.1,0);}assert.equal(runtime.stats.caveCollisionBakes,2,'queries never bake geometry');
});

test('actual cave runtime commits base deletions into owned clearance and camera hooks, undo/dispose restore the exact original gate',async t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});engine.getCaps().instancedArrays=true;caveFogFallback(world.scene).getInternalTexture().isReady=true;
 let rebuilds=0;world.caveFog={fog:{rebuildOccluders(){rebuilds++;}},updateRecords(){}};
 const runtime=new AuthoredPlacementRuntime(world,{catalog:ASSET_CATALOG,initialize:async()=>{}}),original=world.navigation;t.after(()=>{runtime.dispose();world.scene.dispose();engine.dispose();});
 const empty=createEmptyPlacementDocument(runtime.baseManifest);await runtime.apply({...empty,revision:1});assert.equal(runtime.stats.caveCollisionBakes,undefined);assert.equal(world.terrain.authoredCaveCollision,undefined);assert.equal(rebuilds,0);
 const target=runtime.baseManifest.instances.find(row=>row.instanceId==='cavern-88'&&row.editable);assert.ok(target);
 const removed={...empty,revision:2,removedBaseIds:[target.instanceId]};await runtime.apply(removed);assert.notEqual(world.navigation,original);assert.equal(world.navigation.clearanceAt,world.terrain.authoredCaveCollision.clearanceAt);assert.equal(rebuilds,1);assert.equal(runtime.stats.caveCollisionBakes,1);
 const occupancy=bodyUnion(new Set([target.instanceId])),field=caveDistanceField(occupancy,data);let changed=0;for(let z=0;z<data.size;z++)for(let x=0;x<data.size;x++){const xx=data.min+(x+.5)*data.step,zz=data.min+(z+.5)*data.step;if(world.navigation.clearanceAt(xx,zz)>original.clearanceAt(xx,zz)+.01)changed++;}assert.ok(changed>0,'deleting an actual original opens its former walkable footprint');
 const hook=world.terrain.authoredCaveCollision;assert.equal(caveCameraBlocked({...world.terrain,heightAt:()=>-100,authoredCaveCollision:{...hook,cameraBlocked:()=>true}},0,1,0,0),true);
 await runtime.apply({...empty,revision:3});assert.equal(world.navigation,original);assert.equal(world.terrain.authoredCaveCollision,undefined);assert.equal(rebuilds,2);
 await runtime.apply({...removed,revision:4});assert.equal(runtime.stats.caveCollisionBakes,1,'undo/redo can reuse the last identical geometric field');runtime.dispose();assert.equal(world.navigation,original);assert.equal(world.terrain.authoredCaveCollision,undefined);assert.equal(runtime.caveEditorMasks.size,0);assert.equal(runtime.caveEditorPrepared,null);assert.equal(rebuilds,4);
});


test('a full 128-object cave commit reuses fixed-size typed scratch buffers and retains a bounded sparse cache',t=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=MeshBuilder.CreateBox('batch-rock',{size:1},scene),terrain=createWitchCaveTerrain();t.after(()=>{scene.dispose();engine.dispose();});
 const rows=Array.from({length:128},(_,i)=>({instanceId:'batch-'+i,assetId:'fixture-rock',collision:'solid',transform:{position:[(i%16)*2-16,0,Math.floor(i/16)*2-8]},attachment:{}})),records=new Map(rows.map(instance=>[instance.instanceId,{instance,entry:{catalog:{category:'rock',assetId:'fixture-rock'},config:{category:'rock'}},meshes:[mesh],facing:mesh}])),runtime={world:{terrain},baseManifest:{instances:[]},stats:{},_setTransform(record,row){mesh.position.set(row.transform.position[0],terrain.heightAt(row.transform.position[0],row.transform.position[2])+.5,row.transform.position[2]);mesh.computeWorldMatrix(true);record.instance=structuredClone(row);}};
 const Original=globalThis.Uint32Array,allocations=[];globalThis.Uint32Array=new Proxy(Original,{construct(target,args){allocations.push(args[0]);return Reflect.construct(target,args);}});try{prepareEditedCaveClearance(runtime,{instances:rows},records);}finally{globalThis.Uint32Array=Original;}
 assert.equal(allocations.filter(length=>length===data.size*data.size*8).length,2,'one final camera field plus one shared camera scratch, regardless of object count');assert.equal(runtime.caveEditorMasks.size,128);assert.ok(runtime.caveEditorMaskBytes<=16*1024*1024);assert.equal(runtime.stats.caveCollisionBakes,1);
});


test('departing after a terrain swap restores the owned cached cave field without touching the new region',async t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true}),runtime=new AuthoredPlacementRuntime(world,{catalog:ASSET_CATALOG,initialize:async()=>{}}),terrain=world.terrain;t.after(()=>{runtime.dispose();world.scene.dispose();engine.dispose();});await runtime.apply({...createEmptyPlacementDocument(runtime.baseManifest),revision:1,removedBaseIds:['cavern-88']});assert.ok(terrain.authoredCaveCollision);
 const nextTerrain={marker:'new-region'};world.terrain=nextTerrain;world.mapId='village';world.ground={};runtime.dispose();assert.equal(terrain.authoredCaveCollision,undefined);assert.deepEqual(nextTerrain,{marker:'new-region'});
});
