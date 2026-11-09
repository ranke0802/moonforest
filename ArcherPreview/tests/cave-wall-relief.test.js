import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {sourcePath} from '../../Sources/resolve-source.mjs';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readAccessor} from '../scripts/web-geometry.js';
import {laboratoryTopology} from '../scripts/pack-cave-laboratory.mjs';
import {buildCaveWallRelief,caveWallReliefProfile} from '../scripts/cave-wall-relief.mjs';
import {CAVE_LABORATORY_GEOMETRY} from '../src/cave-laboratory-geometry.js';
const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('witch-cave.json',base))),asset=manifest.assets['cave-01-eroded-wall'];
const beforeBytes=fs.readFileSync(sourcePath('approved-scenery-budgets','before-manifests/witch-cave.json')),beforeManifest=JSON.parse(beforeBytes),historicalAsset=beforeManifest.assets['cave-01-eroded-wall'];
const approval=JSON.parse(fs.readFileSync(sourcePath('approved-scenery-budgets','approval.json'))),wallApproval=approval.assets.find(row=>row.id==='cave-01-eroded-wall');
const digest=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const protectedDigest=(part,values)=>{
 const set=new Set(),profile=caveWallReliefProfile('cave-01-eroded-wall');
 for(let i=0;i<part.indices.length;i+=3){const ids=Array.from(part.indices.slice(i,i+3));if(ids.some(id=>profile.protected(Array.from(part.positions.slice(id*3,id*3+3)))))for(const id of ids)set.add(id);}
 return digest(Float32Array.from([...set].sort((a,b)=>a-b).flatMap(id=>Array.from(values.slice(id*3,id*3+3)))));
};
for(const level of [0,1,2])test(`historical pre-budget cave wall relief LOD${level} retains original UV/color/index/protected-face bytes and topology`,async()=>{
 const source=await readRuntimeGltf(new URL(historicalAsset.lods[level].model,base)),proof=historicalAsset.vertexRelief.levels[level];
 assert.equal(source.gltf.meshes.length,1);assert.equal(source.gltf.materials.length,1);assert.equal(source.gltf.skins?.length??0,0);assert.equal(source.gltf.animations?.length??0,0);
 const topology=laboratoryTopology(source.gltf,source.files);assert.deepEqual(topology,{triangles:[5000,2750,1400][level],components:1,boundaryEdges:10,nonmanifoldEdges:0,degenerate:0,duplicate:0},'No new seam, component, duplicate or collapsed triangle');
 const primitive=source.gltf.meshes[0].primitives[0],positions=readAccessor(source.gltf,source.files,primitive.attributes.POSITION),normal=readAccessor(source.gltf,source.files,primitive.attributes.NORMAL),indices=readAccessor(source.gltf,source.files,primitive.indices),part={positions,indices};
 assert.equal(positions.length/3,proof.parts[0].vertices);assert.equal(digest(indices),proof.parts[0].indicesSha256);
 for(const [semantic,index]of Object.entries(primitive.attributes))assert.equal(digest(readAccessor(source.gltf,source.files,index)),proof.parts[0].channels[semantic]);
 assert.equal(protectedDigest(part,positions),proof.parts[0].protectedPositionsSha256);assert.equal(protectedDigest(part,normal),proof.parts[0].protectedNormalsSha256);
 for(let i=0;i<normal.length;i+=3)assert.ok(Math.abs(Math.hypot(normal[i],normal[i+1],normal[i+2])-1)<1e-5);
 assert.deepEqual(historicalAsset.vertexRelief.sourceStats.perLod.map(l=>l.triangles),[5000,2750,1400]);assert.equal(historicalAsset.vertexRelief.sourceStats.flippedFaces,0);assert.equal(historicalAsset.vertexRelief.sourceStats.protectedTriangleChanges,0);
});

