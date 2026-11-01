import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hash} from '../scripts/resource-pack.js';
import {packCaveLaboratory,laboratoryTopology} from '../scripts/pack-cave-laboratory.mjs';
import {CAVE_LABORATORY_GEOMETRY} from '../src/cave-laboratory-geometry.js';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'moonforest-native-lab-'));t.after(()=>rm(root,{recursive:true,force:true}));const assetsRoot=join(root,'assets');await mkdir(assetsRoot);
 const positions=Float32Array.from([-1,0,-1,1,0,-1,1,0,1,-1,0,1,-1,2,-1,1,2,-1,1,2,1,-1,2,1,1,1,0,-1,1,0,0,2,0,0,0,0,0,1,1,0,1,-1]),normals=new Float32Array(positions.length);
 for(let i=0;i<positions.length;i+=3){const n=Math.hypot(positions[i],positions[i+1]-1,positions[i+2]);normals.set([positions[i]/n,(positions[i+1]-1)/n,positions[i+2]/n],i);}
 const faces=[
  [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5],
  [10,8,12,10,12,9,10,9,13,10,13,8,11,12,8,11,9,12,11,13,9,11,8,13],
  [0,2,5,0,7,2,0,5,7,2,7,5]
 ],levels=[];
 for(let level=0;level<3;level++){
  const ids=Uint32Array.from(faces[level]),buffer=Buffer.concat([Buffer.from(positions.buffer),Buffer.from(normals.buffer),Buffer.from(ids.buffer)]),bin='level-'+level+'.bin';await writeFile(join(root,bin),buffer);
  const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'approved-static-lab'}],materials:[{pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:1}}],meshes:[{name:'laboratory',primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:0}]}],buffers:[{uri:bin,byteLength:buffer.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength},{buffer:0,byteOffset:positions.byteLength,byteLength:normals.byteLength},{buffer:0,byteOffset:positions.byteLength+normals.byteLength,byteLength:ids.byteLength}],accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:positions.length/3,min:[-1,0,-1],max:[1,2,1]},{bufferView:1,componentType:5126,type:'VEC3',count:normals.length/3},{bufferView:2,componentType:5125,type:'SCALAR',count:ids.length}]};
  const bytes=Buffer.from(JSON.stringify(gltf)),name='level-'+level+'.gltf';await writeFile(join(root,name),bytes);assert.equal(laboratoryTopology(gltf,new Map([[bin,{data:buffer}]])).boundaryEdges,0);levels.push({level,model:name,sha256:hash(bytes),dependencies:{[bin]:hash(buffer)},visualReview:{passed:true}});
 }
 const terrainBytes=Buffer.from(Float32Array.from([0,0,0,1,0,1]).buffer);await writeFile(join(root,'terrain.f32'),terrainBytes);const terrain={file:'terrain.f32',sha256:hash(terrainBytes)};
 const source={file:levels[0].model,sha256:levels[0].sha256},contract={...CAVE_LABORATORY_GEOMETRY,enabled:true,version:1,revision:'fixture-approved-only',sourceSha256:source.sha256,terrainSha256:terrain.sha256},approval={approved:true,assetId:contract.assetId,revision:contract.revision,source,terrain,newGenerationCalls:0,levels,geometryContract:contract,placement:{x:-35.5,z:-18.5,elevation:1.825,scale:1,yaw:0}},approvalPath=join(root,'approved.json'),manifest={version:1,id:'witch-cave',assets:{untouched:{source:'original',lods:[1,2,3]}},availableAssetCount:1,newSourceModels:22,reusedSourceModels:6,spentCredits:440,sourceSettings:{enablePbr:false,textureResolution:8192},placementCount:148};
 await writeFile(approvalPath,JSON.stringify(approval));await writeFile(join(assetsRoot,'witch-cave.json'),JSON.stringify(manifest));return {root,assetsRoot,approval,approvalPath,manifest};
}

