import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NullEngine,Scene,Vector3,VertexBuffer} from '@babylonjs/core';
import manifest from '../public/assets/village-plains-outskirts.json' with {type:'json'};
import village from '../public/assets/village.json' with {type:'json'};
import plains from '../public/assets/great-plains.json' with {type:'json'};
import ground from '../public/assets/great-plains-ground.json' with {type:'json'};
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {placementBounds} from '../src/village-demand.js';
import {plainsToVillage,villageToPlains} from '../src/village-plains-boundary.js';
import {buildVillagePlainsOutskirts,VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS} from '../src/village-plains-outskirts.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {selectVillageShadowCasters} from '../src/village-shadow-policy.js';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {createTerrainGround} from '../src/terrain-mesh.js';
import {villageOutskirtsSkirtHeight} from '../src/village-outskirts-skirt.js';

const root=resolve(import.meta.dirname,'..'),terrain=createGreatPlainsTerrain(),targetTerrain=createVillageTerrain();
const points=[new Vector3(0,0,0),new Vector3(1,2,3),new Vector3(-3,4,-2)];
test('reciprocal town vista preserves actual production source transforms and original per-source LOD',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{
  const targets=manifest.placements.filter(p=>p.sourcePlacementId),built=buildVillagePlainsOutskirts({placements:PLAINS_PLACEMENTS,assets:plains.assets,terrain});
  assert.deepEqual(targets,built);assert.ok(targets.length>=45&&targets.length<=60);assert.equal(manifest.placements.length,targets.length+1);
  assert.ok(Object.isFrozen(VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS));
  for(const target of targets){
   const source=PLAINS_PLACEMENTS.find(p=>p.id===target.sourcePlacementId);assert.ok(source);assert.equal(source.villageBoundary,undefined);assert.notEqual(source.asset,'village-approach');
   assert.deepEqual(manifest.assets[source.asset],plains.assets[source.asset]);if(village.assets[source.asset])assert.deepEqual(manifest.assets[source.asset],village.assets[source.asset],'existing town container can be reused without a second source/texture graph');
   const a=createVillageTransform({scene,terrain},source,plains.assets[source.asset]),b=createVillageTransform({scene,terrain:targetTerrain},target,manifest.assets[target.asset]);
   const am=a.facing.computeWorldMatrix(true),bm=b.facing.computeWorldMatrix(true);
   for(const point of points){const from=Vector3.TransformCoordinates(point,am),actual=Vector3.TransformCoordinates(point,bm),expected=plainsToVillage(from);assert.ok(Math.abs(actual.x-expected.x)<2e-5,source.id);assert.ok(Math.abs(actual.z-expected.z)<2e-5,source.id);assert.ok(Math.abs(actual.y-from.y)<2e-5,source.id);}
   assert.equal(target.background,true);assert.equal(target.colliderRadius,0);assert.equal(target.lootTier,undefined);a.root.dispose();b.root.dispose();
  }
  for(let i=0;i<7;i++)assert.ok(targets.some(p=>p.sourcePlacementId===`lookout-rock-${i}`));assert.ok(targets.some(p=>p.sourcePlacementId==='lookout-oak'));
 }finally{scene.dispose();engine.dispose();}
});

function values(g,files,index){
 const a=g.accessors[index],v=g.bufferViews[a.bufferView],data=files.get(g.buffers[v.buffer].uri).data,n={SCALAR:1,VEC2:2,VEC3:3}[a.type],size=a.componentType===5126?4:a.componentType===5125?4:2,out=[];
 for(let i=0;i<a.count;i++)for(let j=0;j<n;j++){const o=(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??n*size)+j*size;out.push(a.componentType===5126?data.readFloatLE(o):a.componentType===5125?data.readUInt32LE(o):data.readUInt16LE(o));}return out;
}
test('shipped clipped ground uses source triangle heights, macro UV and streaming bounds',async()=>{
 const config=manifest.assets[manifest.ground.asset],placement=manifest.placements.find(p=>p.asset===manifest.ground.asset),{gltf:g,files}=await readRuntimeGltf(pathToFileURL(resolve(root,'public/assets',config.lods[0].model)));
 assert.equal(g.meshes.length,1);assert.equal(g.meshes[0].primitives.length,1);assert.equal(new Set(config.lods.map(l=>l.model)).size,1);assert.equal(config.surfaceStyle,'outskirts-ground');
 assert.equal(g.images[0].uri,ground.color.url.replace('./content/',''));assert.equal(manifest.ground.detail.url,ground.detail.url);
 const p=g.meshes[0].primitives[0],pos=values(g,files,p.attributes.POSITION),uv=values(g,files,p.attributes.TEXCOORD_0),normal=values(g,files,p.attributes.NORMAL),indices=values(g,files,p.indices),world={terrain:createVillageTerrain()},bounds=placementBounds(world,placement,config);
 assert.ok(indices.length/3<11000);assert.equal(indices.length/3,config.lods[0].triangles);
 let maxHeightError=0,maxUvError=0;
 for(let i=0;i<pos.length;i+=3){
  const x=pos[i]+placement.x,y=pos[i+1]+placement.elevation-.025,z=pos[i+2]+placement.z,source=villageToPlains({x,z});
  maxHeightError=Math.max(maxHeightError,Math.abs(y-terrain.heightAt(source.x,source.z)));
  maxUvError=Math.max(maxUvError,Math.abs(uv[i/3*2]-(.5+source.x/ground.span)),Math.abs(uv[i/3*2+1]-(.5-source.z/ground.span)));
  assert.ok(x>=bounds.min.x-1e-5&&x<=bounds.max.x+1e-5&&y>=bounds.min.y-1e-5&&y<=bounds.max.y+1e-5&&z>=bounds.min.z-1e-5&&z<=bounds.max.z+1e-5,'stream planner bounds must enclose every shipped vertex');
  assert.ok(Math.abs(Math.hypot(normal[i],normal[i+1],normal[i+2])-1)<1e-5);assert.ok(z>=80-1e-5,'no change to original town floor');
 }
 assert.ok(maxHeightError<2e-5,`triangle height error ${maxHeightError}`);assert.ok(maxUvError<1e-7,`macro UV error ${maxUvError}`);
 for(const resource of manifest.resources)assert.ok((await readFile(resolve(root,'public/assets',resource))).length>0);
});