test('current budget wall uses descending approved LOD counts with finite attributes and nonzero unit normals',async()=>{
 assert.deepEqual(asset.lods.map(l=>l.triangles),[2000,1998,1400]);assert.deepEqual(asset.lods.map(l=>l.level),[0,1,2]);
 assert.ok(asset.lods.every((lod,i)=>lod.triangles<=2000&&(!i||lod.triangles<asset.lods[i-1].triangles)));
 assert.deepEqual(asset.mobileNear,asset.lods[0]);
 for(const lod of asset.lods){
  const source=await readRuntimeGltf(new URL(lod.model,base)),primitive=source.gltf.meshes[0].primitives[0],positions=readAccessor(source.gltf,source.files,primitive.attributes.POSITION),normal=readAccessor(source.gltf,source.files,primitive.attributes.NORMAL),indices=readAccessor(source.gltf,source.files,primitive.indices);
  assert.equal(indices.length/3,lod.triangles);assert.equal(normal.length,positions.length);
  for(const index of indices)assert.ok(Number.isInteger(index)&&index>=0&&index<positions.length/3,'Packed index remains in range');
  for(const [semantic,index]of Object.entries(primitive.attributes))for(const value of readAccessor(source.gltf,source.files,index))assert.ok(Number.isFinite(value),`${semantic} remains finite`);
  for(let i=0;i<normal.length;i+=3)assert.ok(Math.abs(Math.hypot(normal[i],normal[i+1],normal[i+2])-1)<1e-5,'Normals are unit length and never zero');
  assert.equal(laboratoryTopology(source.gltf,source.files).degenerate,0,'No zero-area triangles in the approved current wall');
 }
});

test('current packed near wall reproduces registered approved candidate attributes and geometry',async()=>{
 const row=wallApproval.tiers.find(tier=>tier.tier==='lod0'),rawBytes=fs.readFileSync(sourcePath(row.sourceId));assert.equal(digest(rawBytes),row.sourceSha256);
 const approvedGltf=JSON.parse(rawBytes),approvedFiles=new Map(approvedGltf.buffers.map(buffer=>{assert.ok(buffer.uri.startsWith('data:application/octet-stream;base64,'));return [buffer.uri,{data:Buffer.from(buffer.uri.split(',')[1],'base64')}];}));
 const current=await readRuntimeGltf(new URL(asset.lods[0].model,base)),expected=approvedGltf.meshes[0].primitives[0],actual=current.gltf.meshes[0].primitives[0];
 assert.deepEqual(Object.keys(actual.attributes),Object.keys(expected.attributes));
 for(const [semantic,index]of Object.entries(expected.attributes)){
  assert.ok(bytes(readAccessor(current.gltf,current.files,actual.attributes[semantic])).equals(bytes(readAccessor(approvedGltf,approvedFiles,index))),`${semantic} is byte-exact to the approved raw candidate`);
  assert.equal(current.gltf.accessors[actual.attributes[semantic]].normalized,approvedGltf.accessors[index].normalized);
 }
 assert.deepEqual(Array.from(readAccessor(current.gltf,current.files,actual.indices)),Array.from(readAccessor(approvedGltf,approvedFiles,expected.indices)));
 for(const key of ['nodes','scenes','scene','materials','images','textures','samplers'])assert.deepEqual(current.gltf[key],approvedGltf[key]);
 // The approved simplification has its own topology; the original clean
 // topology/protected-face proof is retained separately in the historical tests.
 assert.deepEqual(laboratoryTopology(current.gltf,current.files),laboratoryTopology(approvedGltf,approvedFiles));
});