test('incremental palette native pack preserves paid ledger, source and unrelated assets; emits only hashed geometry and three stable LODs',async t=>{
 const f=await fixture(t),before=await readFile(join(f.root,f.approval.source.file)),enabledBefore=CAVE_LABORATORY_GEOMETRY.enabled,result=await packCaveLaboratory(f.approvalPath,{assetsRoot:f.assetsRoot});
 assert.deepEqual(result.asset.lods.map(l=>l.triangles),[12,8,4]);assert.equal(result.asset.surfaceStyle,'cave-palette');assert.equal(result.asset.essentialStructural,true);assert.equal(result.asset.highTextures,undefined);assert.deepEqual(result.asset.mobileNear,result.asset.lods[0]);assert.deepEqual(result.asset.bounds,[2,2,2]);
 const after=JSON.parse(await readFile(join(f.assetsRoot,'witch-cave.json'),'utf8'));assert.deepEqual(after.assets.untouched,f.manifest.assets.untouched);assert.equal(after.spentCredits,440);assert.equal(after.newSourceModels,22);assert.equal(after.reusedSourceModels,6);assert.equal(after.availableAssetCount,2);assert.deepEqual(await readFile(join(f.root,f.approval.source.file)),before);
 for(const lod of result.asset.lods){assert.equal(lod.textureSize,0);for(const url of lod.resources){const name=url.split('/').at(-1),bytes=await readFile(join(f.assetsRoot,url));assert.equal(hash(bytes),name.slice(0,64));assert.match(name,/\.(gltf|bin)$/);}const g=JSON.parse(await readFile(join(f.assetsRoot,lod.model),'utf8'));assert.equal(g.images.length,0);assert.equal(g.animations?.length??0,0);assert.equal(g.skins?.length??0,0);assert.equal(g.materials[0].pbrMetallicRoughness.metallicFactor,0);}
 assert.equal(result.audit.sourceUnchanged,true);assert.equal(result.audit.newGenerationCalls,0);assert.equal(result.audit.newTextures,0);assert.equal(CAVE_LABORATORY_GEOMETRY.enabled,enabledBefore,'packing never changes the production geometry contract');
});

test('unapproved or changed-source packing never writes a public asset or mutates the manifest',async t=>{
 const f=await fixture(t),original=await readFile(join(f.assetsRoot,'witch-cave.json'));
 f.approval.approved=false;await writeFile(f.approvalPath,JSON.stringify(f.approval));await assert.rejects(packCaveLaboratory(f.approvalPath,{assetsRoot:f.assetsRoot}),/approval/);
 f.approval.approved=true;f.approval.source.sha256='0'.repeat(64);f.approval.geometryContract.sourceSha256=f.approval.source.sha256;await writeFile(f.approvalPath,JSON.stringify(f.approval));await assert.rejects(packCaveLaboratory(f.approvalPath,{assetsRoot:f.assetsRoot}),/source changed/);
 assert.deepEqual(await readFile(join(f.assetsRoot,'witch-cave.json')),original);assert.deepEqual(await readdir(f.assetsRoot),['witch-cave.json']);
});

test('image-bearing or inconsistent geometry cannot enter the no-atlas path and leaves all published data unchanged',async t=>{
 const f=await fixture(t),original=await readFile(join(f.assetsRoot,'witch-cave.json')),path=join(f.root,f.approval.levels[1].model),g=JSON.parse(await readFile(path,'utf8'));g.images=[{uri:'unrelated-atlas.ktx2'}];const bytes=Buffer.from(JSON.stringify(g));await writeFile(path,bytes);f.approval.levels[1].sha256=hash(bytes);await writeFile(f.approvalPath,JSON.stringify(f.approval));
 await assert.rejects(packCaveLaboratory(f.approvalPath,{assetsRoot:f.assetsRoot}),/unrelated UV atlas/);assert.deepEqual(await readFile(join(f.assetsRoot,'witch-cave.json')),original);assert.deepEqual(await readdir(f.assetsRoot),['witch-cave.json']);
});