test('outskirts ground never consumes the actual village caster budget at the exit',()=>{
 const assets={...village.assets,...manifest.assets},world={terrain:targetTerrain},records=[...VILLAGE_PLACEMENTS,...manifest.placements].map(placement=>{const bounds=placementBounds(world,placement,assets[placement.asset]);return {placement,min:bounds.min,max:bounds.max,root:{isEnabled:()=>true,isDisposed:()=>false}};}),ground=records.find(r=>r.placement.asset===manifest.ground.asset);
 assert.equal(ground.placement.kind,'ground-detail');
 for(const touch of[true,false])assert.ok(!selectVillageShadowCasters(records,{x:-.418,z:73.1},touch).includes(ground),'the ground patch must receive existing shadows without casting a whole floor plane');
});

test('the actual exterior floor row clears every shipped patch vertex while preserving the original inner ground',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine),before=createTerrainGround(scene,targetTerrain,{borderExtension:105}),after=createTerrainGround(scene,targetTerrain,{borderExtension:105,borderHeight:villageOutskirtsSkirtHeight});
 try{
  const a=before.getVerticesData(VertexBuffer.PositionKind),b=after.getVerticesData(VertexBuffer.PositionKind),uv=before.getVerticesData(VertexBuffer.UVKind),changedUv=after.getVerticesData(VertexBuffer.UVKind),normals=before.getVerticesData(VertexBuffer.NormalKind),changedNormals=after.getVerticesData(VertexBuffer.NormalKind);
  assert.deepEqual(uv,changedUv);assert.deepEqual(before.getIndices(),after.getIndices());
  for(let i=0;i<a.length;i+=3){assert.equal(a[i],b[i]);assert.equal(a[i+2],b[i+2]);if(a[i+2]<=79)assert.equal(a[i+1],b[i+1]);if(a[i+2]<79)for(let j=0;j<3;j++)assert.equal(normals[i+j],changedNormals[i+j],'the original inner vertex normals stay identical');}
  const config=manifest.assets[manifest.ground.asset],placement=manifest.placements.find(p=>p.asset===manifest.ground.asset),{gltf:g,files}=await readRuntimeGltf(pathToFileURL(resolve(root,'public/assets',config.lods[0].model))),positions=values(g,files,g.meshes[0].primitives[0].attributes.POSITION),stride=targetTerrain.subdivisions+1;
  let minimumGap=Infinity;
  for(let i=0;i<positions.length;i+=3){
   const x=positions[i]+placement.x,y=positions[i+1]+placement.elevation-.025,z=positions[i+2]+placement.z,col=Math.floor(x+targetTerrain.half),ai=col*3,bi=(col+1)*3,ci=(stride+col)*3,di=(stride+col+1)*3,u=(x-b[ai])/(b[bi]-b[ai]),v=(b[ai+2]-z)/(b[ai+2]-b[ci+2]);
   const floor=u>=v?b[ai+1]+u*(b[bi+1]-b[ai+1])+v*(b[di+1]-b[bi+1]):b[ai+1]+v*(b[ci+1]-b[ai+1])+u*(b[di+1]-b[ci+1]);minimumGap=Math.min(minimumGap,y-floor);
  }
  assert.ok(minimumGap>.005,'existing stretched ground cannot hide/z-fight the patch: '+minimumGap);
 }finally{before.dispose();after.dispose();scene.dispose();engine.dispose();}
});