test('budget wall preserves historical relief metadata, exact 4K texture bytes and independent native laboratory revision',()=>{
 const beforeRecord=approval.beforeManifests.find(row=>row.manifest==='witch-cave.json');assert.equal(digest(beforeBytes),beforeRecord.sha256);
 assert.equal(asset.vertexRelief.approvedBudgetRevision,'approved-scenery-budget-v1');assert.equal(asset.vertexRelief.approvedBudgetRevision,asset.geometryBudget.revision);
 assert.deepEqual(asset.vertexRelief.sourceStats,historicalAsset.vertexRelief.sourceStats);assert.deepEqual(asset.vertexRelief.levels,historicalAsset.vertexRelief.levels);assert.deepEqual(asset.vertexRelief.sourceModelHashes,historicalAsset.vertexRelief.sourceModelHashes);
 assert.deepEqual(asset.highTextures,historicalAsset.highTextures);assert.deepEqual(asset.mobileHighTextures,historicalAsset.mobileHighTextures);
 for(const key of ['bounds','height','origin','frontYawOffset'])assert.deepEqual(asset[key],historicalAsset[key]);
 assert.deepEqual(asset.mobileNear,asset.lods[0]);assert.equal(asset.highTextures.textures.albedo.url,'./content/081b18b2af992bdd0953fb9fceb75a66b86deaede4e3515c012d2e9284048c49.ktx2');
 const high=fs.readFileSync(new URL(asset.highTextures.textures.albedo.url,base));assert.equal(high.readUInt32LE(20),4096);assert.equal(high.readUInt32LE(24),4096);assert.equal(digest(high),'081b18b2af992bdd0953fb9fceb75a66b86deaede4e3515c012d2e9284048c49');
 assert.equal(CAVE_LABORATORY_GEOMETRY.sourceSha256,'eadcb1b51b5314ac6bfc8ac5fbd5951d027ef51fc6636063caedf55bf304bd6b');assert.equal(CAVE_LABORATORY_GEOMETRY.revision,'lab-large-joints-r3-v1');
 const native=manifest.assets['cave-derived-laboratory-rock'];assert.equal(native.sourceSha256,CAVE_LABORATORY_GEOMETRY.sourceSha256);
 if(native.r2Geometry){
  const r2=JSON.parse(fs.readFileSync(sourcePath('approved-review-r2-2026-11-09','approval.json'))),entry=r2.assets.find(row=>row.id==='cave-derived-laboratory-rock'),application=entry.applications.find(row=>row.manifest==='witch-cave.json');
  assert.deepEqual(application.beforeConfig.lods.map(l=>l.triangles),[4512,3158,2374],'The historic native source remains recorded');
  assert.deepEqual(native,application.afterConfig,'The current native render is exactly the approved R2 candidate');
  assert.equal(entry.actualTriangles,2500);assert.deepEqual(native.lods.map(l=>l.triangles),[2500,3158,2374]);
 }else assert.deepEqual(native.lods.map(l=>l.triangles),[4512,3158,2374]);
 assert.equal(native.vertexRelief,undefined,'Rejected r3 visual prototype must not enter deployment');
 assert.equal(asset.vertexRelief.sourceStats.newTriangles,0);assert.equal(asset.vertexRelief.sourceStats.newDrawCalls,0);assert.equal(asset.vertexRelief.sourceStats.newTextures,0);
 assert.equal(asset.vertexRelief.sourceModels,undefined,'Historic sources must not become live deployment links');assert.equal(asset.vertexRelief.sourceModelHashes.length,3);assert.ok(asset.vertexRelief.sourceModelHashes.every(value=>/^[a-f0-9]{64}$/.test(value)));
});

test('offline profile is deterministic, does not mutate inputs and locks interpolated lower/upper/join faces in all LODs',()=>{
 const xs=[-4,-3.3,-2,0,2,3.3,4],ys=[0,3.05,3.2,3.6,4,4.4,4.8,5.085721],positions=[],normals=[],indices=[];
 for(const y of ys)for(const x of xs){positions.push(x,y,2.2);normals.push(0,0,1);}
 for(let y=0;y<ys.length-1;y++)for(let x=0;x<xs.length-1;x++){const a=y*xs.length+x;indices.push(a,a+1,a+xs.length+1,a,a+xs.length+1,a+xs.length);}
 const sources=[0,1,2].map(level=>({level,parts:[{positions:[...positions],normals:[...normals],indices:[...indices],uv:'an unrelated attribute remains untouched'}]})),copy=structuredClone(sources),first=buildCaveWallRelief(sources,'cave-01-eroded-wall'),second=buildCaveWallRelief(sources,'cave-01-eroded-wall');
 assert.deepEqual(first,second);assert.deepEqual(sources,copy);assert.ok(first.stats.perLod.every(level=>level.changedVertices>0));assert.equal(first.stats.protectedTriangleChanges,0);
 for(let level=0;level<3;level++){const result=first.levels[level].parts[0];assert.deepEqual(result.indices,indices);assert.equal(result.uv,'an unrelated attribute remains untouched');assert.equal(protectedDigest({positions,indices},result.positions),protectedDigest({positions,indices},positions));}
});

test('rejected native prototype and unknown objects cannot be processed by the packable wall helper',()=>{
 assert.throws(()=>caveWallReliefProfile('cave-derived-laboratory-rock'),/Unapproved wall relief source/);
 assert.throws(()=>caveWallReliefProfile('tree'),/Unapproved wall relief source/);
 assert.throws(()=>buildCaveWallRelief([],'cave-01-eroded-wall'),/three original LODs/);
});
